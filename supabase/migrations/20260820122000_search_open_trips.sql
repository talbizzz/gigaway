-- Milestone 3 — the host's side of discovery.
--
-- search_matches answers "who is in the city I am travelling to". This answers
-- the mirror question — "who is coming to a city I have a couch in" — which is
-- what a proactive offer needs.
--
-- Without it, a host can only ever respond to a request, and the whole
-- proactive path exists in the schema but is unreachable from the app. In a
-- density-constrained product the host who happens to be free and notices a
-- colleague arriving is exactly the match worth making.
--
-- CRITICAL: invoker rights, NOT security definer — same as search_matches. RLS
-- must stay active inside, so pending applicants, suspended profiles and
-- blocked pairs are filtered by the same policies as everywhere else.
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

grant execute on function public.search_open_trips() to authenticated;
