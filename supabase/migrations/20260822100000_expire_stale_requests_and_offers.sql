-- Milestone 3 — expiry of requests and offers whose nights have passed.
--
-- `request_status` and `offer_status` both declared 'expired' from the start,
-- but nothing ever set it. Two consequences, one cosmetic and one not:
--
--   * A request for a trip that happened in March sat in the host's "waiting on
--     you" list forever.
--
--   * MORE SERIOUSLY: accept_offer guarded on offer status, trip status and
--     profile status, but never on dates — and nothing sets trips.completed
--     either. So a months-old offer was still 'pending' against a still-
--     'active' trip, and accepting it wrote a stays row entirely in the past.
--     Milestone 4 decides when to prompt for a review by comparing
--     stays.end_date against current_date, so that backdated stay would read as
--     already finished and immediately ask both people to review a stay that
--     never happened.
--
-- Fixed in two places, deliberately. The sweep is housekeeping; the guard
-- inside the acceptance functions is the correctness fix, because there is
-- always a window between a trip's last night passing and the next sweep
-- running.

-- ───────────────────────────────────────────────────────────────────────────
-- The sweep
--
-- A request expires with its TRIP — it asks for a stay, not for particular
-- nights. An offer expires with its OWN last night, which may fall earlier: a
-- host who offered the 3rd to the 5th of a trip running to the 10th has
-- nothing left to give on the 6th.
--
-- responded_at is deliberately left null. Nobody responded; the dates simply
-- ran out, and the column should not claim otherwise.
--
-- No notification is enqueued. There is no expiry notification type in the
-- design, and telling somebody their months-old request has been tidied away
-- is noise, not news.
-- ───────────────────────────────────────────────────────────────────────────
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
  )
  select (select count(*) from expired_requests)
       + (select count(*) from expired_offers)
    into affected;

  return affected;
end;
$$;

revoke all on function public.expire_stale_requests_and_offers()
  from public, anon, authenticated;

comment on function public.expire_stale_requests_and_offers is
  'Daily housekeeping. The real guard against accepting a dead offer lives in '
  'accept_offer — a sweep can always be one run behind.';

-- Daily at 04:00 UTC, clear of the 03:00 and 09:00 jobs from Milestone 1.
-- Date granularity makes anything more frequent pointless.
select cron.schedule(
  'expire-stale-requests-and-offers',
  '0 4 * * *',
  $$ select public.expire_stale_requests_and_offers(); $$
);

-- ───────────────────────────────────────────────────────────────────────────
-- accept_offer — unchanged except for the date guard
--
-- `end_date < current_date` and not `<=`: an offer whose last night is tonight
-- is still perfectly acceptable, and a traveller arriving today should be able
-- to take it. Only nights that are wholly in the past are refused.
--
-- Compared in Postgres against current_date, never a client clock — the same
-- rule Milestone 4 uses to decide when a stay has ended.
-- ───────────────────────────────────────────────────────────────────────────
create or replace function public.accept_offer(p_offer_id uuid, p_user uuid)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_offer         public.offers%rowtype;
  v_trip          public.trips%rowtype;
  v_stay          public.stays%rowtype;
  v_auto_declined integer := 0;
begin
  select * into v_offer from public.offers o where o.id = p_offer_id;

  -- Not found and not-yours are the same answer on purpose: distinguishing
  -- them would let anyone probe for the existence of other people's offers.
  if not found or v_offer.to_profile <> p_user then
    return jsonb_build_object('ok', false, 'error', 'offer_not_found');
  end if;

  -- Serialise every acceptance on this trip against each other. Locking the
  -- offer alone would not: two siblings accepted concurrently would each see
  -- the other as still pending and both would produce a stay.
  select * into v_trip from public.trips t where t.id = v_offer.trip_id for update;

  -- Re-read under the lock. Between the first read and here, a concurrent
  -- call may already have accepted this very offer.
  select * into v_offer from public.offers o where o.id = p_offer_id for update;

  -- Idempotent: the user may double-tap on a bad connection. This stays ahead
  -- of the date guard so that an already-accepted offer keeps returning its
  -- stay even after the nights have passed.
  if v_offer.status = 'accepted' then
    select * into v_stay from public.stays s where s.offer_id = p_offer_id;
    select count(*)::integer into v_auto_declined
      from public.offers o
      where o.trip_id = v_offer.trip_id and o.auto_declined;

    return jsonb_build_object(
      'ok', true,
      'stayId', v_stay.id,
      'range', jsonb_build_object('start', v_stay.start_date, 'end', v_stay.end_date),
      'nights', (v_stay.end_date - v_stay.start_date + 1),
      'autoDeclinedCount', v_auto_declined
    );
  end if;

  -- The nights are gone. Accepting here would write a stay wholly in the past,
  -- which Milestone 4 would immediately prompt both parties to review.
  if v_offer.status = 'expired' or v_offer.end_date < current_date then
    return jsonb_build_object('ok', false, 'error', 'offer_expired');
  end if;

  if v_offer.status <> 'pending' then
    return jsonb_build_object('ok', false, 'error', 'offer_not_pending');
  end if;

  if v_trip.status <> 'active' then
    return jsonb_build_object('ok', false, 'error', 'trip_cancelled');
  end if;

  if not exists (
    select 1 from public.profiles p
    where p.id = v_offer.from_profile and p.status = 'approved'
  ) or not exists (
    select 1 from public.profiles p
    where p.id = v_offer.to_profile and p.status = 'approved'
  ) then
    return jsonb_build_object('ok', false, 'error', 'not_approved');
  end if;

  -- 1. Accept. The offers trigger enqueues offer_accepted to the host and
  --    offer_confirmed to the traveller.
  update public.offers
    set status = 'accepted', responded_at = now()
    where id = p_offer_id;

  -- 2. Decline every sibling. The same trigger enqueues offer_declined for
  --    each, carrying auto_declined so the copy can say "she found a couch"
  --    rather than "she turned you down".
  with declined as (
    update public.offers
      set status = 'declined', auto_declined = true, responded_at = now()
      where trip_id = v_offer.trip_id
        and id <> p_offer_id
        and status = 'pending'
      returning id
  )
  select count(*)::integer into v_auto_declined from declined;

  -- 3. Close the originating request, if the offer answered one.
  if v_offer.request_id is not null then
    update public.requests
      set status = 'accepted', responded_at = now()
      where id = v_offer.request_id and status = 'pending';
  end if;

  -- 4. The reveal. Canonically ordered so the grant is symmetric and cannot be
  --    stored twice in mirror form.
  insert into public.contact_grants (profile_a, profile_b, source, source_id)
  values (
    least(v_offer.from_profile, v_offer.to_profile),
    greatest(v_offer.from_profile, v_offer.to_profile),
    'offer',
    p_offer_id
  )
  on conflict (profile_a, profile_b, source, source_id) do nothing;

  -- 5. The stay: the reviewable unit Milestone 4 hangs off. city_id comes from
  --    the offer, which the containment trigger set from the availability row
  --    that covers these nights — for a nearby-city host that is where the
  --    guest actually sleeps, not the trip's destination.
  insert into public.stays (offer_id, host_id, guest_id, city_id, start_date, end_date)
  values (
    p_offer_id,
    v_offer.from_profile,
    v_offer.to_profile,
    coalesce(v_offer.city_id, v_trip.city_id),
    v_offer.start_date,
    v_offer.end_date
  )
  returning * into v_stay;

  return jsonb_build_object(
    'ok', true,
    'stayId', v_stay.id,
    'range', jsonb_build_object('start', v_stay.start_date, 'end', v_stay.end_date),
    'nights', (v_stay.end_date - v_stay.start_date + 1),
    'autoDeclinedCount', v_auto_declined
  );
end;
$$;

-- ───────────────────────────────────────────────────────────────────────────
-- accept_co_request — same guard, keyed on the trip
--
-- There are no offered nights here, so the trip's own last night is what
-- decides whether splitting a place still means anything.
-- ───────────────────────────────────────────────────────────────────────────
create or replace function public.accept_co_request(p_request_id uuid, p_user uuid)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_request public.requests%rowtype;
  v_trip    public.trips%rowtype;
begin
  select * into v_request from public.requests r where r.id = p_request_id;

  if not found
     or v_request.to_profile <> p_user
     or v_request.kind <> 'co_accommodation' then
    return jsonb_build_object('ok', false, 'error', 'request_not_found');
  end if;

  select * into v_trip from public.trips t where t.id = v_request.trip_id for update;
  select * into v_request from public.requests r where r.id = p_request_id for update;

  -- Idempotent for the same reason accept_offer is: a double-tap on a train.
  if v_request.status = 'accepted' then
    return jsonb_build_object('ok', true, 'grantedWith', v_request.from_profile);
  end if;

  if v_request.status = 'expired' or v_trip.end_date < current_date then
    return jsonb_build_object('ok', false, 'error', 'request_expired');
  end if;

  if v_request.status <> 'pending' then
    return jsonb_build_object('ok', false, 'error', 'request_not_pending');
  end if;

  if v_trip.status <> 'active' then
    return jsonb_build_object('ok', false, 'error', 'trip_cancelled');
  end if;

  if not exists (
    select 1 from public.profiles p
    where p.id = v_request.from_profile and p.status = 'approved'
  ) or not exists (
    select 1 from public.profiles p
    where p.id = v_request.to_profile and p.status = 'approved'
  ) then
    return jsonb_build_object('ok', false, 'error', 'not_approved');
  end if;

  update public.requests
    set status = 'accepted', responded_at = now()
    where id = p_request_id;

  insert into public.contact_grants (profile_a, profile_b, source, source_id)
  values (
    least(v_request.from_profile, v_request.to_profile),
    greatest(v_request.from_profile, v_request.to_profile),
    'co_request',
    p_request_id
  )
  on conflict (profile_a, profile_b, source, source_id) do nothing;

  -- Both sides, because both now have someone to contact. The requests trigger
  -- covers withdrawal and decline but deliberately not acceptance, which is
  -- only reachable through this function.
  perform public.enqueue_notification(
    v_request.from_profile,
    'co_request_accepted',
    public.notification_trip_payload(v_request.trip_id)
      || jsonb_build_object(
           'requestId', v_request.id,
           'withProfileId', v_request.to_profile,
           'withName', public.display_name_of(v_request.to_profile)
         )
  );

  perform public.enqueue_notification(
    v_request.to_profile,
    'co_request_accepted',
    public.notification_trip_payload(v_request.trip_id)
      || jsonb_build_object(
           'requestId', v_request.id,
           'withProfileId', v_request.from_profile,
           'withName', public.display_name_of(v_request.from_profile)
         )
  );

  return jsonb_build_object('ok', true, 'grantedWith', v_request.from_profile);
end;
$$;
