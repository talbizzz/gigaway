-- The WhatsApp number format constraint.
--
-- wa.me takes digits only and has no idea what country the reader is in, so a
-- number stored without its country code produces a link that dials somebody
-- else entirely. The constraint is what stops a national number reaching the
-- column from any writer — the client, an Edge Function, or a hand-run UPDATE
-- in the dashboard.
--
-- The rule here duplicates WhatsAppNumberSchema in
-- packages/shared/src/domain/phone.ts. These cases mirror phone.test.ts on
-- purpose: if the two ever disagree, one of these suites fails.

begin;

-- `supabase test db --linked` connects as cli_login_postgres, a NOINHERIT role
-- the CLI recreates on every run, so the privileges these fixtures need (writing
-- to auth.users) must be claimed explicitly. Locally this is a no-op.
set local role postgres;
select plan(9);

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
  (select whatsapp from public.contact_details
    where profile_id = '11111111-1111-1111-1111-111111111111'),
  null,
  'and leaves whatsapp null — a NOT NULL column would block account creation'
);

-- ── accepted forms ─────────────────────────────────────────────────────────
select lives_ok(
  $$ update public.contact_details set whatsapp = '+491701234567'
     where profile_id = '11111111-1111-1111-1111-111111111111' $$,
  'an E.164 number is accepted'
);

select lives_ok(
  $$ update public.contact_details set whatsapp = null
     where profile_id = '11111111-1111-1111-1111-111111111111' $$,
  'and null still is, so a member can clear it'
);

-- ── rejected forms ─────────────────────────────────────────────────────────
select throws_ok(
  $$ update public.contact_details set whatsapp = '0170 1234567'
     where profile_id = '11111111-1111-1111-1111-111111111111' $$,
  '23514',
  null,
  'a national number with no country code is rejected — this is the whole point'
);

select throws_ok(
  $$ update public.contact_details set whatsapp = '+49 170 1234567'
     where profile_id = '11111111-1111-1111-1111-111111111111' $$,
  '23514',
  null,
  'so is a spaced number: the client normalises before writing'
);

select throws_ok(
  $$ update public.contact_details set whatsapp = '+0491701234567'
     where profile_id = '11111111-1111-1111-1111-111111111111' $$,
  '23514',
  null,
  'no country code starts with zero'
);

select throws_ok(
  $$ update public.contact_details set whatsapp = '+49'
     where profile_id = '11111111-1111-1111-1111-111111111111' $$,
  '23514',
  null,
  'a country code alone is not a number'
);

select throws_ok(
  $$ update public.contact_details set whatsapp = '+1234567890123456'
     where profile_id = '11111111-1111-1111-1111-111111111111' $$,
  '23514',
  null,
  'and E.164 allows at most 15 digits'
);

select * from finish();
rollback;
