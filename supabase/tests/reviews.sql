-- Double-blind reviews.
--
-- The test that matters most in this file is not "the subject cannot read the
-- review". It is "the subject cannot detect that a review EXISTS". A count, an
-- aggregate or a `select exists` leaks the fact just as effectively as the
-- body does, and a policy that hides rows from `select *` can still answer
-- `select count(*)` truthfully if it is written carelessly.

begin;

-- `supabase test db --linked` connects as cli_login_postgres, a NOINHERIT role
-- the CLI recreates on every run, so the privileges these fixtures need (writing
-- to auth.users) must be claimed explicitly. Locally this is a no-op.
set local role postgres;
select plan(38);

insert into auth.users (id, email, raw_user_meta_data) values
  ('11111111-1111-1111-1111-111111111111', 'anna@example.test',
   '{"display_name":"Anna Weber","discipline":"voice"}'::jsonb),
  ('22222222-2222-2222-2222-222222222222', 'bruno@example.test',
   '{"display_name":"Bruno Kraus","discipline":"strings"}'::jsonb),
  ('33333333-3333-3333-3333-333333333333', 'clara@example.test',
   '{"display_name":"Clara Ortiz","discipline":"dance"}'::jsonb);

update public.profiles set status = 'approved';

-- A stay that ended three days ago: Bruno hosted Anna in Munich.
insert into public.trips (id, profile_id, city_id, start_date, end_date, needs)
values ('aaaa0000-0000-0000-0000-000000000001',
        '11111111-1111-1111-1111-111111111111',
        (select id from public.cities where name = 'Munich' limit 1),
        current_date - 8, current_date - 3, array['couch']);

insert into public.availability (profile_id, city_id, start_date, end_date, offers)
values ('22222222-2222-2222-2222-222222222222',
        (select id from public.cities where name = 'Munich' limit 1),
        current_date - 10, current_date - 1, array['couch']);

insert into public.offers (id, trip_id, from_profile, to_profile, start_date, end_date)
values ('dddd0000-0000-0000-0000-000000000001',
        'aaaa0000-0000-0000-0000-000000000001',
        '22222222-2222-2222-2222-222222222222', '11111111-1111-1111-1111-111111111111',
        current_date - 8, current_date - 3);

insert into public.stays (id, offer_id, host_id, guest_id, city_id, start_date, end_date)
values ('5a750000-0000-0000-0000-000000000001',
        'dddd0000-0000-0000-0000-000000000001',
        '22222222-2222-2222-2222-222222222222', '11111111-1111-1111-1111-111111111111',
        (select id from public.cities where name = 'Munich' limit 1),
        current_date - 8, current_date - 3);

select is(
  (select review_closes_at from public.stays
    where id = '5a750000-0000-0000-0000-000000000001'),
  (current_date - 3 + 14),
  'the review window is set from app_config, not hard-coded'
);

-- ── who may write, and when ────────────────────────────────────────────────
set local role authenticated;
set local request.jwt.claims to
  '{"sub":"33333333-3333-3333-3333-333333333333","role":"authenticated"}';

select throws_ok(
  $$ insert into public.reviews (stay_id, author_id, subject_id, would_again)
     values ('5a750000-0000-0000-0000-000000000001',
             '33333333-3333-3333-3333-333333333333',
             '22222222-2222-2222-2222-222222222222', true) $$,
  '42501',
  null,
  'somebody who was not there cannot review the stay'
);

set local role postgres;
set local role authenticated;
set local request.jwt.claims to
  '{"sub":"11111111-1111-1111-1111-111111111111","role":"authenticated"}';

select throws_ok(
  $$ insert into public.reviews (stay_id, author_id, subject_id, would_again)
     values ('5a750000-0000-0000-0000-000000000001',
             '11111111-1111-1111-1111-111111111111',
             '33333333-3333-3333-3333-333333333333', true) $$,
  '42501',
  null,
  'a guest cannot review a third party off the back of their stay'
);

-- 42501, not the no_self_review CHECK: the insert policy requires the subject
-- to be the stay's OTHER party, so it rejects this before the constraint is
-- ever reached. The constraint stays as a backstop for privileged writes.
select throws_ok(
  $$ insert into public.reviews (stay_id, author_id, subject_id, would_again)
     values ('5a750000-0000-0000-0000-000000000001',
             '11111111-1111-1111-1111-111111111111',
             '11111111-1111-1111-1111-111111111111', true) $$,
  '42501',
  null,
  'nobody can review themselves'
);

select lives_ok(
  $$ insert into public.reviews (id, stay_id, author_id, subject_id, would_again, body)
     values ('7e710000-0000-0000-0000-000000000001',
             '5a750000-0000-0000-0000-000000000001',
             '11111111-1111-1111-1111-111111111111',
             '22222222-2222-2222-2222-222222222222',
             true, 'Generous host, quiet flat, good coffee.') $$,
  'the guest can review the host after the stay has ended'
);

select throws_ok(
  $$ insert into public.reviews (stay_id, author_id, subject_id, would_again)
     values ('5a750000-0000-0000-0000-000000000001',
             '11111111-1111-1111-1111-111111111111',
             '22222222-2222-2222-2222-222222222222', false) $$,
  '23505',
  null,
  'one review per author per stay'
);

-- ── THE DOUBLE-BLIND ───────────────────────────────────────────────────────
-- Bruno has been reviewed and has not written his own. He must not be able to
-- tell that anything has been written about him — by any means at all.
set local role postgres;
set local role authenticated;
set local request.jwt.claims to
  '{"sub":"22222222-2222-2222-2222-222222222222","role":"authenticated"}';

select is(
  (select count(*)::int from public.reviews),
  0,
  'the subject sees no rows'
);

select is(
  (select count(*)::int from public.reviews
    where subject_id = '22222222-2222-2222-2222-222222222222'),
  0,
  'NOR A COUNT — the aggregate must not leak what the row select hides'
);

select is(
  (select exists (select 1 from public.reviews
    where stay_id = '5a750000-0000-0000-0000-000000000001')),
  false,
  'nor an existence check'
);

select is(
  (select count(*)::int from public.reviews
    where would_again = true),
  0,
  'nor a filtered aggregate that guesses at the content'
);

select is(
  (select coalesce(max(submitted_at)::text, 'none') from public.reviews),
  'none',
  'nor a max() over a column that would reveal the timing'
);

select is(
  (select bool_or(would_again) from public.reviews),
  null,
  'nor a boolean aggregate over the verdict itself'
);

select is(
  (select total from public.review_summary('22222222-2222-2222-2222-222222222222')),
  0,
  'and the reputation summary shows nothing while the review is unpublished'
);

-- Third parties are equally in the dark.
set local role postgres;
set local role authenticated;
set local request.jwt.claims to
  '{"sub":"33333333-3333-3333-3333-333333333333","role":"authenticated"}';

select is(
  (select count(*)::int from public.reviews),
  0,
  'a third member sees no unpublished review either'
);

-- The author, however, can always see and edit their own.
set local role postgres;
set local role authenticated;
set local request.jwt.claims to
  '{"sub":"11111111-1111-1111-1111-111111111111","role":"authenticated"}';

select is(
  (select count(*)::int from public.reviews),
  1,
  'the author can see what they wrote'
);

select lives_ok(
  $$ update public.reviews set body = 'Generous host. Would stay again.'
     where id = '7e710000-0000-0000-0000-000000000001' $$,
  'and can edit it while it is unpublished'
);

select throws_ok(
  $$ update public.reviews set published_at = now()
     where id = '7e710000-0000-0000-0000-000000000001' $$,
  '42501',
  null,
  'but cannot publish it early to force the counterparty''s hand'
);

select throws_ok(
  $$ update public.reviews set subject_id = '33333333-3333-3333-3333-333333333333'
     where id = '7e710000-0000-0000-0000-000000000001' $$,
  '42501',
  null,
  'nor repoint it at somebody else'
);

-- ── both submitted publishes instantly ─────────────────────────────────────
set local role postgres;
set local role authenticated;
set local request.jwt.claims to
  '{"sub":"22222222-2222-2222-2222-222222222222","role":"authenticated"}';

select lives_ok(
  $$ insert into public.reviews (id, stay_id, author_id, subject_id, would_again, body)
     values ('7e710000-0000-0000-0000-000000000002',
             '5a750000-0000-0000-0000-000000000001',
             '22222222-2222-2222-2222-222222222222',
             '11111111-1111-1111-1111-111111111111',
             true, 'Considerate guest, left the place spotless.') $$,
  'the host writes theirs too'
);

set local role postgres;

select is(
  (select count(*)::int from public.reviews where published_at is not null),
  2,
  'both reviews publish the instant the second one lands'
);

select is(
  (select count(*)::int from public.notifications where type = 'review_published'),
  2,
  'and both parties are told'
);

set local role authenticated;
set local request.jwt.claims to
  '{"sub":"22222222-2222-2222-2222-222222222222","role":"authenticated"}';

select is(
  (select body from public.reviews
    where id = '7e710000-0000-0000-0000-000000000001'),
  'Generous host. Would stay again.',
  'the subject can now read the review about them'
);

-- Note the shape of this test. The update policy's USING clause excludes
-- published rows, and a row excluded by USING is simply not matched — the
-- statement succeeds and changes nothing rather than raising. Asserting on the
-- exception would have passed for the wrong reason, or failed for the right
-- one; asserting on the stored value is what actually proves immutability.
select lives_ok(
  $$ update public.reviews set body = 'Actually, terrible.'
     where id = '7e710000-0000-0000-0000-000000000002' $$,
  'editing a published review raises nothing — the row is simply not matched'
);

select is(
  (select body from public.reviews
    where id = '7e710000-0000-0000-0000-000000000002'),
  'Considerate guest, left the place spotless.',
  'and the published review is UNCHANGED — it cannot be rewritten after the fact'
);

select is(
  (select total from public.review_summary('22222222-2222-2222-2222-222222222222')),
  1,
  'the reputation summary now counts it'
);

select is(
  (select would_again from public.review_summary('22222222-2222-2222-2222-222222222222')),
  1,
  'and carries the would-again tally'
);

-- ── the deadline publishes a lone review ───────────────────────────────────
-- Without this, never writing a review would be a way to bury criticism.
set local role postgres;

insert into public.trips (id, profile_id, city_id, start_date, end_date, needs)
values ('aaaa0000-0000-0000-0000-000000000002',
        '33333333-3333-3333-3333-333333333333',
        (select id from public.cities where name = 'Munich' limit 1),
        current_date - 40, current_date - 35, array['couch']);

insert into public.availability (profile_id, city_id, start_date, end_date, offers)
values ('22222222-2222-2222-2222-222222222222',
        (select id from public.cities where name = 'Munich' limit 1),
        current_date - 45, current_date - 30, array['couch']);

insert into public.offers (id, trip_id, from_profile, to_profile, start_date, end_date)
values ('dddd0000-0000-0000-0000-000000000002',
        'aaaa0000-0000-0000-0000-000000000002',
        '22222222-2222-2222-2222-222222222222', '33333333-3333-3333-3333-333333333333',
        current_date - 40, current_date - 35);

insert into public.stays (id, offer_id, host_id, guest_id, city_id, start_date, end_date)
values ('5a750000-0000-0000-0000-000000000002',
        'dddd0000-0000-0000-0000-000000000002',
        '22222222-2222-2222-2222-222222222222', '33333333-3333-3333-3333-333333333333',
        (select id from public.cities where name = 'Munich' limit 1),
        current_date - 40, current_date - 35);

-- Written inside the window, which has since closed.
insert into public.reviews (id, stay_id, author_id, subject_id, would_again, body, submitted_at)
values ('7e710000-0000-0000-0000-000000000003',
        '5a750000-0000-0000-0000-000000000002',
        '33333333-3333-3333-3333-333333333333',
        '22222222-2222-2222-2222-222222222222',
        false, 'Cancelled on me the night before.', now() - interval '30 days');

select is(
  (select published_at from public.reviews
    where id = '7e710000-0000-0000-0000-000000000003'),
  null,
  'a lone review stays unpublished while it waits for its counterpart'
);

select is(
  (select public.release_reviews()),
  1,
  'the release job publishes it once the window has closed'
);

select is(
  (select published_at is not null from public.reviews
    where id = '7e710000-0000-0000-0000-000000000003'),
  true,
  'so silence cannot be used to bury criticism'
);

select is(
  (select public.release_reviews()),
  0,
  'and a second run republishes nothing — the job is idempotent'
);

select is(
  (select count(*)::int from public.notifications where type = 'review_published'),
  3,
  'the idempotent rerun did not duplicate the notification either'
);

-- ── the window is closed for new reviews ───────────────────────────────────
set local role authenticated;
set local request.jwt.claims to
  '{"sub":"22222222-2222-2222-2222-222222222222","role":"authenticated"}';

select throws_ok(
  $$ insert into public.reviews (stay_id, author_id, subject_id, would_again)
     values ('5a750000-0000-0000-0000-000000000002',
             '22222222-2222-2222-2222-222222222222',
             '33333333-3333-3333-3333-333333333333', true) $$,
  '42501',
  null,
  'once the window has closed nobody can add a late review'
);

-- ── a stay that has not ended yet ──────────────────────────────────────────
set local role postgres;
insert into public.trips (id, profile_id, city_id, start_date, end_date, needs)
values ('aaaa0000-0000-0000-0000-000000000003',
        '11111111-1111-1111-1111-111111111111',
        (select id from public.cities where name = 'Munich' limit 1),
        current_date + 10, current_date + 15, array['couch']);

insert into public.availability (profile_id, city_id, start_date, end_date, offers)
values ('22222222-2222-2222-2222-222222222222',
        (select id from public.cities where name = 'Munich' limit 1),
        current_date + 5, current_date + 20, array['couch']);

insert into public.offers (id, trip_id, from_profile, to_profile, start_date, end_date)
values ('dddd0000-0000-0000-0000-000000000003',
        'aaaa0000-0000-0000-0000-000000000003',
        '22222222-2222-2222-2222-222222222222', '11111111-1111-1111-1111-111111111111',
        current_date + 10, current_date + 15);

insert into public.stays (id, offer_id, host_id, guest_id, city_id, start_date, end_date)
values ('5a750000-0000-0000-0000-000000000003',
        'dddd0000-0000-0000-0000-000000000003',
        '22222222-2222-2222-2222-222222222222', '11111111-1111-1111-1111-111111111111',
        (select id from public.cities where name = 'Munich' limit 1),
        current_date + 10, current_date + 15);

set local role authenticated;
set local request.jwt.claims to
  '{"sub":"11111111-1111-1111-1111-111111111111","role":"authenticated"}';

select throws_ok(
  $$ insert into public.reviews (stay_id, author_id, subject_id, would_again)
     values ('5a750000-0000-0000-0000-000000000003',
             '11111111-1111-1111-1111-111111111111',
             '22222222-2222-2222-2222-222222222222', true) $$,
  '42501',
  null,
  'a stay that has not happened yet cannot be reviewed'
);

-- ── prompts ────────────────────────────────────────────────────────────────
set local role postgres;

select is(
  (select prompted_at from public.stays
    where id = '5a750000-0000-0000-0000-000000000003'),
  null,
  'a future stay has not been prompted'
);

select ok(
  (select public.prompt_reviews()) >= 1,
  'the prompt job picks up stays whose last night has passed'
);

select is(
  (select count(*)::int from public.notifications where type = 'review_prompt'),
  2,
  'and prompts both parties of the eligible stay, once each'
);

select is(
  (select public.prompt_reviews()),
  0,
  'a second run prompts nobody again — prompted_at is claimed in the same statement'
);

select is(
  (select prompted_at is null from public.stays
    where id = '5a750000-0000-0000-0000-000000000003'),
  true,
  'and the future stay is still untouched'
);

select * from finish();
rollback;
