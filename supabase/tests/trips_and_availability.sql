-- Trips and availability: visibility rules, and the date semantics the whole
-- matching feature depends on.

begin;

-- `supabase test db --linked` connects as cli_login_postgres, a NOINHERIT role
-- the CLI recreates on every run, so the privileges these fixtures need (writing
-- to auth.users) must be claimed explicitly. Locally this is a no-op.
set local role postgres;
select plan(16);

insert into auth.users (id, email, raw_user_meta_data) values
  ('11111111-1111-1111-1111-111111111111', 'anna@example.test',
   '{"display_name":"Anna Weber","discipline":"voice"}'::jsonb),
  ('22222222-2222-2222-2222-222222222222', 'bruno@example.test',
   '{"display_name":"Bruno Kraus","discipline":"strings"}'::jsonb),
  ('33333333-3333-3333-3333-333333333333', 'clara@example.test',
   '{"display_name":"Clara Ortiz","discipline":"dance"}'::jsonb);

update public.profiles set status = 'approved'
  where id in ('11111111-1111-1111-1111-111111111111',
               '22222222-2222-2222-2222-222222222222');
-- Clara stays pending.

-- ── date semantics: SQL must agree with domain/dates.ts ────────────────────
-- The TypeScript tests assert that ranges touching on a single date overlap by
-- one shared night. If Postgres disagreed, matching would silently drop exactly
-- the case the brief's example turns on.
select ok(
  daterange('2027-03-03', '2027-03-05', '[]') && daterange('2027-03-05', '2027-03-09', '[]'),
  'daterange ''[]'' treats touching ranges as overlapping, matching overlaps()'
);

select ok(
  not (daterange('2027-03-03', '2027-03-05', '[]') && daterange('2027-03-06', '2027-03-09', '[]')),
  'ranges one day apart do not overlap'
);

select is(
  (upper(daterange('2027-03-03', '2027-03-05', '[]')) -
   lower(daterange('2027-03-03', '2027-03-05', '[]')))::int,
  3,
  'an inclusive daterange spans three nights for the 3rd–5th, matching nightCount()'
);

-- ── constraints ────────────────────────────────────────────────────────────
select throws_ok(
  $$ insert into public.trips (profile_id, city_id, start_date, end_date, needs)
     values ('11111111-1111-1111-1111-111111111111',
             (select id from public.cities where name = 'Munich' limit 1),
             '2027-03-10', '2027-03-03', array['couch']) $$,
  '23514',
  null,
  'a trip ending before it starts is rejected'
);

select throws_ok(
  $$ insert into public.trips (profile_id, city_id, start_date, end_date, needs)
     values ('11111111-1111-1111-1111-111111111111',
             (select id from public.cities where name = 'Munich' limit 1),
             '2027-03-01', '2027-12-31', array['couch']) $$,
  '23514',
  null,
  'a trip longer than the 60-night cap is rejected, so nobody floods a city'
);

select throws_ok(
  $$ insert into public.trips (profile_id, city_id, start_date, end_date, needs)
     values ('11111111-1111-1111-1111-111111111111',
             (select id from public.cities where name = 'Munich' limit 1),
             '2027-03-03', '2027-03-10', array[]::text[]) $$,
  '23514',
  null,
  'a trip must say what it needs'
);

select throws_ok(
  $$ insert into public.trips (profile_id, city_id, start_date, end_date, needs)
     values ('11111111-1111-1111-1111-111111111111',
             (select id from public.cities where name = 'Munich' limit 1),
             '2027-03-03', '2027-03-10', array['a_villa']) $$,
  '23514',
  null,
  'an unknown need is rejected rather than stored as free text'
);

-- ── fixtures ───────────────────────────────────────────────────────────────
set local role authenticated;
set local request.jwt.claims to
  '{"sub":"11111111-1111-1111-1111-111111111111","role":"authenticated"}';

select lives_ok(
  $$ insert into public.trips (profile_id, city_id, start_date, end_date, needs, note)
     values ('11111111-1111-1111-1111-111111111111',
             (select id from public.cities where name = 'Munich' limit 1),
             '2027-03-03', '2027-03-10', array['couch','tips'], 'Competition.') $$,
  'an approved member can post a trip'
);

select throws_ok(
  $$ insert into public.trips (profile_id, city_id, start_date, end_date, needs)
     values ('22222222-2222-2222-2222-222222222222',
             (select id from public.cities where name = 'Munich' limit 1),
             '2027-03-03', '2027-03-10', array['couch']) $$,
  '42501',
  null,
  'a member cannot post a trip on somebody else''s behalf'
);

set local role postgres;
set local role authenticated;
set local request.jwt.claims to
  '{"sub":"22222222-2222-2222-2222-222222222222","role":"authenticated"}';

select lives_ok(
  $$ insert into public.availability
       (profile_id, city_id, start_date, end_date, offers, constraints, max_nights)
     values ('22222222-2222-2222-2222-222222222222',
             (select id from public.cities where name = 'Munich' limit 1),
             '2027-03-01', '2027-03-05', array['couch'], array['no_pets'], 3) $$,
  'an approved member can post availability'
);

-- ── visibility between approved members ────────────────────────────────────
select is(
  (select count(*)::int from public.trips),
  1,
  'an approved member sees another approved member''s active trip'
);

set local role postgres;
set local role authenticated;
set local request.jwt.claims to
  '{"sub":"11111111-1111-1111-1111-111111111111","role":"authenticated"}';

select is(
  (select count(*)::int from public.availability),
  1,
  'an approved member sees another approved member''s active availability'
);

-- ── a pending applicant sees nothing ───────────────────────────────────────
set local role postgres;
set local role authenticated;
set local request.jwt.claims to
  '{"sub":"33333333-3333-3333-3333-333333333333","role":"authenticated"}';

select is(
  (select count(*)::int from public.trips),
  0,
  'a pending applicant sees no trips at all'
);

select is(
  (select count(*)::int from public.availability),
  0,
  'a pending applicant sees no availability at all'
);

-- ── cancelling hides a trip from others but not from its owner ─────────────
set local role postgres;
update public.trips set status = 'cancelled';

set local role authenticated;
set local request.jwt.claims to
  '{"sub":"22222222-2222-2222-2222-222222222222","role":"authenticated"}';

select is(
  (select count(*)::int from public.trips),
  0,
  'a cancelled trip disappears from other members'' view'
);

set local role postgres;
set local role authenticated;
set local request.jwt.claims to
  '{"sub":"11111111-1111-1111-1111-111111111111","role":"authenticated"}';

select is(
  (select count(*)::int from public.trips),
  1,
  'the owner can still see their own cancelled trip'
);

select * from finish();
rollback;
