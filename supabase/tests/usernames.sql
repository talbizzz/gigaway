-- Usernames: unique, lower case, validated, changeable once every 30 days.

begin;

-- See rls_profiles.sql: the CLI's login role needs this to write auth.users.
set local role postgres;
select plan(20);

-- ── sign-up ────────────────────────────────────────────────────────────────
insert into auth.users (id, email, raw_user_meta_data) values
  ('11111111-1111-1111-1111-111111111111', 'anna@example.test',
   '{"first_name":"Anna","last_name":"Weber","username":"Anna_W"}'::jsonb),
  -- No username at all: an older build.
  ('22222222-2222-2222-2222-222222222222', 'bruno@example.test',
   '{"first_name":"Bruno","last_name":"Kraus"}'::jsonb),
  -- Wants the name Anna already has.
  ('33333333-3333-3333-3333-333333333333', 'clara@example.test',
   '{"first_name":"Clara","last_name":"Ortiz","username":"anna_w"}'::jsonb),
  -- Not a valid username.
  ('44444444-4444-4444-4444-444444444444', 'dieter@example.test',
   '{"first_name":"Dieter","last_name":"Hahn","username":"no"}'::jsonb);

update public.profiles set status = 'approved';

select is(
  (select username from public.profiles where id = '11111111-1111-1111-1111-111111111111'),
  'anna_w',
  'the username chosen at sign-up is kept, in lower case'
);

select matches(
  (select username from public.profiles where id = '22222222-2222-2222-2222-222222222222'),
  '^bruno_[0-9]{4}$',
  'with none given, one is made from the first name'
);

select matches(
  (select username from public.profiles where id = '33333333-3333-3333-3333-333333333333'),
  '^clara_[0-9]{4}$',
  'a taken username falls back to a generated one rather than failing sign-up'
);

select matches(
  (select username from public.profiles where id = '44444444-4444-4444-4444-444444444444'),
  '^dieter_[0-9]{4}$',
  'and so does an invalid one'
);

select is(
  (select count(distinct username)::int from public.profiles
    where id in ('11111111-1111-1111-1111-111111111111', '22222222-2222-2222-2222-222222222222',
                 '33333333-3333-3333-3333-333333333333', '44444444-4444-4444-4444-444444444444')),
  4,
  'every one of the four is different'
);

-- ── asking whether one is free ─────────────────────────────────────────────
select is(public.check_username('fresh_name'), 'ok', 'an unused valid name is ok');
select is(public.check_username('ANNA_W'), 'taken', 'a used one is taken, whatever its case');
select is(public.check_username('@anna_w'), 'taken', 'including with an @ in front');
select is(public.check_username('ab'), 'invalid', 'a too-short one is invalid');
select is(public.check_username('admin'), 'invalid', 'and a reserved one');

set local role anon;
select is(public.check_username('fresh_name'), 'ok',
  'it can be asked before signing in, which is when sign-up needs it');
set local role postgres;

-- ── the rules in the database ──────────────────────────────────────────────
select throws_ok(
  $$ update public.profiles set username = 'bad name'
      where id = '11111111-1111-1111-1111-111111111111' $$,
  '23514', null, 'a username with a space is refused');

select throws_ok(
  $$ update public.profiles set username = (select username from public.profiles
                                            where id = '22222222-2222-2222-2222-222222222222')
      where id = '11111111-1111-1111-1111-111111111111' $$,
  '23505', null, 'and so is one somebody else has');

-- ── changing it, as the member ─────────────────────────────────────────────
set local role authenticated;
set local request.jwt.claims to
  '{"sub":"22222222-2222-2222-2222-222222222222","role":"authenticated"}';

update public.profiles set username = 'Bruno.K' where id = '22222222-2222-2222-2222-222222222222';

select is(
  (select username from public.profiles where id = '22222222-2222-2222-2222-222222222222'),
  'bruno.k',
  'a member can change their own, and it is stored in lower case'
);

select throws_ok(
  $$ update public.profiles set username = 'bruno_again'
      where id = '22222222-2222-2222-2222-222222222222' $$,
  '42501', 'A username can be changed once every 30 days.',
  'but not again within 30 days'
);

select throws_ok(
  $$ update public.profiles set username_changed_at = now() - interval '60 days'
      where id = '22222222-2222-2222-2222-222222222222' $$,
  '42501', null, 'and the time of the change cannot be rewound by the member'
);

set local role postgres;
update public.profiles set username_changed_at = now() - interval '31 days'
  where id = '22222222-2222-2222-2222-222222222222';
set local role authenticated;
set local request.jwt.claims to
  '{"sub":"22222222-2222-2222-2222-222222222222","role":"authenticated"}';

select lives_ok(
  $$ update public.profiles set username = 'bruno_again'
      where id = '22222222-2222-2222-2222-222222222222' $$,
  'after 30 days it can be changed again');

-- The first change after an automatic name is free.
set local request.jwt.claims to
  '{"sub":"33333333-3333-3333-3333-333333333333","role":"authenticated"}';
select lives_ok(
  $$ update public.profiles set username = 'clara.o'
      where id = '33333333-3333-3333-3333-333333333333' $$,
  'replacing an automatically assigned name is free');

-- ── leaving ────────────────────────────────────────────────────────────────
set local role postgres;
update public.profiles set status = 'deleted' where id = '11111111-1111-1111-1111-111111111111';

select is(
  (select username from public.profiles where id = '11111111-1111-1111-1111-111111111111'),
  null,
  'a deleted member gives up their username');

select is(public.check_username('anna_w'), 'ok', 'which anyone can then take');

select * from finish();
rollback;
