-- Tips and coffee requests.
--
-- Uses the two new request kinds (previous migration). They behave like a
-- co-accommodation request: nobody is hosting, nothing is negotiated, and
-- accepting shares contact details both ways so the two of them arrange it
-- themselves. accept_co_request keeps its name (the Edge Function and app call
-- it) and now answers all three.
--
-- Notifications: a request arriving gets its own type for each new kind, so the
-- copy can say what is being asked. Acceptance and decline keep their existing
-- types and carry the kind in the payload, which the copy reads.

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
  'friend_request_received',
  'friend_request_accepted',
  -- Milestone 7
  'tips_request_received',
  'coffee_request_received'
));

create or replace function public.notify_on_request()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  perform public.enqueue_notification(
    new.to_profile,
    case new.kind
      when 'co_accommodation' then 'co_request_received'
      when 'tips'             then 'tips_request_received'
      when 'coffee'           then 'coffee_request_received'
      else 'request_received'
    end,
    public.notification_trip_payload(new.trip_id)
      || jsonb_build_object(
           'requestId', new.id,
           'kind', new.kind,
           'fromProfileId', new.from_profile,
           'fromName', public.display_name_of(new.from_profile)
         )
  );
  return null;
end;
$$;

create or replace function public.notify_on_request_response()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if new.status = old.status then
    return null;
  end if;

  if new.status = 'withdrawn' then
    perform public.enqueue_notification(
      new.to_profile,
      'request_withdrawn',
      public.notification_trip_payload(new.trip_id)
        || jsonb_build_object(
             'requestId', new.id,
             'fromProfileId', new.from_profile,
             'fromName', public.display_name_of(new.from_profile)
           )
    );
  elsif new.status = 'declined' and new.kind in ('co_accommodation', 'tips', 'coffee') then
    perform public.enqueue_notification(
      new.from_profile,
      'co_request_declined',
      public.notification_trip_payload(new.trip_id)
        || jsonb_build_object(
             'requestId', new.id,
             'kind', new.kind,
             'toProfileId', new.to_profile,
             'toName', public.display_name_of(new.to_profile)
           )
    );
  end if;

  return null;
end;
$$;

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
     or v_request.kind not in ('co_accommodation', 'tips', 'coffee') then
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
           'kind', v_request.kind,
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
           'kind', v_request.kind,
           'withProfileId', v_request.from_profile,
           'withName', public.display_name_of(v_request.from_profile)
         )
  );

  return jsonb_build_object('ok', true, 'grantedWith', v_request.from_profile);
end;
$$;
