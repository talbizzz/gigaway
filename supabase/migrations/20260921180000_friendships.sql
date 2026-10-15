-- Friendships.
--
-- A member sends a friend request; the other accepts or declines. Friends see a
-- little more of each other (the app shows a friend's bio, links and full name)
-- and, from the visibility migration that follows, the trips marked for friends.
--
-- ONE ROW PER PAIR, whichever way round it was asked, enforced by a unique index
-- over the two ids in canonical order. If A has asked B and B then asks A, that
-- is an acceptance, not a second row (send_friend_request handles it).
--
-- WHO MAY DO WHAT
--   send     only through send_friend_request(), by an approved member, to an
--            approved member, not blocked either way, with a cap on requests
--            waiting for an answer. There is no insert policy.
--   accept   the addressee updates status to 'accepted' (and nothing else).
--   decline, cancel, unfriend
--            either side deletes the row. Nothing is kept: a declined request
--            leaves no mark, so being declined is not a record anyone can read.
--
-- Blocking removes the friendship, silently. Deleting an account removes it too.
--
-- Written to be re-runnable where it can be.

insert into public.app_config (key, value) values
  ('max_pending_friend_requests', '50'::jsonb)
on conflict (key) do nothing;

do $$
begin
  if not exists (select 1 from pg_type where typname = 'friendship_status') then
    create type public.friendship_status as enum ('pending', 'accepted');
  end if;
end $$;

create table if not exists public.friendships (
  id            uuid primary key default gen_random_uuid(),
  requester_id  uuid not null references public.profiles(id) on delete cascade,
  addressee_id  uuid not null references public.profiles(id) on delete cascade,
  status        public.friendship_status not null default 'pending',
  created_at    timestamptz not null default now(),
  responded_at  timestamptz,

  constraint no_self_friendship check (requester_id <> addressee_id)
);

create unique index if not exists friendships_pair
  on public.friendships (least(requester_id, addressee_id), greatest(requester_id, addressee_id));
create index if not exists friendships_addressee on public.friendships (addressee_id, status);
create index if not exists friendships_requester on public.friendships (requester_id, status);

comment on table public.friendships is
  'One row per pair of members. pending until the addressee accepts; deleted to '
  'decline, cancel or unfriend.';

-- ── helpers ───────────────────────────────────────────────────────────────
-- SECURITY DEFINER so a policy on another table can ask without hitting this
-- table's own RLS.
create or replace function public.are_friends(a uuid, b uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select a is not null and b is not null and exists (
    select 1 from public.friendships f
    where f.status = 'accepted'
      and ((f.requester_id = a and f.addressee_id = b)
        or (f.requester_id = b and f.addressee_id = a))
  );
$$;

-- The policy-facing form, keyed off the caller, like is_blocked(other).
create or replace function public.is_friend(other uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select public.are_friends((select auth.uid()), other);
$$;

comment on function public.is_friend is
  'True when the signed-in member and `other` are friends. Used by trip visibility.';

-- ── RLS ───────────────────────────────────────────────────────────────────
alter table public.friendships enable row level security;

drop policy if exists friendships_select_parties on public.friendships;
create policy friendships_select_parties
  on public.friendships for select
  to authenticated
  using (requester_id = (select auth.uid()) or addressee_id = (select auth.uid()));

-- Only the addressee, only a pending row, only to accept it.
drop policy if exists friendships_accept on public.friendships;
create policy friendships_accept
  on public.friendships for update
  to authenticated
  using (addressee_id = (select auth.uid()) and status = 'pending')
  with check (addressee_id = (select auth.uid()) and status = 'accepted');

-- Either side may remove it: decline, cancel a request, or unfriend.
drop policy if exists friendships_delete_parties on public.friendships;
create policy friendships_delete_parties
  on public.friendships for delete
  to authenticated
  using (requester_id = (select auth.uid()) or addressee_id = (select auth.uid()));

revoke all on public.friendships from anon, authenticated;
grant select, update, delete on public.friendships to authenticated;

-- The update policy decides WHICH row; this decides which columns.
create or replace function public.guard_friendship_columns()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  if current_user in ('service_role', 'postgres', 'supabase_admin') then
    return new;
  end if;

  if new.id is distinct from old.id
     or new.requester_id is distinct from old.requester_id
     or new.addressee_id is distinct from old.addressee_id
     or new.created_at   is distinct from old.created_at then
    raise exception 'only friendships.status is client-updatable'
      using errcode = '42501';
  end if;

  if new.status is distinct from old.status then
    new.responded_at := now();
  end if;

  return new;
end;
$$;

drop trigger if exists friendships_guard_columns on public.friendships;
create trigger friendships_guard_columns
  before update on public.friendships
  for each row execute function public.guard_friendship_columns();

-- ── sending a request ─────────────────────────────────────────────────────
create or replace function public.send_friend_request(p_user uuid)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_me       uuid := (select auth.uid());
  v_existing public.friendships%rowtype;
begin
  if v_me is null then
    return jsonb_build_object('ok', false, 'error', 'unauthenticated');
  end if;

  if v_me = p_user then
    return jsonb_build_object('ok', false, 'error', 'self');
  end if;

  if not exists (select 1 from public.profiles p where p.id = v_me and p.status = 'approved') then
    return jsonb_build_object('ok', false, 'error', 'not_approved');
  end if;

  -- A blocked or unapproved target looks exactly like one that does not exist.
  if not exists (select 1 from public.profiles p where p.id = p_user and p.status = 'approved')
     or public.are_blocked(v_me, p_user) then
    return jsonb_build_object('ok', false, 'error', 'user_not_found');
  end if;

  select * into v_existing from public.friendships f
   where least(f.requester_id, f.addressee_id) = least(v_me, p_user)
     and greatest(f.requester_id, f.addressee_id) = greatest(v_me, p_user);

  if found then
    if v_existing.status = 'accepted' then
      return jsonb_build_object('ok', true, 'status', 'friends');
    end if;

    -- They asked first: asking back is saying yes.
    if v_existing.requester_id = p_user then
      update public.friendships set status = 'accepted' where id = v_existing.id;
      return jsonb_build_object('ok', true, 'status', 'friends');
    end if;

    return jsonb_build_object('ok', true, 'status', 'requested');
  end if;

  if (select count(*) from public.friendships f
       where f.requester_id = v_me and f.status = 'pending')
     >= public.config_int('max_pending_friend_requests') then
    return jsonb_build_object('ok', false, 'error', 'too_many_pending');
  end if;

  insert into public.friendships (requester_id, addressee_id) values (v_me, p_user);
  return jsonb_build_object('ok', true, 'status', 'requested');
end;
$$;

revoke all on function public.send_friend_request(uuid) from public, anon, authenticated;
grant execute on function public.send_friend_request(uuid) to authenticated;

-- ── notifications ─────────────────────────────────────────────────────────
alter table public.notifications drop constraint if exists notification_type_known;
alter table public.notifications add constraint notification_type_known check (type in (
  'request_received',
  'co_request_received',
  'offer_received',
  'offer_accepted',
  'offer_confirmed',
  'offer_declined',
  'co_request_accepted',
  'co_request_declined',
  'request_withdrawn',
  'review_prompt',
  'review_reminder',
  'review_published',
  'report_received',
  -- Milestone 7
  'friend_request_received',
  'friend_request_accepted'
));

create or replace function public.notify_on_friendship()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if tg_op = 'INSERT' then
    perform public.enqueue_notification(
      new.addressee_id,
      'friend_request_received',
      jsonb_build_object(
        'fromProfileId', new.requester_id,
        'fromName', public.display_name_of(new.requester_id)
      )
    );
  elsif new.status = 'accepted' and old.status = 'pending' then
    perform public.enqueue_notification(
      new.requester_id,
      'friend_request_accepted',
      jsonb_build_object(
        'fromProfileId', new.addressee_id,
        'fromName', public.display_name_of(new.addressee_id)
      )
    );
  end if;

  return null;
end;
$$;

drop trigger if exists friendships_notify_on_insert on public.friendships;
create trigger friendships_notify_on_insert
  after insert on public.friendships
  for each row execute function public.notify_on_friendship();

drop trigger if exists friendships_notify_on_accept on public.friendships;
create trigger friendships_notify_on_accept
  after update of status on public.friendships
  for each row execute function public.notify_on_friendship();

-- ── blocking ends a friendship, silently ──────────────────────────────────
create or replace function public.remove_friendship_on_block()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  delete from public.friendships f
   where (f.requester_id = new.blocker_id and f.addressee_id = new.blocked_id)
      or (f.requester_id = new.blocked_id and f.addressee_id = new.blocker_id);
  return null;
end;
$$;

drop trigger if exists blocks_remove_friendship on public.blocks;
create trigger blocks_remove_friendship
  after insert on public.blocks
  for each row execute function public.remove_friendship_on_block();

-- ── finding members ───────────────────────────────────────────────────────
-- INVOKER rights, deliberately: profiles RLS decides who can be found (approved
-- members, not blocked either way), exactly as everywhere else. A username
-- matches by prefix; a name matches anywhere in "first family" or the display
-- name. `relationship` is what the viewer already has with each result.
create or replace function public.search_members(p_query text, p_limit integer default 20)
returns table (
  profile_id     uuid,
  display_name   text,
  username       text,
  discipline     text,
  specialisation text,
  photo_path     text,
  home_city      text,
  relationship   text
)
language sql
stable
set search_path = public
as $$
  with q as (
    select btrim(coalesce(p_query, '')) as raw,
           lower(regexp_replace(btrim(coalesce(p_query, '')), '^@', '')) as norm
  )
  select
    p.id, p.display_name, p.username, p.discipline, p.specialisation, p.photo_path, c.name,
    case
      when f.id is null then 'none'
      when f.status = 'accepted' then 'friends'
      when f.requester_id = (select auth.uid()) then 'requested'
      else 'incoming'
    end
  from public.profiles p
  cross join q
  left join public.cities c on c.id = p.home_city_id
  left join public.friendships f
    on (f.requester_id = p.id and f.addressee_id = (select auth.uid()))
    or (f.addressee_id = p.id and f.requester_id = (select auth.uid()))
  where length(q.norm) >= 2
    and p.id <> (select auth.uid())
    and p.status = 'approved'
    and (
      starts_with(p.username, q.norm)
      or strpos(lower(concat_ws(' ', p.first_name, p.last_name)), lower(q.raw)) > 0
      or strpos(lower(p.display_name), lower(q.raw)) > 0
    )
  order by (p.username = q.norm) desc,
           (f.status = 'accepted') desc nulls last,
           p.display_name
  limit least(greatest(coalesce(p_limit, 20), 1), 50)
$$;

revoke all on function public.search_members(text, integer) from public, anon;
grant execute on function public.search_members(text, integer) to authenticated;

-- ── deleting an account removes its friendships ───────────────────────────
create or replace function public.delete_account(p_user uuid)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_photo_path text;
  v_email      text;
  v_legal_name text;
  v_reported   boolean;
  v_actioned   boolean;
  v_days       integer;
begin
  select photo_path into v_photo_path from public.profiles where id = p_user;

  -- ── the hold: keep who this was, for a limited time ─────────────────────
  -- Everything below erases the member, which also erases the only link
  -- between a retained report or stay and a real person. So first copy the
  -- identity into deletion_holds, where it waits out a short window (or a long
  -- one if anyone reported them) before purge-deletion-holds erases it, files
  -- included. Taken before anything is deleted, in this same transaction.
  select email into v_email from auth.users where id = p_user;

  select exists (
           select 1 from public.reports r
            where r.subject_id = p_user and r.status in ('open', 'reviewing', 'actioned')),
         exists (
           select 1 from public.reports r
            where r.subject_id = p_user and r.status = 'actioned')
    into v_reported, v_actioned;

  v_days := case when v_reported
                 then public.config_int('deletion_hold_reported_days')
                 else public.config_int('deletion_hold_days') end;

  insert into public.deletion_holds
    (profile_id, tier, held_until, email, first_name, last_name, full_legal_name,
     phone, links, selfie_path, cv_path)
  select p.id,
         case when v_reported then 'reported' else 'standard' end,
         now() + make_interval(days => v_days),
         v_email, p.first_name, p.last_name, a.full_legal_name,
         cd.phone, a.links, a.selfie_path, a.cv_path
    from public.profiles p
    left join public.contact_details cd on cd.profile_id = p.id
    left join public.verification_applications a on a.profile_id = p.id
   where p.id = p_user and p.status <> 'deleted'
  on conflict (profile_id) do nothing;

  -- Someone whose reports were acted on leaves a one-way fingerprint behind,
  -- so signing up again as the same person is flagged to a moderator. Only
  -- the fingerprints are kept, and only for this case.
  if v_actioned then
    select full_legal_name into v_legal_name
      from public.verification_applications where profile_id = p_user;
    insert into public.conduct_bans (email_hash, name_hash, source_profile_id)
    values (public.fingerprint(v_email), public.fingerprint(v_legal_name), p_user);
  end if;

  -- ── things nobody else needs ────────────────────────────────────────────
  delete from public.contact_details where profile_id = p_user;
  delete from public.push_tokens where profile_id = p_user;
  delete from public.notifications where profile_id = p_user;
  delete from public.verification_applications where profile_id = p_user;
  delete from public.data_exports where profile_id = p_user;

  -- The grant is meaningless once contact_details are gone, and leaving it
  -- would show the counterparty a contact with nothing behind it.
  delete from public.contact_grants
    where profile_a = p_user or profile_b = p_user;

  -- Blocks THEY created go. Blocks created AGAINST them stay, so that somebody
  -- who blocked this person for a reason is not quietly re-exposed to them if
  -- the account is ever recreated.
  delete from public.blocks where blocker_id = p_user;

  -- Friendships go with the member: they were between two people, and one of
  -- them no longer exists. Their friends are not told.
  delete from public.friendships
    where requester_id = p_user or addressee_id = p_user;

  -- Reviews about them serve no purpose once they are gone. Reviews they WROTE
  -- about other people stay if published — see the note above — and the author
  -- now points at the tombstone, which renders as "Deleted member".
  delete from public.reviews where subject_id = p_user;
  delete from public.reviews where author_id = p_user and published_at is null;

  -- ── anything not underpinning a stay ────────────────────────────────────
  -- Order matters: requests and offers cascade from trips, and stays cascade
  -- from offers, so a naive "delete their trips" would take somebody else's
  -- stay with it.
  delete from public.requests
    where (from_profile = p_user or to_profile = p_user)
      and status <> 'accepted';

  delete from public.offers o
    where (o.from_profile = p_user or o.to_profile = p_user)
      and not exists (select 1 from public.stays s where s.offer_id = o.id);

  delete from public.availability where profile_id = p_user;

  delete from public.trips t
    where t.profile_id = p_user
      and not exists (
        select 1 from public.offers o
        join public.stays s on s.offer_id = o.id
        where o.trip_id = t.id
      );

  -- A trip that produced a stay survives, stripped of its free text. The dates
  -- and city are the counterparty's record of where they hosted somebody.
  update public.trips set note = null where profile_id = p_user;

  -- ── the tombstone ───────────────────────────────────────────────────────
  update public.profiles
    set display_name   = 'Deleted member',
        specialisation = null,
        bio            = null,
        home_district  = null,
        home_city_id   = null,
        photo_path     = null,
        links          = '[]'::jsonb,
        status         = 'deleted'
    where id = p_user;

  -- stays, published reviews they wrote, and reports in both directions are
  -- all retained deliberately and now point at the tombstone.

  -- The selfie and CV are deliberately NOT returned: the Edge Function that
  -- calls this used to delete them straight away, and now must not. They stay
  -- in Storage until the hold expires.
  return jsonb_build_object('ok', true, 'photoPath', v_photo_path);
end;
$$;
