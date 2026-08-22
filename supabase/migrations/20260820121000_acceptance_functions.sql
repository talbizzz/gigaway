-- Milestone 3 — the acceptance transaction.
--
-- This is the single most important transaction in the product, and the whole
-- reason it lives in SQL rather than in the Edge Function: partial application
-- is the worst failure mode GigAway has. A contact grant with no stay, or a
-- stay with no sibling declines, leaves two people holding different beliefs
-- about where somebody is sleeping.
--
-- A supabase-js Edge Function cannot open a transaction across four tables, so
-- — exactly as redeem_invite established in Milestone 1 — the work happens in
-- a plpgsql function, which IS one transaction, and the Edge Function is
-- authentication, validation and error mapping only.
--
-- Notification rows are not written here. Triggers on `offers` and `requests`
-- do that, inside this same transaction, so a notification can never be
-- enqueued for an acceptance that later rolls back.

-- ───────────────────────────────────────────────────────────────────────────
-- accept_offer
--
-- IDEMPOTENT. The user may double-tap on a bad connection, and accepting an
-- already-accepted offer returns the existing stay rather than erroring — or
-- worse, creating a second one.
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

revoke all on function public.accept_offer(uuid, uuid) from public, anon, authenticated;

comment on function public.accept_offer is
  'Called only by the accept-offer Edge Function as service_role. Idempotent: '
  'accepting an already-accepted offer returns the existing stay.';

-- ───────────────────────────────────────────────────────────────────────────
-- accept_co_request
--
-- The same shape, shorter. Two travellers agreeing to split a place: neither
-- hosted the other, so there is NO stay and Milestone 4 prompts no review.
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

revoke all on function public.accept_co_request(uuid, uuid) from public, anon, authenticated;
