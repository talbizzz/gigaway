-- A member whose verification is under review may browse and post their own
-- trips and availability, but nothing that involves another member acting on
-- them, and nobody else can see them until they are approved.

begin;

-- See rls_profiles.sql: the CLI's login role needs this to write auth.users.
set local role postgres;
select plan(25);

-- ── fixtures ───────────────────────────────────────────────────────────────
--   Anna   approved host
--   Bruno  in review: submitted, waiting
--   Clara  signed up, never submitted
--   Dieter submitted, then rejected
--   Eva    approved, a second viewer
insert into auth.users (id, email, raw_user_meta_data) values
  ('11111111-1111-1111-1111-111111111111', 'anna@example.test',
   '{"first_name":"Anna","last_name":"Weber","discipline":"voice"}'::jsonb),
  ('22222222-2222-2222-2222-222222222222', 'bruno@example.test',
   '{"first_name":"Bruno","last_name":"Kraus","discipline":"strings"}'::jsonb),
  ('33333333-3333-3333-3333-333333333333', 'clara@example.test',
   '{"first_name":"Clara","last_name":"Ortiz","discipline":"dance"}'::jsonb),
  ('44444444-4444-4444-4444-444444444444', 'dieter@example.test',
   '{"first_name":"Dieter","last_name":"Hahn","discipline":"brass"}'::jsonb),
  ('55555555-5555-5555-5555-555555555555', 'eva@example.test',
   '{"first_name":"Eva","last_name":"Lind","discipline":"keyboard"}'::jsonb);

update public.profiles set status = 'approved'
  where id in ('11111111-1111-1111-1111-111111111111',
               '55555555-5555-5555-5555-555555555555');

insert into public.verification_applications
  (profile_id, full_legal_name, selfie_prompt, selfie_path, links)
select p.id, 'Legal Name', 'two fingers', p.id || '/selfie.jpg', '["https://x.example"]'::jsonb
from public.profiles p
where p.id in ('22222222-2222-2222-2222-222222222222',
               '44444444-4444-4444-4444-444444444444');

update public.verification_applications
  set status = 'rejected', decision_reason = 'Photo unreadable'
  where profile_id = '44444444-4444-4444-4444-444444444444';

insert into public.trips (id, profile_id, city_id, start_date, end_date, needs)
values ('aaaa0000-0000-0000-0000-000000000001',
        '11111111-1111-1111-1111-111111111111',
        (select id from public.cities where name = 'Munich' limit 1),
        '2027-03-03', '2027-03-10', array['couch']);

insert into public.availability (id, profile_id, city_id, start_date, end_date, offers)
values ('bbbb0000-0000-0000-0000-000000000001',
        '11111111-1111-1111-1111-111111111111',
        (select id from public.cities where name = 'Munich' limit 1),
        '2027-03-01', '2027-03-31', array['couch']);

-- Bruno is also free to host in March, so an offer he tried to make would be
-- valid in every respect except who he is.
insert into public.availability (id, profile_id, city_id, start_date, end_date, offers)
values ('bbbb0000-0000-0000-0000-000000000002',
        '22222222-2222-2222-2222-222222222222',
        (select id from public.cities where name = 'Munich' limit 1),
        '2027-03-01', '2027-03-31', array['couch']);

-- Scoped to fixture ids throughout, so this passes on a database with data.

-- ── the states ─────────────────────────────────────────────────────────────
select is(
  (select array_agg(status::text order by id) from public.profiles
    where id in ('22222222-2222-2222-2222-222222222222',
                 '33333333-3333-3333-3333-333333333333',
                 '44444444-4444-4444-4444-444444444444')),
  array['pending', 'pending', 'rejected'],
  'submitted = pending, never submitted = pending, rejected = rejected'
);

-- ── in review: Bruno ───────────────────────────────────────────────────────
set local role authenticated;
set local request.jwt.claims to
  '{"sub":"22222222-2222-2222-2222-222222222222","role":"authenticated"}';

select ok(public.is_in_review(), 'a member with a submitted application is in review');
select ok(public.can_browse(), 'and may browse');
select ok(not public.is_approved(), 'but is not approved');

select is(
  (select count(*)::int from public.profiles
    where id = '11111111-1111-1111-1111-111111111111'),
  1,
  'they can see an approved member''s profile'
);

select is(
  (select count(*)::int from public.trips
    where id = 'aaaa0000-0000-0000-0000-000000000001'),
  1,
  'and their trips'
);

select is(
  (select count(*)::int from public.availability
    where id = 'bbbb0000-0000-0000-0000-000000000001'),
  1,
  'and their availability'
);

select is(
  (select count(*)::int from public.profiles
    where id = '33333333-3333-3333-3333-333333333333'),
  0,
  'but not another unapproved member'
);

select lives_ok(
  $$ insert into public.trips (id, profile_id, city_id, start_date, end_date, needs)
     values ('aaaa0000-0000-0000-0000-000000000002',
             '22222222-2222-2222-2222-222222222222',
             (select id from public.cities where name = 'Munich' limit 1),
             '2027-03-05', '2027-03-08', array['couch']) $$,
  'a member in review can post a trip'
);

select lives_ok(
  $$ insert into public.availability (profile_id, city_id, start_date, end_date, offers)
     values ('22222222-2222-2222-2222-222222222222',
             (select id from public.cities where name = 'Munich' limit 1),
             '2027-04-01', '2027-04-05', array['couch']) $$,
  'and post availability'
);

select lives_ok($$ select public.home_feed() $$, 'the home feed works for them');

select is(
  (select jsonb_array_length(public.search_matches('aaaa0000-0000-0000-0000-000000000002') -> 'hosts')),
  1,
  'and matching finds them the approved host whose availability overlaps'
);

select throws_ok(
  $$ insert into public.requests (kind, trip_id, from_profile, to_profile)
     values ('host_stay', 'aaaa0000-0000-0000-0000-000000000002',
             '22222222-2222-2222-2222-222222222222',
             '11111111-1111-1111-1111-111111111111') $$,
  '42501',
  null,
  'but they cannot request a stay'
);

select throws_ok(
  $$ insert into public.offers (trip_id, from_profile, to_profile, start_date, end_date)
     values ('aaaa0000-0000-0000-0000-000000000001',
             '22222222-2222-2222-2222-222222222222',
             '11111111-1111-1111-1111-111111111111',
             '2027-03-03', '2027-03-08') $$,
  '42501',
  null,
  'or make an offer'
);

-- ── never submitted: Clara ─────────────────────────────────────────────────
set local request.jwt.claims to
  '{"sub":"33333333-3333-3333-3333-333333333333","role":"authenticated"}';

select ok(not public.can_browse(), 'a member who has not submitted cannot browse');

select is(
  (select count(*)::int from public.profiles
    where id = '11111111-1111-1111-1111-111111111111'),
  0,
  'and sees nobody'
);

select throws_ok(
  $$ insert into public.trips (profile_id, city_id, start_date, end_date, needs)
     values ('33333333-3333-3333-3333-333333333333',
             (select id from public.cities where name = 'Munich' limit 1),
             '2027-05-01', '2027-05-04', array['couch']) $$,
  '42501',
  null,
  'nor post a trip'
);

-- ── rejected: Dieter ───────────────────────────────────────────────────────
set local request.jwt.claims to
  '{"sub":"44444444-4444-4444-4444-444444444444","role":"authenticated"}';

select ok(not public.can_browse(), 'a rejected member is back at the gate');

select is(
  (select count(*)::int from public.trips
    where id = 'aaaa0000-0000-0000-0000-000000000001'),
  0,
  'and sees no trips'
);

-- ── nobody else sees a member in review ────────────────────────────────────
set local request.jwt.claims to
  '{"sub":"55555555-5555-5555-5555-555555555555","role":"authenticated"}';

select is(
  (select count(*)::int from public.profiles
    where id = '22222222-2222-2222-2222-222222222222'),
  0,
  'an approved member does not see a member in review'
);

select is(
  (select count(*)::int from public.trips
    where id = 'aaaa0000-0000-0000-0000-000000000002'),
  0,
  'nor the trip they posted'
);

-- ── the decision ───────────────────────────────────────────────────────────
set local role postgres;

update public.verification_applications
  set status = 'approved' where profile_id = '22222222-2222-2222-2222-222222222222';

set local role authenticated;
set local request.jwt.claims to
  '{"sub":"55555555-5555-5555-5555-555555555555","role":"authenticated"}';

select is(
  (select count(*)::int from public.trips
    where id = 'aaaa0000-0000-0000-0000-000000000002'),
  1,
  'once approved, the trip they posted while waiting becomes visible'
);

-- A rejected member reapplying is in review again.
set local role postgres;

update public.verification_applications
  set status = 'pending' where profile_id = '44444444-4444-4444-4444-444444444444';

set local role authenticated;
set local request.jwt.claims to
  '{"sub":"44444444-4444-4444-4444-444444444444","role":"authenticated"}';

select ok(public.is_in_review(), 'a rejected member who reapplies is in review again');

-- And a rejection hides what they posted while waiting.
set local role postgres;

insert into public.verification_applications
  (profile_id, full_legal_name, selfie_prompt, selfie_path, links)
values ('33333333-3333-3333-3333-333333333333', 'Legal Name', 'two fingers',
        '33333333-3333-3333-3333-333333333333/selfie.jpg', '["https://x.example"]'::jsonb);

set local role authenticated;
set local request.jwt.claims to
  '{"sub":"33333333-3333-3333-3333-333333333333","role":"authenticated"}';

select lives_ok(
  $$ insert into public.trips (id, profile_id, city_id, start_date, end_date, needs)
     values ('aaaa0000-0000-0000-0000-000000000003',
             '33333333-3333-3333-3333-333333333333',
             (select id from public.cities where name = 'Munich' limit 1),
             '2027-05-01', '2027-05-04', array['couch']) $$,
  'submitting is what opens the door'
);

set local role postgres;

update public.verification_applications
  set status = 'rejected', decision_reason = 'No' where profile_id = '33333333-3333-3333-3333-333333333333';

set local role authenticated;
set local request.jwt.claims to
  '{"sub":"55555555-5555-5555-5555-555555555555","role":"authenticated"}';

select is(
  (select count(*)::int from public.trips
    where id = 'aaaa0000-0000-0000-0000-000000000003'),
  0,
  'a rejected member''s trip stays hidden from everyone'
);

select * from finish();
rollback;
