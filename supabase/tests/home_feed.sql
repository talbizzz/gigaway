-- The home feed: the three bands, their ranking, and the privacy property.
--
-- The band definitions are easy to get subtly wrong in ways no screenshot would
-- show — "in your city" must mean a trip covering today rather than any trip,
-- and "living there" must exclude a local who will themselves be away. Both are
-- asserted here.
--
-- The load-bearing test is the last one. home_feed is invoker rights on purpose,
-- so a block has to empty it out through RLS alone. If someone ever "fixes" a
-- permissions error by making it SECURITY DEFINER, this file fails rather than
-- the leak reaching a member.
--
-- Dates are relative to current_date throughout: the function asks what is
-- happening today, so fixed dates would rot.

begin;

-- `supabase test db --linked` connects as cli_login_postgres, a NOINHERIT role
-- the CLI recreates on every run, so the privileges these fixtures need (writing
-- to auth.users) must be claimed explicitly. Locally this is a no-op.
set local role postgres;
select plan(11);

insert into auth.users (id, email, raw_user_meta_data) values
  ('11111111-1111-1111-1111-111111111111', 'anna@example.test',
   '{"display_name":"Anna Weber","discipline":"voice"}'::jsonb),
  ('22222222-2222-2222-2222-222222222222', 'bruno@example.test',
   '{"display_name":"Bruno Kraus","discipline":"strings"}'::jsonb),
  ('33333333-3333-3333-3333-333333333333', 'clara@example.test',
   '{"display_name":"Clara Ortiz","discipline":"dance"}'::jsonb),
  ('44444444-4444-4444-4444-444444444444', 'dora@example.test',
   '{"display_name":"Dora Feld","discipline":"voice"}'::jsonb),
  ('55555555-5555-5555-5555-555555555555', 'erik@example.test',
   '{"display_name":"Erik Sund","discipline":"strings"}'::jsonb),
  ('66666666-6666-6666-6666-666666666666', 'frank@example.test',
   '{"display_name":"Frank Iles","discipline":"dance"}'::jsonb),
  ('77777777-7777-7777-7777-777777777777', 'gita@example.test',
   '{"display_name":"Gita Roy","discipline":"voice"}'::jsonb);

update public.profiles set status = 'approved';

-- Anna lives in Munich and is going to Berlin next week.
update public.profiles
  set home_city_id = (select id from public.cities where name = 'Munich' limit 1)
  where id = '11111111-1111-1111-1111-111111111111';

-- Dora and Gita live in Berlin. Erik lives there too AND has posted nights,
-- which is what proves one person cannot appear twice.
update public.profiles
  set home_city_id = (select id from public.cities where name = 'Berlin' limit 1)
  where id in ('44444444-4444-4444-4444-444444444444',
               '55555555-5555-5555-5555-555555555555',
               '77777777-7777-7777-7777-777777777777');

insert into public.trips (id, profile_id, city_id, start_date, end_date, needs) values
  -- Anna's own trip: Berlin, a week out.
  ('aaaa0000-0000-0000-0000-000000000001',
   '11111111-1111-1111-1111-111111111111',
   (select id from public.cities where name = 'Berlin' limit 1),
   current_date + 7, current_date + 10, array['couch']),
  -- Bruno is in Munich right now.
  ('bbbb0000-0000-0000-0000-000000000001',
   '22222222-2222-2222-2222-222222222222',
   (select id from public.cities where name = 'Munich' limit 1),
   current_date - 1, current_date + 2, array['couch']),
  -- Clara arrives in Munich in a fortnight.
  ('cccc0000-0000-0000-0000-000000000001',
   '33333333-3333-3333-3333-333333333333',
   (select id from public.cities where name = 'Munich' limit 1),
   current_date + 14, current_date + 17, array['couch']),
  -- Frank will be in Berlin while Anna is.
  ('ffff0000-0000-0000-0000-000000000001',
   '66666666-6666-6666-6666-666666666666',
   (select id from public.cities where name = 'Berlin' limit 1),
   current_date + 8, current_date + 11, array['tips']),
  -- Gita lives in Berlin but is away for exactly Anna's window.
  ('99990000-0000-0000-0000-000000000001',
   '77777777-7777-7777-7777-777777777777',
   (select id from public.cities where name = 'Hamburg' limit 1),
   current_date + 6, current_date + 12, array['couch']);

insert into public.availability (profile_id, city_id, start_date, end_date, offers) values
  ('55555555-5555-5555-5555-555555555555',
   (select id from public.cities where name = 'Berlin' limit 1),
   current_date + 5, current_date + 20, array['couch']);

-- ── the privacy property, before anything else ─────────────────────────────
select is(
  (select prosecdef from pg_proc where proname = 'home_feed'),
  false,
  'home_feed runs with invoker rights, so RLS still filters what it returns'
);

set local role authenticated;
set local request.jwt.claims to
  '{"sub":"11111111-1111-1111-1111-111111111111","role":"authenticated"}';

-- ── in your city ───────────────────────────────────────────────────────────
select is(
  (select jsonb_array_length(public.home_feed() -> 'inYourCity')),
  1,
  'only the colleague whose trip covers today counts as being in your city'
);

select is(
  (select public.home_feed() -> 'inYourCity' -> 0 -> 'profile' ->> 'displayName'),
  'Bruno Kraus',
  'and it is the one who is actually here'
);

select is(
  (select jsonb_array_length(public.home_feed() -> 'comingToYourCity')),
  1,
  'the one arriving in a fortnight is coming, not here'
);

select is(
  (select public.home_feed() -> 'comingToYourCity' -> 0 -> 'profile' ->> 'displayName'),
  'Clara Ortiz',
  'and it is the one who is on the way'
);

-- ── the city you are going to ──────────────────────────────────────────────
select is(
  (select jsonb_array_length(public.home_feed() -> 'destinations')),
  1,
  'one destination per upcoming trip'
);

select is(
  (select (public.home_feed() -> 'destinations' -> 0 ->> 'total')::int),
  3,
  'Erik hosting, Dora at home and Frank visiting — Gita is away, so she is not there'
);

select is(
  (select public.home_feed() -> 'destinations' -> 0 -> 'people' -> 0 ->> 'kind'),
  'host',
  'the person offering nights is ranked first'
);

select is(
  (select public.home_feed() -> 'destinations' -> 0 -> 'people' -> 0 -> 'profile' ->> 'displayName'),
  'Erik Sund',
  'and although Erik also lives there, he appears once, as the host'
);

select is(
  (select jsonb_agg(person ->> 'kind')
     from jsonb_array_elements(
       public.home_feed() -> 'destinations' -> 0 -> 'people'
     ) as person),
  '["host", "local", "traveller"]'::jsonb,
  'ranked host, then whoever is at home, then whoever is visiting'
);

-- ── and the whole thing goes through RLS ───────────────────────────────────
set local role postgres;
insert into public.blocks (blocker_id, blocked_id)
  values ('11111111-1111-1111-1111-111111111111',
          '55555555-5555-5555-5555-555555555555');

set local role authenticated;
set local request.jwt.claims to
  '{"sub":"11111111-1111-1111-1111-111111111111","role":"authenticated"}';

select is(
  (select (public.home_feed() -> 'destinations' -> 0 ->> 'total')::int),
  2,
  'blocking the host removes him from the feed, through RLS alone'
);

select * from finish();
rollback;
