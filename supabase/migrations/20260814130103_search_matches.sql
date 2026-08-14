-- Milestone 2 — matching.
--
-- One round trip returns everything the match screen shows: hosts in the
-- destination city, other travellers there in the same window, and — only when
-- the first list is thin — hosts in nearby cities.
--
-- CRITICAL: invoker rights (the default), NOT security definer. RLS must stay
-- active inside this function so that pending applicants, suspended profiles
-- and blocked pairs are filtered by the same policies as everywhere else. A
-- definer function here would quietly become a hole through the entire privacy
-- model, and the pgTAP tests assert it is not one.

-- Great-circle distance in kilometres. Sufficient at this scale — a few
-- thousand cities — and avoids taking a PostGIS dependency for one expression.
create or replace function public.distance_km(
  lat1 double precision, lon1 double precision,
  lat2 double precision, lon2 double precision
)
returns double precision
language sql
immutable
parallel safe
as $$
  select 6371 * acos(
    -- Clamped because floating-point error can push the dot product a hair
    -- outside [-1, 1], where acos() returns NaN.
    least(1.0, greatest(-1.0,
      sin(radians(lat1)) * sin(radians(lat2)) +
      cos(radians(lat1)) * cos(radians(lat2)) * cos(radians(lon2 - lon1))
    ))
  );
$$;

-- The parameter is p_trip_id, not trip_id: a bare `trip_id` collides with the
-- column of the same name inside the query bodies, and PL/pgSQL resolves the
-- ambiguity by raising rather than guessing. The client sends { p_trip_id }.
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
      order by m.overlap_nights desc, m.created_at asc
    ),
    '[]'::jsonb
  )
  into v_hosts
  from (
    select
      a.id                                               as availability_id,
      p.id                                               as profile_id,
      p.display_name,
      p.discipline,
      p.specialisation,
      p.photo_path,
      p.home_district,
      a.city_id,
      a.offers,
      a.constraints,
      a.max_nights,
      greatest(a.start_date, v_trip.start_date)          as overlap_start,
      least(a.end_date, v_trip.end_date)                 as overlap_end,
      (least(a.end_date, v_trip.end_date)
        - greatest(a.start_date, v_trip.start_date) + 1) as overlap_nights,
      a.created_at
    from public.availability a
    join public.profiles p on p.id = a.profile_id
    where a.city_id = v_trip.city_id
      and a.status = 'active'
      and a.profile_id <> (select auth.uid())
      and daterange(a.start_date, a.end_date, '[]') && v_range
    order by overlap_nights desc, a.created_at asc
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
      select
        a.id                                               as availability_id,
        p.id                                               as profile_id,
        p.display_name,
        p.discipline,
        p.specialisation,
        p.photo_path,
        p.home_district,
        a.city_id,
        c.name                                             as city_name,
        a.offers,
        a.constraints,
        a.max_nights,
        greatest(a.start_date, v_trip.start_date)          as overlap_start,
        least(a.end_date, v_trip.end_date)                 as overlap_end,
        (least(a.end_date, v_trip.end_date)
          - greatest(a.start_date, v_trip.start_date) + 1) as overlap_nights,
        round(public.distance_km(v_city.lat, v_city.lon, c.lat, c.lon)::numeric, 1) as distance_km
      from public.availability a
      join public.profiles p on p.id = a.profile_id
      join public.cities c on c.id = a.city_id
      where a.status = 'active'
        and a.city_id <> v_trip.city_id
        and a.profile_id <> (select auth.uid())
        and daterange(a.start_date, a.end_date, '[]') && v_range
        and public.distance_km(v_city.lat, v_city.lon, c.lat, c.lon) <= 100
      order by distance_km asc, overlap_nights desc
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

comment on function public.search_matches is
  'Everything the match screen shows, in one round trip. Invoker rights so RLS '
  'still applies — do not change to SECURITY DEFINER.';

grant execute on function public.search_matches(uuid) to authenticated;
grant execute on function public.distance_km(
  double precision, double precision, double precision, double precision
) to authenticated;
