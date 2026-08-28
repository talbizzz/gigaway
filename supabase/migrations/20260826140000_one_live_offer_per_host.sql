-- One live offer per host per trip, and the ability to revise it.
--
-- THE BUG. Nothing stopped a host answering the same request twice. The
-- requests screen offered "Offer nights" for as long as the request was
-- pending, and offers_insert_own is happy to insert a second row, so a host
-- who answered again — or tapped twice on a slow connection — produced two
-- live offers on one trip, often overlapping the same nights. The traveller
-- then saw two offers from one person and could accept either; accept_offer
-- would auto-decline the sibling, but which nights were actually agreed came
-- down to which card was tapped.
--
-- The fix is a constraint, not a hidden button. A UI that stops offering the
-- action is a courtesy; this is the part that makes the second row impossible
-- whoever writes it.
--
-- Revising replaces re-offering: the host edits the offer they already made,
-- which keeps one row, one notification thread, and one thing for the
-- traveller to answer.

-- ───────────────────────────────────────────────────────────────────────────
-- Withdraw pre-existing duplicates
--
-- Keeps the newest live offer per (trip, host) and withdraws the rest, so the
-- index below cannot fail on data written before the rule existed. Withdrawn
-- rather than deleted: the traveller may already have been notified, and a row
-- vanishing is worse than a row that says it was withdrawn.
-- ───────────────────────────────────────────────────────────────────────────
with ranked as (
  select id,
         row_number() over (
           partition by trip_id, from_profile
           order by created_at desc, id desc
         ) as rank
  from public.offers
  where status in ('pending', 'accepted')
)
update public.offers o
set status = 'withdrawn'
from ranked r
where o.id = r.id and r.rank > 1;

create unique index offers_one_live_per_host_trip
  on public.offers (trip_id, from_profile)
  where status in ('pending', 'accepted');

comment on index public.offers_one_live_per_host_trip is
  'A host may have only one unanswered or accepted offer on a given trip. '
  'Declined, withdrawn and expired rows are excluded, so a host whose offer '
  'was turned down may make a fresh one.';

-- ───────────────────────────────────────────────────────────────────────────
-- Let the host revise an offer nobody has answered
--
-- The previous guard locked every column but status, which made "change your
-- offer" impossible. It now distinguishes the two cases: answering an offer
-- (status only, by either party) and revising one (dates and message, by the
-- host, while it is still pending).
--
-- city_id has to be allowed through with the dates. It is not client-supplied:
-- enforce_offer_range recomputes it from whichever availability covers the new
-- nights, and moving the dates can legitimately move the stay to a different
-- city. That trigger fires first — before-update triggers run in name order,
-- and offers_enforce_range sorts before offers_guard_columns — so by the time
-- this runs, new.city_id is the database's own answer rather than the caller's.
-- ───────────────────────────────────────────────────────────────────────────
-- NOTE: invoker rights, deliberately, matching the other guards. In a SECURITY
-- DEFINER function current_user is the owner (postgres), which would make the
-- service-role escape hatch below pass for everyone.
create or replace function public.guard_offer_columns()
returns trigger
language plpgsql
set search_path = public
as $$
declare
  v_revising boolean;
begin
  if current_user in ('service_role', 'postgres', 'supabase_admin') then
    return new;
  end if;

  -- Never the client's to rewrite, in any state. Which trip, which two people,
  -- and whether accept_offer auto-declined the row are not editorial.
  if new.id            is distinct from old.id
     or new.request_id    is distinct from old.request_id
     or new.trip_id       is distinct from old.trip_id
     or new.from_profile  is distinct from old.from_profile
     or new.to_profile    is distinct from old.to_profile
     or new.auto_declined is distinct from old.auto_declined
     or new.created_at    is distinct from old.created_at then
    raise exception 'that column is not client-updatable'
      using errcode = '42501';
  end if;

  v_revising := old.status = 'pending'
    and new.status = 'pending'
    and old.from_profile = (select auth.uid());

  if not v_revising
     and (new.city_id    is distinct from old.city_id
          or new.start_date is distinct from old.start_date
          or new.end_date   is distinct from old.end_date
          or new.message    is distinct from old.message) then
    raise exception 'an offer can only be revised by its host, and only while it is unanswered'
      using errcode = '42501';
  end if;

  if new.status is distinct from old.status then
    new.responded_at := now();
  end if;

  return new;
end;
$$;

-- The matching policy. offers_withdraw_own already covers pending → withdrawn;
-- this is pending → pending, which is a revision.
create policy offers_revise_own
  on public.offers for update
  to authenticated
  using (from_profile = (select auth.uid()) and status = 'pending')
  with check (from_profile = (select auth.uid()) and status = 'pending');

-- ───────────────────────────────────────────────────────────────────────────
-- Tell the traveller when an offer changes
--
-- A host who quietly shortens five nights to two leaves the traveller planning
-- around nights they no longer have. The revision reuses offer_received: with
-- one live offer per host per trip it can only refer to the same offer, and
-- the payload carries the new dates.
-- ───────────────────────────────────────────────────────────────────────────
create or replace function public.notify_on_offer()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  -- The edit form writes all three columns every time, so an update that
  -- changed nothing must not notify.
  if tg_op = 'UPDATE'
     and new.start_date = old.start_date
     and new.end_date = old.end_date
     and new.message is not distinct from old.message then
    return null;
  end if;

  perform public.enqueue_notification(
    new.to_profile,
    'offer_received',
    public.notification_trip_payload(new.trip_id)
      || jsonb_build_object(
           'offerId', new.id,
           'fromProfileId', new.from_profile,
           'fromName', public.display_name_of(new.from_profile),
           'offerStart', new.start_date,
           'offerEnd', new.end_date,
           'nights', (new.end_date - new.start_date + 1),
           'revised', tg_op = 'UPDATE'
         )
  );
  return null;
end;
$$;

-- Renamed: it is no longer insert-only.
drop trigger if exists offers_notify_on_insert on public.offers;

create trigger offers_notify_on_write
  after insert or update of start_date, end_date, message on public.offers
  for each row execute function public.notify_on_offer();
