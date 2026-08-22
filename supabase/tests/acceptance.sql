-- accept_offer and accept_co_request: the transaction the whole product turns
-- on.
--
-- The two tests that matter most here are the sibling auto-decline and the
-- idempotent double-accept. Partial application — a grant with no stay, or two
-- stays from one offer — is the worst failure mode GigAway has, and a double
-- tap on a bad connection is the likeliest way to cause it.

begin;

-- `supabase test db --linked` connects as cli_login_postgres, a NOINHERIT role
-- the CLI recreates on every run, so the privileges these fixtures need (writing
-- to auth.users) must be claimed explicitly. Locally this is a no-op.
set local role postgres;
select plan(30);

-- ── fixtures ───────────────────────────────────────────────────────────────
-- Anna travels to Munich. Bruno and Clara both offer her a couch; Dieter is an
-- uninvolved third party.
insert into auth.users (id, email, raw_user_meta_data) values
  ('11111111-1111-1111-1111-111111111111', 'anna@example.test',
   '{"display_name":"Anna Weber","discipline":"voice"}'::jsonb),
  ('22222222-2222-2222-2222-222222222222', 'bruno@example.test',
   '{"display_name":"Bruno Kraus","discipline":"strings"}'::jsonb),
  ('33333333-3333-3333-3333-333333333333', 'clara@example.test',
   '{"display_name":"Clara Ortiz","discipline":"dance"}'::jsonb),
  ('44444444-4444-4444-4444-444444444444', 'dieter@example.test',
   '{"display_name":"Dieter Hahn","discipline":"brass"}'::jsonb);

update public.profiles set status = 'approved';

update public.contact_details
  set phone = '+49 170 1234567', whatsapp = '+49 170 1234567',
      preferred_channel = 'whatsapp'
  where profile_id = '22222222-2222-2222-2222-222222222222';

insert into public.trips (id, profile_id, city_id, start_date, end_date, needs)
values ('aaaa0000-0000-0000-0000-000000000001',
        '11111111-1111-1111-1111-111111111111',
        (select id from public.cities where name = 'Munich' limit 1),
        '2027-03-03', '2027-03-10', array['couch','co_accommodation']);

insert into public.availability (profile_id, city_id, start_date, end_date, offers)
values
  ('22222222-2222-2222-2222-222222222222',
   (select id from public.cities where name = 'Munich' limit 1),
   '2027-03-01', '2027-03-05', array['couch']),
  ('33333333-3333-3333-3333-333333333333',
   (select id from public.cities where name = 'Munich' limit 1),
   '2027-03-01', '2027-03-31', array['spare_room']);

insert into public.requests (id, kind, trip_id, from_profile, to_profile)
values ('cccc0000-0000-0000-0000-000000000001', 'host_stay',
        'aaaa0000-0000-0000-0000-000000000001',
        '11111111-1111-1111-1111-111111111111',
        '22222222-2222-2222-2222-222222222222');

-- Bruno answers with three of the seven nights. Clara offers the lot.
insert into public.offers (id, request_id, trip_id, from_profile, to_profile,
                           start_date, end_date)
values
  ('dddd0000-0000-0000-0000-000000000001',
   'cccc0000-0000-0000-0000-000000000001',
   'aaaa0000-0000-0000-0000-000000000001',
   '22222222-2222-2222-2222-222222222222',
   '11111111-1111-1111-1111-111111111111',
   '2027-03-03', '2027-03-05'),
  ('dddd0000-0000-0000-0000-000000000002',
   null,
   'aaaa0000-0000-0000-0000-000000000001',
   '33333333-3333-3333-3333-333333333333',
   '11111111-1111-1111-1111-111111111111',
   '2027-03-03', '2027-03-10');

-- ── guard rails before the happy path ──────────────────────────────────────
select is(
  (select public.accept_offer('dddd0000-0000-0000-0000-000000000001',
                              '33333333-3333-3333-3333-333333333333') ->> 'error'),
  'offer_not_found',
  'a member cannot accept an offer that was not made to them'
);

select is(
  (select public.accept_offer(gen_random_uuid(),
                              '11111111-1111-1111-1111-111111111111') ->> 'error'),
  'offer_not_found',
  'accepting an offer that does not exist is not_found, not a crash'
);

-- ── the happy path ─────────────────────────────────────────────────────────
select is(
  (select public.accept_offer('dddd0000-0000-0000-0000-000000000001',
                              '11111111-1111-1111-1111-111111111111') ->> 'ok'),
  'true',
  'the traveller accepts the three-night offer'
);

select is(
  (select status::text from public.offers
    where id = 'dddd0000-0000-0000-0000-000000000001'),
  'accepted',
  'the accepted offer is marked accepted'
);

select is(
  (select status::text from public.offers
    where id = 'dddd0000-0000-0000-0000-000000000002'),
  'declined',
  'accepting one offer auto-declines the others on the same trip'
);

select is(
  (select auto_declined from public.offers
    where id = 'dddd0000-0000-0000-0000-000000000002'),
  true,
  'the sibling is flagged auto_declined, so the copy can differ'
);

select is(
  (select status::text from public.requests
    where id = 'cccc0000-0000-0000-0000-000000000001'),
  'accepted',
  'the originating request is closed'
);

select is(
  (select count(*)::int from public.stays),
  1,
  'exactly one stay exists'
);

select is(
  (select (start_date::text || '/' || end_date::text) from public.stays),
  '2027-03-03/2027-03-05',
  'the stay records the OFFERED nights, not the whole trip'
);

select is(
  (select city_id from public.stays),
  (select id from public.cities where name = 'Munich' limit 1),
  'the stay records the city the guest sleeps in'
);

select is(
  (select count(*)::int from public.contact_grants
    where profile_a = least('11111111-1111-1111-1111-111111111111'::uuid,
                            '22222222-2222-2222-2222-222222222222'::uuid)
      and profile_b = greatest('11111111-1111-1111-1111-111111111111'::uuid,
                               '22222222-2222-2222-2222-222222222222'::uuid)
      and source = 'offer'),
  1,
  'a contact grant is created for the pair, in canonical order'
);

-- ── the reveal ─────────────────────────────────────────────────────────────
set local role authenticated;
set local request.jwt.claims to
  '{"sub":"11111111-1111-1111-1111-111111111111","role":"authenticated"}';

select is(
  (select whatsapp from public.contact_details
    where profile_id = '22222222-2222-2222-2222-222222222222'),
  '+49 170 1234567',
  'the traveller can now read the host''s WhatsApp number'
);

set local role postgres;
set local role authenticated;
set local request.jwt.claims to
  '{"sub":"22222222-2222-2222-2222-222222222222","role":"authenticated"}';

select is(
  (select count(*)::int from public.contact_details
    where profile_id = '11111111-1111-1111-1111-111111111111'),
  1,
  'the reveal is symmetric — the host can read the traveller''s details too'
);

-- The host whose offer was auto-declined must NOT get contact details.
set local role postgres;
set local role authenticated;
set local request.jwt.claims to
  '{"sub":"33333333-3333-3333-3333-333333333333","role":"authenticated"}';

select is(
  (select count(*)::int from public.contact_details
    where profile_id <> '33333333-3333-3333-3333-333333333333'),
  0,
  'an auto-declined host gets no contact details'
);

set local role postgres;
set local role authenticated;
set local request.jwt.claims to
  '{"sub":"44444444-4444-4444-4444-444444444444","role":"authenticated"}';

select is(
  (select count(*)::int from public.contact_details
    where profile_id <> '44444444-4444-4444-4444-444444444444'),
  0,
  'a third profile selecting the pair''s contact_details gets zero rows'
);

select is(
  (select count(*)::int from public.stays),
  0,
  'a third profile sees none of the pair''s stays'
);

-- ── idempotency ────────────────────────────────────────────────────────────
set local role postgres;

select is(
  (select public.accept_offer('dddd0000-0000-0000-0000-000000000001',
                              '11111111-1111-1111-1111-111111111111') ->> 'ok'),
  'true',
  'accepting the same offer twice succeeds rather than erroring'
);

select is(
  (select count(*)::int from public.stays),
  1,
  'the double accept created exactly one stay'
);

select is(
  (select count(*)::int from public.contact_grants where source = 'offer'),
  1,
  'the double accept created exactly one contact grant'
);

select is(
  (select public.accept_offer('dddd0000-0000-0000-0000-000000000001',
                              '11111111-1111-1111-1111-111111111111')
          ->> 'autoDeclinedCount'),
  '1',
  'the repeat accept reports the same auto-declined count'
);

-- ── notifications ──────────────────────────────────────────────────────────
select is(
  (select count(*)::int from public.notifications
    where type = 'offer_accepted'
      and profile_id = '22222222-2222-2222-2222-222222222222'),
  1,
  'the host is notified that their offer was accepted'
);

select is(
  (select count(*)::int from public.notifications
    where type = 'offer_confirmed'
      and profile_id = '11111111-1111-1111-1111-111111111111'),
  1,
  'the traveller gets their own confirmation'
);

select is(
  (select (payload ->> 'autoDeclined') from public.notifications
    where type = 'offer_declined'
      and profile_id = '33333333-3333-3333-3333-333333333333'),
  'true',
  'the auto-declined host is told, and the payload says it was automatic'
);

select is(
  (select count(*)::int from public.notifications n
    where n.payload::text ~* '(\+49|@example\.test|1234567)'),
  0,
  'no notification payload carries a phone number or an email address'
);

-- ── rejections ─────────────────────────────────────────────────────────────
select is(
  (select public.accept_offer('dddd0000-0000-0000-0000-000000000002',
                              '11111111-1111-1111-1111-111111111111') ->> 'error'),
  'offer_not_pending',
  'an auto-declined offer can no longer be accepted'
);

-- ── co-accommodation: no offer step, and no stay ───────────────────────────
insert into public.trips (id, profile_id, city_id, start_date, end_date, needs)
values ('aaaa0000-0000-0000-0000-000000000002',
        '44444444-4444-4444-4444-444444444444',
        (select id from public.cities where name = 'Munich' limit 1),
        '2027-03-04', '2027-03-08', array['co_accommodation']);

insert into public.requests (id, kind, trip_id, from_profile, to_profile)
values ('cccc0000-0000-0000-0000-000000000002', 'co_accommodation',
        'aaaa0000-0000-0000-0000-000000000002',
        '44444444-4444-4444-4444-444444444444',
        '11111111-1111-1111-1111-111111111111');

select is(
  (select public.accept_co_request('cccc0000-0000-0000-0000-000000000001',
                                   '22222222-2222-2222-2222-222222222222') ->> 'error'),
  'request_not_found',
  'accept_co_request refuses a host_stay request'
);

select is(
  (select public.accept_co_request('cccc0000-0000-0000-0000-000000000002',
                                   '11111111-1111-1111-1111-111111111111')
          ->> 'grantedWith'),
  '44444444-4444-4444-4444-444444444444',
  'a co-accommodation request is accepted directly, with no offer step'
);

select is(
  (select count(*)::int from public.contact_grants where source = 'co_request'),
  1,
  'accepting a co-accommodation request reveals contact'
);

select is(
  (select count(*)::int from public.stays),
  1,
  'co-accommodation creates NO stay — nobody hosted anybody'
);

select is(
  (select count(*)::int from public.notifications where type = 'co_request_accepted'),
  2,
  'both travellers are told the co-accommodation request was accepted'
);

select * from finish();
rollback;
