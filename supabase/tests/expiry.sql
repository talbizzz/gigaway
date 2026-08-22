-- Expiry: the sweep, and the guard that the sweep cannot be trusted to replace.
--
-- The case that matters is the second one. accept_offer originally checked
-- offer status, trip status and profile status but never dates, and nothing
-- sets trips.completed — so a months-old offer was still 'pending' against a
-- still-'active' trip, and accepting it wrote a stay wholly in the past.
-- Milestone 4 decides when to prompt for a review by comparing stays.end_date
-- against current_date, so that stay would have asked both people to review
-- something that never happened.

begin;

-- `supabase test db --linked` connects as cli_login_postgres, a NOINHERIT role
-- the CLI recreates on every run, so the privileges these fixtures need (writing
-- to auth.users) must be claimed explicitly. Locally this is a no-op.
set local role postgres;
select plan(16);

insert into auth.users (id, email, raw_user_meta_data) values
  ('11111111-1111-1111-1111-111111111111', 'anna@example.test',
   '{"display_name":"Anna Weber","discipline":"voice"}'::jsonb),
  ('22222222-2222-2222-2222-222222222222', 'bruno@example.test',
   '{"display_name":"Bruno Kraus","discipline":"strings"}'::jsonb);

update public.profiles set status = 'approved';

-- A trip that finished a fortnight ago, and one still to come. Dates are
-- relative to current_date so the file does not rot.
insert into public.trips (id, profile_id, city_id, start_date, end_date, needs)
values
  ('aaaa0000-0000-0000-0000-000000000001',
   '11111111-1111-1111-1111-111111111111',
   (select id from public.cities where name = 'Munich' limit 1),
   current_date - 20, current_date - 14, array['couch','co_accommodation']),
  ('aaaa0000-0000-0000-0000-000000000002',
   '11111111-1111-1111-1111-111111111111',
   (select id from public.cities where name = 'Munich' limit 1),
   current_date + 10, current_date + 17, array['couch']);

insert into public.availability (profile_id, city_id, start_date, end_date, offers)
values
  ('22222222-2222-2222-2222-222222222222',
   (select id from public.cities where name = 'Munich' limit 1),
   current_date - 30, current_date - 10, array['couch']),
  ('22222222-2222-2222-2222-222222222222',
   (select id from public.cities where name = 'Munich' limit 1),
   current_date + 5, current_date + 20, array['couch']);

insert into public.requests (id, kind, trip_id, from_profile, to_profile) values
  ('cccc0000-0000-0000-0000-000000000001', 'host_stay',
   'aaaa0000-0000-0000-0000-000000000001',
   '11111111-1111-1111-1111-111111111111', '22222222-2222-2222-2222-222222222222'),
  ('cccc0000-0000-0000-0000-000000000002', 'host_stay',
   'aaaa0000-0000-0000-0000-000000000002',
   '11111111-1111-1111-1111-111111111111', '22222222-2222-2222-2222-222222222222');

insert into public.offers (id, trip_id, from_profile, to_profile, start_date, end_date) values
  ('dddd0000-0000-0000-0000-000000000001',
   'aaaa0000-0000-0000-0000-000000000001',
   '22222222-2222-2222-2222-222222222222', '11111111-1111-1111-1111-111111111111',
   current_date - 20, current_date - 14),
  ('dddd0000-0000-0000-0000-000000000002',
   'aaaa0000-0000-0000-0000-000000000002',
   '22222222-2222-2222-2222-222222222222', '11111111-1111-1111-1111-111111111111',
   current_date + 10, current_date + 17);

-- ── the guard, BEFORE any sweep has run ────────────────────────────────────
-- This is the window the sweep cannot cover: the nights have passed but the
-- daily job has not yet fired.
select is(
  (select status::text from public.offers
    where id = 'dddd0000-0000-0000-0000-000000000001'),
  'pending',
  'the stale offer is still pending — the sweep has not run yet'
);

select is(
  (select public.accept_offer('dddd0000-0000-0000-0000-000000000001',
                              '11111111-1111-1111-1111-111111111111') ->> 'error'),
  'offer_expired',
  'an offer whose nights have passed cannot be accepted, sweep or no sweep'
);

select is(
  (select count(*)::int from public.stays),
  0,
  'no backdated stay was created — the bug this guard exists for'
);

select is(
  (select count(*)::int from public.contact_grants),
  0,
  'and no contact was revealed on the strength of it'
);

select is(
  (select public.accept_co_request('cccc0000-0000-0000-0000-000000000001',
                                   '22222222-2222-2222-2222-222222222222') ->> 'error'),
  'request_not_found',
  'a host_stay request is still refused by accept_co_request'
);

-- The same guard on the co-accommodation path, keyed on the trip's own dates.
set local role postgres;
insert into public.requests (id, kind, trip_id, from_profile, to_profile)
values ('cccc0000-0000-0000-0000-000000000003', 'co_accommodation',
        'aaaa0000-0000-0000-0000-000000000001',
        '11111111-1111-1111-1111-111111111111', '22222222-2222-2222-2222-222222222222');

select is(
  (select public.accept_co_request('cccc0000-0000-0000-0000-000000000003',
                                   '22222222-2222-2222-2222-222222222222') ->> 'error'),
  'request_expired',
  'a co-accommodation request for a trip that has happened cannot be accepted'
);

-- ── a trip ending today is NOT expired ─────────────────────────────────────
-- `< current_date`, not `<=`: a traveller arriving today should still be able
-- to take a couch for tonight.
set local role postgres;
insert into public.trips (id, profile_id, city_id, start_date, end_date, needs)
values ('aaaa0000-0000-0000-0000-000000000003',
        '11111111-1111-1111-1111-111111111111',
        (select id from public.cities where name = 'Munich' limit 1),
        current_date - 2, current_date, array['couch']);

insert into public.availability (profile_id, city_id, start_date, end_date, offers)
values ('22222222-2222-2222-2222-222222222222',
        (select id from public.cities where name = 'Munich' limit 1),
        current_date - 3, current_date, array['couch']);

insert into public.offers (id, trip_id, from_profile, to_profile, start_date, end_date)
values ('dddd0000-0000-0000-0000-000000000003',
        'aaaa0000-0000-0000-0000-000000000003',
        '22222222-2222-2222-2222-222222222222', '11111111-1111-1111-1111-111111111111',
        current_date, current_date);

select is(
  (select public.accept_offer('dddd0000-0000-0000-0000-000000000003',
                              '11111111-1111-1111-1111-111111111111') ->> 'ok'),
  'true',
  'a couch for tonight is still acceptable — the boundary is exclusive'
);

-- ── the sweep ──────────────────────────────────────────────────────────────
-- Three rows sit on the trip that ended: the host_stay request, the
-- co-accommodation request added above, and the offer.
select is(
  (select public.expire_stale_requests_and_offers()),
  3,
  'the sweep expires both stale requests and the stale offer, and nothing else'
);

select is(
  (select status::text from public.requests
    where id = 'cccc0000-0000-0000-0000-000000000001'),
  'expired',
  'a request whose trip has ended is expired'
);

select is(
  (select status::text from public.offers
    where id = 'dddd0000-0000-0000-0000-000000000001'),
  'expired',
  'an offer whose nights have passed is expired'
);

select is(
  (select status::text from public.requests
    where id = 'cccc0000-0000-0000-0000-000000000002'),
  'pending',
  'a request for a trip still to come is untouched'
);

select is(
  (select status::text from public.offers
    where id = 'dddd0000-0000-0000-0000-000000000002'),
  'pending',
  'an offer for nights still to come is untouched'
);

select is(
  (select responded_at from public.requests
    where id = 'cccc0000-0000-0000-0000-000000000001'),
  null,
  'expiry leaves responded_at null — nobody responded, the dates just ran out'
);

select is(
  (select count(*)::int from public.notifications
    where profile_id = '22222222-2222-2222-2222-222222222222'
      and type in ('offer_declined', 'request_withdrawn')),
  0,
  'expiry notifies nobody — tidying away a dead request is not news'
);

select is(
  (select public.expire_stale_requests_and_offers()),
  0,
  'a second sweep finds nothing left to do'
);

-- ── an already-accepted offer survives its own dates ───────────────────────
-- Idempotency has to outlive the stay: a traveller reopening the app after the
-- trip must still reach the contact card, not an "expired" error.
select is(
  (select public.accept_offer('dddd0000-0000-0000-0000-000000000003',
                              '11111111-1111-1111-1111-111111111111') ->> 'ok'),
  'true',
  'accepting an already-accepted offer still returns its stay after the nights pass'
);

select * from finish();
rollback;
