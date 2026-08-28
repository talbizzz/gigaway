-- Reports and suspension.
--
-- The report table's guarantee is unusual and worth stating plainly: NOBODY
-- reads it from the app. Not the subject, obviously — but not the reporter
-- either. There is no client read path at all, which is why the reporter gets
-- a notification rather than the ability to look the row up.
--
-- The other half is silence: being reported must produce no observable signal
-- whatsoever, or the private channel becomes a way to provoke people.

begin;

-- `supabase test db --linked` connects as cli_login_postgres, a NOINHERIT role
-- the CLI recreates on every run, so the privileges these fixtures need (writing
-- to auth.users) must be claimed explicitly. Locally this is a no-op.
set local role postgres;
select plan(27);

insert into auth.users (id, email, raw_user_meta_data) values
  ('11111111-1111-1111-1111-111111111111', 'anna@example.test',
   '{"display_name":"Anna Weber","discipline":"voice"}'::jsonb),
  ('22222222-2222-2222-2222-222222222222', 'bruno@example.test',
   '{"display_name":"Bruno Kraus","discipline":"strings"}'::jsonb),
  ('33333333-3333-3333-3333-333333333333', 'clara@example.test',
   '{"display_name":"Clara Ortiz","discipline":"dance"}'::jsonb);

update public.profiles set status = 'approved';

-- ── no client may touch the table, in either direction ─────────────────────
set local role authenticated;
set local request.jwt.claims to
  '{"sub":"11111111-1111-1111-1111-111111111111","role":"authenticated"}';

select throws_ok(
  $$ select count(*) from public.reports $$,
  '42501',
  null,
  'no client can read the reports table at all'
);

select throws_ok(
  $$ insert into public.reports (reporter_id, subject_id, category, body)
     values ('11111111-1111-1111-1111-111111111111',
             '22222222-2222-2222-2222-222222222222', 'safety', 'test') $$,
  '42501',
  null,
  'nor write to it directly — submit-report is the only door'
);

select throws_ok(
  $$ select count(*) from public.v_open_reports $$,
  '42501',
  null,
  'nor read the moderator queue view'
);

select throws_ok(
  $$ select count(*) from public.v_user_summary $$,
  '42501',
  null,
  'nor the per-member summary the moderator uses'
);

-- ── filing one ─────────────────────────────────────────────────────────────
set local role postgres;

select is(
  (select public.submit_report(
     '11111111-1111-1111-1111-111111111111',
     '22222222-2222-2222-2222-222222222222',
     'safety', 'He would not let me leave when I asked.') ->> 'ok'),
  'true',
  'a member can file a report'
);

select is(
  (select public.submit_report(
     '11111111-1111-1111-1111-111111111111',
     '11111111-1111-1111-1111-111111111111',
     'safety', 'reporting myself') ->> 'error'),
  'subject_not_found',
  'nobody can report themselves'
);

select is(
  (select public.submit_report(
     '11111111-1111-1111-1111-111111111111',
     gen_random_uuid(),
     'safety', 'reporting a ghost') ->> 'error'),
  'subject_not_found',
  'reporting a profile that does not exist is refused'
);

select is(
  (select public.submit_report(
     '11111111-1111-1111-1111-111111111111',
     '22222222-2222-2222-2222-222222222222',
     'vibes', 'not a real category') ->> 'error'),
  'invalid_category',
  'an invented category is refused rather than stored as free text'
);

-- ── the reporter is told; the subject is not ───────────────────────────────
select is(
  (select count(*)::int from public.notifications
    where type = 'report_received'
      and profile_id = '11111111-1111-1111-1111-111111111111'),
  1,
  'the reporter gets a confirmation, since they cannot read the row back'
);

select is(
  (select count(*)::int from public.notifications
    where profile_id = '22222222-2222-2222-2222-222222222222'),
  0,
  'THE REPORTED MEMBER RECEIVES NOTHING — no signal that a report exists'
);

select is(
  (select count(*)::int from public.notifications n
    where n.payload::text ilike '%would not let me leave%'),
  0,
  'and no report content ever reaches a notification payload'
);

-- ── reporting with a block ─────────────────────────────────────────────────
select is(
  (select public.submit_report(
     '33333333-3333-3333-3333-333333333333',
     '22222222-2222-2222-2222-222222222222',
     'harassment', 'Persistent unwanted messages.', null, null, true) ->> 'ok'),
  'true',
  'a report can carry a block alongside it'
);

select is(
  (select count(*)::int from public.blocks
    where blocker_id = '33333333-3333-3333-3333-333333333333'
      and blocked_id = '22222222-2222-2222-2222-222222222222'),
  1,
  'and the block is created'
);

-- The reporter's own confirmation must survive the block they just made.
-- enqueue_notification suppresses anything crossing a block, so the receipt is
-- enqueued without a counterparty in the payload precisely to avoid that.
select is(
  (select count(*)::int from public.notifications
    where type = 'report_received'
      and profile_id = '33333333-3333-3333-3333-333333333333'),
  1,
  'the reporter still gets their receipt despite having just blocked the subject'
);

-- ── rate limiting ──────────────────────────────────────────────────────────
select is(
  (select count(*)::int from (
     select public.submit_report(
       '11111111-1111-1111-1111-111111111111',
       '33333333-3333-3333-3333-333333333333',
       'spam', 'filler ' || n) as result
     from generate_series(1, 4) n
   ) x where x.result ->> 'ok' = 'true'),
  4,
  'a member may file up to five reports in a day'
);

select is(
  (select public.submit_report(
     '11111111-1111-1111-1111-111111111111',
     '33333333-3333-3333-3333-333333333333',
     'spam', 'one too many') ->> 'error'),
  'rate_limited',
  'the sixth in twenty-four hours is refused'
);

-- ── the moderator's own view works ─────────────────────────────────────────
select ok(
  (select count(*) from public.v_open_reports) >= 2,
  'the moderator queue lists the open reports'
);

-- The column that turns a judgement call into an easy one. Anna filed four
-- spam reports about Clara above; that is four reports from ONE person, and
-- the view has to say so rather than presenting it as a pattern.
select is(
  (select subject_prior_reports::int from public.v_open_reports
    where subject_id = '33333333-3333-3333-3333-333333333333' limit 1),
  3,
  'the raw prior-report count is high'
);

select is(
  (select subject_prior_reporters::int from public.v_open_reports
    where subject_id = '33333333-3333-3333-3333-333333333333' limit 1),
  1,
  'but they came from ONE person — a single angry counterparty cannot manufacture a pattern'
);

select is(
  (select reports_received::int from public.v_user_summary
    where profile_id = '22222222-2222-2222-2222-222222222222'),
  2,
  'the member summary totals reports received'
);

-- ── suspension ─────────────────────────────────────────────────────────────
-- Setting status makes is_approved() false, which every member-content policy
-- already gates on. The milestone says to verify this rather than assume it.
set local role postgres;

insert into public.trips (id, profile_id, city_id, start_date, end_date, needs)
values ('aaaa0000-0000-0000-0000-000000000001',
        '11111111-1111-1111-1111-111111111111',
        (select id from public.cities where name = 'Munich' limit 1),
        '2027-03-03', '2027-03-10', array['couch']);

set local role authenticated;
set local request.jwt.claims to
  '{"sub":"22222222-2222-2222-2222-222222222222","role":"authenticated"}';

select is(
  (select count(*)::int from public.trips),
  1,
  'before suspension, an approved member sees other members'' trips'
);

set local role postgres;
update public.profiles set status = 'suspended'
  where id = '22222222-2222-2222-2222-222222222222';

set local role authenticated;
set local request.jwt.claims to
  '{"sub":"22222222-2222-2222-2222-222222222222","role":"authenticated"}';

select is(
  (select public.is_approved()),
  false,
  'suspension flips is_approved() immediately'
);

select is(
  (select count(*)::int from public.trips),
  0,
  'and revokes access to member content on the very next query'
);

select is(
  (select count(*)::int from public.profiles),
  1,
  'a suspended member can still see their own profile, and nobody else''s'
);

select is(
  (select count(*)::int from public.availability),
  0,
  'no availability'
);

-- And they vanish from everyone else's view too.
set local role postgres;
set local role authenticated;
set local request.jwt.claims to
  '{"sub":"11111111-1111-1111-1111-111111111111","role":"authenticated"}';

select is(
  (select count(*)::int from public.profiles
    where id = '22222222-2222-2222-2222-222222222222'),
  0,
  'a suspended member disappears from other members'' view'
);

-- enqueue_notification is revoked from authenticated, so this check has to run
-- as the role the triggers actually use.
set local role postgres;

select is(
  (select public.enqueue_notification(
     '22222222-2222-2222-2222-222222222222', 'offer_received')),
  null,
  'and stops receiving notifications entirely'
);

select * from finish();
rollback;
