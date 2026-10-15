-- Keeping who a member was, for a limited time, after they delete their account.
--
-- delete_account() copies identity into deletion_holds before it erases the
-- member: 30 days normally, 12 months if anyone reported them. A report made
-- afterwards extends it. Members removed after an ACTIONED report leave only
-- one-way fingerprints, which flag a repeat application to a moderator.

begin;

-- See rls_profiles.sql: the CLI's login role needs this to write auth.users.
set local role postgres;
select plan(29);

-- ── fixtures ───────────────────────────────────────────────────────────────
--   Anna   reported, and the report was ACTIONED
--   Bruno  has an OPEN report
--   Clara  clean
--   Dieter approved observer / reporter
--   Admin  a moderator
--   Frank  applies later under Anna's name
insert into auth.users (id, email, raw_user_meta_data) values
  ('11111111-1111-1111-1111-111111111111', 'anna@example.test',
   '{"first_name":"Anna","last_name":"Weber","discipline":"voice"}'::jsonb),
  ('22222222-2222-2222-2222-222222222222', 'bruno@example.test',
   '{"first_name":"Bruno","last_name":"Kraus","discipline":"strings"}'::jsonb),
  ('33333333-3333-3333-3333-333333333333', 'clara@example.test',
   '{"first_name":"Clara","last_name":"Ortiz","discipline":"dance"}'::jsonb),
  ('44444444-4444-4444-4444-444444444444', 'dieter@example.test',
   '{"first_name":"Dieter","last_name":"Hahn","discipline":"brass"}'::jsonb),
  ('a0000000-0000-0000-0000-000000000001', 'admin@example.test',
   '{"first_name":"Admin","last_name":"One"}'::jsonb),
  ('66666666-6666-6666-6666-666666666666', 'frank@example.test',
   '{"first_name":"Frank","last_name":"Lund","discipline":"winds"}'::jsonb);

insert into public.admin_users (id, display_name)
values ('a0000000-0000-0000-0000-000000000001', 'Admin One');

update public.profiles set status = 'approved'
  where id in ('11111111-1111-1111-1111-111111111111',
               '22222222-2222-2222-2222-222222222222',
               '33333333-3333-3333-3333-333333333333',
               '44444444-4444-4444-4444-444444444444');

insert into public.verification_applications
  (profile_id, full_legal_name, selfie_prompt, selfie_path, cv_path, links)
values
  ('11111111-1111-1111-1111-111111111111', 'Anna Maria Weber', 'p',
   '11111111-1111-1111-1111-111111111111/selfie.jpg', null, '["https://anna.example"]'::jsonb),
  ('33333333-3333-3333-3333-333333333333', 'Clara Ortiz', 'p',
   '33333333-3333-3333-3333-333333333333/selfie.jpg',
   '33333333-3333-3333-3333-333333333333/cv.pdf', '[]'::jsonb),
  ('66666666-6666-6666-6666-666666666666', 'ANNA  maria WEBER', 'p',
   '66666666-6666-6666-6666-666666666666/selfie.jpg', null, '["https://frank.example"]'::jsonb);

insert into public.reports (reporter_id, subject_id, category, body, status) values
  ('44444444-4444-4444-4444-444444444444', '11111111-1111-1111-1111-111111111111',
   'safety', 'x', 'actioned'),
  ('44444444-4444-4444-4444-444444444444', '22222222-2222-2222-2222-222222222222',
   'no_show', 'x', 'open');

-- ── deleting a clean member ────────────────────────────────────────────────
select ok(
  not (public.delete_account('33333333-3333-3333-3333-333333333333') ? 'selfiePath'),
  'deletion no longer hands the selfie path back to be deleted'
);

select results_eq(
  $$ select tier, held_until, email, full_legal_name, first_name, last_name,
            selfie_path, cv_path
       from public.deletion_holds
      where profile_id = '33333333-3333-3333-3333-333333333333' $$,
  $$ values ('standard'::text, now() + interval '30 days', 'clara@example.test'::text,
             'Clara Ortiz'::text, 'Clara'::text, 'Ortiz'::text,
             '33333333-3333-3333-3333-333333333333/selfie.jpg'::text,
             '33333333-3333-3333-3333-333333333333/cv.pdf'::text) $$,
  'a clean member is held for 30 days, with identity and the file paths'
);

select results_eq(
  $$ select status::text, first_name, display_name from public.profiles
      where id = '33333333-3333-3333-3333-333333333333' $$,
  $$ values ('deleted'::text, null::text, 'Deleted member'::text) $$,
  'while the profile itself is still erased to a tombstone'
);

select is(
  (select count(*)::int from public.verification_applications
    where profile_id = '33333333-3333-3333-3333-333333333333'),
  0,
  'and the application row is gone: the hold is the only copy'
);

-- ── reported members are held longer ───────────────────────────────────────
select public.delete_account('22222222-2222-2222-2222-222222222222');

select results_eq(
  $$ select tier, held_until from public.deletion_holds
      where profile_id = '22222222-2222-2222-2222-222222222222' $$,
  $$ values ('reported'::text, now() + interval '365 days') $$,
  'a member with an open report is held for 12 months'
);

select is(
  (select count(*)::int from public.conduct_bans where source_profile_id = '22222222-2222-2222-2222-222222222222'),
  0,
  'but an open report alone leaves no ban marker'
);

-- ── an actioned report leaves a fingerprint ────────────────────────────────
select public.delete_account('11111111-1111-1111-1111-111111111111');

select is(
  (select count(*)::int from public.conduct_bans where source_profile_id = '11111111-1111-1111-1111-111111111111'),
  1,
  'a member removed after an actioned report leaves a ban marker'
);

select ok(
  (select email_hash <> 'anna@example.test' and name_hash <> 'Anna Maria Weber'
     from public.conduct_bans where source_profile_id = '11111111-1111-1111-1111-111111111111'),
  'which holds fingerprints, not the readable email or name'
);

select ok(public.matches_conduct_ban('ANNA@example.test ', 'someone else'),
  'the same email matches, whatever its case or spacing');
select ok(public.matches_conduct_ban('other@example.test', 'anna  MARIA weber'),
  'the same legal name matches on its own');
select ok(not public.matches_conduct_ban('other@example.test', 'Someone Else'),
  'and an unrelated applicant does not');

-- Deleting twice must not blank the hold.
select public.delete_account('33333333-3333-3333-3333-333333333333');
select is(
  (select first_name from public.deletion_holds
    where profile_id = '33333333-3333-3333-3333-333333333333'),
  'Clara',
  'running the deletion again does not overwrite the held identity'
);

-- ── nobody reads it through the API ────────────────────────────────────────
set local role authenticated;
set local request.jwt.claims to
  '{"sub":"44444444-4444-4444-4444-444444444444","role":"authenticated"}';

select throws_ok($$ select * from public.deletion_holds $$, '42501', null,
  'a member cannot read the holds table');
select throws_ok($$ select * from public.conduct_bans $$, '42501', null,
  'or the ban markers');

select is(
  (select count(*)::int from public.admin_get_deletion_hold('33333333-3333-3333-3333-333333333333')),
  0,
  'and the moderator function returns nothing to a non-admin'
);

select throws_ok(
  $$ select public.admin_extend_deletion_hold('33333333-3333-3333-3333-333333333333') $$,
  '42501', null,
  'who also cannot extend a hold'
);

-- ── moderators ─────────────────────────────────────────────────────────────
set local request.jwt.claims to
  '{"sub":"a0000000-0000-0000-0000-000000000001","role":"authenticated"}';

select is(
  (select full_legal_name from public.admin_get_deletion_hold('33333333-3333-3333-3333-333333333333')),
  'Clara Ortiz',
  'a moderator can read a held identity'
);

select is(
  (select public.admin_extend_deletion_hold('33333333-3333-3333-3333-333333333333')),
  now() + interval '365 days',
  'and extend a hold to the long period'
);

-- audit_log is not directly readable by an admin session, only by the owner.
set local role postgres;
select is(
  (select count(*)::int from public.audit_log
    where action = 'extend_deletion_hold'
      and target_id = '33333333-3333-3333-3333-333333333333'),
  1,
  'which is written to the audit log'
);
set local role authenticated;
set local request.jwt.claims to
  '{"sub":"a0000000-0000-0000-0000-000000000001","role":"authenticated"}';

select ok(
  (select matches_removed_member from public.admin_pending_verifications()
    where profile_id = '66666666-6666-6666-6666-666666666666'),
  'the verification queue flags an applicant matching a removed member'
);

-- ── reporting after deletion ───────────────────────────────────────────────
set local role postgres;

-- Back to the short period to see the report extend it.
update public.deletion_holds set tier = 'standard', held_until = now() + interval '5 days'
  where profile_id = '33333333-3333-3333-3333-333333333333';

select is(
  (public.submit_report('44444444-4444-4444-4444-444444444444',
                        '33333333-3333-3333-3333-333333333333',
                        'safety', 'After the fact.') ->> 'ok')::boolean,
  true,
  'a member can still be reported while their identity is held'
);

select results_eq(
  $$ select tier, held_until from public.deletion_holds
      where profile_id = '33333333-3333-3333-3333-333333333333' $$,
  $$ values ('reported'::text, now() + interval '365 days') $$,
  'and that report extends the hold to 12 months'
);

-- ── the purge ──────────────────────────────────────────────────────────────
update public.deletion_holds set held_until = now() - interval '1 day'
  where profile_id = '22222222-2222-2222-2222-222222222222';

select is(
  (select array_agg(profile_id) from public.claim_expired_deletion_holds(1000)
    where profile_id in ('11111111-1111-1111-1111-111111111111',
                         '22222222-2222-2222-2222-222222222222',
                         '33333333-3333-3333-3333-333333333333')),
  array['22222222-2222-2222-2222-222222222222']::uuid[],
  'only the expired hold is claimed for purging'
);

select public.finish_deletion_hold('22222222-2222-2222-2222-222222222222');
select public.finish_deletion_hold('11111111-1111-1111-1111-111111111111');

select is(
  (select array_agg(profile_id order by profile_id) from public.deletion_holds
    where profile_id in ('11111111-1111-1111-1111-111111111111',
                         '22222222-2222-2222-2222-222222222222',
                         '33333333-3333-3333-3333-333333333333')),
  array['11111111-1111-1111-1111-111111111111',
        '33333333-3333-3333-3333-333333333333']::uuid[],
  'finishing removes an expired hold and leaves one that has not expired'
);

-- ── the admin lists show a held name, and drop it with the hold ───────────
-- Clara's and Anna's holds are still live (Anna was reported, so hers is the long
-- one), so a moderator sees who they were. Bruno was deleted and his hold has now
-- ended, so he no longer appears.
select is(
  (select display_name from public.v_recent_signups
    where id = '33333333-3333-3333-3333-333333333333'),
  'Clara Ortiz',
  'a deleted member is listed by name while their identity is held'
);

select is(
  (select display_name from public.v_user_summary
    where profile_id = '33333333-3333-3333-3333-333333333333'),
  'Clara Ortiz',
  'and their detail page names them'
);

select is(
  (select display_name from public.v_recent_signups
    where id = '11111111-1111-1111-1111-111111111111'),
  'Anna Weber',
  'a reported member is named for as long as their longer hold lasts'
);

select is(
  (select count(*)::int from public.v_recent_signups
    where id = '22222222-2222-2222-2222-222222222222'),
  0,
  'a deleted member whose hold has ended is no longer listed'
);

select is(
  (select display_name from public.v_user_summary
    where profile_id = '22222222-2222-2222-2222-222222222222'),
  'Deleted member',
  'though a direct link to them still opens, as the tombstone'
);

select * from finish();
rollback;
