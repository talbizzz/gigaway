-- Requests, offers and stays: who may create what, who may see it, and the
-- range-containment rule that makes a partial offer safe.
--
-- The third-party tests here are the point of the file. A request and an offer
-- name two people and say where one of them will sleep; a competing host on
-- the same trip must not be able to read either.

begin;

-- `supabase test db --linked` connects as cli_login_postgres, a NOINHERIT role
-- the CLI recreates on every run, so the privileges these fixtures need (writing
-- to auth.users) must be claimed explicitly. Locally this is a no-op.
set local role postgres;
select plan(32);

-- ── fixtures ───────────────────────────────────────────────────────────────
-- Anna travels to Munich. Bruno hosts there. Clara also hosts there, and is
-- the third party who must see nothing. Dieter is pending throughout.
insert into auth.users (id, email, raw_user_meta_data) values
  ('11111111-1111-1111-1111-111111111111', 'anna@example.test',
   '{"display_name":"Anna Weber","discipline":"voice"}'::jsonb),
  ('22222222-2222-2222-2222-222222222222', 'bruno@example.test',
   '{"display_name":"Bruno Kraus","discipline":"strings"}'::jsonb),
  ('33333333-3333-3333-3333-333333333333', 'clara@example.test',
   '{"display_name":"Clara Ortiz","discipline":"dance"}'::jsonb),
  ('44444444-4444-4444-4444-444444444444', 'dieter@example.test',
   '{"display_name":"Dieter Hahn","discipline":"brass"}'::jsonb);

update public.profiles set status = 'approved'
  where id <> '44444444-4444-4444-4444-444444444444';

-- Anna: Munich, 3–10 March, seven nights.
insert into public.trips (id, profile_id, city_id, start_date, end_date, needs)
values ('aaaa0000-0000-0000-0000-000000000001',
        '11111111-1111-1111-1111-111111111111',
        (select id from public.cities where name = 'Munich' limit 1),
        '2027-03-03', '2027-03-10', array['couch']);

-- Bruno: free 1–5 March. His overlap with Anna is 3–5 March, three nights —
-- the brief's own example.
insert into public.availability (id, profile_id, city_id, start_date, end_date, offers)
values ('bbbb0000-0000-0000-0000-000000000001',
        '22222222-2222-2222-2222-222222222222',
        (select id from public.cities where name = 'Munich' limit 1),
        '2027-03-01', '2027-03-05', array['couch']);

-- Clara: free the whole trip.
insert into public.availability (id, profile_id, city_id, start_date, end_date, offers)
values ('bbbb0000-0000-0000-0000-000000000002',
        '33333333-3333-3333-3333-333333333333',
        (select id from public.cities where name = 'Munich' limit 1),
        '2027-03-01', '2027-03-31', array['spare_room']);

-- ── sending a request ──────────────────────────────────────────────────────
set local role authenticated;
set local request.jwt.claims to
  '{"sub":"11111111-1111-1111-1111-111111111111","role":"authenticated"}';

select lives_ok(
  $$ insert into public.requests (id, kind, trip_id, from_profile, to_profile, message)
     values ('cccc0000-0000-0000-0000-000000000001', 'host_stay',
             'aaaa0000-0000-0000-0000-000000000001',
             '11111111-1111-1111-1111-111111111111',
             '22222222-2222-2222-2222-222222222222',
             'Competition at the Hochschule — three nights would already help.') $$,
  'a traveller can request a stay from a host whose availability overlaps'
);

select throws_ok(
  $$ insert into public.requests (kind, trip_id, from_profile, to_profile)
     values ('host_stay', 'aaaa0000-0000-0000-0000-000000000001',
             '11111111-1111-1111-1111-111111111111',
             '22222222-2222-2222-2222-222222222222') $$,
  '23505',
  null,
  'the same person cannot be asked twice for the same trip'
);

select throws_ok(
  $$ insert into public.requests (kind, trip_id, from_profile, to_profile)
     values ('host_stay', 'aaaa0000-0000-0000-0000-000000000001',
             '11111111-1111-1111-1111-111111111111',
             '44444444-4444-4444-4444-444444444444') $$,
  '42501',
  null,
  'a request cannot be sent to a profile that is not approved'
);

select throws_ok(
  $$ insert into public.requests (kind, trip_id, from_profile, to_profile)
     values ('host_stay', 'aaaa0000-0000-0000-0000-000000000001',
             '11111111-1111-1111-1111-111111111111',
             '11111111-1111-1111-1111-111111111111') $$,
  '23514',
  null,
  'nobody can request themselves'
);

select throws_ok(
  $$ insert into public.requests (kind, trip_id, from_profile, to_profile, message)
     values ('host_stay', 'aaaa0000-0000-0000-0000-000000000001',
             '11111111-1111-1111-1111-111111111111',
             '33333333-3333-3333-3333-333333333333',
             repeat('x', 501)) $$,
  '23514',
  null,
  'a request message longer than 500 characters is rejected'
);

-- A member cannot send requests against somebody else's trip.
set local role postgres;
set local role authenticated;
set local request.jwt.claims to
  '{"sub":"33333333-3333-3333-3333-333333333333","role":"authenticated"}';

select throws_ok(
  $$ insert into public.requests (kind, trip_id, from_profile, to_profile)
     values ('host_stay', 'aaaa0000-0000-0000-0000-000000000001',
             '33333333-3333-3333-3333-333333333333',
             '22222222-2222-2222-2222-222222222222') $$,
  '42501',
  null,
  'a member cannot send a request against a trip they do not own'
);

-- ── the request cap ────────────────────────────────────────────────────────
set local role postgres;
-- Nine more approved members, taking Anna's trip to the cap of ten.
insert into auth.users (id, email, raw_user_meta_data)
select ('55555555-0000-0000-0000-00000000000' || n)::uuid,
       'filler' || n || '@example.test',
       '{"display_name":"Filler Person","discipline":"other"}'::jsonb
from generate_series(1, 9) n;
update public.profiles set status = 'approved'
  where id::text like '55555555-%';

set local role authenticated;
set local request.jwt.claims to
  '{"sub":"11111111-1111-1111-1111-111111111111","role":"authenticated"}';

select lives_ok(
  $$ insert into public.requests (kind, trip_id, from_profile, to_profile)
     select 'host_stay', 'aaaa0000-0000-0000-0000-000000000001',
            '11111111-1111-1111-1111-111111111111',
            ('55555555-0000-0000-0000-00000000000' || n)::uuid
     from generate_series(1, 9) n $$,
  'a trip can carry up to ten requests'
);

select throws_ok(
  $$ insert into public.requests (kind, trip_id, from_profile, to_profile)
     values ('host_stay', 'aaaa0000-0000-0000-0000-000000000001',
             '11111111-1111-1111-1111-111111111111',
             '33333333-3333-3333-3333-333333333333') $$,
  '42501',
  null,
  'the eleventh request on a trip is refused'
);

-- ── withdrawal, and what a client may not do ───────────────────────────────
select lives_ok(
  $$ update public.requests set status = 'withdrawn'
     where id = 'cccc0000-0000-0000-0000-000000000001' $$,
  'a traveller can withdraw their own pending request'
);

select is(
  (select responded_at is not null from public.requests
    where id = 'cccc0000-0000-0000-0000-000000000001'),
  true,
  'withdrawing stamps responded_at automatically'
);

select is(
  (select public.trip_request_count('aaaa0000-0000-0000-0000-000000000001')),
  10,
  'withdrawing does not buy another slot under the cap'
);

set local role postgres;
update public.requests set status = 'pending', responded_at = null
  where id = 'cccc0000-0000-0000-0000-000000000001';

set local role authenticated;
set local request.jwt.claims to
  '{"sub":"11111111-1111-1111-1111-111111111111","role":"authenticated"}';

select throws_ok(
  $$ update public.requests set status = 'accepted'
     where id = 'cccc0000-0000-0000-0000-000000000001' $$,
  '42501',
  null,
  'a traveller cannot mark their own request accepted — that is the Edge Function''s job'
);

select throws_ok(
  $$ update public.requests set message = 'rewritten', status = 'withdrawn'
     where id = 'cccc0000-0000-0000-0000-000000000001' $$,
  '42501',
  null,
  'withdrawing cannot be used to rewrite the message'
);

-- ── offers, and range containment ──────────────────────────────────────────
set local role postgres;
set local role authenticated;
set local request.jwt.claims to
  '{"sub":"22222222-2222-2222-2222-222222222222","role":"authenticated"}';

select throws_ok(
  $$ insert into public.offers (request_id, trip_id, from_profile, to_profile, start_date, end_date)
     values ('cccc0000-0000-0000-0000-000000000001',
             'aaaa0000-0000-0000-0000-000000000001',
             '22222222-2222-2222-2222-222222222222',
             '11111111-1111-1111-1111-111111111111',
             '2027-03-03', '2027-03-08') $$,
  '23514',
  null,
  'a host cannot offer nights beyond their own availability'
);

select throws_ok(
  $$ insert into public.offers (trip_id, from_profile, to_profile, start_date, end_date)
     values ('aaaa0000-0000-0000-0000-000000000001',
             '22222222-2222-2222-2222-222222222222',
             '11111111-1111-1111-1111-111111111111',
             '2027-03-01', '2027-03-05') $$,
  '23514',
  null,
  'a host cannot offer nights before the trip begins, even though they are free then'
);

select lives_ok(
  $$ insert into public.offers (id, request_id, trip_id, from_profile, to_profile,
                                start_date, end_date, message)
     values ('dddd0000-0000-0000-0000-000000000001',
             'cccc0000-0000-0000-0000-000000000001',
             'aaaa0000-0000-0000-0000-000000000001',
             '22222222-2222-2222-2222-222222222222',
             '11111111-1111-1111-1111-111111111111',
             '2027-03-03', '2027-03-05',
             'Three nights is what I have — the couch is yours.') $$,
  'a host can offer a subset of the requested nights'
);

select is(
  (select city_id from public.offers where id = 'dddd0000-0000-0000-0000-000000000001'),
  (select id from public.cities where name = 'Munich' limit 1),
  'the containment trigger records the city the guest will actually sleep in'
);

select throws_ok(
  $$ insert into public.offers (trip_id, from_profile, to_profile, start_date, end_date)
     values ('aaaa0000-0000-0000-0000-000000000001',
             '22222222-2222-2222-2222-222222222222',
             '33333333-3333-3333-3333-333333333333',
             '2027-03-03', '2027-03-05') $$,
  '23514',
  null,
  'an offer cannot be addressed to anyone but the traveller who posted the trip'
);

-- A proactive offer: Clara found the trip herself, with no request.
set local role postgres;
set local role authenticated;
set local request.jwt.claims to
  '{"sub":"33333333-3333-3333-3333-333333333333","role":"authenticated"}';

select lives_ok(
  $$ insert into public.offers (id, trip_id, from_profile, to_profile, start_date, end_date)
     values ('dddd0000-0000-0000-0000-000000000002',
             'aaaa0000-0000-0000-0000-000000000001',
             '33333333-3333-3333-3333-333333333333',
             '11111111-1111-1111-1111-111111111111',
             '2027-03-03', '2027-03-10') $$,
  'a host can offer proactively against an open trip, with no prior request'
);

select is(
  (select request_id from public.offers where id = 'dddd0000-0000-0000-0000-000000000002'),
  null,
  'a proactive offer carries no request'
);

select throws_ok(
  $$ update public.offers set start_date = '2027-03-04', status = 'withdrawn'
     where id = 'dddd0000-0000-0000-0000-000000000002' $$,
  '42501',
  null,
  'withdrawing cannot be used to rewrite the offered nights'
);

-- ── a third party sees nothing ─────────────────────────────────────────────
-- Clara hosts in the same city and has her own offer on the same trip. Bruno's
-- request and offer must still be invisible to her.
select is(
  (select count(*)::int from public.requests),
  0,
  'a third profile sees none of the pair''s requests'
);

select is(
  (select count(*)::int from public.offers
    where id = 'dddd0000-0000-0000-0000-000000000001'),
  0,
  'a competing host on the same trip cannot read a rival''s offer'
);

select is(
  (select count(*)::int from public.offers),
  1,
  'a host sees only their own offer'
);

set local role postgres;
set local role authenticated;
set local request.jwt.claims to
  '{"sub":"44444444-4444-4444-4444-444444444444","role":"authenticated"}';

select is(
  (select count(*)::int from public.requests),
  0,
  'a pending applicant sees no requests at all'
);

select is(
  (select count(*)::int from public.offers),
  0,
  'a pending applicant sees no offers at all'
);

-- ── declining ──────────────────────────────────────────────────────────────
set local role postgres;
set local role authenticated;
set local request.jwt.claims to
  '{"sub":"11111111-1111-1111-1111-111111111111","role":"authenticated"}';

select is(
  (select count(*)::int from public.offers),
  2,
  'the traveller sees every offer made to them'
);

select lives_ok(
  $$ update public.offers set status = 'declined'
     where id = 'dddd0000-0000-0000-0000-000000000002' $$,
  'a traveller can decline an offer made to them'
);

select throws_ok(
  $$ update public.offers set status = 'accepted'
     where id = 'dddd0000-0000-0000-0000-000000000001' $$,
  '42501',
  null,
  'a traveller cannot accept an offer directly — that is the Edge Function''s job'
);

-- ── stays are not client-writable ──────────────────────────────────────────
select throws_ok(
  $$ insert into public.stays (offer_id, host_id, guest_id, city_id, start_date, end_date)
     values ('dddd0000-0000-0000-0000-000000000001',
             '22222222-2222-2222-2222-222222222222',
             '11111111-1111-1111-1111-111111111111',
             (select id from public.cities where name = 'Munich' limit 1),
             '2027-03-03', '2027-03-05') $$,
  '42501',
  null,
  'a client cannot fabricate a stay'
);

set local role postgres;
insert into public.stays (offer_id, host_id, guest_id, city_id, start_date, end_date)
values ('dddd0000-0000-0000-0000-000000000001',
        '22222222-2222-2222-2222-222222222222',
        '11111111-1111-1111-1111-111111111111',
        (select id from public.cities where name = 'Munich' limit 1),
        '2027-03-03', '2027-03-05');

set local role authenticated;
set local request.jwt.claims to
  '{"sub":"33333333-3333-3333-3333-333333333333","role":"authenticated"}';

select is(
  (select count(*)::int from public.stays),
  0,
  'a third profile sees none of the pair''s stays'
);

set local role postgres;
set local role authenticated;
set local request.jwt.claims to
  '{"sub":"11111111-1111-1111-1111-111111111111","role":"authenticated"}';

select is(
  (select count(*)::int from public.stays),
  1,
  'the guest sees their own stay'
);

select * from finish();
rollback;
