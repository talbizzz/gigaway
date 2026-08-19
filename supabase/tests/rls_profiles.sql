-- RLS: profiles visibility and the privileged-column guard.
--
-- These tests encode the product's central trust rule: an unverified applicant
-- can see nothing, and nobody can promote themselves past the verification wall.

begin;

-- `supabase test db --linked` connects as cli_login_postgres, a NOINHERIT role
-- the CLI recreates on every run, so the privileges these fixtures need (writing
-- to auth.users) must be claimed explicitly. Locally this is a no-op.
set local role postgres;
select plan(14);

-- ── fixtures ───────────────────────────────────────────────────────────────
-- Four members covering every status that affects visibility.
insert into auth.users (id, email, raw_user_meta_data) values
  ('11111111-1111-1111-1111-111111111111', 'anna@example.test',
   '{"display_name":"Anna Weber","discipline":"voice"}'::jsonb),
  ('22222222-2222-2222-2222-222222222222', 'bruno@example.test',
   '{"display_name":"Bruno Kraus","discipline":"strings"}'::jsonb),
  ('33333333-3333-3333-3333-333333333333', 'clara@example.test',
   '{"display_name":"Clara Ortiz","discipline":"dance"}'::jsonb),
  ('44444444-4444-4444-4444-444444444444', 'dieter@example.test',
   '{"display_name":"Dieter Hahn","discipline":"brass"}'::jsonb);

-- The auth trigger created all four as 'pending'. Promote three of them.
update public.profiles set status = 'approved'
  where id in ('11111111-1111-1111-1111-111111111111',
               '22222222-2222-2222-2222-222222222222');
update public.profiles set status = 'suspended'
  where id = '44444444-4444-4444-4444-444444444444';
-- Clara (3333) stays pending.

-- Counts are scoped to the fixture ids throughout (inline, because a temporary
-- view would not be readable once the role switches to `authenticated`), so the
-- suite passes against a development database that already holds data.

-- ── the auth trigger ───────────────────────────────────────────────────────
select is(
  (select count(*)::int from public.profiles
    where id = any(array[
      '11111111-1111-1111-1111-111111111111',
      '22222222-2222-2222-2222-222222222222',
      '33333333-3333-3333-3333-333333333333',
      '44444444-4444-4444-4444-444444444444'
    ]::uuid[])),
  4,
  'auth.users insert creates a profile row for every new user'
);

select is(
  (select display_name from public.profiles
    where id = '11111111-1111-1111-1111-111111111111'),
  'Anna Weber',
  'display_name is carried through from sign-up metadata'
);

select is(
  (select discipline from public.profiles
    where id = '22222222-2222-2222-2222-222222222222'),
  'strings',
  'discipline is carried through from sign-up metadata'
);

select is(
  (select count(*)::int from public.contact_details
    where profile_id = any(array[
      '11111111-1111-1111-1111-111111111111',
      '22222222-2222-2222-2222-222222222222',
      '33333333-3333-3333-3333-333333333333',
      '44444444-4444-4444-4444-444444444444'
    ]::uuid[])),
  4,
  'a contact_details row is created alongside each profile'
);

-- ── a PENDING applicant sees no member content ─────────────────────────────
set local role authenticated;
set local request.jwt.claims to
  '{"sub":"33333333-3333-3333-3333-333333333333","role":"authenticated"}';

select is(
  (select count(*)::int from public.profiles),
  1,
  'a pending applicant sees exactly one profile — their own'
);

select is(
  (select id from public.profiles),
  '33333333-3333-3333-3333-333333333333'::uuid,
  'the one profile a pending applicant sees is their own'
);

select is(
  (select public.is_approved()),
  false,
  'is_approved() is false for a pending applicant'
);

-- ── an APPROVED member sees other approved members only ────────────────────
set local role postgres;
set local role authenticated;
set local request.jwt.claims to
  '{"sub":"11111111-1111-1111-1111-111111111111","role":"authenticated"}';

select is(
  (select count(*)::int from public.profiles
    where id = any(array[
      '11111111-1111-1111-1111-111111111111',
      '22222222-2222-2222-2222-222222222222',
      '33333333-3333-3333-3333-333333333333',
      '44444444-4444-4444-4444-444444444444'
    ]::uuid[])),
  2,
  'an approved member sees their own profile and other approved profiles only'
);

select is(
  (select count(*)::int from public.profiles
    where id = '33333333-3333-3333-3333-333333333333'),
  0,
  'a pending profile is invisible to approved members'
);

select is(
  (select count(*)::int from public.profiles
    where id = '44444444-4444-4444-4444-444444444444'),
  0,
  'a suspended profile is invisible to approved members'
);

select lives_ok(
  $$ update public.profiles set bio = 'Mezzo-soprano based in Berlin.'
       where id = '11111111-1111-1111-1111-111111111111' $$,
  'a member can still edit their own ordinary profile fields'
);

-- ── the privileged-column guard ────────────────────────────────────────────
-- Run as the pending applicant, because that is the actual attack: someone
-- waiting on document review trying to approve themselves.
set local role postgres;
set local role authenticated;
set local request.jwt.claims to
  '{"sub":"33333333-3333-3333-3333-333333333333","role":"authenticated"}';

select throws_ok(
  $$ update public.profiles set status = 'approved'
       where id = '33333333-3333-3333-3333-333333333333' $$,
  '42501',
  'profiles.status is not client-updatable',
  'a pending applicant cannot approve themselves past the verification wall'
);

select throws_ok(
  $$ update public.profiles set invite_quota = 999
       where id = '33333333-3333-3333-3333-333333333333' $$,
  '42501',
  'profiles.invite_quota is not client-updatable',
  'a member cannot grant themselves extra invites'
);

-- ── a SUSPENDED member loses access immediately ────────────────────────────
set local role postgres;
set local role authenticated;
set local request.jwt.claims to
  '{"sub":"44444444-4444-4444-4444-444444444444","role":"authenticated"}';

select is(
  (select count(*)::int from public.profiles),
  1,
  'a suspended member sees only their own profile, with no further action needed'
);

select * from finish();
rollback;
