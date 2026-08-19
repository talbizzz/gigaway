-- Document verification: the fallback path in, and the promise that evidence
-- is deleted once it has served its purpose.

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

-- ── an applicant opens an application ──────────────────────────────────────
set local role authenticated;
set local request.jwt.claims to
  '{"sub":"11111111-1111-1111-1111-111111111111","role":"authenticated"}';

select lives_ok(
  $$ insert into public.verification_applications (profile_id, doc_paths, note)
     values ('11111111-1111-1111-1111-111111111111',
             array['11111111-1111-1111-1111-111111111111/cv.pdf'],
             'Diploma attached.') $$,
  'an applicant can submit an application with evidence'
);

select is(
  (select status::text from public.verification_applications),
  'pending',
  'a new application starts pending'
);

select throws_ok(
  $$ update public.verification_applications
       set status = 'approved'
       where profile_id = '11111111-1111-1111-1111-111111111111' $$,
  '42501',
  'verification status is not client-updatable',
  'an applicant cannot approve their own application'
);

select throws_ok(
  $$ update public.verification_applications
       set reviewed_by = '11111111-1111-1111-1111-111111111111'
       where profile_id = '11111111-1111-1111-1111-111111111111' $$,
  '42501',
  'verification decision fields are not client-updatable',
  'an applicant cannot forge a review record'
);

select lives_ok(
  $$ update public.verification_applications
       set note = 'Diploma and two programmes attached.'
       where profile_id = '11111111-1111-1111-1111-111111111111' $$,
  'an applicant can amend their own submission while it is undecided'
);

-- ── applications are private to the applicant ──────────────────────────────
set local role postgres;
set local role authenticated;
set local request.jwt.claims to
  '{"sub":"22222222-2222-2222-2222-222222222222","role":"authenticated"}';

select is(
  (select count(*)::int from public.verification_applications),
  0,
  'one applicant cannot see another applicant''s submission'
);

-- ── the moderator decides ──────────────────────────────────────────────────
set local role postgres;

update public.verification_applications
  set status = 'approved', decision_reason = 'Verified via diploma.'
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

select ok(
  (select docs_deletion_requested_at is not null
     from public.verification_applications
    where profile_id = '11111111-1111-1111-1111-111111111111'),
  'a decision immediately requests deletion of the evidence'
);

select ok(
  (select coalesce(array_length(doc_paths, 1), 0) > 0
     from public.verification_applications
    where profile_id = '11111111-1111-1111-1111-111111111111'),
  'doc_paths are retained until the purge runs — they are what tells it what to delete'
);

-- ── rejection ──────────────────────────────────────────────────────────────
insert into public.verification_applications (profile_id, doc_paths)
values ('22222222-2222-2222-2222-222222222222',
        array['22222222-2222-2222-2222-222222222222/cv.pdf']);

update public.verification_applications
  set status = 'rejected', decision_reason = 'Could not confirm professional status.'
  where profile_id = '22222222-2222-2222-2222-222222222222';

select is(
  (select status::text from public.profiles
    where id = '22222222-2222-2222-2222-222222222222'),
  'rejected',
  'rejecting an application marks the profile rejected'
);

select is(
  (select public.is_approved()),
  false,
  'a rejected applicant is not approved'
);

-- ── expiry never rejects anybody ───────────────────────────────────────────
insert into auth.users (id, email, raw_user_meta_data) values
  ('33333333-3333-3333-3333-333333333333', 'clara@example.test',
   '{"display_name":"Clara Ortiz","discipline":"dance"}'::jsonb);

insert into public.verification_applications (profile_id, doc_paths, submitted_at)
values ('33333333-3333-3333-3333-333333333333',
        array['33333333-3333-3333-3333-333333333333/cv.pdf'],
        now() - interval '91 days');

select is(
  public.expire_verification_docs(),
  1,
  'an application undecided past the purge window has its documents expired'
);

select is(
  (select status::text from public.verification_applications
    where profile_id = '33333333-3333-3333-3333-333333333333'),
  'docs_expired',
  'expiry sets docs_expired — the application itself survives'
);

select is(
  (select status::text from public.profiles
    where id = '33333333-3333-3333-3333-333333333333'),
  'pending',
  'expiry never rejects the applicant; they keep their place in the queue'
);

select ok(
  (select reviewed_at is null from public.verification_applications
    where profile_id = '33333333-3333-3333-3333-333333333333'),
  'an expiry is not a review, so reviewed_at stays empty'
);

select * from finish();
rollback;
