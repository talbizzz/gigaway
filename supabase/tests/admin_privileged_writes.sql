-- Admin privileged writes (Milestone 6, phase 5, part 1).
--
-- Unlike the phase 2 read functions, these raise rather than return quietly
-- — a write that silently no-ops for a non-admin would be worse than one
-- that errors loudly. Both are granted to `authenticated` (unlike
-- log_admin_action), so a non-admin reaches the function body and is_admin()
-- raises from inside it — 'P0001', not the 42501 a missing grant would give.

begin;

set local role postgres;
select plan(16);

insert into auth.users (id, email, raw_user_meta_data) values
  ('a0000000-0000-0000-0000-000000000001', 'admin@example.test',
   '{"display_name":"Admin One"}'::jsonb),
  ('b0000000-0000-0000-0000-000000000002', 'anna@example.test',
   '{"display_name":"Anna Weber","discipline":"voice"}'::jsonb),
  ('c0000000-0000-0000-0000-000000000003', 'bruno@example.test',
   '{"display_name":"Bruno Kraus","discipline":"strings"}'::jsonb);

insert into public.admin_users (id, display_name)
values ('a0000000-0000-0000-0000-000000000001', 'Admin One');

update public.profiles set status = 'approved';

-- A trip with no stay — the one the successful delete test removes.
insert into public.trips (id, profile_id, city_id, start_date, end_date, needs)
values ('aaaa0000-0000-0000-0000-000000000001',
        'b0000000-0000-0000-0000-000000000002',
        (select id from public.cities where name = 'Munich' limit 1),
        '2027-03-03', '2027-03-10', array['couch']);

-- A trip that already produced a stay — admin_delete_trip must refuse this
-- one, the same protection delete_account already gives its own case.
insert into public.trips (id, profile_id, city_id, start_date, end_date, needs)
values ('aaaa0000-0000-0000-0000-000000000002',
        'b0000000-0000-0000-0000-000000000002',
        (select id from public.cities where name = 'Munich' limit 1),
        '2027-04-01', '2027-04-05', array['couch']);

-- enforce_offer_range (a BEFORE INSERT trigger, unconditional on role) requires
-- the host to have posted availability covering the offered nights, or the
-- insert below raises rather than silently accepting city_id.
insert into public.availability (profile_id, city_id, start_date, end_date, offers)
values ('c0000000-0000-0000-0000-000000000003',
        (select id from public.cities where name = 'Munich' limit 1),
        '2027-04-01', '2027-04-05', array['couch']);

insert into public.offers (id, trip_id, from_profile, to_profile, city_id, start_date, end_date, status)
values ('bbbb0000-0000-0000-0000-000000000001',
        'aaaa0000-0000-0000-0000-000000000002',
        'c0000000-0000-0000-0000-000000000003',
        'b0000000-0000-0000-0000-000000000002',
        (select id from public.cities where name = 'Munich' limit 1),
        '2027-04-01', '2027-04-05', 'accepted');

insert into public.stays (id, offer_id, host_id, guest_id, city_id, start_date, end_date)
values ('cccc0000-0000-0000-0000-000000000001',
        'bbbb0000-0000-0000-0000-000000000001',
        'c0000000-0000-0000-0000-000000000003',
        'b0000000-0000-0000-0000-000000000002',
        (select id from public.cities where name = 'Munich' limit 1),
        '2027-04-01', '2027-04-05');

-- ── anon: no grant at all ────────────────────────────────────────────────

set local role anon;

select throws_ok(
  $$ select public.admin_set_user_status(
       'b0000000-0000-0000-0000-000000000002', 'suspended') $$,
  '42501', null,
  'anon has no grant to call admin_set_user_status'
);

select throws_ok(
  $$ select public.admin_delete_trip('aaaa0000-0000-0000-0000-000000000001') $$,
  '42501', null,
  'nor admin_delete_trip'
);

-- ── an ordinary member: grant exists, is_admin() raises from inside ─────

set local role authenticated;
set local request.jwt.claims to
  '{"sub":"b0000000-0000-0000-0000-000000000002","role":"authenticated"}';

select throws_ok(
  $$ select public.admin_set_user_status(
       'c0000000-0000-0000-0000-000000000003', 'suspended') $$,
  'P0001', 'not authorized',
  'a non-admin cannot suspend anyone, including someone else'
);

select throws_ok(
  $$ select public.admin_delete_trip('aaaa0000-0000-0000-0000-000000000001') $$,
  'P0001', 'not authorized',
  'nor delete a trip'
);

select is(
  (select status::text from public.profiles
    where id = 'c0000000-0000-0000-0000-000000000003'),
  'approved',
  'and Bruno is untouched by the attempt'
);

-- ── the admin ────────────────────────────────────────────────────────────

set local request.jwt.claims to
  '{"sub":"a0000000-0000-0000-0000-000000000001","role":"authenticated"}';

select throws_ok(
  $$ select public.admin_set_user_status(
       'c0000000-0000-0000-0000-000000000003', 'deleted') $$,
  'P0001', null,
  'even the admin cannot set an arbitrary status — only approved/suspended'
);

select throws_ok(
  $$ select public.admin_set_user_status(gen_random_uuid(), 'suspended') $$,
  'P0001', null,
  'and a profile that does not exist is refused, not silently accepted'
);

select lives_ok(
  $$ select public.admin_set_user_status(
       'c0000000-0000-0000-0000-000000000003', 'suspended') $$,
  'the admin can suspend Bruno'
);

-- Read back through admin_get_user_detail, not `select ... from profiles`:
-- a suspended member is deliberately invisible to other members through
-- RLS (that IS what suspension does), so a plain read as the acting admin's
-- `authenticated` role returns NULL and looks like the update failed. This
-- is also exactly how the admin UI reads it.
select is(
  (select status::text from public.admin_get_user_detail(
     'c0000000-0000-0000-0000-000000000003')),
  'suspended',
  'and it takes effect immediately'
);

select is(
  (select count(*)::int from public.admin_audit_log()
    where action = 'set_user_status' and target_id = 'c0000000-0000-0000-0000-000000000003'),
  1,
  'and is logged'
);

select lives_ok(
  $$ select public.admin_set_user_status(
       'c0000000-0000-0000-0000-000000000003', 'approved') $$,
  'and can reinstate him'
);

-- ── deleting trips ───────────────────────────────────────────────────────

select throws_ok(
  $$ select public.admin_delete_trip('aaaa0000-0000-0000-0000-000000000002') $$,
  'P0001', null,
  'a trip that already produced a stay cannot be deleted — it would erase '
  'the other member''s review history'
);

-- Raw reads as postgres so RLS can't make a row look absent that isn't —
-- and a positive control before the delete, so "gone" below can't pass just
-- because the row was never visible to begin with.
set local role postgres;

select is(
  (select count(*)::int from public.trips
    where id = 'aaaa0000-0000-0000-0000-000000000002'),
  1,
  'and it is untouched'
);

select is(
  (select count(*)::int from public.trips
    where id = 'aaaa0000-0000-0000-0000-000000000001'),
  1,
  'the deletable trip exists before the delete'
);

set local role authenticated;

select lives_ok(
  $$ select public.admin_delete_trip('aaaa0000-0000-0000-0000-000000000001') $$,
  'but a trip with no stay can be deleted'
);

set local role postgres;

select is(
  (select count(*)::int from public.trips
    where id = 'aaaa0000-0000-0000-0000-000000000001'),
  0,
  'and it is actually gone'
);

select * from finish();
rollback;
