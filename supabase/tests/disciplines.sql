-- The list of disciplines, and translating the old one.
--
-- Members choose from singer, instrumentalist, musical_theatre, dancer, actor,
-- conductor, stage_director, artist, photographer, designer, other. An older
-- app build still in someone's pocket sends the previous list at sign-up
-- (voice, strings, ...), which must land on the nearest new category rather
-- than on 'other'.

begin;

-- See rls_profiles.sql: the CLI's login role needs this to write auth.users.
set local role postgres;
select plan(16);

-- ── the translation ────────────────────────────────────────────────────────
select is(public.normalize_discipline('musical_theatre'), 'musical_theatre',
  'a new value is kept');
select is(public.normalize_discipline('  Singer '), 'singer',
  'case and spacing do not matter');
select is(public.normalize_discipline('voice'), 'singer', 'voice becomes singer');
select is(
  (select array_agg(public.normalize_discipline(v) order by v)
     from unnest(array['strings', 'keyboard', 'winds', 'brass', 'percussion']) as v),
  array['instrumentalist', 'instrumentalist', 'instrumentalist', 'instrumentalist',
        'instrumentalist'],
  'every instrument family becomes instrumentalist'
);
select is(public.normalize_discipline('dance'), 'dancer', 'dance becomes dancer');
select is(public.normalize_discipline('conducting'), 'conductor',
  'conducting becomes conductor');
select is(public.normalize_discipline('composition'), 'other',
  'composition has no equivalent and becomes other');
select is(public.normalize_discipline(null), 'other', 'nothing becomes other');
select is(public.normalize_discipline('astronaut'), 'other', 'and so does anything unknown');

-- ── sign-up ────────────────────────────────────────────────────────────────
insert into auth.users (id, email, raw_user_meta_data) values
  ('11111111-1111-1111-1111-111111111111', 'a@example.test',
   '{"first_name":"Anna","last_name":"Weber","discipline":"stage_director"}'::jsonb),
  ('22222222-2222-2222-2222-222222222222', 'b@example.test',
   '{"display_name":"Bruno Kraus","discipline":"voice"}'::jsonb),
  ('33333333-3333-3333-3333-333333333333', 'c@example.test',
   '{"first_name":"Clara","last_name":"Ortiz"}'::jsonb);

select is(
  (select discipline from public.profiles where id = '11111111-1111-1111-1111-111111111111'),
  'stage_director',
  'a new build signs up with a new discipline'
);
select is(
  (select discipline from public.profiles where id = '22222222-2222-2222-2222-222222222222'),
  'singer',
  'an older build signing up with the old list is translated'
);
select is(
  (select discipline from public.profiles where id = '33333333-3333-3333-3333-333333333333'),
  'other',
  'no discipline at all gives other'
);

-- ── the constraint ─────────────────────────────────────────────────────────
select lives_ok(
  $$ update public.profiles set discipline = 'photographer'
      where id = '11111111-1111-1111-1111-111111111111' $$,
  'a new value can be stored'
);
select throws_ok(
  $$ update public.profiles set discipline = 'voice'
      where id = '11111111-1111-1111-1111-111111111111' $$,
  '23514',
  null,
  'a value from the previous list can no longer be stored'
);
select throws_ok(
  $$ update public.profiles set discipline = 'astronaut'
      where id = '11111111-1111-1111-1111-111111111111' $$,
  '23514',
  null,
  'nor can an arbitrary one'
);
select throws_ok(
  $$ update public.profiles set discipline = 'Singer'
      where id = '11111111-1111-1111-1111-111111111111' $$,
  '23514',
  null,
  'and the stored form is the lower-case key'
);

select * from finish();
rollback;
