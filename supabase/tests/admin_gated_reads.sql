-- Admin gated reads (Milestone 6, phase 2).
--
-- Same property tested nine times over: a non-admin, whether anon or an
-- ordinary authenticated member, gets nothing from any admin_* read
-- function — not an error for most of them (they're designed to return
-- zero rows, matching admin_audit_log's precedent), but never real data
-- either. An admin gets exactly the rows the fixtures below set up.

begin;

set local role postgres;
select plan(23);

insert into auth.users (id, email, raw_user_meta_data) values
  ('a0000000-0000-0000-0000-000000000001', 'admin@example.test',
   '{"display_name":"Admin One"}'::jsonb),
  ('b0000000-0000-0000-0000-000000000002', 'anna@example.test',
   '{"display_name":"Anna Weber","discipline":"voice"}'::jsonb),
  ('c0000000-0000-0000-0000-000000000003', 'bruno@example.test',
   '{"display_name":"Bruno Kraus","discipline":"strings"}'::jsonb);

insert into public.admin_users (id, display_name)
values ('a0000000-0000-0000-0000-000000000001', 'Admin One');

update public.profiles set status = 'approved';

insert into public.trips (id, profile_id, city_id, start_date, end_date, needs)
values ('aaaa0000-0000-0000-0000-000000000001',
        'b0000000-0000-0000-0000-000000000002',
        (select id from public.cities where name = 'Munich' limit 1),
        '2027-03-03', '2027-03-10', array['couch']);

insert into public.verification_applications
  (profile_id, full_legal_name, selfie_prompt, links, status)
values
  ('c0000000-0000-0000-0000-000000000003', 'Bruno Kraus', 'thumbs up',
   '["https://brunokraus.example"]'::jsonb, 'pending');

insert into public.reports (reporter_id, subject_id, category, body)
values ('b0000000-0000-0000-0000-000000000002',
        'c0000000-0000-0000-0000-000000000003',
        'no_show', 'Did not show up to the meeting point.');

insert into public.notifications (profile_id, type, attempts, sent_at)
values ('b0000000-0000-0000-0000-000000000002', 'offer_received', 3, null);

insert into storage.objects (bucket_id, name, owner)
values ('verification-docs',
        'c0000000-0000-0000-0000-000000000003/selfie-1.jpg',
        'c0000000-0000-0000-0000-000000000003');

-- ── anon: shut out entirely ─────────────────────────────────────────────

set local role anon;

select throws_ok(
  $$ select * from public.admin_search_profiles('anna') $$,
  '42501', null,
  'anon has no grant to call admin_search_profiles at all'
);

select throws_ok(
  $$ select * from public.admin_cron_status() $$,
  '42501', null,
  'nor admin_cron_status'
);

-- ── an ordinary member: grant exists, is_admin() closes the door ────────

set local role authenticated;
set local request.jwt.claims to
  '{"sub":"b0000000-0000-0000-0000-000000000002","role":"authenticated"}';

select is(
  (select count(*)::int from public.admin_search_profiles('anna')),
  0,
  'a non-admin gets zero rows from admin_search_profiles, not an error'
);

select is(
  (select count(*)::int from public.admin_get_user_detail(
     'b0000000-0000-0000-0000-000000000002')),
  0,
  'nor from admin_get_user_detail, even for their own profile_id'
);

select is(
  (select count(*)::int from public.admin_search_trips('munich')),
  0,
  'nor admin_search_trips'
);

select is(
  (select count(*)::int from public.admin_get_trip_detail(
     'aaaa0000-0000-0000-0000-000000000001')),
  0,
  'nor admin_get_trip_detail'
);

select is(
  (select count(*)::int from public.admin_pending_verifications()),
  0,
  'nor the verification queue'
);

select is(
  (select count(*)::int from public.admin_open_reports()),
  0,
  'nor the report queue'
);

select is(
  (select count(*)::int from public.admin_stuck_notifications()),
  0,
  'nor stuck notifications'
);

select is(
  (select count(*)::int from public.admin_recent_signups()),
  0,
  'nor recent signups'
);

select is(
  (select count(*)::int from public.admin_cron_status()),
  0,
  'nor cron status'
);

-- RLS-denied rows come back as an empty result, not a thrown 42501 — the
-- base table grant on storage.objects is broad (Supabase's own default for
-- Storage; access control is meant to live entirely in policies), so a
-- non-matching policy just filters the row out silently. Confirmed
-- directly against dev before writing this the second time.
select is(
  (select count(*)::int from storage.objects
    where bucket_id = 'verification-docs'
      and name = 'c0000000-0000-0000-0000-000000000003/selfie-1.jpg'),
  0,
  'and Anna (a different non-admin, not even the owner) cannot read '
  'Bruno''s verification evidence either — the new policy is admin-only, '
  'not owner-or-admin'
);

-- ── the admin: sees exactly what the fixtures set up ────────────────────

set local request.jwt.claims to
  '{"sub":"a0000000-0000-0000-0000-000000000001","role":"authenticated"}';

-- Same reasoning as the trip search below: a bare count(*) = 1 would be
-- fragile against a real, populated dev database — someone else's real
-- name could legitimately contain "anna" too.
select is(
  (select count(*)::int from public.admin_search_profiles('anna')
    where profile_id = 'b0000000-0000-0000-0000-000000000002'),
  1,
  'the admin finds Anna by a case-insensitive name fragment'
);

select is(
  (select count(*)::int from public.admin_search_profiles('nobody-like-this')),
  0,
  'and a query matching nobody returns nothing, not everybody'
);

select is(
  (select trips::int from public.admin_get_user_detail(
     'b0000000-0000-0000-0000-000000000002')),
  1,
  'admin_get_user_detail counts the trip Anna posted'
);

-- count(*) = 1 would be wrong against a real, populated dev database — this
-- city search can legitimately match other real trips already in Munich.
-- What actually matters is that the fixture is among the results.
select is(
  (select count(*)::int from public.admin_search_trips('munich')
    where trip_id = 'aaaa0000-0000-0000-0000-000000000001'),
  1,
  'the admin finds the Munich trip by city'
);

select is(
  (select requests_count::int from public.admin_get_trip_detail(
     'aaaa0000-0000-0000-0000-000000000001')),
  0,
  'admin_get_trip_detail reports zero requests against a trip with none'
);

select is(
  (select count(*)::int from public.admin_pending_verifications()
    where profile_id = 'c0000000-0000-0000-0000-000000000003'),
  1,
  'the admin sees Bruno''s pending verification application'
);

select is(
  (select count(*)::int from public.admin_open_reports()
    where subject_id = 'c0000000-0000-0000-0000-000000000003'),
  1,
  'and the report Anna filed against him'
);

select is(
  (select count(*)::int from public.admin_stuck_notifications()
    where profile_id = 'b0000000-0000-0000-0000-000000000002'),
  1,
  'and the stuck notification'
);

select ok(
  (select count(*)::int from public.admin_recent_signups()) >= 2,
  'and the recent signups list includes the fixture members'
);

select ok(
  (select count(*)::int from public.admin_cron_status()) > 0,
  'and the real scheduled jobs this project already runs'
);

select is(
  (select count(*)::int from storage.objects
    where bucket_id = 'verification-docs'
      and name = 'c0000000-0000-0000-0000-000000000003/selfie-1.jpg'),
  1,
  'and CAN read the verification evidence a moderator needs to decide the application'
);

select * from finish();
rollback;
