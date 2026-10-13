-- Matching learns that a service is one post, and that not every service is a bed.
--
-- THE PROBLEM THIS SOLVES. Once each post is a single service (previous
-- migration), a host who offers a couch AND a coffee has two rows, and would show
-- up in matching twice. search_matches now groups them: one entry per host (and
-- per city, for nearby hosts), listing every service they offer. The nights, the
-- hosting conditions and the maximum come from their couch or room if they have
-- one; a host who offers only coffee or tips is listed with just those, and the
-- app shows no nights for them.
--
-- THE GAP IT CLOSES. Any availability row used to be enough to offer nights, so a
-- host who had posted only local tips could be matched with, and make an offer
-- to, a traveller who needed a bed. Now only a couch or a spare room can be
-- offered from: the offer range check, and the open-trips list a host picks from,
-- both require one.
--
-- Same invoker rights as before, deliberately: RLS must stay active inside
-- search_matches and search_open_trips.

create or replace function public.search_matches(p_trip_id uuid)
returns jsonb
language plpgsql
stable
set search_path = public
as $$
declare
  v_trip       public.trips%rowtype;
  v_city       public.cities%rowtype;
  v_range      daterange;
  v_hosts      jsonb;
  v_travellers jsonb;
  v_nearby     jsonb;
  v_host_count integer;
begin
  -- RLS already restricts trips to the caller's own plus other members'
  -- active ones; the explicit owner check makes it impossible to enumerate
  -- someone else's matches by passing their trip id.
  select * into v_trip
  from public.trips t
  where t.id = p_trip_id
    and t.profile_id = (select auth.uid());

  if not found then
    return jsonb_build_object(
      'hosts', '[]'::jsonb, 'travellers', '[]'::jsonb, 'nearbyHosts', '[]'::jsonb
    );
  end if;

  select * into v_city from public.cities c where c.id = v_trip.city_id;

  -- '[]' throughout: start_date and end_date are the first and last night, so
  -- both ends count. See packages/shared/src/domain/dates.ts.
  v_range := daterange(v_trip.start_date, v_trip.end_date, '[]');

  -- ── hosts in the destination city ────────────────────────────────────────
  select coalesce(
    jsonb_agg(
      jsonb_build_object(
        'availabilityId', m.availability_id,
        'profile', jsonb_build_object(
          'id', m.profile_id,
          'displayName', m.display_name,
          'discipline', m.discipline,
          'specialisation', m.specialisation,
          'photoPath', m.photo_path,
          'homeDistrict', m.home_district
        ),
        'cityId', m.city_id,
        'offers', m.offers,
        'constraints', m.constraints,
        'overlap', jsonb_build_object('start', m.overlap_start, 'end', m.overlap_end),
        'overlapNights', m.overlap_nights,
        'maxNights', m.max_nights,
        'distanceKm', 0
      )
      order by m.stays desc, m.overlap_nights desc, m.created_at asc
    ),
    '[]'::jsonb
  )
  into v_hosts
  from (
    -- One row per service, then one entry per HOST: a member who offers a couch
    -- and a coffee is one card with both on it, not two. The nights, the
    -- conditions and the maximum come from their couch or room when they have
    -- one, since those are about a stay; a host who offers only coffee or tips
    -- has no stay to count.
    with service_rows as (
      select
        a.id, a.profile_id, a.city_id, a.offers, a.constraints, a.max_nights, a.created_at,
        (a.offers && array['couch', 'spare_room'])        as stays,
        greatest(a.start_date, v_trip.start_date)          as overlap_start,
        least(a.end_date, v_trip.end_date)                 as overlap_end,
        (least(a.end_date, v_trip.end_date)
          - greatest(a.start_date, v_trip.start_date) + 1) as overlap_nights
      from public.availability a
      where a.city_id = v_trip.city_id
        and a.status = 'active'
        and a.profile_id <> (select auth.uid())
        and daterange(a.start_date, a.end_date, '[]') && v_range
    )
    select
      (array_agg(r.id order by r.stays desc, r.overlap_nights desc, r.created_at asc))[1] as availability_id,
      p.id                                               as profile_id,
      p.display_name,
      p.discipline,
      p.specialisation,
      p.photo_path,
      p.home_district,
      r.city_id,
      (select array_agg(distinct o order by o)
         from service_rows r2 cross join lateral unnest(r2.offers) as o
        where r2.profile_id = r.profile_id)              as offers,
      (select coalesce(array_agg(distinct c order by c), '{}'::text[])
         from service_rows r2 cross join lateral unnest(r2.constraints) as c
        where r2.profile_id = r.profile_id and r2.stays) as constraints,
      (array_agg(r.max_nights order by r.stays desc, r.overlap_nights desc, r.created_at asc))[1] as max_nights,
      (array_agg(r.overlap_start order by r.stays desc, r.overlap_nights desc, r.created_at asc))[1] as overlap_start,
      (array_agg(r.overlap_end order by r.stays desc, r.overlap_nights desc, r.created_at asc))[1] as overlap_end,
      (array_agg(r.overlap_nights order by r.stays desc, r.overlap_nights desc, r.created_at asc))[1] as overlap_nights,
      bool_or(r.stays)                                   as stays,
      min(r.created_at)                                  as created_at
    from service_rows r
    join public.profiles p on p.id = r.profile_id
    group by p.id, p.display_name, p.discipline, p.specialisation, p.photo_path,
             p.home_district, r.city_id, r.profile_id
    order by bool_or(r.stays) desc,
             (array_agg(r.overlap_nights order by r.stays desc, r.overlap_nights desc, r.created_at asc))[1] desc,
             min(r.created_at) asc
    limit 50
  ) m;

  v_host_count := jsonb_array_length(v_hosts);

  -- ── other travellers heading to the same city ────────────────────────────
  select coalesce(
    jsonb_agg(
      jsonb_build_object(
        'tripId', m.matched_trip_id,
        'profile', jsonb_build_object(
          'id', m.profile_id,
          'displayName', m.display_name,
          'discipline', m.discipline,
          'specialisation', m.specialisation,
          'photoPath', m.photo_path,
          'homeDistrict', m.home_district
        ),
        'overlap', jsonb_build_object('start', m.overlap_start, 'end', m.overlap_end),
        'overlapNights', m.overlap_nights,
        'needs', m.needs
      )
      order by m.overlap_nights desc, m.created_at asc
    ),
    '[]'::jsonb
  )
  into v_travellers
  from (
    select
      t.id                                               as matched_trip_id,
      p.id                                               as profile_id,
      p.display_name,
      p.discipline,
      p.specialisation,
      p.photo_path,
      p.home_district,
      t.needs,
      greatest(t.start_date, v_trip.start_date)          as overlap_start,
      least(t.end_date, v_trip.end_date)                 as overlap_end,
      (least(t.end_date, v_trip.end_date)
        - greatest(t.start_date, v_trip.start_date) + 1) as overlap_nights,
      t.created_at
    from public.trips t
    join public.profiles p on p.id = t.profile_id
    where t.city_id = v_trip.city_id
      and t.status = 'active'
      and t.id <> v_trip.id
      and t.profile_id <> (select auth.uid())
      and daterange(t.start_date, t.end_date, '[]') && v_range
    order by overlap_nights desc, t.created_at asc
    limit 50
  ) m;

  -- ── nearby cities, only when the destination itself is thin ──────────────
  --
  -- The designed answer to the cold-start problem in Project-Raw.md: an early
  -- user searching a quiet city gets a shorter list, not a dead end.
  if v_host_count < 5 then
    select coalesce(
      jsonb_agg(
        jsonb_build_object(
          'availabilityId', m.availability_id,
          'profile', jsonb_build_object(
            'id', m.profile_id,
            'displayName', m.display_name,
            'discipline', m.discipline,
            'specialisation', m.specialisation,
            'photoPath', m.photo_path,
            'homeDistrict', m.home_district
          ),
          'cityId', m.city_id,
          'cityName', m.city_name,
          'offers', m.offers,
          'constraints', m.constraints,
          'overlap', jsonb_build_object('start', m.overlap_start, 'end', m.overlap_end),
          'overlapNights', m.overlap_nights,
          'maxNights', m.max_nights,
          'distanceKm', m.distance_km
        )
        order by m.distance_km asc, m.overlap_nights desc
      ),
      '[]'::jsonb
    )
    into v_nearby
    from (
      with service_rows as (
        select
          a.id, a.profile_id, a.city_id, c.name as city_name, a.offers, a.constraints,
          a.max_nights, a.created_at,
          (a.offers && array['couch', 'spare_room'])        as stays,
          greatest(a.start_date, v_trip.start_date)          as overlap_start,
          least(a.end_date, v_trip.end_date)                 as overlap_end,
          (least(a.end_date, v_trip.end_date)
            - greatest(a.start_date, v_trip.start_date) + 1) as overlap_nights,
          round(public.distance_km(v_city.lat, v_city.lon, c.lat, c.lon)::numeric, 1) as distance_km
        from public.availability a
        join public.cities c on c.id = a.city_id
        where a.status = 'active'
          and a.city_id <> v_trip.city_id
          and a.profile_id <> (select auth.uid())
          and daterange(a.start_date, a.end_date, '[]') && v_range
          and public.distance_km(v_city.lat, v_city.lon, c.lat, c.lon) <= 100
      )
      select
        (array_agg(r.id order by r.stays desc, r.overlap_nights desc, r.created_at asc))[1] as availability_id,
        p.id                                               as profile_id,
        p.display_name,
        p.discipline,
        p.specialisation,
        p.photo_path,
        p.home_district,
        r.city_id,
        r.city_name,
        (select array_agg(distinct o order by o)
           from service_rows r2 cross join lateral unnest(r2.offers) as o
          where r2.profile_id = r.profile_id and r2.city_id = r.city_id) as offers,
        (select coalesce(array_agg(distinct c order by c), '{}'::text[])
           from service_rows r2 cross join lateral unnest(r2.constraints) as c
          where r2.profile_id = r.profile_id and r2.city_id = r.city_id and r2.stays) as constraints,
        (array_agg(r.max_nights order by r.stays desc, r.overlap_nights desc, r.created_at asc))[1] as max_nights,
        (array_agg(r.overlap_start order by r.stays desc, r.overlap_nights desc, r.created_at asc))[1] as overlap_start,
        (array_agg(r.overlap_end order by r.stays desc, r.overlap_nights desc, r.created_at asc))[1] as overlap_end,
        (array_agg(r.overlap_nights order by r.stays desc, r.overlap_nights desc, r.created_at asc))[1] as overlap_nights,
        r.distance_km
      from service_rows r
      join public.profiles p on p.id = r.profile_id
      group by p.id, p.display_name, p.discipline, p.specialisation, p.photo_path,
               p.home_district, r.city_id, r.city_name, r.distance_km, r.profile_id
      order by r.distance_km asc,
               (array_agg(r.overlap_nights order by r.stays desc, r.overlap_nights desc, r.created_at asc))[1] desc
      limit 20
    ) m;
  else
    v_nearby := '[]'::jsonb;
  end if;

  return jsonb_build_object(
    'hosts', v_hosts,
    'travellers', v_travellers,
    'nearbyHosts', v_nearby
  );
end;
$$;

create or replace function public.search_open_trips()
returns table (
  trip_id         uuid,
  profile_id      uuid,
  display_name    text,
  discipline      text,
  specialisation  text,
  photo_path      text,
  city_id         uuid,
  city_name       text,
  distance_km     numeric,
  trip_start      date,
  trip_end        date,
  needs           text[],
  note            text,
  overlap_start   date,
  overlap_end     date,
  overlap_nights  integer,
  already_offered boolean,
  already_asked   boolean
)
language sql
stable
set search_path = public
as $$
  -- One row per trip, keeping the availability window that covers the most
  -- nights: a host with two overlapping windows should see the better one, not
  -- the same traveller twice.
  select distinct on (t.id)
    t.id,
    p.id,
    p.display_name,
    p.discipline,
    p.specialisation,
    p.photo_path,
    t.city_id,
    tc.name,
    round(public.distance_km(ac.lat, ac.lon, tc.lat, tc.lon)::numeric, 1),
    t.start_date,
    t.end_date,
    t.needs,
    t.note,
    greatest(a.start_date, t.start_date),
    least(a.end_date, t.end_date),
    (least(a.end_date, t.end_date) - greatest(a.start_date, t.start_date) + 1)::integer,
    exists (
      select 1 from public.offers o
      where o.trip_id = t.id
        and o.from_profile = (select auth.uid())
        and o.status in ('pending', 'accepted')
    ),
    exists (
      select 1 from public.requests r
      where r.trip_id = t.id
        and r.to_profile = (select auth.uid())
        and r.status = 'pending'
    )
  from public.availability a
  join public.cities ac on ac.id = a.city_id
  join public.trips t
    on t.status = 'active'
   and t.profile_id <> (select auth.uid())
   and daterange(a.start_date, a.end_date, '[]') && daterange(t.start_date, t.end_date, '[]')
  join public.cities tc on tc.id = t.city_id
  join public.profiles p on p.id = t.profile_id
  where a.profile_id = (select auth.uid())
    and a.status = 'active'
    -- Nights can only be offered from a couch or a spare room: a coffee or a tip
    -- is not a place to sleep.
    and a.offers && array['couch', 'spare_room']
    -- The same reach the offer containment trigger allows, so every trip
    -- listed here can actually be offered on.
    and (
      t.city_id = a.city_id
      or public.distance_km(ac.lat, ac.lon, tc.lat, tc.lon)
         <= public.config_int('nearby_radius_km')
    )
  order by t.id,
           (least(a.end_date, t.end_date) - greatest(a.start_date, t.start_date)) desc,
           t.start_date asc
  limit 50;
$$;

create or replace function public.enforce_offer_range()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_trip    public.trips%rowtype;
  v_city    public.cities%rowtype;
  v_radius  integer := public.config_int('nearby_radius_km');
  v_city_id uuid;
begin
  select * into v_trip from public.trips t where t.id = new.trip_id;
  if not found then
    raise exception 'that trip no longer exists' using errcode = '23503';
  end if;

  if new.to_profile <> v_trip.profile_id then
    raise exception 'an offer must be addressed to the traveller who posted the trip'
      using errcode = '23514';
  end if;

  if not (daterange(v_trip.start_date, v_trip.end_date, '[]')
          @> daterange(new.start_date, new.end_date, '[]')) then
    raise exception 'the offered nights fall outside the trip'
      using errcode = '23514';
  end if;

  select * into v_city from public.cities c where c.id = v_trip.city_id;

  -- The availability row that covers the offered nights also decides where the
  -- stay happens. Nearest city first, so a host with availability in both the
  -- destination and a neighbouring city resolves to the destination.
  select a.city_id into v_city_id
  from public.availability a
  join public.cities c on c.id = a.city_id
  where a.profile_id = new.from_profile
    and a.status = 'active'
    and a.offers && array['couch', 'spare_room']
    and daterange(a.start_date, a.end_date, '[]')
        @> daterange(new.start_date, new.end_date, '[]')
    and (
      a.city_id = v_trip.city_id
      or public.distance_km(v_city.lat, v_city.lon, c.lat, c.lon) <= v_radius
    )
  order by public.distance_km(v_city.lat, v_city.lon, c.lat, c.lon) asc
  limit 1;

  if v_city_id is null then
    raise exception 'those nights are not inside any availability you have posted'
      using errcode = '23514';
  end if;

  new.city_id := v_city_id;
  return new;
end;
$$;

comment on function public.search_matches is
  'Everything the match screen shows, in one round trip. One entry per host, '
  'listing every service they offer. Invoker rights so RLS still applies — do not '
  'change to SECURITY DEFINER.';

grant execute on function public.search_matches(uuid) to authenticated;
grant execute on function public.search_open_trips() to authenticated;
