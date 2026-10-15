-- First and family name.
--
-- Other members see "Aziz T." (profiles.display_name). first_name and last_name
-- are columns on profiles, and display_name is derived from them by a trigger
-- so the two cannot drift apart.

begin;

-- See rls_profiles.sql: the CLI's login role needs this to write auth.users.
set local role postgres;
select plan(17);

-- ── fixtures ───────────────────────────────────────────────────────────────
-- Anna signs up with the new metadata, Bruno with the legacy single field an
-- older app build still sends, Clara with a lowercase family name.
insert into auth.users (id, email, raw_user_meta_data) values
  ('11111111-1111-1111-1111-111111111111', 'anna@example.test',
   '{"first_name":"Anna","last_name":"Weber","discipline":"voice"}'::jsonb),
  ('22222222-2222-2222-2222-222222222222', 'bruno@example.test',
   '{"display_name":"Bruno Kraus","discipline":"strings"}'::jsonb),
  ('33333333-3333-3333-3333-333333333333', 'clara@example.test',
   '{"first_name":"Clara","last_name":"ortiz","discipline":"dance"}'::jsonb),
  ('a0000000-0000-0000-0000-000000000001', 'admin@example.test',
   '{"first_name":"Admin","last_name":"One"}'::jsonb);

insert into public.admin_users (id, display_name)
values ('a0000000-0000-0000-0000-000000000001', 'Admin One');

update public.profiles set status = 'approved'
  where id in ('11111111-1111-1111-1111-111111111111',
               '22222222-2222-2222-2222-222222222222',
               '33333333-3333-3333-3333-333333333333');

-- ── the formatter ──────────────────────────────────────────────────────────
select is(public.format_public_name('Aziz', 'Talbi'), 'Aziz T.',
  'first name plus the initial of the family name');
select is(public.format_public_name('Aziz', 'talbi'), 'Aziz T.',
  'the initial is upper-cased');
select is(public.format_public_name('Cher', null), 'Cher',
  'no family name (a member from before the split) leaves just the first name');
select is(public.format_public_name('Aziz', '  '), 'Aziz',
  'a blank family name counts as none');

-- ── sign-up ────────────────────────────────────────────────────────────────
select results_eq(
  $$ select display_name, first_name, last_name from public.profiles
      where id = '11111111-1111-1111-1111-111111111111' $$,
  $$ values ('Anna W.'::text, 'Anna'::text, 'Weber'::text) $$,
  'sign-up stores both names and a short public one'
);

select results_eq(
  $$ select display_name, first_name, last_name from public.profiles
      where id = '22222222-2222-2222-2222-222222222222' $$,
  $$ values ('Bruno K.'::text, 'Bruno'::text, 'Kraus'::text) $$,
  'an older build sending only display_name is split on its first space'
);

select is(
  (select display_name from public.profiles
    where id = '33333333-3333-3333-3333-333333333333'),
  'Clara O.',
  'a lowercase family name still yields a capital initial'
);

-- ── editing ────────────────────────────────────────────────────────────────
update public.profiles set last_name = 'Meier'
  where id = '11111111-1111-1111-1111-111111111111';

select is(
  (select display_name from public.profiles
    where id = '11111111-1111-1111-1111-111111111111'),
  'Anna M.',
  'changing the family name re-derives the public name'
);

-- A member writing both through the API, the way the app does, as themselves.
set local role authenticated;
set local request.jwt.claims to
  '{"sub":"11111111-1111-1111-1111-111111111111","role":"authenticated"}';

update public.profiles set first_name = 'Anne', last_name = 'Berger'
  where id = '11111111-1111-1111-1111-111111111111';

select is(
  (select display_name from public.profiles
    where id = '11111111-1111-1111-1111-111111111111'),
  'Anne B.',
  'a member editing their own names changes what others see'
);

update public.profiles set display_name = 'Anne Berger'
  where id = '11111111-1111-1111-1111-111111111111';

select is(
  (select display_name from public.profiles
    where id = '11111111-1111-1111-1111-111111111111'),
  'Anne B.',
  'display_name cannot be set directly: it is re-derived from the names'
);

select is(
  (select display_name from public.profiles
    where id = '22222222-2222-2222-2222-222222222222'),
  'Bruno K.',
  'what another member sees of someone is the short name'
);

-- ── export and deletion ────────────────────────────────────────────────────
set local role postgres;

select is(
  (select public.export_user_data('11111111-1111-1111-1111-111111111111')
          -> 'profile' ->> 'last_name'),
  'Berger',
  'the data export carries the full name'
);

update public.profiles
  set display_name = 'Deleted member', status = 'deleted'
  where id = '22222222-2222-2222-2222-222222222222';

select results_eq(
  $$ select display_name, first_name, last_name from public.profiles
      where id = '22222222-2222-2222-2222-222222222222' $$,
  $$ values ('Deleted member'::text, null::text, null::text) $$,
  'a deleted member''s tombstone keeps no name'
);

select is(
  (select first_name from public.profiles
    where id = '11111111-1111-1111-1111-111111111111'),
  'Anne',
  'and only theirs'
);

-- ── admins see the whole name ──────────────────────────────────────────────
set local role authenticated;
set local request.jwt.claims to
  '{"sub":"a0000000-0000-0000-0000-000000000001","role":"authenticated"}';

select is(
  (select display_name from public.admin_search_profiles('Berger')),
  'Anne Berger',
  'admin search finds a member by family name and shows the full name'
);

select is(
  (select display_name from public.admin_get_user_detail('11111111-1111-1111-1111-111111111111')),
  'Anne Berger',
  'the admin user detail shows the full name'
);

set local request.jwt.claims to
  '{"sub":"33333333-3333-3333-3333-333333333333","role":"authenticated"}';

select is(
  (select count(*)::int from public.admin_search_profiles('Berger')),
  0,
  'and a non-admin gets nothing from the same search'
);

select * from finish();
rollback;
