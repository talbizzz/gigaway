-- The numbers on a profile, and who may open them.
--
-- Anyone who can see a member sees three numbers. Only the member and their
-- connections can open them.

begin;

-- See rls_profiles.sql: the CLI's login role needs this to write auth.users.
set local role postgres;
select plan(21);

-- ── fixtures ───────────────────────────────────────────────────────────────
--   Anna   the member whose numbers these are
--   Bruno  connected to Anna        Frank  connected to Anna
--   Clara  a stranger               Greta  asked to connect, not yet accepted
--   Hugo   connected, but suspended Dieter and Eva: people Anna helped
insert into auth.users (id, email, raw_user_meta_data) values
  ('11111111-1111-1111-1111-111111111111', 'anna@example.test',   '{"first_name":"Anna","last_name":"A"}'::jsonb),
  ('22222222-2222-2222-2222-222222222222', 'bruno@example.test',  '{"first_name":"Bruno","last_name":"B"}'::jsonb),
  ('33333333-3333-3333-3333-333333333333', 'clara@example.test',  '{"first_name":"Clara","last_name":"C"}'::jsonb),
  ('44444444-4444-4444-4444-444444444444', 'dieter@example.test', '{"first_name":"Dieter","last_name":"D"}'::jsonb),
  ('55555555-5555-5555-5555-555555555555', 'eva@example.test',    '{"first_name":"Eva","last_name":"E"}'::jsonb),
  ('66666666-6666-6666-6666-666666666666', 'frank@example.test',  '{"first_name":"Frank","last_name":"F"}'::jsonb),
  ('77777777-7777-7777-7777-777777777777', 'greta@example.test',  '{"first_name":"Greta","last_name":"G"}'::jsonb),
  ('88888888-8888-8888-8888-888888888888', 'hugo@example.test',   '{"first_name":"Hugo","last_name":"H"}'::jsonb);

update public.profiles set status = 'approved';
update public.profiles set status = 'suspended' where id = '88888888-8888-8888-8888-888888888888';

insert into public.connections (requester_id, addressee_id, status) values
  ('11111111-1111-1111-1111-111111111111', '22222222-2222-2222-2222-222222222222', 'accepted'),
  ('66666666-6666-6666-6666-666666666666', '11111111-1111-1111-1111-111111111111', 'accepted'),
  ('11111111-1111-1111-1111-111111111111', '88888888-8888-8888-8888-888888888888', 'accepted'),
  ('77777777-7777-7777-7777-777777777777', '11111111-1111-1111-1111-111111111111', 'pending');

-- Anna's trips: one public and ahead, one connections-only and over, one private,
-- one cancelled.
insert into public.trips (id, profile_id, city_id, start_date, end_date, needs, visibility, status)
select v.id::uuid, '11111111-1111-1111-1111-111111111111',
       (select id from public.cities where name = 'Munich' limit 1),
       current_date + v.s, current_date + v.e, array['couch'], v.visibility, v.status::public.trip_status
from (values
  ('a1000000-0000-0000-0000-000000000001',  30,  35, 'public',      'active'),
  ('a1000000-0000-0000-0000-000000000002', -60, -55, 'connections', 'active'),
  ('a1000000-0000-0000-0000-000000000003',  50,  52, 'private',     'active'),
  ('a1000000-0000-0000-0000-000000000004',  70,  72, 'public',      'cancelled')
) as v(id, s, e, visibility, status);

-- Anna offers nights in Munich in the past and the near future.
insert into public.availability (profile_id, city_id, start_date, end_date, offers)
select '11111111-1111-1111-1111-111111111111',
       (select id from public.cities where name = 'Munich' limit 1),
       current_date + v.s, current_date + v.e, array['couch', 'tips', 'coffee']
from (values (-40, -20), (5, 30)) as v(s, e);

-- Eva's PRIVATE trip, which Anna hosted and which is over: a completed couch.
insert into public.trips (id, profile_id, city_id, start_date, end_date, needs, visibility)
values ('e1000000-0000-0000-0000-000000000001', '55555555-5555-5555-5555-555555555555',
        (select id from public.cities where name = 'Munich' limit 1),
        current_date - 30, current_date - 25, array['couch'], 'private');
insert into public.offers (id, trip_id, from_profile, to_profile, start_date, end_date, status)
values ('f1000000-0000-0000-0000-000000000001', 'e1000000-0000-0000-0000-000000000001',
        '11111111-1111-1111-1111-111111111111', '55555555-5555-5555-5555-555555555555',
        current_date - 29, current_date - 26, 'accepted');
insert into public.stays (offer_id, host_id, guest_id, city_id, start_date, end_date)
values ('f1000000-0000-0000-0000-000000000001', '11111111-1111-1111-1111-111111111111',
        '55555555-5555-5555-5555-555555555555',
        (select id from public.cities where name = 'Munich' limit 1),
        current_date - 29, current_date - 26);

-- Eva again, a stay still ahead: accepted but not complete, so it does not count.
insert into public.trips (id, profile_id, city_id, start_date, end_date, needs)
values ('e2000000-0000-0000-0000-000000000002', '55555555-5555-5555-5555-555555555555',
        (select id from public.cities where name = 'Munich' limit 1),
        current_date + 10, current_date + 14, array['couch']);
insert into public.offers (id, trip_id, from_profile, to_profile, start_date, end_date, status)
values ('f2000000-0000-0000-0000-000000000002', 'e2000000-0000-0000-0000-000000000002',
        '11111111-1111-1111-1111-111111111111', '55555555-5555-5555-5555-555555555555',
        current_date + 11, current_date + 13, 'accepted');
insert into public.stays (offer_id, host_id, guest_id, city_id, start_date, end_date)
values ('f2000000-0000-0000-0000-000000000002', '11111111-1111-1111-1111-111111111111',
        '55555555-5555-5555-5555-555555555555',
        (select id from public.cities where name = 'Munich' limit 1),
        current_date + 11, current_date + 13);

-- Dieter's trips and what Anna did about them.
insert into public.trips (id, profile_id, city_id, start_date, end_date, needs, status)
select v.id::uuid, '44444444-4444-4444-4444-444444444444',
       (select id from public.cities where name = 'Munich' limit 1),
       current_date + v.s, current_date + v.e, array['tips', 'company'], v.status::public.trip_status
from (values
  ('d1000000-0000-0000-0000-000000000001', -20, -15, 'active'),
  ('d2000000-0000-0000-0000-000000000002',  20,  25, 'active'),
  ('d3000000-0000-0000-0000-000000000003', -12, -10, 'active'),
  ('d4000000-0000-0000-0000-000000000004', -9,   -7, 'cancelled')
) as v(id, s, e, status);

insert into public.requests (kind, trip_id, from_profile, to_profile, status)
values
  ('tips',   'd1000000-0000-0000-0000-000000000001', '44444444-4444-4444-4444-444444444444', '11111111-1111-1111-1111-111111111111', 'accepted'),  -- counts
  ('coffee', 'd2000000-0000-0000-0000-000000000002', '44444444-4444-4444-4444-444444444444', '11111111-1111-1111-1111-111111111111', 'accepted'),  -- trip still ahead
  ('tips',   'd3000000-0000-0000-0000-000000000003', '44444444-4444-4444-4444-444444444444', '11111111-1111-1111-1111-111111111111', 'pending'),   -- never answered
  ('coffee', 'd3000000-0000-0000-0000-000000000003', '44444444-4444-4444-4444-444444444444', '11111111-1111-1111-1111-111111111111', 'declined'),  -- declined
  ('tips',   'd4000000-0000-0000-0000-000000000004', '44444444-4444-4444-4444-444444444444', '11111111-1111-1111-1111-111111111111', 'accepted');  -- trip cancelled

-- ── a stranger sees the three numbers and nothing behind them ─────────────
set local role authenticated;
set local request.jwt.claims to '{"sub":"33333333-3333-3333-3333-333333333333","role":"authenticated"}';

select results_eq(
  $$ select connections, trips, services from public.member_stats('11111111-1111-1111-1111-111111111111') $$,
  $$ values (2, 2, 2) $$,
  'a stranger sees 2 connections, 2 trips and 2 completed services');

select is((select count(*)::int from public.member_trips('11111111-1111-1111-1111-111111111111')), 0,
  'but cannot open the trips');
select is((select count(*)::int from public.member_connections('11111111-1111-1111-1111-111111111111')), 0,
  'or the connections');
select is((select count(*)::int from public.member_services('11111111-1111-1111-1111-111111111111')), 0,
  'or the services');

-- ── the member sees their own, including private trips ────────────────────
set local request.jwt.claims to '{"sub":"11111111-1111-1111-1111-111111111111","role":"authenticated"}';

select results_eq(
  $$ select trips from public.member_stats('11111111-1111-1111-1111-111111111111') $$,
  $$ values (3) $$,
  'the member''s own trip count includes their private one');

select is((select count(*)::int from public.member_trips('11111111-1111-1111-1111-111111111111')), 3,
  'and they can list all three');

-- ── a connection can open them ────────────────────────────────────────────
set local request.jwt.claims to '{"sub":"22222222-2222-2222-2222-222222222222","role":"authenticated"}';

select is(
  (select array_agg(id order by start_date)
     from public.member_trips('11111111-1111-1111-1111-111111111111')),
  array['a1000000-0000-0000-0000-000000000002', 'a1000000-0000-0000-0000-000000000001']::uuid[],
  'a connection sees the trips that are not private, nor cancelled, past ones too');

select is(
  (select array_agg(profile_id order by display_name)
     from public.member_connections('11111111-1111-1111-1111-111111111111')),
  array['22222222-2222-2222-2222-222222222222', '66666666-6666-6666-6666-666666666666']::uuid[],
  'and who the member is connected with, leaving out a suspended member and a pending request');

select is(
  (select relationship from public.member_connections('11111111-1111-1111-1111-111111111111')
    where profile_id = '66666666-6666-6666-6666-666666666666'),
  'none', 'each shown with how they stand with the viewer');

select is(
  (select relationship from public.member_connections('11111111-1111-1111-1111-111111111111')
    where profile_id = '22222222-2222-2222-2222-222222222222'),
  'self', 'including the viewer themselves');

select is(
  (select array_agg(kind order by kind) from public.member_services('11111111-1111-1111-1111-111111111111')),
  array['couch', 'tips'],
  'the services are the couch that was finished and the tips that were accepted for a finished trip');

select is(
  (select recipient_name from public.member_services('11111111-1111-1111-1111-111111111111')
    where kind = 'tips'),
  'Dieter D.', 'each names who it was for');

select is(
  (select city_name from public.member_services('11111111-1111-1111-1111-111111111111')
    where kind = 'couch'),
  null, 'but not the city of a trip that was private');

select is(
  (select city_name from public.member_services('11111111-1111-1111-1111-111111111111')
    where kind = 'tips'),
  'Munich', 'while a public trip''s city is shown');

-- ── the member sees the city of the private one ───────────────────────────
set local request.jwt.claims to '{"sub":"11111111-1111-1111-1111-111111111111","role":"authenticated"}';
select is(
  (select city_name from public.member_services('11111111-1111-1111-1111-111111111111')
    where kind = 'couch'),
  'Munich', 'the member sees the city themselves');

-- ── a blocked recipient is not named ──────────────────────────────────────
set local request.jwt.claims to '{"sub":"22222222-2222-2222-2222-222222222222","role":"authenticated"}';
insert into public.blocks (blocker_id, blocked_id)
values ('22222222-2222-2222-2222-222222222222', '55555555-5555-5555-5555-555555555555');
select is(
  (select recipient_name from public.member_services('11111111-1111-1111-1111-111111111111')
    where kind = 'couch'),
  null, 'a recipient the viewer has blocked is left unnamed');

-- ── who is not shown ──────────────────────────────────────────────────────
select is((select count(*)::int from public.member_stats('88888888-8888-8888-8888-888888888888')), 0,
  'a member who is not approved has no numbers');

set local request.jwt.claims to '{"sub":"33333333-3333-3333-3333-333333333333","role":"authenticated"}';
insert into public.blocks (blocker_id, blocked_id)
values ('33333333-3333-3333-3333-333333333333', '11111111-1111-1111-1111-111111111111');
select is((select count(*)::int from public.member_stats('11111111-1111-1111-1111-111111111111')), 0,
  'nor does a member you have blocked');

-- ── a member waiting for approval sees the numbers ────────────────────────
set local role postgres;
delete from public.blocks;
update public.profiles set status = 'pending' where id = '33333333-3333-3333-3333-333333333333';
insert into public.verification_applications (profile_id, full_legal_name, selfie_prompt, selfie_path, links)
values ('33333333-3333-3333-3333-333333333333', 'Clara C', 'p', 'x/selfie.jpg', '["https://x.example"]'::jsonb);
set local role authenticated;
set local request.jwt.claims to '{"sub":"33333333-3333-3333-3333-333333333333","role":"authenticated"}';
select is((select count(*)::int from public.member_stats('11111111-1111-1111-1111-111111111111')), 1,
  'a member waiting for approval can see the numbers too');

-- ── not callable without signing in ───────────────────────────────────────
set local role anon;
select throws_ok(
  $$ select * from public.member_stats('11111111-1111-1111-1111-111111111111') $$,
  '42501', null, 'the numbers are not available before signing in');

select throws_ok(
  $$ select * from public.completed_services('11111111-1111-1111-1111-111111111111') $$,
  '42501', null, 'and the internal list is not callable at all');

select * from finish();
rollback;
