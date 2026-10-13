-- A service can be "always available": no dates, open until switched off.

begin;

-- See rls_profiles.sql: the CLI's login role needs this to write auth.users.
set local role postgres;
select plan(20);

--   Anna hosts and offers services.   Bruno offers a couch on fixed dates only.
--   Clara travels to Munich far in the future.  Dieter offers only a coffee.
insert into auth.users (id, email, raw_user_meta_data) values
  ('11111111-1111-1111-1111-111111111111', 'anna@example.test',  '{"first_name":"Anna","last_name":"A"}'::jsonb),
  ('22222222-2222-2222-2222-222222222222', 'bruno@example.test', '{"first_name":"Bruno","last_name":"B"}'::jsonb),
  ('33333333-3333-3333-3333-333333333333', 'clara@example.test', '{"first_name":"Clara","last_name":"C"}'::jsonb),
  ('44444444-4444-4444-4444-444444444444', 'dieter@example.test', '{"first_name":"Dieter","last_name":"D"}'::jsonb);
update public.profiles set status = 'approved';

-- ── the rules ──────────────────────────────────────────────────────────────
select lives_ok(
  $$ insert into public.availability (id, profile_id, city_id, offers, always_available)
     values ('a1000000-0000-0000-0000-000000000001', '11111111-1111-1111-1111-111111111111',
             (select id from public.cities where name = 'Munich' limit 1),
             array['couch'], true) $$,
  'a service with no dates can be always available');

select throws_ok(
  $$ insert into public.availability (profile_id, city_id, offers, always_available)
     values ('11111111-1111-1111-1111-111111111111',
             (select id from public.cities where name = 'Munich' limit 1),
             array['coffee'], false) $$,
  '23514', null, 'but one that is not always available must have its dates');

select throws_ok(
  $$ insert into public.availability (profile_id, city_id, start_date, end_date, offers, always_available)
     values ('11111111-1111-1111-1111-111111111111',
             (select id from public.cities where name = 'Munich' limit 1),
             '2027-03-01', '2027-03-05', array['coffee'], true) $$,
  '23514', null, 'and an always-available one must not have any');

select throws_ok(
  $$ insert into public.availability (profile_id, city_id, offers, always_available)
     values ('11111111-1111-1111-1111-111111111111',
             (select id from public.cities where name = 'Munich' limit 1),
             array['coffee', 'tips'], true) $$,
  '23514', null, 'an always-available post is exactly one service');

select throws_ok(
  $$ insert into public.availability (profile_id, city_id, offers, always_available)
     values ('11111111-1111-1111-1111-111111111111',
             (select id from public.cities where name = 'Munich' limit 1),
             array['couch'], true) $$,
  '23505', null, 'the same service cannot be always available twice in a city');

select lives_ok(
  $$ insert into public.availability (profile_id, city_id, offers, always_available)
     values ('11111111-1111-1111-1111-111111111111',
             (select id from public.cities where name = 'Munich' limit 1),
             array['coffee'], true),
            ('11111111-1111-1111-1111-111111111111',
             (select id from public.cities where name = 'Berlin' limit 1),
             array['couch'], true) $$,
  'but another service, or another city, can be');

update public.availability set status = 'cancelled'
  where id = 'a1000000-0000-0000-0000-000000000001';
select lives_ok(
  $$ insert into public.availability (profile_id, city_id, offers, always_available)
     values ('11111111-1111-1111-1111-111111111111',
             (select id from public.cities where name = 'Munich' limit 1),
             array['couch'], true) $$,
  'and once it is switched off it can be switched on again');

-- Bruno's couch is on fixed dates that do not include Clara's trip.
insert into public.availability (profile_id, city_id, start_date, end_date, offers)
values ('22222222-2222-2222-2222-222222222222',
        (select id from public.cities where name = 'Munich' limit 1),
        '2027-03-01', '2027-03-10', array['couch']);

-- ── matching ───────────────────────────────────────────────────────────────
insert into public.availability (profile_id, city_id, offers, always_available)
values ('44444444-4444-4444-4444-444444444444',
        (select id from public.cities where name = 'Munich' limit 1),
        array['coffee'], true);

insert into public.trips (id, profile_id, city_id, start_date, end_date, needs)
values ('c1000000-0000-0000-0000-000000000001', '33333333-3333-3333-3333-333333333333',
        (select id from public.cities where name = 'Munich' limit 1),
        '2028-06-01', '2028-06-06', array['couch']);

set local role authenticated;
set local request.jwt.claims to '{"sub":"33333333-3333-3333-3333-333333333333","role":"authenticated"}';

select is(
  (select jsonb_array_length(public.search_matches('c1000000-0000-0000-0000-000000000001') -> 'hosts')),
  2, 'a trip far in the future finds the two always-available hosts, and not the one with fixed dates');

select is(
  (select public.search_matches('c1000000-0000-0000-0000-000000000001') -> 'hosts' -> 0 ->> 'overlapNights')::int,
  6, 'the host with a couch is listed first, for exactly the nights of the trip');

select is(
  (select array_agg(o order by o)
     from jsonb_array_elements_text(public.search_matches('c1000000-0000-0000-0000-000000000001') -> 'hosts' -> 0 -> 'offers') o),
  array['coffee', 'couch'],
  'and a host who offers a couch and a coffee is ONE entry listing both, not two');

select is(
  (select array_agg(o)
     from jsonb_array_elements_text(public.search_matches('c1000000-0000-0000-0000-000000000001') -> 'hosts' -> 1 -> 'offers') o),
  array['coffee'],
  'a host who offers only a coffee comes after, with just that');

select is(
  (select count(*)::int
     from jsonb_array_elements(public.search_matches('c1000000-0000-0000-0000-000000000001') -> 'hosts') h
    where h -> 'profile' ->> 'id' = '11111111-1111-1111-1111-111111111111'),
  1, 'each host appears once');

-- ── the host sees who is coming, and may offer any of those nights ─────────
set local request.jwt.claims to '{"sub":"11111111-1111-1111-1111-111111111111","role":"authenticated"}';

select is(
  (select count(*)::int from public.search_open_trips()
    where trip_id = 'c1000000-0000-0000-0000-000000000001'),
  1, 'the host sees the traveller''s trip in the open-trips list');

select ok(
  public.in_city_during((select id from public.cities where name = 'Munich' limit 1), '2030-01-01', '2030-01-09'),
  'and counts as being in that city on any dates, for trip visibility');

set local role postgres;
select lives_ok(
  $$ insert into public.offers (trip_id, from_profile, to_profile, start_date, end_date)
     values ('c1000000-0000-0000-0000-000000000001', '11111111-1111-1111-1111-111111111111',
             '33333333-3333-3333-3333-333333333333', '2028-06-02', '2028-06-04') $$,
  'an offer can be made for nights inside the trip, with no dates posted');

select throws_ok(
  $$ insert into public.offers (trip_id, from_profile, to_profile, start_date, end_date)
     values ('c1000000-0000-0000-0000-000000000001', '11111111-1111-1111-1111-111111111111',
             '33333333-3333-3333-3333-333333333333', '2028-06-05', '2028-06-12') $$,
  '23514', null, 'but still not beyond the trip itself');

-- ── only a couch or a room can be offered as nights ───────────────────────
set local role authenticated;
set local request.jwt.claims to '{"sub":"44444444-4444-4444-4444-444444444444","role":"authenticated"}';
select is(
  (select count(*)::int from public.search_open_trips()
    where trip_id = 'c1000000-0000-0000-0000-000000000001'),
  0, 'a host who offers only a coffee is not shown trips to offer nights on');

set local role postgres;
select throws_ok(
  $$ insert into public.offers (trip_id, from_profile, to_profile, start_date, end_date)
     values ('c1000000-0000-0000-0000-000000000001', '44444444-4444-4444-4444-444444444444',
             '33333333-3333-3333-3333-333333333333', '2028-06-02', '2028-06-04') $$,
  '23514', null, 'and cannot offer nights, since a coffee is not a place to sleep');

-- ── a member with no always-available service finds nothing extra ─────────
select is(
  (select count(*)::int from public.availability
    where profile_id = '33333333-3333-3333-3333-333333333333'),
  0, 'Clara has posted nothing');

select is(
  (select count(*)::int from public.availability
    where profile_id = '11111111-1111-1111-1111-111111111111' and always_available and status = 'active'),
  3, 'Anna has three services switched on: a couch and a coffee in Munich, a couch in Berlin');

select * from finish();
rollback;
