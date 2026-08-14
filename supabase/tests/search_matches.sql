-- Matching: ranking, isolation between members, and the nearby-city fallback.

begin;
select plan(14);

-- ── the function must not bypass RLS ───────────────────────────────────────
-- Guarded by a test rather than a comment because switching this to SECURITY
-- DEFINER would silently expose pending, suspended and blocked profiles
-- through matching while every other policy still looked correct.
select is(
  (select prosecdef from pg_proc p
     join pg_namespace n on n.oid = p.pronamespace
    where n.nspname = 'public' and p.proname = 'search_matches'),
  false,
  'search_matches runs with invoker rights, so RLS still applies inside it'
);

-- ── fixtures: the brief's own scenario ─────────────────────────────────────
insert into auth.users (id, email, raw_user_meta_data) values
  ('a0000000-0000-0000-0000-000000000001','anna@t.test','{"display_name":"Anna Weber","discipline":"voice"}'),
  ('a0000000-0000-0000-0000-000000000002','bruno@t.test','{"display_name":"Bruno Kraus","discipline":"strings"}'),
  ('a0000000-0000-0000-0000-000000000003','clara@t.test','{"display_name":"Clara Ortiz","discipline":"keyboard"}'),
  ('a0000000-0000-0000-0000-000000000004','dora@t.test','{"display_name":"Dora Lang","discipline":"voice"}'),
  ('a0000000-0000-0000-0000-000000000005','emil@t.test','{"display_name":"Emil Roth","discipline":"brass"}'),
  ('a0000000-0000-0000-0000-000000000006','frida@t.test','{"display_name":"Frida Nagel","discipline":"dance"}');

update public.profiles set status = 'approved'
  where id <> 'a0000000-0000-0000-0000-000000000006';
-- Frida stays pending.

-- Anna: Munich, 3rd–10th March.
insert into public.trips (profile_id, city_id, start_date, end_date, needs)
select 'a0000000-0000-0000-0000-000000000001', id, '2027-03-03', '2027-03-10',
       array['couch','co_accommodation']
from public.cities where name = 'Munich' limit 1;

-- Bruno: Munich couch 1st–5th → overlaps the 3rd–5th, three nights.
insert into public.availability (profile_id, city_id, start_date, end_date, offers, max_nights)
select 'a0000000-0000-0000-0000-000000000002', id, '2027-03-01', '2027-03-05', array['couch'], 3
from public.cities where name = 'Munich' limit 1;

-- Clara: Munich spare room 5th–12th → overlaps the 5th–10th, six nights.
insert into public.availability (profile_id, city_id, start_date, end_date, offers)
select 'a0000000-0000-0000-0000-000000000003', id, '2027-03-05', '2027-03-12', array['spare_room']
from public.cities where name = 'Munich' limit 1;

-- Dora: also going to Munich, 5th–9th.
insert into public.trips (profile_id, city_id, start_date, end_date, needs)
select 'a0000000-0000-0000-0000-000000000004', id, '2027-03-05', '2027-03-09',
       array['co_accommodation']
from public.cities where name = 'Munich' limit 1;

-- Emil: Augsburg couch, same week. ~57 km from Munich.
insert into public.availability (profile_id, city_id, start_date, end_date, offers)
select 'a0000000-0000-0000-0000-000000000005', id, '2027-03-03', '2027-03-10', array['couch']
from public.cities where name = 'Augsburg' limit 1;

set local role authenticated;
set local request.jwt.claims to
  '{"sub":"a0000000-0000-0000-0000-000000000001","role":"authenticated"}';

create temporary table result as
select public.search_matches((select id from public.trips
  where profile_id = 'a0000000-0000-0000-0000-000000000001')) as m;

-- ── hosts ──────────────────────────────────────────────────────────────────
select is(
  (select jsonb_array_length(m -> 'hosts') from result),
  2,
  'both Munich hosts with overlapping availability are returned'
);

select is(
  (select m -> 'hosts' -> 0 -> 'profile' ->> 'displayName' from result),
  'Clara Ortiz',
  'hosts are ranked by overlap nights, so the six-night match leads'
);

select is(
  (select (m -> 'hosts' -> 0 ->> 'overlapNights')::int from result),
  6,
  'the leading host covers six of the seven nights'
);

select is(
  (select (m -> 'hosts' -> 1 ->> 'overlapNights')::int from result),
  3,
  'the partial three-night offer is still returned, not filtered out'
);

select is(
  (select m -> 'hosts' -> 1 -> 'overlap' ->> 'start' from result),
  '2027-03-03',
  'the overlap is clipped to the nights the two ranges share'
);

select is(
  (select (m -> 'hosts' -> 1 ->> 'maxNights')::int from result),
  3,
  'the host''s own cap is carried through so the traveller can see it'
);

-- ── travellers ─────────────────────────────────────────────────────────────
select is(
  (select jsonb_array_length(m -> 'travellers') from result),
  1,
  'the other traveller heading to Munich that week is surfaced'
);

select is(
  (select m -> 'travellers' -> 0 -> 'profile' ->> 'displayName' from result),
  'Dora Lang',
  'the co-accommodation candidate is the other traveller, not the caller'
);

-- ── nearby fallback ────────────────────────────────────────────────────────
select is(
  (select jsonb_array_length(m -> 'nearbyHosts') from result),
  1,
  'with fewer than five hosts in the city, nearby hosts are offered'
);

select is(
  (select m -> 'nearbyHosts' -> 0 ->> 'cityName' from result),
  'Augsburg',
  'the nearby host is named with their own city, not the destination'
);

select ok(
  (select (m -> 'nearbyHosts' -> 0 ->> 'distanceKm')::numeric between 40 and 80 from result),
  'the reported distance to Augsburg is plausible'
);

-- ── isolation ──────────────────────────────────────────────────────────────
select is(
  (select jsonb_array_length(
     public.search_matches((select id from public.trips
       where profile_id = 'a0000000-0000-0000-0000-000000000004')) -> 'hosts')),
  0,
  'passing another member''s trip id returns nothing, not their matches'
);

set local role postgres;
set local role authenticated;
set local request.jwt.claims to
  '{"sub":"a0000000-0000-0000-0000-000000000006","role":"authenticated"}';

select is(
  (select jsonb_array_length(
     public.search_matches((select id from public.trips limit 1)) -> 'hosts')),
  0,
  'a pending applicant gets no matches at all'
);

select * from finish();
rollback;
