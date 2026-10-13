-- Tips and coffee requests: sent like any request, accepted or declined like a
-- co-accommodation request, and accepting shares contact both ways.

begin;

-- See rls_profiles.sql: the CLI's login role needs this to write auth.users.
set local role postgres;
select plan(16);

insert into auth.users (id, email, raw_user_meta_data) values
  ('11111111-1111-1111-1111-111111111111', 'anna@example.test',
   '{"first_name":"Anna","last_name":"A"}'::jsonb),
  ('22222222-2222-2222-2222-222222222222', 'bruno@example.test',
   '{"first_name":"Bruno","last_name":"B"}'::jsonb),
  ('33333333-3333-3333-3333-333333333333', 'clara@example.test',
   '{"first_name":"Clara","last_name":"C"}'::jsonb);

update public.profiles set status = 'approved';
update public.contact_details set phone = '+4917011111111'
  where profile_id = '22222222-2222-2222-2222-222222222222';
update public.contact_details set phone = '+4917022222222'
  where profile_id = '11111111-1111-1111-1111-111111111111';

insert into public.trips (id, profile_id, city_id, start_date, end_date, needs, visibility)
values ('aaaa0000-0000-0000-0000-000000000001', '11111111-1111-1111-1111-111111111111',
        (select id from public.cities where name = 'Munich' limit 1),
        current_date + 20, current_date + 25, array['tips', 'company'], 'private');

-- ── sending ────────────────────────────────────────────────────────────────
set local role authenticated;
set local request.jwt.claims to '{"sub":"11111111-1111-1111-1111-111111111111","role":"authenticated"}';

select lives_ok(
  $$ insert into public.requests (id, kind, trip_id, from_profile, to_profile)
     values ('cccc0000-0000-0000-0000-000000000001', 'tips',
             'aaaa0000-0000-0000-0000-000000000001',
             '11111111-1111-1111-1111-111111111111', '22222222-2222-2222-2222-222222222222') $$,
  'a traveller can ask someone for tips');

select lives_ok(
  $$ insert into public.requests (id, kind, trip_id, from_profile, to_profile)
     values ('cccc0000-0000-0000-0000-000000000002', 'coffee',
             'aaaa0000-0000-0000-0000-000000000001',
             '11111111-1111-1111-1111-111111111111', '22222222-2222-2222-2222-222222222222') $$,
  'and for a coffee, to the same person');

select throws_ok(
  $$ insert into public.requests (kind, trip_id, from_profile, to_profile)
     values ('tips', 'aaaa0000-0000-0000-0000-000000000001',
             '11111111-1111-1111-1111-111111111111', '22222222-2222-2222-2222-222222222222') $$,
  '23505', null, 'but not for tips twice');

select lives_ok(
  $$ insert into public.requests (id, kind, trip_id, from_profile, to_profile)
     values ('cccc0000-0000-0000-0000-000000000003', 'tips',
             'aaaa0000-0000-0000-0000-000000000001',
             '11111111-1111-1111-1111-111111111111', '33333333-3333-3333-3333-333333333333') $$,
  'and a different person can be asked as well');

-- ── the recipient is told what is being asked ──────────────────────────────
set local role postgres;
select is(
  (select array_agg(type order by type) from public.notifications
    where profile_id = '22222222-2222-2222-2222-222222222222'),
  array['coffee_request_received', 'tips_request_received'],
  'each kind notifies the recipient with its own type');

select is(
  (select payload ->> 'kind' from public.notifications
    where profile_id = '22222222-2222-2222-2222-222222222222' and type = 'tips_request_received'),
  'tips', 'and the payload carries the kind');

-- ── the private trip is visible to the people it was sent to ──────────────
set local role authenticated;
set local request.jwt.claims to '{"sub":"22222222-2222-2222-2222-222222222222","role":"authenticated"}';
select is(
  (select count(*)::int from public.trips where id = 'aaaa0000-0000-0000-0000-000000000001'),
  1, 'a private trip is visible to someone asked for tips or a coffee');

-- ── accepting ──────────────────────────────────────────────────────────────
set local role postgres;
select is(
  public.accept_co_request('cccc0000-0000-0000-0000-000000000001',
                           '22222222-2222-2222-2222-222222222222') ->> 'ok',
  'true', 'the person asked can accept a tips request');

select is(
  public.accept_co_request('cccc0000-0000-0000-0000-000000000001',
                           '22222222-2222-2222-2222-222222222222') ->> 'ok',
  'true', 'and accepting twice is harmless');

select is(
  public.accept_co_request('cccc0000-0000-0000-0000-000000000002',
                           '33333333-3333-3333-3333-333333333333') ->> 'error',
  'request_not_found', 'nobody else can accept it for them');

set local role authenticated;
set local request.jwt.claims to '{"sub":"11111111-1111-1111-1111-111111111111","role":"authenticated"}';
select is(
  (select phone from public.contact_details where profile_id = '22222222-2222-2222-2222-222222222222'),
  '+4917011111111', 'accepting shares their contact with the person who asked');

set local request.jwt.claims to '{"sub":"22222222-2222-2222-2222-222222222222","role":"authenticated"}';
select is(
  (select phone from public.contact_details where profile_id = '11111111-1111-1111-1111-111111111111'),
  '+4917022222222', 'and theirs with them');

set local role postgres;
select is(
  (select count(*)::int from public.notifications
    where type = 'co_request_accepted' and payload ->> 'kind' = 'tips'),
  2, 'both are told, and the notification says it was about tips');

-- ── declining ──────────────────────────────────────────────────────────────
set local role authenticated;
set local request.jwt.claims to '{"sub":"22222222-2222-2222-2222-222222222222","role":"authenticated"}';
update public.requests set status = 'declined' where id = 'cccc0000-0000-0000-0000-000000000002';

set local role postgres;
select is(
  (select payload ->> 'kind' from public.notifications
    where type = 'co_request_declined' and profile_id = '11111111-1111-1111-1111-111111111111'),
  'coffee', 'declining a coffee tells the sender, naming the kind');

-- ── a stay request still goes the other way ────────────────────────────────
insert into public.requests (id, kind, trip_id, from_profile, to_profile)
values ('cccc0000-0000-0000-0000-000000000009', 'host_stay',
        'aaaa0000-0000-0000-0000-000000000001',
        '11111111-1111-1111-1111-111111111111', '33333333-3333-3333-3333-333333333333');
select is(
  public.accept_co_request('cccc0000-0000-0000-0000-000000000009',
                           '33333333-3333-3333-3333-333333333333') ->> 'error',
  'request_not_found', 'a request for a stay cannot be accepted this way: it needs an offer');

select is(
  (select count(*)::int from public.requests
    where kind in ('tips', 'coffee') and trip_id = 'aaaa0000-0000-0000-0000-000000000001'),
  3, 'three tips or coffee requests exist');

select * from finish();
rollback;
