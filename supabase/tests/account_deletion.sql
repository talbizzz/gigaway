-- Data export and account deletion, against a FULLY ENTANGLED account.
--
-- An account with no relationships proves nothing here: every failure mode in
-- deletion lives in the foreign keys. Anna therefore arrives at her deletion
-- having hosted somebody, been hosted, written reviews in both states,
-- received one, blocked and been blocked, reported and been reported, and
-- invited somebody who joined.
--
-- The tension being tested is that deletion must be real for HER while leaving
-- OTHER people's history standing. If deleting an account erased the reviews
-- she wrote about other people, deleting and rejoining would launder
-- reputation.

begin;

-- `supabase test db --linked` connects as cli_login_postgres, a NOINHERIT role
-- the CLI recreates on every run, so the privileges these fixtures need (writing
-- to auth.users) must be claimed explicitly. Locally this is a no-op.
set local role postgres;
select plan(31);

insert into auth.users (id, email, raw_user_meta_data) values
  ('11111111-1111-1111-1111-111111111111', 'anna@example.test',
   '{"display_name":"Anna Weber","discipline":"voice"}'::jsonb),
  ('22222222-2222-2222-2222-222222222222', 'bruno@example.test',
   '{"display_name":"Bruno Kraus","discipline":"strings"}'::jsonb),
  ('33333333-3333-3333-3333-333333333333', 'clara@example.test',
   '{"display_name":"Clara Ortiz","discipline":"dance"}'::jsonb);

update public.profiles set status = 'approved';
update public.profiles
  set bio = 'Mezzo-soprano, Berlin.', home_district = 'Neukölln',
      photo_path = '11111111-1111-1111-1111-111111111111/avatar.jpg',
      links = '["https://example.test/anna"]'::jsonb
  where id = '11111111-1111-1111-1111-111111111111';

-- ── Anna as guest: Bruno hosts her in Munich ───────────────────────────────
insert into public.trips (id, profile_id, city_id, start_date, end_date, needs, note) values
  ('aaaa0000-0000-0000-0000-000000000001', '11111111-1111-1111-1111-111111111111',
   (select id from public.cities where name = 'Munich' limit 1),
   current_date - 20, current_date - 15, array['couch'], 'Competition week.'),
  -- A second trip that never produced anything.
  ('aaaa0000-0000-0000-0000-000000000002', '11111111-1111-1111-1111-111111111111',
   (select id from public.cities where name = 'Munich' limit 1),
   current_date + 30, current_date + 35, array['couch'], 'Maybe.');

insert into public.availability (id, profile_id, city_id, start_date, end_date, offers) values
  ('bbbb0000-0000-0000-0000-000000000001', '22222222-2222-2222-2222-222222222222',
   (select id from public.cities where name = 'Munich' limit 1),
   current_date - 25, current_date - 10, array['couch']),
  -- Anna hosts too.
  ('bbbb0000-0000-0000-0000-000000000002', '11111111-1111-1111-1111-111111111111',
   (select id from public.cities where name = 'Munich' limit 1),
   current_date - 25, current_date - 10, array['couch']);

insert into public.requests (id, kind, trip_id, from_profile, to_profile, status) values
  ('cccc0000-0000-0000-0000-000000000001', 'host_stay',
   'aaaa0000-0000-0000-0000-000000000001',
   '11111111-1111-1111-1111-111111111111', '22222222-2222-2222-2222-222222222222', 'accepted'),
  ('cccc0000-0000-0000-0000-000000000002', 'host_stay',
   'aaaa0000-0000-0000-0000-000000000002',
   '11111111-1111-1111-1111-111111111111', '33333333-3333-3333-3333-333333333333', 'pending');

-- Clara travels; Anna hosts her.
insert into public.trips (id, profile_id, city_id, start_date, end_date, needs)
values ('aaaa0000-0000-0000-0000-000000000003', '33333333-3333-3333-3333-333333333333',
        (select id from public.cities where name = 'Munich' limit 1),
        current_date - 20, current_date - 15, array['couch']),
       -- A second Clara trip, so Anna's unanswered offer below has somewhere to
       -- live: one host may hold only one live offer per trip
       -- (offers_one_live_per_host_trip), and her accepted one already occupies
       -- the trip above.
       ('aaaa0000-0000-0000-0000-000000000004', '33333333-3333-3333-3333-333333333333',
        (select id from public.cities where name = 'Munich' limit 1),
        current_date - 18, current_date - 16, array['couch']);

insert into public.offers (id, trip_id, from_profile, to_profile, start_date, end_date, status) values
  ('dddd0000-0000-0000-0000-000000000001', 'aaaa0000-0000-0000-0000-000000000001',
   '22222222-2222-2222-2222-222222222222', '11111111-1111-1111-1111-111111111111',
   current_date - 20, current_date - 15, 'accepted'),
  ('dddd0000-0000-0000-0000-000000000002', 'aaaa0000-0000-0000-0000-000000000003',
   '11111111-1111-1111-1111-111111111111', '33333333-3333-3333-3333-333333333333',
   current_date - 20, current_date - 15, 'accepted'),
  -- A pending offer that leads nowhere.
  ('dddd0000-0000-0000-0000-000000000003', 'aaaa0000-0000-0000-0000-000000000004',
   '11111111-1111-1111-1111-111111111111', '33333333-3333-3333-3333-333333333333',
   current_date - 18, current_date - 16, 'pending');

insert into public.stays (id, offer_id, host_id, guest_id, city_id, start_date, end_date) values
  ('5a750000-0000-0000-0000-000000000001', 'dddd0000-0000-0000-0000-000000000001',
   '22222222-2222-2222-2222-222222222222', '11111111-1111-1111-1111-111111111111',
   (select id from public.cities where name = 'Munich' limit 1),
   current_date - 20, current_date - 15),
  ('5a750000-0000-0000-0000-000000000002', 'dddd0000-0000-0000-0000-000000000002',
   '11111111-1111-1111-1111-111111111111', '33333333-3333-3333-3333-333333333333',
   (select id from public.cities where name = 'Munich' limit 1),
   current_date - 20, current_date - 15);

-- Stay one: both wrote, so both published.
insert into public.reviews (id, stay_id, author_id, subject_id, would_again, body) values
  ('7e710000-0000-0000-0000-000000000001', '5a750000-0000-0000-0000-000000000001',
   '11111111-1111-1111-1111-111111111111', '22222222-2222-2222-2222-222222222222',
   true, 'Generous host.'),
  ('7e710000-0000-0000-0000-000000000002', '5a750000-0000-0000-0000-000000000001',
   '22222222-2222-2222-2222-222222222222', '11111111-1111-1111-1111-111111111111',
   true, 'Easy guest.');

-- Stay two: only Anna wrote, so hers is still unpublished.
insert into public.reviews (id, stay_id, author_id, subject_id, would_again, body)
values ('7e710000-0000-0000-0000-000000000003', '5a750000-0000-0000-0000-000000000002',
        '11111111-1111-1111-1111-111111111111', '33333333-3333-3333-3333-333333333333',
        false, 'Left the kitchen in a state.');

insert into public.blocks (blocker_id, blocked_id) values
  ('11111111-1111-1111-1111-111111111111', '33333333-3333-3333-3333-333333333333'),
  ('22222222-2222-2222-2222-222222222222', '11111111-1111-1111-1111-111111111111');

select public.submit_report('11111111-1111-1111-1111-111111111111',
                            '33333333-3333-3333-3333-333333333333',
                            'no_show', 'Never turned up.');
select public.submit_report('22222222-2222-2222-2222-222222222222',
                            '11111111-1111-1111-1111-111111111111',
                            'spam', 'Kept advertising lessons.');

insert into public.push_tokens (profile_id, token, platform)
values ('11111111-1111-1111-1111-111111111111', 'ExponentPushToken[anna]', 'ios');

insert into public.contact_grants (profile_a, profile_b, source, source_id)
values (least('11111111-1111-1111-1111-111111111111'::uuid,
              '22222222-2222-2222-2222-222222222222'::uuid),
        greatest('11111111-1111-1111-1111-111111111111'::uuid,
                 '22222222-2222-2222-2222-222222222222'::uuid),
        'offer', 'dddd0000-0000-0000-0000-000000000001');

-- ── export, while she is still entangled ───────────────────────────────────
select is(
  (select public.export_user_data('11111111-1111-1111-1111-111111111111')
          -> 'profile' ->> 'display_name'),
  'Anna Weber',
  'the export carries her profile'
);

select is(
  (select jsonb_array_length(
     public.export_user_data('11111111-1111-1111-1111-111111111111') -> 'stays')),
  2,
  'and both stays, hosted and stayed'
);

select is(
  (select jsonb_array_length(
     public.export_user_data('11111111-1111-1111-1111-111111111111') -> 'reviewsWritten')),
  2,
  'and every review she wrote, published or not — they are hers'
);

select is(
  (select jsonb_array_length(
     public.export_user_data('11111111-1111-1111-1111-111111111111') -> 'reviewsReceived')),
  1,
  'and the published reviews about her'
);

-- The exclusion that protects the private channel.
select is(
  (select (public.export_user_data('11111111-1111-1111-1111-111111111111') ? 'reports')),
  false,
  'BUT NO REPORTS, in either direction — the export must not unmask reporters'
);

select is(
  (select (public.export_user_data('11111111-1111-1111-1111-111111111111'))::text
            ilike '%never turned up%'),
  false,
  'and no report body leaks into it by another route'
);

select ok(
  (select public.recent_export_count('11111111-1111-1111-1111-111111111111')) >= 1,
  'the export is logged, so the daily rate limit has something to count'
);

-- ── deletion ───────────────────────────────────────────────────────────────
select is(
  (select public.delete_account('11111111-1111-1111-1111-111111111111') ->> 'photoPath'),
  '11111111-1111-1111-1111-111111111111/avatar.jpg',
  'deletion hands the avatar path back so the function can remove the object'
);

-- ── what is gone ───────────────────────────────────────────────────────────
select is(
  (select count(*)::int from public.contact_details
    where profile_id = '11111111-1111-1111-1111-111111111111'),
  0,
  'contact details are hard-deleted'
);

select is(
  (select count(*)::int from public.push_tokens
    where profile_id = '11111111-1111-1111-1111-111111111111'),
  0,
  'push tokens are hard-deleted'
);

select is(
  (select count(*)::int from public.notifications
    where profile_id = '11111111-1111-1111-1111-111111111111'),
  0,
  'notification history is hard-deleted'
);

select is(
  (select count(*)::int from public.availability
    where profile_id = '11111111-1111-1111-1111-111111111111'),
  0,
  'availability is hard-deleted'
);

select is(
  (select count(*)::int from public.trips
    where id = 'aaaa0000-0000-0000-0000-000000000002'),
  0,
  'a trip that produced nothing is hard-deleted'
);

select is(
  (select count(*)::int from public.requests
    where id = 'cccc0000-0000-0000-0000-000000000002'),
  0,
  'a pending request is hard-deleted'
);

select is(
  (select count(*)::int from public.offers
    where id = 'dddd0000-0000-0000-0000-000000000003'),
  0,
  'a pending offer is hard-deleted'
);

select is(
  (select count(*)::int from public.reviews
    where id = '7e710000-0000-0000-0000-000000000003'),
  0,
  'an unpublished review she wrote is deleted — it never became public'
);

select is(
  (select count(*)::int from public.reviews
    where subject_id = '11111111-1111-1111-1111-111111111111'),
  0,
  'reviews ABOUT her are deleted — reputation data about a departed person serves nobody'
);

select is(
  (select count(*)::int from public.blocks
    where blocker_id = '11111111-1111-1111-1111-111111111111'),
  0,
  'blocks she created are removed'
);

select is(
  (select count(*)::int from public.contact_grants
    where profile_a = '11111111-1111-1111-1111-111111111111'
       or profile_b = '11111111-1111-1111-1111-111111111111'),
  0,
  'contact grants go, since there are no contact details left behind them'
);

-- ── what survives, and why ─────────────────────────────────────────────────
select is(
  (select count(*)::int from public.stays
    where host_id = '11111111-1111-1111-1111-111111111111'
       or guest_id = '11111111-1111-1111-1111-111111111111'),
  2,
  'BOTH STAYS SURVIVE — they are the counterparties'' history, not hers alone'
);

select is(
  (select count(*)::int from public.trips
    where id = 'aaaa0000-0000-0000-0000-000000000001'),
  1,
  'the trip underpinning a stay survives with it'
);

select is(
  (select note from public.trips
    where id = 'aaaa0000-0000-0000-0000-000000000001'),
  null,
  'though its free text is stripped'
);

select is(
  (select count(*)::int from public.reviews
    where id = '7e710000-0000-0000-0000-000000000001'),
  1,
  'the PUBLISHED review she wrote about Bruno survives — otherwise deleting and '
  'rejoining would launder a bad reputation'
);

select is(
  (select count(*)::int from public.blocks
    where blocked_id = '11111111-1111-1111-1111-111111111111'),
  1,
  'the block somebody else placed on her survives'
);

select is(
  (select count(*)::int from public.reports
    where reporter_id = '11111111-1111-1111-1111-111111111111'),
  1,
  'the report she filed survives — a departing bad actor cannot erase the record'
);

select is(
  (select count(*)::int from public.reports
    where subject_id = '11111111-1111-1111-1111-111111111111'),
  1,
  'and so does the report about her'
);

-- ── the tombstone ──────────────────────────────────────────────────────────
select is(
  (select display_name from public.profiles
    where id = '11111111-1111-1111-1111-111111111111'),
  'Deleted member',
  'her profile becomes an anonymised tombstone'
);

select is(
  (select status::text from public.profiles
    where id = '11111111-1111-1111-1111-111111111111'),
  'deleted',
  'marked deleted, so is_approved() is false and nothing is visible to her again'
);

select ok(
  (select bio is null and home_district is null and photo_path is null
            and home_city_id is null and specialisation is null
            and links = '[]'::jsonb
     from public.profiles where id = '11111111-1111-1111-1111-111111111111'),
  'with every free-text and identifying field cleared'
);

-- ── what the counterparty sees afterwards ──────────────────────────────────
set local role authenticated;
set local request.jwt.claims to
  '{"sub":"33333333-3333-3333-3333-333333333333","role":"authenticated"}';

select is(
  (select count(*)::int from public.profiles
    where display_name = 'Anna Weber'),
  0,
  'her name appears nowhere in another member''s app'
);

select is(
  (select count(*)::int from public.stays
    where guest_id = '33333333-3333-3333-3333-333333333333'),
  1,
  'but Clara''s own stay history is intact'
);

select * from finish();
rollback;
