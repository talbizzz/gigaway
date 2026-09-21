-- Verification and report decisions (Milestone 6, phase 6, part 1).
--
-- Both functions do nothing but the same UPDATE MODERATION.md's manual SQL
-- already performs, so what's actually under test is the gate (is_admin()),
-- the validation (only real decision values), and that the EXISTING
-- triggers still fire the same downstream effects they always have —
-- profile promotion for verification, nothing-but-a-record for reports.

begin;

set local role postgres;
select plan(31);

insert into auth.users (id, email, raw_user_meta_data) values
  ('a0000000-0000-0000-0000-000000000001', 'admin@example.test',
   '{"display_name":"Admin One"}'::jsonb),
  ('b0000000-0000-0000-0000-000000000002', 'anna@example.test',
   '{"display_name":"Anna Weber","discipline":"voice"}'::jsonb),
  ('c0000000-0000-0000-0000-000000000003', 'bruno@example.test',
   '{"display_name":"Bruno Kraus","discipline":"strings"}'::jsonb),
  ('f0000000-0000-0000-0000-000000000004', 'carla@example.test',
   '{"display_name":"Carla Ortiz","discipline":"dance"}'::jsonb),
  ('f0000000-0000-0000-0000-000000000005', 'dora@example.test',
   '{"display_name":"Dora Vance","discipline":"winds"}'::jsonb);

insert into public.admin_users (id, display_name)
values ('a0000000-0000-0000-0000-000000000001', 'Admin One');

-- Anna's profile stays 'pending' (the default) — that's what lets the
-- approval test below prove handle_verification_decision actually promoted
-- it, rather than it having been approved some other way.
insert into public.verification_applications
  (id, profile_id, full_legal_name, selfie_prompt, links, status)
values
  ('dddd0000-0000-0000-0000-000000000001',
   'b0000000-0000-0000-0000-000000000002',
   'Anna Weber', 'thumbs up', '["https://annaweber.example"]'::jsonb, 'pending');

update public.profiles set status = 'approved'
  where id = 'c0000000-0000-0000-0000-000000000003';

-- Carla will be rejected, reapply, and eventually be approved; Dora is
-- suspended while an application of hers is still open.
insert into public.verification_applications
  (id, profile_id, full_legal_name, selfie_prompt, links, status)
values
  ('dddd0000-0000-0000-0000-000000000002', 'f0000000-0000-0000-0000-000000000004',
   'Carla Ortiz', 'thumbs up', '["https://carla.example"]'::jsonb, 'pending'),
  ('dddd0000-0000-0000-0000-000000000003', 'f0000000-0000-0000-0000-000000000005',
   'Dora Vance', 'thumbs up', '["https://dora.example"]'::jsonb, 'pending');

update public.profiles set status = 'suspended'
  where id = 'f0000000-0000-0000-0000-000000000005';

insert into public.reports (id, reporter_id, subject_id, category, body)
values ('eeee0000-0000-0000-0000-000000000001',
        'c0000000-0000-0000-0000-000000000003',
        'b0000000-0000-0000-0000-000000000002',
        'no_show', 'Did not show up.');

-- ── anon: no grant at all ────────────────────────────────────────────────

set local role anon;

select throws_ok(
  $$ select public.admin_decide_verification(
       'dddd0000-0000-0000-0000-000000000001', 'approved') $$,
  '42501', null,
  'anon has no grant to call admin_decide_verification'
);

select throws_ok(
  $$ select public.admin_decide_report(
       'eeee0000-0000-0000-0000-000000000001', 'actioned') $$,
  '42501', null,
  'nor admin_decide_report'
);

-- ── an ordinary member: grant exists, is_admin() raises from inside ─────

set local role authenticated;
set local request.jwt.claims to
  '{"sub":"c0000000-0000-0000-0000-000000000003","role":"authenticated"}';

select throws_ok(
  $$ select public.admin_decide_verification(
       'dddd0000-0000-0000-0000-000000000001', 'approved') $$,
  'P0001', 'not authorized',
  'a non-admin cannot decide a verification application'
);

select throws_ok(
  $$ select public.admin_decide_report(
       'eeee0000-0000-0000-0000-000000000001', 'actioned') $$,
  'P0001', 'not authorized',
  'nor a report'
);

-- ── the admin ────────────────────────────────────────────────────────────

set local request.jwt.claims to
  '{"sub":"a0000000-0000-0000-0000-000000000001","role":"authenticated"}';

select throws_ok(
  $$ select public.admin_decide_verification(
       'dddd0000-0000-0000-0000-000000000001', 'pending') $$,
  'P0001', null,
  'even the admin cannot set an invented decision — only approved/rejected'
);

select throws_ok(
  $$ select public.admin_decide_verification(gen_random_uuid(), 'approved') $$,
  'P0001', null,
  'and an application that does not exist is refused'
);

select lives_ok(
  $$ select public.admin_decide_verification(
       'dddd0000-0000-0000-0000-000000000001', 'approved',
       'Conservatory enrolment confirmed.') $$,
  'the admin can approve Anna''s application'
);

-- Reading state back has to happen as postgres, not as the acting admin's
-- `authenticated` role: RLS legitimately hides another member's application
-- and a not-yet-approved profile from a role that isn't that member (the
-- admin's own JWT claims are still set, so admin_audit_log() still resolves
-- them correctly). Found by running this against a live database — reading
-- as `authenticated` returned NULL, which looked like the function failing.
set local role postgres;

select is(
  (select status::text from public.verification_applications
    where id = 'dddd0000-0000-0000-0000-000000000001'),
  'approved',
  'the application itself is marked approved'
);

select is(
  (select decision_reason from public.verification_applications
    where id = 'dddd0000-0000-0000-0000-000000000001'),
  'Conservatory enrolment confirmed.',
  'and carries the reason given'
);

select is(
  (select status::text from public.profiles
    where id = 'b0000000-0000-0000-0000-000000000002'),
  'approved',
  'handle_verification_decision (unmodified) promoted Anna''s profile'
);

select ok(
  (select verified_at from public.profiles
    where id = 'b0000000-0000-0000-0000-000000000002') is not null,
  'and stamped verified_at'
);

select is(
  (select count(*)::int from public.admin_audit_log()
    where action = 'decide_verification'
      and target_id = 'dddd0000-0000-0000-0000-000000000001'),
  1,
  'and the decision is logged'
);

set local role authenticated;

select throws_ok(
  $$ select public.admin_decide_report(
       'eeee0000-0000-0000-0000-000000000001', 'open') $$,
  'P0001', null,
  'even the admin cannot set a report to an invented status'
);

select throws_ok(
  $$ select public.admin_decide_report(gen_random_uuid(), 'actioned') $$,
  'P0001', null,
  'and a report that does not exist is refused'
);

select lives_ok(
  $$ select public.admin_decide_report(
       'eeee0000-0000-0000-0000-000000000001', 'actioned',
       'Suspended pending reply.') $$,
  'the admin can action the report'
);

-- reports has no client grant at all (revoke all from authenticated), so
-- reading it as the admin's own role is a hard `permission denied`, not an
-- empty result — and an uncaught one, which aborts the whole file.
set local role postgres;

select is(
  (select status::text from public.reports
    where id = 'eeee0000-0000-0000-0000-000000000001'),
  'actioned',
  'the report status updates'
);

select is(
  (select moderator_note from public.reports
    where id = 'eeee0000-0000-0000-0000-000000000001'),
  'Suspended pending reply.',
  'along with the moderator note'
);

select ok(
  (select resolved_at from public.reports
    where id = 'eeee0000-0000-0000-0000-000000000001') is not null,
  'and resolved_at is stamped'
);

-- ── a member rejected once can be approved later ─────────────────────────
-- The bug this guards: submit-verification reopens a rejected application to
-- 'pending' without touching the profile, and the decision trigger only
-- promotes a 'pending' profile — so approving the reapplication flipped the
-- application and left the member locked out, with the admin told it worked.

set local role authenticated;

select lives_ok(
  $$ select public.admin_decide_verification(
       'dddd0000-0000-0000-0000-000000000002', 'rejected', 'No proof of standing.') $$,
  'the admin rejects Carla'
);

set local role postgres;

select is(
  (select status::text from public.profiles
    where id = 'f0000000-0000-0000-0000-000000000004'),
  'rejected',
  'and her profile is rejected'
);

-- What submit-verification does when a rejected member reapplies.
select lives_ok(
  $$ insert into public.verification_applications
       (profile_id, full_legal_name, selfie_prompt, links, status,
        reviewed_at, reviewed_by, decision_reason)
     values ('f0000000-0000-0000-0000-000000000004', 'Carla Ortiz', 'make a fist',
             '["https://carla.example/new"]'::jsonb, 'pending', null, null, null)
     on conflict (profile_id) do update set
       selfie_prompt = excluded.selfie_prompt, links = excluded.links,
       status = excluded.status, reviewed_at = excluded.reviewed_at,
       reviewed_by = excluded.reviewed_by, decision_reason = excluded.decision_reason $$,
  'Carla reapplies with updated details'
);

select is(
  (select status::text from public.profiles
    where id = 'f0000000-0000-0000-0000-000000000004'),
  'pending',
  'and her profile moves back to pending while that is decided'
);

set local role authenticated;

select lives_ok(
  $$ select public.admin_decide_verification(
       'dddd0000-0000-0000-0000-000000000002', 'rejected', 'Still not enough.') $$,
  'a second rejection works'
);

set local role postgres;

select is(
  (select status::text from public.profiles
    where id = 'f0000000-0000-0000-0000-000000000004'),
  'rejected',
  'and the profile is rejected again'
);

select lives_ok(
  $$ insert into public.verification_applications
       (profile_id, full_legal_name, selfie_prompt, links, status,
        reviewed_at, reviewed_by, decision_reason)
     values ('f0000000-0000-0000-0000-000000000004', 'Carla Ortiz', 'point up',
             '["https://carla.example/final"]'::jsonb, 'pending', null, null, null)
     on conflict (profile_id) do update set
       selfie_prompt = excluded.selfie_prompt, links = excluded.links,
       status = excluded.status, reviewed_at = excluded.reviewed_at,
       reviewed_by = excluded.reviewed_by, decision_reason = excluded.decision_reason $$,
  'she reapplies once more'
);

set local role authenticated;

select lives_ok(
  $$ select public.admin_decide_verification(
       'dddd0000-0000-0000-0000-000000000002', 'approved', 'Portfolio confirmed.') $$,
  'and the admin approves her'
);

set local role postgres;

select is(
  (select status::text from public.profiles
    where id = 'f0000000-0000-0000-0000-000000000004'),
  'approved',
  'the profile is approved — a member rejected before is not locked out for good'
);

select ok(
  (select verified_at from public.profiles
    where id = 'f0000000-0000-0000-0000-000000000004') is not null,
  'and verified_at is stamped'
);

-- ── an approval that cannot take effect must fail, not half-apply ────────

set local role authenticated;

select throws_ok(
  $$ select public.admin_decide_verification(
       'dddd0000-0000-0000-0000-000000000003', 'approved') $$,
  'P0001', null,
  'approving a suspended member''s application is refused rather than silently half-applied'
);

set local role postgres;

select is(
  (select status::text from public.verification_applications
    where id = 'dddd0000-0000-0000-0000-000000000003'),
  'pending',
  'and the refused approval left the application pending — it was rolled back'
);

select is(
  (select status::text from public.profiles
    where id = 'f0000000-0000-0000-0000-000000000005'),
  'suspended',
  'and she is still suspended'
);

select * from finish();
rollback;
