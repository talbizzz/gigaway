-- Milestone 6 — admin privileged writes (phase 5, part 1).
--
-- Same shape as log_admin_action itself: SECURITY DEFINER, `is_admin()`
-- checked as the literal first statement, `raise exception` rather than
-- returning quietly on failure — unlike the phase 2 read functions, a
-- write that silently no-ops is worse than one that errors loudly.
--
-- Both functions capture what they're about to change into the audit log's
-- `detail` BEFORE changing it. For admin_delete_trip this is load-bearing,
-- not just nice-to-have: after the delete, the row is gone and there is no
-- second chance to describe what it was.
--
-- `admin-delete-user` is not here — it needs the Auth Admin API and Storage,
-- neither reachable from SQL, so it's an Edge Function (this phase, part 2).

-- ───────────────────────────────────────────────────────────────────────────
-- admin_set_user_status — suspend / unsuspend, unchanged in effect from
-- MODERATION.md's `update profiles set status = …`. The existing
-- guard_profile_privileged_columns trigger already allows this: it checks
-- `current_user in ('service_role', 'postgres', 'supabase_admin')`, and a
-- SECURITY DEFINER function runs as its owner (postgres), not its caller.
-- ───────────────────────────────────────────────────────────────────────────
create or replace function public.admin_set_user_status(p_profile_id uuid, p_status text)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_old_status public.profile_status;
  v_display_name text;
begin
  if not public.is_admin() then
    raise exception 'not authorized';
  end if;

  if p_status not in ('approved', 'suspended') then
    raise exception 'invalid status: %, must be approved or suspended', p_status;
  end if;

  select status, display_name into v_old_status, v_display_name
  from public.profiles
  where id = p_profile_id;

  if not found then
    raise exception 'profile not found: %', p_profile_id;
  end if;

  update public.profiles set status = p_status where id = p_profile_id;

  perform public.log_admin_action(
    'set_user_status',
    'profiles',
    p_profile_id::text,
    jsonb_build_object('displayName', v_display_name, 'from', v_old_status, 'to', p_status)
  );
end;
$$;

revoke all on function public.admin_set_user_status(uuid, text) from public;
grant execute on function public.admin_set_user_status(uuid, text) to authenticated;

comment on function public.admin_set_user_status is
  'Suspend (''suspended'') or reinstate (''approved'') a member. Takes effect '
  'on their next query, same as the manual SQL in MODERATION.md — is_approved() '
  'reads profiles.status directly.';

-- ───────────────────────────────────────────────────────────────────────────
-- admin_delete_trip
-- ───────────────────────────────────────────────────────────────────────────
create or replace function public.admin_delete_trip(p_trip_id uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_owner_name text;
  v_city text;
  v_start date;
  v_end date;
begin
  if not public.is_admin() then
    raise exception 'not authorized';
  end if;

  select p.display_name, c.name, t.start_date, t.end_date
    into v_owner_name, v_city, v_start, v_end
  from public.trips t
  join public.profiles p on p.id = t.profile_id
  join public.cities c on c.id = t.city_id
  where t.id = p_trip_id;

  if not found then
    raise exception 'trip not found: %', p_trip_id;
  end if;

  -- delete_account protects exactly this case for its own reason ("a trip
  -- that produced a stay survives") — a stay cascades to reviews on either
  -- side, so deleting it here would silently erase the COUNTERPARTY's
  -- review history along with the trip. MODERATION.md's runbook has never
  -- had an action for this; refuse rather than invent one under a delete
  -- button.
  if exists (
    select 1 from public.offers o
    join public.stays s on s.offer_id = o.id
    where o.trip_id = p_trip_id
  ) then
    raise exception
      'trip % has a stay and cannot be deleted — it would erase the other '
      'member''s review history. There is no admin action for this case.',
      p_trip_id;
  end if;

  -- Requests and offers cascade from trips. One delete takes both with it.
  delete from public.trips where id = p_trip_id;

  perform public.log_admin_action(
    'delete_trip',
    'trips',
    p_trip_id::text,
    jsonb_build_object(
      'ownerName', v_owner_name, 'city', v_city,
      'startDate', v_start, 'endDate', v_end
    )
  );
end;
$$;

revoke all on function public.admin_delete_trip(uuid) from public;
grant execute on function public.admin_delete_trip(uuid) to authenticated;

comment on function public.admin_delete_trip is
  'Deletes a trip and its requests/offers. Refuses if the trip produced a '
  'stay — that would cascade to reviews on either side and erase the other '
  'member''s history. Irreversible otherwise — there is no database backup.';
