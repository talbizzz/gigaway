-- Who can see a trip: public, connections, private.
--
-- Anna posts three trips to Munich. Each viewer below stands in one of the
-- relationships the rule cares about.

begin;

-- See rls_profiles.sql: the CLI's login role needs this to write auth.users.
set local role postgres;
select plan(20);

-- ── fixtures ───────────────────────────────────────────────────────────────
--   Anna     the traveller, lives in Berlin
--   Bruno    Anna's connection, lives in Hamburg
--   Clara    lives in Munich
--   Dieter   lives in Berlin, has his own trip to Munich on overlapping dates
--   Eva      lives in Berlin, trip to Munich but weeks later
--   Frank    lives in Vienna, offers a couch in Munich on overlapping dates
--   Greta    lives in Berlin, no connection at all
--   Hugo     lives in Berlin; Anna sends him a request about her private trip
insert into auth.users (id, email, raw_user_meta_data) values
  ('11111111-1111-1111-1111-111111111111', 'anna@example.test',   '{"first_name":"Anna","last_name":"A"}'::jsonb),
  ('22222222-2222-2222-2222-222222222222', 'bruno@example.test',  '{"first_name":"Bruno","last_name":"B"}'::jsonb),
  ('33333333-3333-3333-3333-333333333333', 'clara@example.test',  '{"first_name":"Clara","last_name":"C"}'::jsonb),
  ('44444444-4444-4444-4444-444444444444', 'dieter@example.test', '{"first_name":"Dieter","last_name":"D"}'::jsonb),
  ('55555555-5555-5555-5555-555555555555', 'eva@example.test',    '{"first_name":"Eva","last_name":"E"}'::jsonb),
  ('66666666-6666-6666-6666-666666666666', 'frank@example.test',   '{"first_name":"Frank","last_name":"F"}'::jsonb),
  ('77777777-7777-7777-7777-777777777777', 'greta@example.test',   '{"first_name":"Greta","last_name":"G"}'::jsonb),
  ('88888888-8888-8888-8888-888888888888', 'hugo@example.test',    '{"first_name":"Hugo","last_name":"H"}'::jsonb);

update public.profiles set status = 'approved';

update public.profiles set home_city_id = (select id from public.cities where name = 'Berlin' limit 1)
  where id in ('11111111-1111-1111-1111-111111111111', '44444444-4444-4444-4444-444444444444',
               '55555555-5555-5555-5555-555555555555', '77777777-7777-7777-7777-777777777777',
               '88888888-8888-8888-8888-888888888888');
update public.profiles set home_city_id = (select id from public.cities where name = 'Hamburg' limit 1)
  where id = '22222222-2222-2222-2222-222222222222';
update public.profiles set home_city_id = (select id from public.cities where name = 'Munich' limit 1)
  where id = '33333333-3333-3333-3333-333333333333';
update public.profiles set home_city_id = (select id from public.cities where name = 'Vienna' limit 1)
  where id = '66666666-6666-6666-6666-666666666666';

-- Anna and Bruno are connections.
insert into public.connections (requester_id, addressee_id, status)
values ('11111111-1111-1111-1111-111111111111', '22222222-2222-2222-2222-222222222222', 'accepted');

-- Anna's three trips to Munich, 2027-03-03 to 2027-03-10.
insert into public.trips (id, profile_id, city_id, start_date, end_date, needs, visibility)
select v.id::uuid, '11111111-1111-1111-1111-111111111111',
       (select id from public.cities where name = 'Munich' limit 1),
       '2027-03-03', '2027-03-10', array['couch'], v.visibility
from (values ('aaaa0000-0000-0000-0000-000000000001', 'public'),
             ('aaaa0000-0000-0000-0000-000000000002', 'connections'),
             ('aaaa0000-0000-0000-0000-000000000003', 'private')) as v(id, visibility);

-- Dieter is in Munich at the same time; Eva is there a month later.
insert into public.trips (profile_id, city_id, start_date, end_date, needs)
values ('44444444-4444-4444-4444-444444444444',
        (select id from public.cities where name = 'Munich' limit 1),
        '2027-03-08', '2027-03-12', array['couch']),
       ('55555555-5555-5555-5555-555555555555',
        (select id from public.cities where name = 'Munich' limit 1),
        '2027-04-20', '2027-04-25', array['couch']);

-- Frank offers a couch in Munich over the dates.
insert into public.availability (profile_id, city_id, start_date, end_date, offers)
values ('66666666-6666-6666-6666-666666666666',
        (select id from public.cities where name = 'Munich' limit 1),
        '2027-03-01', '2027-03-31', array['couch']);

-- Hugo is sent a request about the private trip.
insert into public.requests (kind, trip_id, from_profile, to_profile)
values ('host_stay', 'aaaa0000-0000-0000-0000-000000000003',
        '11111111-1111-1111-1111-111111111111', '88888888-8888-8888-8888-888888888888');

-- A helper for the assertions below: which of Anna's three trips can the
-- current member see, as a sorted list of their visibilities.
create or replace function pg_temp.seen() returns text language sql stable as $$
  select coalesce(string_agg(visibility, ',' order by visibility), '')
    from public.trips
   where profile_id = '11111111-1111-1111-1111-111111111111'
$$;
grant execute on function pg_temp.seen() to authenticated;

-- ── the owner ──────────────────────────────────────────────────────────────
set local role authenticated;
set local request.jwt.claims to '{"sub":"11111111-1111-1111-1111-111111111111","role":"authenticated"}';
select is(pg_temp.seen(), 'connections,private,public', 'the owner sees all three');

-- ── a connection ───────────────────────────────────────────────────────────────
set local request.jwt.claims to '{"sub":"22222222-2222-2222-2222-222222222222","role":"authenticated"}';
select is(pg_temp.seen(), 'connections,public', 'a connection sees public and connections-only, not private');

-- ── someone who lives in the destination ───────────────────────────────────
set local request.jwt.claims to '{"sub":"33333333-3333-3333-3333-333333333333","role":"authenticated"}';
select is(pg_temp.seen(), 'public', 'someone who lives in the destination sees only the public one');

-- ── someone there on overlapping dates ─────────────────────────────────────
set local request.jwt.claims to '{"sub":"44444444-4444-4444-4444-444444444444","role":"authenticated"}';
select is(pg_temp.seen(), 'public', 'a visitor there on overlapping dates sees the public one');

set local request.jwt.claims to '{"sub":"55555555-5555-5555-5555-555555555555","role":"authenticated"}';
select is(pg_temp.seen(), '', 'a visitor there on other dates sees nothing');

-- ── a host with availability there ─────────────────────────────────────────
set local request.jwt.claims to '{"sub":"66666666-6666-6666-6666-666666666666","role":"authenticated"}';
select is(pg_temp.seen(), 'public', 'a host with nights free there on those dates sees the public one');

-- ── a stranger ─────────────────────────────────────────────────────────────
set local request.jwt.claims to '{"sub":"77777777-7777-7777-7777-777777777777","role":"authenticated"}';
select is(pg_temp.seen(), '', 'someone with no connection sees nothing');

-- ── the person sent a request ──────────────────────────────────────────────
set local request.jwt.claims to '{"sub":"88888888-8888-8888-8888-888888888888","role":"authenticated"}';
select is(pg_temp.seen(), 'private', 'the person sent a request sees that trip, and only that one');

-- ── the helpers themselves ─────────────────────────────────────────────────
set local request.jwt.claims to '{"sub":"33333333-3333-3333-3333-333333333333","role":"authenticated"}';
select ok(public.in_city_during(
  (select id from public.cities where name = 'Munich' limit 1), '2030-01-01', '2030-01-02'),
  'living in a city counts whatever the dates');
select ok(not public.in_city_during(
  (select id from public.cities where name = 'Berlin' limit 1), '2027-03-03', '2027-03-10'),
  'but only for that city');

set local request.jwt.claims to '{"sub":"44444444-4444-4444-4444-444444444444","role":"authenticated"}';
select ok(public.in_city_during(
  (select id from public.cities where name = 'Munich' limit 1), '2027-03-10', '2027-03-11'),
  'a trip counts when it overlaps, even by a day');
select ok(not public.in_city_during(
  (select id from public.cities where name = 'Munich' limit 1), '2027-03-13', '2027-03-15'),
  'and not when it does not');

-- ── visibility changes take effect ─────────────────────────────────────────
set local role postgres;
update public.trips set visibility = 'connections' where id = 'aaaa0000-0000-0000-0000-000000000001';
set local role authenticated;
set local request.jwt.claims to '{"sub":"33333333-3333-3333-3333-333333333333","role":"authenticated"}';
select is(pg_temp.seen(), '', 'narrowing a trip to connections hides it from a local');

set local role postgres;
update public.trips set visibility = 'public', status = 'cancelled'
  where id = 'aaaa0000-0000-0000-0000-000000000001';
set local role authenticated;
set local request.jwt.claims to '{"sub":"22222222-2222-2222-2222-222222222222","role":"authenticated"}';
select is(pg_temp.seen(), 'connections', 'a cancelled trip is gone for everyone else');

set local role postgres;
update public.trips set status = 'active' where id = 'aaaa0000-0000-0000-0000-000000000001';

-- ── blocking hides everything ──────────────────────────────────────────────
set local role authenticated;
set local request.jwt.claims to '{"sub":"33333333-3333-3333-3333-333333333333","role":"authenticated"}';
insert into public.blocks (blocker_id, blocked_id)
values ('33333333-3333-3333-3333-333333333333', '11111111-1111-1111-1111-111111111111');
select is(pg_temp.seen(), '', 'blocking the owner hides their trips');

-- ── unconnectioning takes connections-only away ────────────────────────────────────
set local role postgres;
delete from public.connections;
set local role authenticated;
set local request.jwt.claims to '{"sub":"22222222-2222-2222-2222-222222222222","role":"authenticated"}';
select is(pg_temp.seen(), '', 'once they are no longer connections, a connection sees only what is still public to them');

-- ── the constraint and the default ─────────────────────────────────────────
set local role postgres;
select is(
  (select visibility from public.trips where id = 'aaaa0000-0000-0000-0000-000000000001'),
  'public', 'a trip is public unless said otherwise');

select throws_ok(
  $$ update public.trips set visibility = 'everyone' where id = 'aaaa0000-0000-0000-0000-000000000001' $$,
  '23514', null, 'and only the three values are allowed');

-- ── a member in review sees public trips where they live ───────────────────
delete from public.blocks;
update public.profiles set status = 'pending' where id = '33333333-3333-3333-3333-333333333333';
insert into public.verification_applications (profile_id, full_legal_name, selfie_prompt, selfie_path, links)
values ('33333333-3333-3333-3333-333333333333', 'Clara C', 'p', 'x/selfie.jpg', '["https://x.example"]'::jsonb);
set local role authenticated;
set local request.jwt.claims to '{"sub":"33333333-3333-3333-3333-333333333333","role":"authenticated"}';
select is(pg_temp.seen(), 'public', 'a member waiting for approval still sees public trips in their own city');

-- ── a host who offered on a private trip keeps seeing it ───────────────────
set local role postgres;
update public.trips set visibility = 'private' where id = 'aaaa0000-0000-0000-0000-000000000001';
select is(
  (select count(*)::int from public.trips where visibility = 'private'
    and profile_id = '11111111-1111-1111-1111-111111111111'),
  2, 'two private trips now exist');

select * from finish();
rollback;
