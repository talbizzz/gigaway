-- The notification outbox: visibility, and the delivery guarantee.
--
-- NFR 7 makes a missed acceptance notification a serious failure, so the
-- interesting tests here are the recovery ones — a dispatcher killed mid-run
-- must leave its rows unsent and the next sweep must pick them up, and a dead
-- device must not silence a member's other phones.

begin;

-- `supabase test db --linked` connects as cli_login_postgres, a NOINHERIT role
-- the CLI recreates on every run, so the privileges these fixtures need (writing
-- to auth.users) must be claimed explicitly. Locally this is a no-op.
set local role postgres;
select plan(28);

insert into auth.users (id, email, raw_user_meta_data) values
  ('11111111-1111-1111-1111-111111111111', 'anna@example.test',
   '{"display_name":"Anna Weber","discipline":"voice"}'::jsonb),
  ('22222222-2222-2222-2222-222222222222', 'bruno@example.test',
   '{"display_name":"Bruno Kraus","discipline":"strings"}'::jsonb),
  ('33333333-3333-3333-3333-333333333333', 'clara@example.test',
   '{"display_name":"Clara Ortiz","discipline":"dance"}'::jsonb);

update public.profiles set status = 'approved'
  where id <> '33333333-3333-3333-3333-333333333333';
-- Clara stays pending.

-- ── enqueue ────────────────────────────────────────────────────────────────
select isnt(
  (select public.enqueue_notification(
     '11111111-1111-1111-1111-111111111111', 'offer_received',
     '{"cityName":"Munich"}'::jsonb)),
  null,
  'an approved member can be enqueued a notification'
);

select is(
  (select public.enqueue_notification(
     '33333333-3333-3333-3333-333333333333', 'offer_received')),
  null,
  'a profile that is not approved is never notified'
);

select throws_ok(
  $$ insert into public.notifications (profile_id, type)
     values ('11111111-1111-1111-1111-111111111111', 'something_invented') $$,
  '23514',
  null,
  'an unknown notification type is rejected rather than stored'
);

-- ── visibility ─────────────────────────────────────────────────────────────
set local role authenticated;
set local request.jwt.claims to
  '{"sub":"22222222-2222-2222-2222-222222222222","role":"authenticated"}';

select is(
  (select count(*)::int from public.notifications),
  0,
  'a member sees none of another member''s notifications'
);

set local role postgres;
set local role authenticated;
set local request.jwt.claims to
  '{"sub":"11111111-1111-1111-1111-111111111111","role":"authenticated"}';

select is(
  (select count(*)::int from public.notifications),
  1,
  'a member sees their own'
);

select throws_ok(
  $$ insert into public.notifications (profile_id, type)
     values ('11111111-1111-1111-1111-111111111111', 'offer_received') $$,
  '42501',
  null,
  'a client cannot write to the outbox — nothing is ever pushed from the app'
);

select lives_ok(
  $$ update public.notifications set read_at = now() $$,
  'a member can mark their own notification read'
);

-- The attack this guards against: marking your own notification sent, so the
-- dispatcher stops retrying it. The values must actually differ from the row's
-- current ones, or there is no change for the guard to catch.
select throws_ok(
  $$ update public.notifications set sent_at = now(), attempts = 5 $$,
  '42501',
  null,
  'a member cannot rewrite delivery state to silence or replay a notification'
);

-- ── push tokens ────────────────────────────────────────────────────────────
select lives_ok(
  $$ insert into public.push_tokens (profile_id, token, platform)
     values ('11111111-1111-1111-1111-111111111111',
             'ExponentPushToken[anna-phone]', 'ios') $$,
  'a member can register their own device'
);

select throws_ok(
  $$ insert into public.push_tokens (profile_id, token, platform)
     values ('22222222-2222-2222-2222-222222222222',
             'ExponentPushToken[not-mine]', 'ios') $$,
  '42501',
  null,
  'a member cannot register a device against somebody else''s profile'
);

select throws_ok(
  $$ insert into public.push_tokens (profile_id, token, platform)
     values ('11111111-1111-1111-1111-111111111111',
             'ExponentPushToken[anna-tablet]', 'blackberry') $$,
  '23514',
  null,
  'an unknown platform is rejected'
);

set local role postgres;
insert into public.push_tokens (profile_id, token, platform) values
  ('11111111-1111-1111-1111-111111111111', 'ExponentPushToken[anna-tablet]', 'ios');

select is(
  (select count(*)::int from public.push_tokens
    where profile_id = '11111111-1111-1111-1111-111111111111'
      and invalidated_at is null),
  2,
  'one profile may hold several live tokens — phone and tablet both get the push'
);

-- ── claiming, and what happens when the dispatcher dies ────────────────────
select is(
  (select count(*)::int from public.claim_notifications(10)),
  1,
  'the due row is claimed'
);

select is(
  (select attempts from public.notifications limit 1),
  1,
  'the attempt is counted BEFORE the send, so a crash cannot lose the row'
);

select is(
  (select sent_at is null from public.notifications limit 1),
  true,
  'a dispatcher killed mid-run leaves the row unsent'
);

select ok(
  (select next_attempt_at > now() from public.notifications limit 1),
  'the claimed row is deferred, so an overlapping sweep does not double-send it'
);

select is(
  (select count(*)::int from public.claim_notifications(10)),
  0,
  'a second sweep during the backoff claims nothing'
);

-- Wind the backoff back: this is the next sweep, a minute later.
update public.notifications set next_attempt_at = now() - interval '1 second';

select is(
  (select count(*)::int from public.claim_notifications(10)),
  1,
  'once the backoff elapses the sweep RECOVERS the row the dead run dropped'
);

-- ── recording results ──────────────────────────────────────────────────────
select is(
  (select public.record_notification_results(
     jsonb_build_array(jsonb_build_object(
       'id', (select id from public.notifications limit 1),
       'receiptId', 'receipt-abc')))),
  1,
  'a successful send is recorded'
);

select is(
  (select (sent_at is not null and expo_receipt_id = 'receipt-abc')
     from public.notifications limit 1),
  true,
  'the row is marked sent and carries its receipt id'
);

-- Exhausted rows stop being pushed but stay in the Activity list.
set local role postgres;
insert into public.notifications (profile_id, type, attempts)
values ('11111111-1111-1111-1111-111111111111', 'offer_received', 8);

select is(
  (select count(*)::int from public.claim_notifications(10)),
  0,
  'a row that has exhausted its attempts is no longer claimed'
);

-- ── receipts and dead devices ──────────────────────────────────────────────
update public.notifications
  set sent_at = now() - interval '2 minutes', receipt_checked_at = null
  where expo_receipt_id = 'receipt-abc';

select is(
  (select count(*)::int from public.claim_notification_receipts(10)),
  1,
  'a sent notification has its receipt claimed for checking'
);

select is(
  (select public.record_notification_receipts(
     jsonb_build_array(jsonb_build_object(
       'id', (select id from public.notifications where expo_receipt_id = 'receipt-abc'),
       'ok', false,
       'error', 'DeviceNotRegistered',
       'token', 'ExponentPushToken[anna-phone]')))),
  1,
  'a DeviceNotRegistered receipt is recorded'
);

select is(
  (select invalidated_at is not null from public.push_tokens
    where token = 'ExponentPushToken[anna-phone]'),
  true,
  'the dead device''s token is invalidated'
);

select is(
  (select invalidated_at is null from public.push_tokens
    where token = 'ExponentPushToken[anna-tablet]'),
  true,
  'the member''s OTHER device is untouched — one dead phone does not silence them'
);

-- ── email fallback ─────────────────────────────────────────────────────────
-- Only offer_accepted escalates, and only once the push has had its fifteen
-- minutes to arrive.
set local role postgres;
insert into public.notifications (id, profile_id, type, created_at)
values
  ('eeee0000-0000-0000-0000-000000000001',
   '11111111-1111-1111-1111-111111111111', 'offer_accepted',
   now() - interval '20 minutes'),
  ('eeee0000-0000-0000-0000-000000000002',
   '11111111-1111-1111-1111-111111111111', 'offer_accepted', now()),
  ('eeee0000-0000-0000-0000-000000000003',
   '11111111-1111-1111-1111-111111111111', 'offer_received',
   now() - interval '20 minutes');

select is(
  (select array_agg(id order by id) from public.claim_notification_emails(10)),
  array['eeee0000-0000-0000-0000-000000000001'::uuid],
  'only an unconfirmed offer_accepted older than fifteen minutes gets an email'
);

select is(
  (select count(*)::int from public.claim_notification_emails(10)),
  0,
  'claiming stamps the row, so a Resend outage costs one email and not a flood'
);

-- A push whose receipt came back OK needs no email at all.
set local role postgres;
insert into public.notifications (profile_id, type, created_at, receipt_ok)
values ('22222222-2222-2222-2222-222222222222', 'offer_accepted',
        now() - interval '20 minutes', true);

select is(
  (select count(*)::int from public.claim_notification_emails(10)),
  0,
  'a push confirmed delivered by its receipt does not also send an email'
);

select * from finish();
rollback;
