-- The phone number format constraint.
--
-- Whoever calls has no idea what country a number was written in, so a number
-- stored without its country code dials somebody else entirely. The constraint is what stops a national number reaching the
-- column from any writer — the client, an Edge Function, or a hand-run UPDATE
-- in the dashboard.
--
-- The rule here duplicates PhoneNumberSchema in
-- packages/shared/src/domain/phone.ts. These cases mirror phone.test.ts on
-- purpose: if the two ever disagree, one of these suites fails.

begin;

-- `supabase test db --linked` connects as cli_login_postgres, a NOINHERIT role
-- the CLI recreates on every run, so the privileges these fixtures need (writing
-- to auth.users) must be claimed explicitly. Locally this is a no-op.
set local role postgres;
select plan(12);

-- ── fixtures ───────────────────────────────────────────────────────────────
insert into auth.users (id, email, raw_user_meta_data) values
  ('11111111-1111-1111-1111-111111111111', 'anna@example.test',
   '{"display_name":"Anna Weber","discipline":"voice"}'::jsonb);

-- ── the row starts with an email and no number ─────────────────────────────
-- Sign-up cannot know a phone number, which is why the column is nullable and
-- the requirement lives in the app's completeness gate instead.
select is(
  (select email from public.contact_details
    where profile_id = '11111111-1111-1111-1111-111111111111'),
  'anna@example.test',
  'sign-up fills the email from auth'
);

select is(
  (select phone from public.contact_details
    where profile_id = '11111111-1111-1111-1111-111111111111'),
  null,
  'and leaves phone null — a NOT NULL column would block account creation'
);

-- ── accepted forms ─────────────────────────────────────────────────────────
select lives_ok(
  $$ update public.contact_details set phone = '+491701234567'
     where profile_id = '11111111-1111-1111-1111-111111111111' $$,
  'an E.164 number is accepted'
);

select lives_ok(
  $$ update public.contact_details set phone = null
     where profile_id = '11111111-1111-1111-1111-111111111111' $$,
  'and null still is, so a member can clear it'
);

-- ── rejected forms ─────────────────────────────────────────────────────────
select throws_ok(
  $$ update public.contact_details set phone = '0170 1234567'
     where profile_id = '11111111-1111-1111-1111-111111111111' $$,
  '23514',
  null,
  'a national number with no country code is rejected — this is the whole point'
);

select throws_ok(
  $$ update public.contact_details set phone = '+49 170 1234567'
     where profile_id = '11111111-1111-1111-1111-111111111111' $$,
  '23514',
  null,
  'so is a spaced number: the client normalises before writing'
);

select throws_ok(
  $$ update public.contact_details set phone = '+0491701234567'
     where profile_id = '11111111-1111-1111-1111-111111111111' $$,
  '23514',
  null,
  'no country code starts with zero'
);

select throws_ok(
  $$ update public.contact_details set phone = '+49'
     where profile_id = '11111111-1111-1111-1111-111111111111' $$,
  '23514',
  null,
  'a country code alone is not a number'
);

select throws_ok(
  $$ update public.contact_details set phone = '+1234567890123456'
     where profile_id = '11111111-1111-1111-1111-111111111111' $$,
  '23514',
  null,
  'and E.164 allows at most 15 digits'
);

-- ── WhatsApp is gone ───────────────────────────────────────────────────────
select hasnt_column('public', 'contact_details', 'whatsapp',
  'there is no WhatsApp column any more');

select lives_ok(
  $$ update public.contact_details set preferred_channel = 'phone'
     where profile_id = '11111111-1111-1111-1111-111111111111' $$,
  'phone is a preferred channel'
);

select throws_ok(
  $$ update public.contact_details set preferred_channel = 'whatsapp'
     where profile_id = '11111111-1111-1111-1111-111111111111' $$,
  '23514',
  null,
  'and whatsapp no longer is'
);

select * from finish();
rollback;
