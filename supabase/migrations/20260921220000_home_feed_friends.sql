-- The home feed gains a fourth band: what my friends are doing.
--
-- Everything else in home_feed is unchanged. Still invoker rights, so the trips
-- policy decides which of a friend's trips I can see. See the previous version
-- (home_feed.sql) for why that matters.

create or replace function public.home_feed()
returns jsonb
language plpgsql
stable
set search_path = public
as $$
declare
  v_me           uuid := (select auth.uid());
  v_home_city    uuid;
  v_home_name    text;
  v_today        date := current_date;
  v_here         jsonb;
  v_coming       jsonb;
  v_destinations jsonb;
  v_friends      jsonb;
begin
  -- The name comes back with the id because the feed titles two of its bands
  -- with it, and a second round trip for one string is not worth it.
  select p.home_city_id, c.name into v_home_city, v_home_name
  from public.profiles p
  left join public.cities c on c.id = p.home_city_id
  where p.id = v_me;

  -- ── in my city today ─────────────────────────────────────────────────────
  --
  -- Guarded on the home city rather than returning early: a member who has not
  -- set one still gets their destinations, which do not depend on it.
  select coalesce(
    jsonb_agg(
      jsonb_build_object(
        'tripId', m.trip_id,
        'profile', jsonb_build_object(
          'id', m.profile_id,
          'displayName', m.display_name,
          'discipline', m.discipline,
          'specialisation', m.specialisation,
          'photoPath', m.photo_path,
          'homeDistrict', m.home_district
        ),
        'start', m.start_date,
        'end', m.end_date,
        'needs', m.needs
      )
      order by m.end_date asc
    ),
    '[]'::jsonb
  )
  into v_here
  from (
    select t.id as trip_id, p.id as profile_id, p.display_name, p.discipline,
           p.specialisation, p.photo_path, p.home_district,
           t.start_date, t.end_date, t.needs
    from public.trips t
    join public.profiles p on p.id = t.profile_id
    where v_home_city is not null
      and t.city_id = v_home_city
      and t.status = 'active'
      and t.profile_id <> v_me
      and v_today between t.start_date and t.end_date
    order by t.end_date asc
    limit 20
  ) m;

  -- ── arriving in my city within the month ─────────────────────────────────
  select coalesce(
    jsonb_agg(
      jsonb_build_object(
        'tripId', m.trip_id,
        'profile', jsonb_build_object(
          'id', m.profile_id,
          'displayName', m.display_name,
          'discipline', m.discipline,
          'specialisation', m.specialisation,
          'photoPath', m.photo_path,
          'homeDistrict', m.home_district
        ),
        'start', m.start_date,
        'end', m.end_date,
        'needs', m.needs
      )
      order by m.start_date asc
    ),
    '[]'::jsonb
  )
  into v_coming
  from (
    select t.id as trip_id, p.id as profile_id, p.display_name, p.discipline,
           p.specialisation, p.photo_path, p.home_district,
           t.start_date, t.end_date, t.needs
    from public.trips t
    join public.profiles p on p.id = t.profile_id
    where v_home_city is not null
      and t.city_id = v_home_city
      and t.status = 'active'
      and t.profile_id <> v_me
      and t.start_date > v_today
      and t.start_date <= v_today + interval '1 month'
    order by t.start_date asc
    limit 20
  ) m;

  -- ── who will be in the cities I am going to ──────────────────────────────
  --
  -- Three kinds of person, ranked in the order they are useful to a traveller:
  -- someone offering nights that cover the trip, then someone who simply lives
  -- there and has no trip taking them away, then a colleague who will be
  -- visiting at the same time. One row per person — a local who has also posted
  -- availability is a host, not both, which is what the distinct on settles.
  --
  -- The feed shows the first three and links into the trip screen for the rest,
  -- so the total is counted before the cut.
  with my_trips as (
    select t.id, t.city_id, c.name as city_name, t.start_date, t.end_date
    from public.trips t
    join public.cities c on c.id = t.city_id
    where t.profile_id = v_me
      and t.status = 'active'
      and t.end_date >= v_today
    order by t.start_date asc
    limit 10
  ),
  candidates as (
    select distinct on (u.trip_id, u.profile_id) u.*
    from (
      select
        mt.id                 as trip_id,
        1                     as sort_rank,
        'host'::text          as kind,
        a.id                  as availability_id,
        null::uuid            as matched_trip_id,
        p.id                  as profile_id,
        p.display_name,
        p.discipline,
        p.specialisation,
        p.photo_path,
        p.home_district
      from my_trips mt
      join public.availability a
        on a.city_id = mt.city_id
       and a.status = 'active'
       and a.profile_id <> v_me
       and daterange(a.start_date, a.end_date, '[]')
           && daterange(mt.start_date, mt.end_date, '[]')
      join public.profiles p on p.id = a.profile_id

      union all

      select
        mt.id, 2, 'local'::text, null::uuid, null::uuid,
        p.id, p.display_name, p.discipline, p.specialisation, p.photo_path,
        p.home_district
      from my_trips mt
      join public.profiles p
        on p.home_city_id = mt.city_id
       and p.id <> v_me
      where not exists (
        select 1
        from public.trips away
        where away.profile_id = p.id
          and away.status = 'active'
          and daterange(away.start_date, away.end_date, '[]')
              && daterange(mt.start_date, mt.end_date, '[]')
      )

      union all

      select
        mt.id, 3, 'traveller'::text, null::uuid, other.id,
        p.id, p.display_name, p.discipline, p.specialisation, p.photo_path,
        p.home_district
      from my_trips mt
      join public.trips other
        on other.city_id = mt.city_id
       and other.status = 'active'
       and other.profile_id <> v_me
       and other.id <> mt.id
       and daterange(other.start_date, other.end_date, '[]')
           && daterange(mt.start_date, mt.end_date, '[]')
      join public.profiles p on p.id = other.profile_id
    ) u
    order by u.trip_id, u.profile_id, u.sort_rank asc
  ),
  -- Numbered here rather than with a per-trip LIMIT below: a subquery in a FROM
  -- clause cannot see the outer trip without LATERAL, and a window function
  -- says the same thing without the ceremony.
  ranked as (
    select
      c.*,
      row_number() over (
        partition by c.trip_id
        order by c.sort_rank asc, c.display_name asc
      ) as position
    from candidates c
  )
  select coalesce(
    jsonb_agg(
      jsonb_build_object(
        'tripId', mt.id,
        'cityId', mt.city_id,
        'cityName', mt.city_name,
        'start', mt.start_date,
        'end', mt.end_date,
        'total', (select count(*) from candidates c where c.trip_id = mt.id),
        'people', coalesce(
          (
            select jsonb_agg(
              jsonb_build_object(
                'kind', r.kind,
                'availabilityId', r.availability_id,
                'tripId', r.matched_trip_id,
                'profile', jsonb_build_object(
                  'id', r.profile_id,
                  'displayName', r.display_name,
                  'discipline', r.discipline,
                  'specialisation', r.specialisation,
                  'photoPath', r.photo_path,
                  'homeDistrict', r.home_district
                )
              )
              order by r.position asc
            )
            from ranked r
            where r.trip_id = mt.id
              and r.position <= 3
          ),
          '[]'::jsonb
        )
      )
      order by mt.start_date asc
    ),
    '[]'::jsonb
  )
  into v_destinations
  from my_trips mt;

  -- ── what my friends are doing ────────────────────────────────────────────
  --
  -- Friends' trips that have not finished, soonest first, wherever they are
  -- going. Which trips I may see at all is the trips policy's decision (a friend's
  -- public and friends-only trips, never a private one), so nothing here repeats
  -- that. A trip already shown above, because it is in my own city, is left out so
  -- it does not appear twice.
  select coalesce(
    jsonb_agg(
      jsonb_build_object(
        'tripId', m.trip_id,
        'cityId', m.city_id,
        'cityName', m.city_name,
        'profile', jsonb_build_object(
          'id', m.profile_id,
          'displayName', m.display_name,
          'discipline', m.discipline,
          'specialisation', m.specialisation,
          'photoPath', m.photo_path,
          'homeDistrict', m.home_district
        ),
        'start', m.start_date,
        'end', m.end_date,
        'needs', m.needs
      )
      order by m.start_date asc
    ),
    '[]'::jsonb
  )
  into v_friends
  from (
    select t.id as trip_id, t.city_id, c.name as city_name, p.id as profile_id,
           p.display_name, p.discipline, p.specialisation, p.photo_path, p.home_district,
           t.start_date, t.end_date, t.needs
    from public.trips t
    join public.profiles p on p.id = t.profile_id
    join public.cities c on c.id = t.city_id
    where t.status = 'active'
      and t.profile_id <> v_me
      and t.end_date >= v_today
      and public.are_friends(v_me, t.profile_id)
      and not (
        v_home_city is not null
        and t.city_id = v_home_city
        and (
          v_today between t.start_date and t.end_date
          or (t.start_date > v_today and t.start_date <= v_today + interval '1 month')
        )
      )
    order by t.start_date asc
    limit 20
  ) m;

  return jsonb_build_object(
    'homeCityName', v_home_name,
    'inYourCity', v_here,
    'comingToYourCity', v_coming,
    'destinations', v_destinations,
    'friends', v_friends
  );
end;
$$;

comment on function public.home_feed is
  'The four bands of the home feed in one round trip: in my city, coming to my '
  'city, who will be where I am going, and what my friends are doing. Invoker '
  'rights so RLS still applies — do not change to SECURITY DEFINER.';

grant execute on function public.home_feed() to authenticated;
