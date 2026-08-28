-- One live offer per host per trip, and revising the one you made.
--
-- THE BUG THIS LOCKS DOWN: answering the same request twice. The requests
-- screen went on showing "Offer nights" after an offer had been made, so a
-- host could leave two overlapping offers on one trip and the traveller could
-- accept either. The UI now routes to a revise screen instead, but the index
-- below is what makes the second row impossible whoever writes it.

begin;

-- `supabase test db --linked` connects as cli_login_postgres, a NOINHERIT role
-- the CLI recreates on every run, so the privileges these fixtures need (writing
-- to auth.users) must be claimed explicitly. Locally this is a no-op.
set local role postgres;
select plan(11);

-- ── fixtures ───────────────────────────────────────────────────────────────
-- Anna travels to Munich 3–10 March. Bruno can host 1–8 March; Clara 1–31.
insert into auth.users (id, email, raw_user_meta_data) values
  ('11111111-1111-1111-1111-111111111111', 'anna@example.test',
   '{"display_name":"Anna Weber","discipline":"voice"}'::jsonb),
  ('22222222-2222-2222-2222-222222222222', 'bruno@example.test',
   '{"display_name":"Bruno Kraus","discipline":"strings"}'::jsonb),
  ('33333333-3333-3333-3333-333333333333', 'clara@example.test',
   '{"display_name":"Clara Ortiz","discipline":"dance"}'::jsonb);

update public.profiles set status = 'approved';

insert into public.trips (id, profile_id, city_id, start_date, end_date, needs)
values ('aaaa0000-0000-0000-0000-000000000001',
        '11111111-1111-1111-1111-111111111111',
        (select id from public.cities where name = 'Munich' limit 1),
        '2027-03-03', '2027-03-10', array['couch']);

insert into public.availability (profile_id, city_id, start_date, end_date, offers)
values
  ('22222222-2222-2222-2222-222222222222',
   (select id from public.cities where name = 'Munich' limit 1),
   '2027-03-01', '2027-03-08', array['couch']),
  ('33333333-3333-3333-3333-333333333333',
   (select id from public.cities where name = 'Munich' limit 1),
   '2027-03-01', '2027-03-31', array['spare_room']);

-- ── Bruno answers ──────────────────────────────────────────────────────────
set local role authenticated;
set local request.jwt.claims to
  '{"sub":"22222222-2222-2222-2222-222222222222","role":"authenticated"}';

select lives_ok(
  $$ insert into public.offers (id, trip_id, from_profile, to_profile,
                                start_date, end_date)
     values ('dddd0000-0000-0000-0000-000000000001',
             'aaaa0000-0000-0000-0000-000000000001',
             '22222222-2222-2222-2222-222222222222',
             '11111111-1111-1111-1111-111111111111',
             '2027-03-03', '2027-03-05') $$,
  'a host may offer nights on a trip'
);

select throws_ok(
  $$ insert into public.offers (trip_id, from_profile, to_profile,
                                start_date, end_date)
     values ('aaaa0000-0000-0000-0000-000000000001',
             '22222222-2222-2222-2222-222222222222',
             '11111111-1111-1111-1111-111111111111',
             '2027-03-06', '2027-03-08') $$,
  '23505',
  null,
  'but not a second one on the same trip — this is the duplicate-offer bug'
);

-- ── another host is unaffected ─────────────────────────────────────────────
set local request.jwt.claims to
  '{"sub":"33333333-3333-3333-3333-333333333333","role":"authenticated"}';

select lives_ok(
  $$ insert into public.offers (id, trip_id, from_profile, to_profile,
                                start_date, end_date)
     values ('dddd0000-0000-0000-0000-000000000002',
             'aaaa0000-0000-0000-0000-000000000001',
             '33333333-3333-3333-3333-333333333333',
             '11111111-1111-1111-1111-111111111111',
             '2027-03-03', '2027-03-10') $$,
  'the rule is per host, so a different host may still offer'
);

-- ── Bruno revises ──────────────────────────────────────────────────────────
set local request.jwt.claims to
  '{"sub":"22222222-2222-2222-2222-222222222222","role":"authenticated"}';

select lives_ok(
  $$ update public.offers
       set start_date = '2027-03-04', end_date = '2027-03-08',
           message = 'Can do a bit longer after all'
     where id = 'dddd0000-0000-0000-0000-000000000001' $$,
  'the host may revise their own unanswered offer'
);

select is(
  (select end_date from public.offers
    where id = 'dddd0000-0000-0000-0000-000000000001'),
  '2027-03-08'::date,
  'and the new nights stick'
);

select throws_ok(
  $$ update public.offers set end_date = '2027-03-10'
     where id = 'dddd0000-0000-0000-0000-000000000001' $$,
  '23514',
  null,
  'but not past the availability they posted — the range trigger still runs'
);

-- created_at, not to_profile: offers_enforce_range fires first (before-update
-- triggers run in name order, and e sorts before g) and rejects a re-addressed
-- offer itself, with 23514. This column reaches the guard.
select throws_ok(
  $$ update public.offers set created_at = now()
     where id = 'dddd0000-0000-0000-0000-000000000001' $$,
  '42501',
  null,
  'and revising never means rewriting the columns that are not the host''s'
);

-- ── nobody else may revise it ──────────────────────────────────────────────
set local request.jwt.claims to
  '{"sub":"11111111-1111-1111-1111-111111111111","role":"authenticated"}';

select is(
  (select count(*)::int from public.offers
    where id = 'dddd0000-0000-0000-0000-000000000001'
      and start_date = '2027-03-04'),
  1,
  'the traveller can see the revised offer'
);

-- offers_decline_received's USING clause matches this row, so the update is not
-- filtered away — it reaches the guard, which refuses it by name. An explicit
-- error beats a silent no-op here: a traveller's client that tried this has a
-- bug, and should be told.
select throws_ok(
  $$ update public.offers set start_date = '2027-03-03'
     where id = 'dddd0000-0000-0000-0000-000000000001' $$,
  '42501',
  null,
  'but cannot rewrite the nights they were offered'
);

select lives_ok(
  $$ update public.offers set status = 'declined'
     where id = 'dddd0000-0000-0000-0000-000000000001' $$,
  'answering it still works — revision did not break the decline path'
);

-- ── a declined offer frees the slot ────────────────────────────────────────
set local request.jwt.claims to
  '{"sub":"22222222-2222-2222-2222-222222222222","role":"authenticated"}';

select lives_ok(
  $$ insert into public.offers (trip_id, from_profile, to_profile,
                                start_date, end_date)
     values ('aaaa0000-0000-0000-0000-000000000001',
             '22222222-2222-2222-2222-222222222222',
             '11111111-1111-1111-1111-111111111111',
             '2027-03-06', '2027-03-08') $$,
  'and a host turned down once may make a fresh offer'
);

select * from finish();
rollback;
