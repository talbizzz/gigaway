-- Verification, the only door in now that invites are gone.
--
-- submit-verification (service_role) is the sole writer of
-- verification_applications — the client can read its own row and nothing
-- more. The selfie and CV themselves are a separate concern: the client
-- uploads those directly to the verification-docs Storage bucket, in its own
-- folder, before ever calling submit-verification — so this file also proves
-- that write is scoped the same way avatars already are, and that nobody can
-- read anything back out of that bucket, not even the owner.

begin;

-- `supabase test db --linked` connects as cli_login_postgres, a NOINHERIT role
-- the CLI recreates on every run, so the privileges these fixtures need (writing
-- to auth.users) must be claimed explicitly. Locally this is a no-op.
set local role postgres;
select plan(21);

insert into auth.users (id, email, raw_user_meta_data) values
  ('11111111-1111-1111-1111-111111111111', 'anna@example.test',
   '{"display_name":"Anna Weber","discipline":"voice"}'::jsonb),
  ('22222222-2222-2222-2222-222222222222', 'bruno@example.test',
   '{"display_name":"Bruno Kraus","discipline":"strings"}'::jsonb);

-- ── the storage side: a device's own folder, and nothing else ──────────────
set local role authenticated;
set local request.jwt.claims to
  '{"sub":"11111111-1111-1111-1111-111111111111","role":"authenticated"}';

select lives_ok(
  $$ insert into storage.objects (bucket_id, name, owner)
     values ('verification-docs', '11111111-1111-1111-1111-111111111111/selfie-1.jpg',
             '11111111-1111-1111-1111-111111111111') $$,
  'a member can upload a selfie into their own folder'
);

select throws_ok(
  $$ insert into storage.objects (bucket_id, name, owner)
     values ('verification-docs', '22222222-2222-2222-2222-222222222222/selfie-1.jpg',
             '11111111-1111-1111-1111-111111111111') $$,
  '42501',
  null,
  'but not into somebody else''s folder'
);

-- No select policy exists on this bucket, so RLS filters the row out of
-- the result set rather than raising an error — proven here by an empty
-- result, not a thrown exception.
select is(
  (select count(*)::int from storage.objects
     where bucket_id = 'verification-docs'
       and name = '11111111-1111-1111-1111-111111111111/selfie-1.jpg'),
  0,
  'and cannot read it back either — not even the owner; a moderator reads '
  'these through the dashboard as a privileged role'
);

-- ── no client may write to the metadata table, in either direction ─────────
select throws_ok(
  $$ insert into public.verification_applications
       (profile_id, full_legal_name, selfie_prompt, selfie_path, links)
     values ('11111111-1111-1111-1111-111111111111', 'Anna Weber',
             'hold up two fingers', '11111111-1111-1111-1111-111111111111/selfie-1.jpg',
             '["https://annaweber.example"]'::jsonb) $$,
  '42501',
  null,
  'an applicant cannot write their own application — submit-verification is the only door'
);

select is(
  (select count(*)::int from public.verification_applications
    where profile_id = '11111111-1111-1111-1111-111111111111'),
  0,
  'nothing was written by the attempt above'
);

-- ── submit-verification writes as service_role; simulated here as postgres ─
set local role postgres;

select throws_ok(
  $$ insert into public.verification_applications
       (profile_id, full_legal_name, selfie_prompt, selfie_path, links)
     values ('11111111-1111-1111-1111-111111111111', 'Anna Weber',
             'hold up two fingers', '11111111-1111-1111-1111-111111111111/selfie-1.jpg',
             '[]'::jsonb) $$,
  '23514',
  null,
  'a row with neither a CV path nor a link fails has_evidence regardless of who writes it'
);

select lives_ok(
  $$ insert into public.verification_applications
       (profile_id, full_legal_name, selfie_prompt, selfie_path, links)
     values ('11111111-1111-1111-1111-111111111111', 'Anna Weber',
             'hold up two fingers', '11111111-1111-1111-1111-111111111111/selfie-1.jpg',
             '["https://annaweber.example"]'::jsonb) $$,
  'a row with at least one link satisfies has_evidence — a CV is not required'
);

select is(
  (select status::text from public.verification_applications
    where profile_id = '11111111-1111-1111-1111-111111111111'),
  'pending',
  'a new application starts pending'
);

select is(
  (select full_legal_name from public.verification_applications
    where profile_id = '11111111-1111-1111-1111-111111111111'),
  'Anna Weber',
  'the legal name given is recorded for the moderator to cross-check'
);

-- ── applications are private to the applicant ──────────────────────────────
set local role authenticated;
set local request.jwt.claims to
  '{"sub":"22222222-2222-2222-2222-222222222222","role":"authenticated"}';

select is(
  (select count(*)::int from public.verification_applications),
  0,
  'one applicant cannot see another applicant''s submission'
);

select throws_ok(
  $$ update public.verification_applications
       set status = 'approved'
       where profile_id = '11111111-1111-1111-1111-111111111111' $$,
  '42501',
  null,
  'nor update it, even to a decision it cannot see the effect of'
);

-- ── the moderator decides ──────────────────────────────────────────────────
set local role postgres;

update public.verification_applications
  set status = 'approved', decision_reason = 'Verified via portfolio link.'
  where profile_id = '11111111-1111-1111-1111-111111111111';

select is(
  (select status::text from public.profiles
    where id = '11111111-1111-1111-1111-111111111111'),
  'approved',
  'approving an application promotes the profile'
);

select ok(
  (select reviewed_at is not null from public.verification_applications
    where profile_id = '11111111-1111-1111-1111-111111111111'),
  'a decision stamps reviewed_at'
);

-- ── rejection, and reapplying afterwards ────────────────────────────────────
insert into public.verification_applications
    (profile_id, full_legal_name, selfie_prompt, selfie_path, cv_path)
values ('22222222-2222-2222-2222-222222222222', 'Bruno Kraus', 'give a thumbs up',
        '22222222-2222-2222-2222-222222222222/selfie-1.jpg',
        '22222222-2222-2222-2222-222222222222/cv-1.pdf');

update public.verification_applications
  set status = 'rejected', decision_reason = 'Could not confirm professional status.'
  where profile_id = '22222222-2222-2222-2222-222222222222';

select is(
  (select status::text from public.profiles
    where id = '22222222-2222-2222-2222-222222222222'),
  'rejected',
  'rejecting an application marks the profile rejected'
);

-- submit-verification allows a fresh attempt after rejection — simulated
-- here as the same upsert-by-profile_id it performs. A fresh submission
-- writes a NEW selfie/cv path (each upload gets a timestamped name) rather
-- than overwriting the old objects, which is why this only needs INSERT on
-- storage.objects and never UPDATE or DELETE.
select lives_ok(
  $$ insert into public.verification_applications
       (profile_id, full_legal_name, selfie_prompt, selfie_path, cv_path, status,
        reviewed_at, reviewed_by, decision_reason)
     values ('22222222-2222-2222-2222-222222222222', 'Bruno Kraus',
             'make a fist', '22222222-2222-2222-2222-222222222222/selfie-2.jpg',
             '22222222-2222-2222-2222-222222222222/cv-2.pdf', 'pending', null, null, null)
     on conflict (profile_id) do update set
       full_legal_name = excluded.full_legal_name,
       selfie_prompt   = excluded.selfie_prompt,
       selfie_path     = excluded.selfie_path,
       cv_path         = excluded.cv_path,
       status          = excluded.status,
       reviewed_at     = excluded.reviewed_at,
       reviewed_by     = excluded.reviewed_by,
       decision_reason = excluded.decision_reason $$,
  'a rejected applicant can reapply, reopening the same row rather than a new one'
);

select is(
  (select status::text from public.verification_applications
    where profile_id = '22222222-2222-2222-2222-222222222222'),
  'pending',
  'reapplying resets the application to pending'
);

select is(
  (select selfie_path from public.verification_applications
    where profile_id = '22222222-2222-2222-2222-222222222222'),
  '22222222-2222-2222-2222-222222222222/selfie-2.jpg',
  'reapplying points at the fresh upload, not the rejected one'
);

-- Reopening puts the profile back to pending: a decision is awaited again, and
-- it is what lets the decision trigger promote it afterwards. The thing this
-- assertion used to guard — that reopening must not silently RE-APPROVE — is
-- unchanged: 'pending' is not 'approved'. It formerly expected 'rejected',
-- which left the profile stranded there when the reapplication was approved
-- (the decision trigger only promotes a pending profile).
select is(
  (select status::text from public.profiles
    where id = '22222222-2222-2222-2222-222222222222'),
  'pending',
  'reapplying puts the profile back to pending — it is awaiting a decision again, '
  'and is not silently re-approved'
);

update public.verification_applications
  set status = 'approved', decision_reason = 'Portfolio confirmed.'
  where profile_id = '22222222-2222-2222-2222-222222222222';

select is(
  (select status::text from public.profiles
    where id = '22222222-2222-2222-2222-222222222222'),
  'approved',
  'approving the reapplication approves the profile — being rejected once is not for good'
);

select ok(
  (select verified_at is not null from public.profiles
    where id = '22222222-2222-2222-2222-222222222222'),
  'and stamps verified_at'
);

select ok(
  (select count(*)::int from public.verification_applications
    where profile_id = '22222222-2222-2222-2222-222222222222') = 1,
  'reapplying updates the one row rather than creating a second'
);

select * from finish();
rollback;
