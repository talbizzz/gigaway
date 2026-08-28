-- Blocking: total mutual invisibility, without erasing history.
--
-- Two things are being proved here at once. The obvious one is that a blocked
-- pair cannot see each other anywhere. The subtler one is that blocking is
-- SILENT — the blocked party must not be able to infer it, which rules out
-- both reading the blocks table and receiving a "withdrew their request"
-- notification the instant it happens.

begin;

-- `supabase test db --linked` connects as cli_login_postgres, a NOINHERIT role
-- the CLI recreates on every run, so the privileges these fixtures need (writing
-- to auth.users) must be claimed explicitly. Locally this is a no-op.
set local role postgres;
select plan(32);

insert into auth.users (id, email, raw_user_meta_data) values
  ('11111111-1111-1111-1111-111111111111', 'anna@example.test',
   '{"display_name":"Anna Weber","discipline":"voice"}'::jsonb),
  ('22222222-2222-2222-2222-222222222222', 'bruno@example.test',
   '{"display_name":"Bruno Kraus","discipline":"strings"}'::jsonb),
  ('33333333-3333-3333-3333-333333333333', 'clara@example.test',
   '{"display_name":"Clara Ortiz","discipline":"dance"}'::jsonb);

update public.profiles set status = 'approved';

update public.contact_details
  set phone = '+49 170 1234567', preferred_channel = 'phone'
  where profile_id = '22222222-2222-2222-2222-222222222222';

-- Anna travels to Munich twice. Bruno hosts there and is free throughout.
-- Clara is an uninvolved third party who must be unaffected by any of this.
insert into public.trips (id, profile_id, city_id, start_date, end_date, needs) values
  ('aaaa0000-0000-0000-0000-000000000001',
   '11111111-1111-1111-1111-111111111111',
   (select id from public.cities where name = 'Munich' limit 1),
   '2027-03-03', '2027-03-10', array['couch']),
  ('aaaa0000-0000-0000-0000-000000000002',
   '11111111-1111-1111-1111-111111111111',
   (select id from public.cities where name = 'Munich' limit 1),
   '2027-05-03', '2027-05-10', array['couch']);

-- Two windows rather than one: the 60-night cap from Milestone 2 rules out a
-- single March-to-May block, and one window per trip is truer to how a host
-- actually posts anyway.
insert into public.availability (profile_id, city_id, start_date, end_date, offers) values
  ('22222222-2222-2222-2222-222222222222',
   (select id from public.cities where name = 'Munich' limit 1),
   '2027-03-01', '2027-03-31', array['couch']),
  ('22222222-2222-2222-2222-222222222222',
   (select id from public.cities where name = 'Munich' limit 1),
   '2027-05-01', '2027-05-31', array['couch']);

-- Trip 1 runs the whole way through to an accepted stay.
insert into public.requests (id, kind, trip_id, from_profile, to_profile)
values ('cccc0000-0000-0000-0000-000000000001', 'host_stay',
        'aaaa0000-0000-0000-0000-000000000001',
        '11111111-1111-1111-1111-111111111111', '22222222-2222-2222-2222-222222222222');

insert into public.offers (id, request_id, trip_id, from_profile, to_profile,
                           start_date, end_date)
values ('dddd0000-0000-0000-0000-000000000001',
        'cccc0000-0000-0000-0000-000000000001',
        'aaaa0000-0000-0000-0000-000000000001',
        '22222222-2222-2222-2222-222222222222', '11111111-1111-1111-1111-111111111111',
        '2027-03-03', '2027-03-05');

select is(
  (select public.accept_offer('dddd0000-0000-0000-0000-000000000001',
                              '11111111-1111-1111-1111-111111111111') ->> 'ok'),
  'true',
  'trip one produced a real stay before anybody blocked anybody'
);

-- Trip 2 is left mid-flight: a pending request and a pending offer.
insert into public.requests (id, kind, trip_id, from_profile, to_profile)
values ('cccc0000-0000-0000-0000-000000000002', 'host_stay',
        'aaaa0000-0000-0000-0000-000000000002',
        '11111111-1111-1111-1111-111111111111', '22222222-2222-2222-2222-222222222222');

insert into public.offers (id, request_id, trip_id, from_profile, to_profile,
                           start_date, end_date)
values ('dddd0000-0000-0000-0000-000000000002',
        'cccc0000-0000-0000-0000-000000000002',
        'aaaa0000-0000-0000-0000-000000000002',
        '22222222-2222-2222-2222-222222222222', '11111111-1111-1111-1111-111111111111',
        '2027-05-03', '2027-05-06');

-- ── before the block ───────────────────────────────────────────────────────
set local role authenticated;
set local request.jwt.claims to
  '{"sub":"11111111-1111-1111-1111-111111111111","role":"authenticated"}';

select is(
  (select count(*)::int from public.profiles
    where id = '22222222-2222-2222-2222-222222222222'),
  1,
  'before the block, the two members can see each other'
);

select is(
  (select jsonb_array_length(
     public.search_matches('aaaa0000-0000-0000-0000-000000000002') -> 'hosts')),
  1,
  'and the host appears in search_matches'
);

select is(
  (select phone from public.contact_details
    where profile_id = '22222222-2222-2222-2222-222222222222'),
  '+49 170 1234567',
  'and the accepted stay has revealed contact details'
);

-- ── Anna blocks Bruno ──────────────────────────────────────────────────────
select lives_ok(
  $$ insert into public.blocks (blocker_id, blocked_id)
     values ('11111111-1111-1111-1111-111111111111',
             '22222222-2222-2222-2222-222222222222') $$,
  'a member can block another member'
);

select throws_ok(
  $$ insert into public.blocks (blocker_id, blocked_id)
     values ('11111111-1111-1111-1111-111111111111',
             '11111111-1111-1111-1111-111111111111') $$,
  '23514',
  null,
  'nobody can block themselves'
);

select throws_ok(
  $$ insert into public.blocks (blocker_id, blocked_id)
     values ('33333333-3333-3333-3333-333333333333',
             '22222222-2222-2222-2222-222222222222') $$,
  '42501',
  null,
  'a member cannot block on somebody else''s behalf'
);

-- ── the blocker's view ─────────────────────────────────────────────────────
select is(
  (select count(*)::int from public.profiles
    where id = '22222222-2222-2222-2222-222222222222'),
  0,
  'the blocked member''s profile is gone'
);

select is(
  (select count(*)::int from public.availability
    where profile_id = '22222222-2222-2222-2222-222222222222'),
  0,
  'their availability is gone'
);

select is(
  (select jsonb_array_length(
     public.search_matches('aaaa0000-0000-0000-0000-000000000002') -> 'hosts')),
  0,
  'and they no longer appear in search_matches'
);

select is(
  (select count(*)::int from public.requests
    where to_profile = '22222222-2222-2222-2222-222222222222'),
  0,
  'requests between the pair are invisible'
);

select is(
  (select count(*)::int from public.offers
    where from_profile = '22222222-2222-2222-2222-222222222222'),
  0,
  'offers between the pair are invisible'
);

select is(
  (select count(*)::int from public.contact_details
    where profile_id = '22222222-2222-2222-2222-222222222222'),
  0,
  'the revealed contact details are withdrawn from view'
);

select is(
  (select count(*)::int from public.contact_grants),
  0,
  'and the grant itself no longer shows in the contacts list'
);

-- ── history survives ───────────────────────────────────────────────────────
-- Blocking must never become a way to erase a stay, because Milestone 4 hangs
-- reviews off it and a blocked bad review would be reputation laundering.
select is(
  (select count(*)::int from public.stays),
  1,
  'the stay itself SURVIVES the block — history is not erasable'
);

-- ── the blocked party's view: symmetric, and silent ────────────────────────
set local role postgres;
set local role authenticated;
set local request.jwt.claims to
  '{"sub":"22222222-2222-2222-2222-222222222222","role":"authenticated"}';

select is(
  (select count(*)::int from public.profiles
    where id = '11111111-1111-1111-1111-111111111111'),
  0,
  'the block is symmetric — the blocked party cannot see the blocker either'
);

select is(
  (select count(*)::int from public.trips
    where profile_id = '11111111-1111-1111-1111-111111111111'),
  0,
  'nor their trips'
);

select is(
  (select count(*)::int from public.requests),
  0,
  'nor the requests they received'
);

select is(
  (select count(*)::int from public.offers),
  0,
  'nor the offers they made'
);

select is(
  (select count(*)::int from public.blocks),
  0,
  'THE BLOCKED PARTY CANNOT SEE THE BLOCK — blocking works quietly or not at all'
);

select is(
  (select count(*)::int from public.stays),
  1,
  'but their own stay history is untouched'
);

-- ── pending work between the pair was closed ───────────────────────────────
set local role postgres;

select is(
  (select status::text from public.requests
    where id = 'cccc0000-0000-0000-0000-000000000002'),
  'withdrawn',
  'the pending request between the pair was withdrawn'
);

select is(
  (select status::text from public.offers
    where id = 'dddd0000-0000-0000-0000-000000000002'),
  'withdrawn',
  'and so was the pending offer'
);

select is(
  (select status::text from public.offers
    where id = 'dddd0000-0000-0000-0000-000000000001'),
  'accepted',
  'the already-accepted offer is left alone'
);

-- The withdrawal must not announce itself. A "withdrew their request"
-- notification arriving the moment somebody blocks you IS the block, told.
select is(
  (select count(*)::int from public.notifications
    where type = 'request_withdrawn'
      and profile_id = '22222222-2222-2222-2222-222222222222'),
  0,
  'no notification was sent about the withdrawal — that would announce the block'
);

select is(
  (select public.enqueue_notification(
     '22222222-2222-2222-2222-222222222222',
     'offer_received',
     '{"fromProfileId":"11111111-1111-1111-1111-111111111111"}'::jsonb)),
  null,
  'and no future notification can cross the block either'
);

-- ── a third party is unaffected ────────────────────────────────────────────
set local role authenticated;
set local request.jwt.claims to
  '{"sub":"33333333-3333-3333-3333-333333333333","role":"authenticated"}';

select is(
  (select count(*)::int from public.profiles
    where id in ('11111111-1111-1111-1111-111111111111',
                 '22222222-2222-2222-2222-222222222222')),
  2,
  'an uninvolved member still sees both of them'
);

-- ── blocking prevents new contact ──────────────────────────────────────────
set local role postgres;
set local role authenticated;
set local request.jwt.claims to
  '{"sub":"11111111-1111-1111-1111-111111111111","role":"authenticated"}';

insert into public.trips (id, profile_id, city_id, start_date, end_date, needs)
values ('aaaa0000-0000-0000-0000-000000000003',
        '11111111-1111-1111-1111-111111111111',
        (select id from public.cities where name = 'Munich' limit 1),
        '2027-07-03', '2027-07-10', array['couch']);

select throws_ok(
  $$ insert into public.requests (kind, trip_id, from_profile, to_profile)
     values ('host_stay', 'aaaa0000-0000-0000-0000-000000000003',
             '11111111-1111-1111-1111-111111111111',
             '22222222-2222-2222-2222-222222222222') $$,
  '42501',
  null,
  'no new request can be sent across a block'
);

-- ── unblocking ─────────────────────────────────────────────────────────────
select lives_ok(
  $$ delete from public.blocks
     where blocked_id = '22222222-2222-2222-2222-222222222222' $$,
  'a member can unblock somebody they blocked'
);

select is(
  (select count(*)::int from public.profiles
    where id = '22222222-2222-2222-2222-222222222222'),
  1,
  'unblocking restores visibility'
);

select is(
  (select status::text from public.requests
    where id = 'cccc0000-0000-0000-0000-000000000002'),
  'withdrawn',
  'but it does NOT resurrect what the block withdrew — that was a real decision'
);

select is(
  (select phone from public.contact_details
    where profile_id = '22222222-2222-2222-2222-222222222222'),
  '+49 170 1234567',
  'and the earlier stay''s contact grant works again'
);

select * from finish();
rollback;
