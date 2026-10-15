-- Offering a service to someone without being asked.
--
-- A member can already offer NIGHTS unprompted: any trip they can see, a couch or
-- a room that covers it (offers). This adds the same for the two services that are
-- not a bed, a coffee and local tips. From a trip they can see, a member offers one
-- of the services they have posted; the trip's owner accepts (and both get each
-- other's contact details) or declines.
--
-- WHICH TRIPS. Only ones the giver can read, which is the trip visibility rule:
-- public to residents and visitors, connections' trips for connections, and never a
-- private one. The insert policy asks for the trip through RLS, so it inherits that
-- exactly.
--
-- WHAT THE GIVER MUST HAVE. An active post of that service in the trip's city, on
-- dates that overlap (or always available). A coffee is offered from a coffee post,
-- not out of nowhere.
--
-- ACCEPTING shares contact both ways, like a co-accommodation request, through
-- accept_service_offer(). It counts as a completed service for the giver once the
-- trip has ended (see completed_services), like the tips and coffee requests do.
--
-- Written to be re-runnable where it can be.

insert into public.app_config (key, value) values
  ('max_service_offers_per_trip', '20'::jsonb)
on conflict (key) do nothing;

-- A new reason to share contact details.
alter table public.contact_grants drop constraint if exists source_known;
alter table public.contact_grants
  add constraint source_known check (source in ('offer', 'co_request', 'service_offer'));

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
  'connection_request_received',
  'connection_request_accepted',
  'tips_request_received',
  'coffee_request_received',
  -- a coffee or tips offered unprompted
  'service_offer_received',
  'service_offer_accepted',
  'service_offer_declined'
));

create table if not exists public.service_offers (
  id           uuid primary key default gen_random_uuid(),
  kind         text not null check (kind in ('coffee', 'tips')),
  trip_id      uuid not null references public.trips(id) on delete cascade,
  from_profile uuid not null references public.profiles(id) on delete cascade,
  to_profile   uuid not null references public.profiles(id) on delete cascade,
  message      text,
  status       text not null default 'pending'
               check (status in ('pending', 'accepted', 'declined', 'withdrawn', 'expired')),
  created_at   timestamptz not null default now(),
  responded_at timestamptz,

  constraint no_self_service_offer check (from_profile <> to_profile),
  constraint service_offer_message_length check (message is null or char_length(message) <= 500),
  -- One offer of each service per person per trip, as with requests.
  unique (trip_id, from_profile, kind)
);

create index if not exists service_offers_to on public.service_offers (to_profile, status);
create index if not exists service_offers_from on public.service_offers (from_profile, created_at desc);
create index if not exists service_offers_trip on public.service_offers (trip_id);

comment on table public.service_offers is
  'A coffee or local tips offered unprompted on a trip the giver can see. Accepting '
  'shares contact details both ways.';

-- Counting the offers on a trip needs to see them all, which RLS would not allow
-- from inside a policy on this same table.
create or replace function public.service_offer_count(p_trip_id uuid)
returns integer
language sql
stable
security definer
set search_path = public
as $$
  select count(*)::integer from public.service_offers where trip_id = p_trip_id;
$$;

-- The rules that cannot be a policy: whose trip it is, whether it is still ahead,
-- and whether the giver has actually posted that service there.
create or replace function public.enforce_service_offer()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_trip public.trips%rowtype;
begin
  select * into v_trip from public.trips t where t.id = new.trip_id;
  if not found then
    raise exception 'that trip no longer exists' using errcode = '23503';
  end if;

  if new.to_profile <> v_trip.profile_id then
    raise exception 'an offer must be addressed to the member who posted the trip'
      using errcode = '23514';
  end if;

  if v_trip.end_date < current_date then
    raise exception 'that trip is over' using errcode = '23514';
  end if;

  if not exists (
    select 1 from public.availability a
     where a.profile_id = new.from_profile
       and a.status = 'active'
       and a.city_id = v_trip.city_id
       and a.offers @> array[new.kind]
       and daterange(a.start_date, a.end_date, '[]')
           && daterange(v_trip.start_date, v_trip.end_date, '[]')
  ) then
    raise exception 'you have not offered that service in this city for these dates'
      using errcode = '23514';
  end if;

  if public.service_offer_count(new.trip_id) >= public.config_int('max_service_offers_per_trip') then
    raise exception 'this trip already has as many offers as it can take'
      using errcode = '23514';
  end if;

  return new;
end;
$$;

drop trigger if exists service_offers_enforce on public.service_offers;
create trigger service_offers_enforce
  before insert on public.service_offers
  for each row execute function public.enforce_service_offer();

-- The update policies decide which row; this decides which column.
create or replace function public.guard_service_offer_columns()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  if current_user in ('service_role', 'postgres', 'supabase_admin') then
    return new;
  end if;

  if new.id is distinct from old.id
     or new.kind is distinct from old.kind
     or new.trip_id is distinct from old.trip_id
     or new.from_profile is distinct from old.from_profile
     or new.to_profile is distinct from old.to_profile
     or new.message is distinct from old.message
     or new.created_at is distinct from old.created_at then
    raise exception 'only service_offers.status is client-updatable'
      using errcode = '42501';
  end if;

  if new.status is distinct from old.status then
    new.responded_at := now();
  end if;

  return new;
end;
$$;

drop trigger if exists service_offers_guard_columns on public.service_offers;
create trigger service_offers_guard_columns
  before update on public.service_offers
  for each row execute function public.guard_service_offer_columns();

-- ── RLS ───────────────────────────────────────────────────────────────────
alter table public.service_offers enable row level security;

drop policy if exists service_offers_select_parties on public.service_offers;
create policy service_offers_select_parties
  on public.service_offers for select
  to authenticated
  using (from_profile = (select auth.uid()) or to_profile = (select auth.uid()));

-- The trip is looked up THROUGH RLS, so only a trip the giver may see can be
-- offered on: that is the whole of "any trip that is visible to me".
drop policy if exists service_offers_insert_own on public.service_offers;
create policy service_offers_insert_own
  on public.service_offers for insert
  to authenticated
  with check (
    from_profile = (select auth.uid())
    and public.is_approved()
    and not public.is_blocked(to_profile)
    and status = 'pending'
    and exists (
      select 1 from public.trips t
      where t.id = trip_id and t.status = 'active'
    )
    and exists (
      select 1 from public.profiles p
      where p.id = to_profile and p.status = 'approved'
    )
  );

drop policy if exists service_offers_withdraw_own on public.service_offers;
create policy service_offers_withdraw_own
  on public.service_offers for update
  to authenticated
  using (from_profile = (select auth.uid()) and status = 'pending')
  with check (from_profile = (select auth.uid()) and status = 'withdrawn');

drop policy if exists service_offers_decline_received on public.service_offers;
create policy service_offers_decline_received
  on public.service_offers for update
  to authenticated
  using (to_profile = (select auth.uid()) and status = 'pending')
  with check (to_profile = (select auth.uid()) and status = 'declined');

revoke all on public.service_offers from anon, authenticated;
grant select, insert, update on public.service_offers to authenticated;

-- ── accepting ─────────────────────────────────────────────────────────────
-- Writes a contact grant and two notifications in one transaction, so it is a
-- function rather than an update the client could do on its own.
create or replace function public.accept_service_offer(p_offer_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_me    uuid := (select auth.uid());
  v_offer public.service_offers%rowtype;
  v_trip  public.trips%rowtype;
begin
  select * into v_offer from public.service_offers s where s.id = p_offer_id;

  -- Not found and not yours are the same answer, so nobody can probe for offers.
  if v_me is null or not found or v_offer.to_profile <> v_me then
    return jsonb_build_object('ok', false, 'error', 'offer_not_found');
  end if;

  select * into v_trip from public.trips t where t.id = v_offer.trip_id for update;
  select * into v_offer from public.service_offers s where s.id = p_offer_id for update;

  -- Idempotent: a double tap on a bad connection.
  if v_offer.status = 'accepted' then
    return jsonb_build_object('ok', true, 'grantedWith', v_offer.from_profile);
  end if;

  if v_offer.status = 'expired' or v_trip.end_date < current_date then
    return jsonb_build_object('ok', false, 'error', 'offer_expired');
  end if;

  if v_offer.status <> 'pending' then
    return jsonb_build_object('ok', false, 'error', 'offer_not_pending');
  end if;

  if v_trip.status <> 'active' then
    return jsonb_build_object('ok', false, 'error', 'trip_cancelled');
  end if;

  if not exists (select 1 from public.profiles p where p.id = v_offer.from_profile and p.status = 'approved')
     or not exists (select 1 from public.profiles p where p.id = v_offer.to_profile and p.status = 'approved') then
    return jsonb_build_object('ok', false, 'error', 'not_approved');
  end if;

  update public.service_offers set status = 'accepted', responded_at = now() where id = p_offer_id;

  insert into public.contact_grants (profile_a, profile_b, source, source_id)
  values (
    least(v_offer.from_profile, v_offer.to_profile),
    greatest(v_offer.from_profile, v_offer.to_profile),
    'service_offer',
    p_offer_id
  )
  on conflict (profile_a, profile_b, source, source_id) do nothing;

  perform public.enqueue_notification(
    v_offer.from_profile,
    'service_offer_accepted',
    public.notification_trip_payload(v_offer.trip_id)
      || jsonb_build_object(
           'offerId', v_offer.id,
           'kind', v_offer.kind,
           'withProfileId', v_offer.to_profile,
           'withName', public.display_name_of(v_offer.to_profile)
         )
  );

  perform public.enqueue_notification(
    v_offer.to_profile,
    'service_offer_accepted',
    public.notification_trip_payload(v_offer.trip_id)
      || jsonb_build_object(
           'offerId', v_offer.id,
           'kind', v_offer.kind,
           'withProfileId', v_offer.from_profile,
           'withName', public.display_name_of(v_offer.from_profile)
         )
  );

  return jsonb_build_object('ok', true, 'grantedWith', v_offer.from_profile);
end;
$$;

revoke all on function public.accept_service_offer(uuid) from public, anon, authenticated;
grant execute on function public.accept_service_offer(uuid) to authenticated;

-- ── notifications ─────────────────────────────────────────────────────────
create or replace function public.notify_on_service_offer()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  perform public.enqueue_notification(
    new.to_profile,
    'service_offer_received',
    public.notification_trip_payload(new.trip_id)
      || jsonb_build_object(
           'offerId', new.id,
           'kind', new.kind,
           'fromProfileId', new.from_profile,
           'fromName', public.display_name_of(new.from_profile)
         )
  );
  return null;
end;
$$;

drop trigger if exists service_offers_notify_on_insert on public.service_offers;
create trigger service_offers_notify_on_insert
  after insert on public.service_offers
  for each row execute function public.notify_on_service_offer();

-- Only a decline is announced. A withdrawal says nothing, as the offer simply
-- goes away, and an acceptance is announced by accept_service_offer().
create or replace function public.notify_on_service_offer_response()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if new.status = 'declined' and old.status = 'pending' then
    perform public.enqueue_notification(
      new.from_profile,
      'service_offer_declined',
      public.notification_trip_payload(new.trip_id)
        || jsonb_build_object(
             'offerId', new.id,
             'kind', new.kind,
             'toProfileId', new.to_profile,
             'toName', public.display_name_of(new.to_profile)
           )
    );
  end if;
  return null;
end;
$$;

drop trigger if exists service_offers_notify_on_response on public.service_offers;
create trigger service_offers_notify_on_response
  after update of status on public.service_offers
  for each row execute function public.notify_on_service_offer_response();

-- ── blocking withdraws what is still open, silently ───────────────────────
create or replace function public.withdraw_service_offers_on_block()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  update public.service_offers
     set status = 'withdrawn', responded_at = now()
   where status = 'pending'
     and ((from_profile = new.blocker_id and to_profile = new.blocked_id)
       or (from_profile = new.blocked_id and to_profile = new.blocker_id));
  return null;
end;
$$;

drop trigger if exists blocks_withdraw_service_offers on public.blocks;
create trigger blocks_withdraw_service_offers
  after insert on public.blocks
  for each row execute function public.withdraw_service_offers_on_block();

-- ── what already named the old set of things ──────────────────────────────
create or replace function public.expire_stale_requests_and_offers()
returns integer
language plpgsql
security definer
set search_path = public
as $$
declare
  affected integer;
begin
  with expired_requests as (
    update public.requests r
      set status = 'expired'
      from public.trips t
      where t.id = r.trip_id
        and r.status = 'pending'
        and t.end_date < current_date
      returning r.id
  ),
  expired_offers as (
    update public.offers o
      set status = 'expired'
      where o.status = 'pending'
        and o.end_date < current_date
      returning o.id
  ),
  expired_service_offers as (
    update public.service_offers s
      set status = 'expired'
      from public.trips t
      where t.id = s.trip_id
        and s.status = 'pending'
        and t.end_date < current_date
      returning s.id
  )
  select (select count(*) from expired_requests)
       + (select count(*) from expired_offers)
       + (select count(*) from expired_service_offers)
    into affected;

  return affected;
end;
$$;

create or replace function public.completed_services(p_profile uuid)
returns table (
  kind            text,
  recipient_id    uuid,
  trip_id         uuid,
  city_name       text,
  trip_is_private boolean,
  completed_on    date
)
language sql
stable
security definer
set search_path = public
as $$
  select 'couch'::text, s.guest_id, o.trip_id, c.name, (t.visibility = 'private'), s.end_date
    from public.stays s
    join public.offers o on o.id = s.offer_id
    join public.trips t on t.id = o.trip_id
    join public.cities c on c.id = s.city_id
   where s.host_id = p_profile
     and s.end_date < current_date

  union all

  select r.kind::text, r.from_profile, r.trip_id, c.name, (t.visibility = 'private'), t.end_date
    from public.requests r
    join public.trips t on t.id = r.trip_id
    join public.cities c on c.id = t.city_id
   where r.to_profile = p_profile
     and r.kind in ('tips', 'coffee')
     and r.status = 'accepted'
     and t.status <> 'cancelled'
     and t.end_date < current_date

  union all

  -- A tips or coffee offer the member made unprompted, accepted by the trip's
  -- owner and for a trip that has ended.
  select so.kind, so.to_profile, so.trip_id, c.name, (t.visibility = 'private'), t.end_date
    from public.service_offers so
    join public.trips t on t.id = so.trip_id
    join public.cities c on c.id = t.city_id
   where so.from_profile = p_profile
     and so.status = 'accepted'
     and t.status <> 'cancelled'
     and t.end_date < current_date
$$;

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

  -- Connections go with the member: they were between two people, and one of
  -- them no longer exists. Their connections are not told.
  delete from public.connections
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

  delete from public.service_offers
    where (from_profile = p_user or to_profile = p_user)
      and status <> 'accepted';

  delete from public.offers o
    where (o.from_profile = p_user or o.to_profile = p_user)
      and not exists (select 1 from public.stays s where s.offer_id = o.id);

  delete from public.availability where profile_id = p_user;

  -- A trip survives, stripped of its free text, if somebody else's record rests
  -- on it: a stay, or a coffee or tips that was accepted. Otherwise their count of
  -- services given would shrink the day the other person left.
  delete from public.trips t
    where t.profile_id = p_user
      and not exists (
        select 1 from public.offers o
        join public.stays s on s.offer_id = o.id
        where o.trip_id = t.id
      )
      and not exists (
        select 1 from public.service_offers so
        where so.trip_id = t.id and so.status = 'accepted'
      )
      and not exists (
        select 1 from public.requests r
        where r.trip_id = t.id and r.status = 'accepted' and r.kind in ('tips', 'coffee')
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
