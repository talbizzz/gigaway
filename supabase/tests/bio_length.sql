-- The "about you" text may be at most 750 characters.

begin;

-- See rls_profiles.sql: the CLI's login role needs this to write auth.users.
set local role postgres;
select plan(4);

insert into auth.users (id, email, raw_user_meta_data)
values ('11111111-1111-1111-1111-111111111111', 'anna@example.test',
        '{"first_name":"Anna","last_name":"Weber","discipline":"singer"}'::jsonb);

select lives_ok(
  $$ update public.profiles set bio = repeat('a', 750)
      where id = '11111111-1111-1111-1111-111111111111' $$,
  'a 750-character bio is accepted'
);

select throws_ok(
  $$ update public.profiles set bio = repeat('a', 751)
      where id = '11111111-1111-1111-1111-111111111111' $$,
  '23514',
  null,
  'a 751-character bio is refused'
);

select lives_ok(
  $$ update public.profiles set bio = repeat('a', 700)
      where id = '11111111-1111-1111-1111-111111111111' $$,
  'what used to be too long (over 600) is now fine'
);

select lives_ok(
  $$ update public.profiles set bio = null
      where id = '11111111-1111-1111-1111-111111111111' $$,
  'and no bio at all is still fine'
);

select * from finish();
rollback;
