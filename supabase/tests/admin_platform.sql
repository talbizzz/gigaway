-- Admin platform foundations (Milestone 6).
--
-- This is the gate every later admin_* function stands behind, so it gets
-- tested in isolation before anything is built on top of it: a non-admin,
-- however authenticated, must get nothing from admin_users, audit_log,
-- log_admin_action or admin_audit_log — and an admin must get exactly what
-- they're entitled to.

begin;

-- `supabase test db --linked` connects as cli_login_postgres, a NOINHERIT role
-- the CLI recreates on every run, so the privileges these fixtures need
-- (writing to auth.users) must be claimed explicitly. Locally this is a no-op.
set local role postgres;
select plan(15);

insert into auth.users (id, email, raw_user_meta_data) values
  ('a0000000-0000-0000-0000-000000000001', 'admin@example.test',
   '{"display_name":"Admin One"}'::jsonb),
  ('b0000000-0000-0000-0000-000000000002', 'member@example.test',
   '{"display_name":"Not An Admin"}'::jsonb),
  ('c0000000-0000-0000-0000-000000000003', 'member2@example.test',
   '{"display_name":"Also Not An Admin"}'::jsonb);

insert into public.admin_users (id, display_name)
values ('a0000000-0000-0000-0000-000000000001', 'Admin One');

-- ── is_admin() ───────────────────────────────────────────────────────────

set local role anon;

select is(
  (select public.is_admin()),
  false,
  'is_admin() is false for an unauthenticated caller'
);

set local role authenticated;
set local request.jwt.claims to
  '{"sub":"b0000000-0000-0000-0000-000000000002","role":"authenticated"}';

select is(
  (select public.is_admin()),
  false,
  'is_admin() is false for an ordinary member'
);

set local request.jwt.claims to
  '{"sub":"a0000000-0000-0000-0000-000000000001","role":"authenticated"}';

select is(
  (select public.is_admin()),
  true,
  'is_admin() is true for a row in admin_users'
);

-- ── nobody reaches the tables directly ──────────────────────────────────

set local request.jwt.claims to
  '{"sub":"b0000000-0000-0000-0000-000000000002","role":"authenticated"}';

select throws_ok(
  $$ select count(*) from public.admin_users $$,
  '42501',
  null,
  'a non-admin cannot read admin_users'
);

select throws_ok(
  $$ insert into public.admin_users (id, display_name)
     values ('b0000000-0000-0000-0000-000000000002', 'Self-promoted') $$,
  '42501',
  null,
  'a non-admin cannot insert themselves into admin_users'
);

select throws_ok(
  $$ select count(*) from public.audit_log $$,
  '42501',
  null,
  'a non-admin cannot read audit_log'
);

select throws_ok(
  $$ insert into public.audit_log (admin_id, action, target_table)
     values ('a0000000-0000-0000-0000-000000000001', 'forged', 'profiles') $$,
  '42501',
  null,
  'a non-admin cannot write a forged audit_log row'
);

-- ── log_admin_action() is not a public entry point, for anyone ─────────────

select throws_ok(
  $$ select public.log_admin_action('test', 'profiles', 'x', '{}'::jsonb) $$,
  '42501',
  null,
  'a non-admin cannot call log_admin_action directly'
);

set local request.jwt.claims to
  '{"sub":"a0000000-0000-0000-0000-000000000001","role":"authenticated"}';

select throws_ok(
  $$ select public.log_admin_action('test', 'profiles', 'x', '{}'::jsonb) $$,
  '42501',
  null,
  'not even an admin calls log_admin_action directly — only admin_* functions do, internally'
);

-- ── the internal path: an admin_* function calling log_admin_action from
--    inside its own SECURITY DEFINER body ──────────────────────────────────
-- No admin_* write function exists yet in this migration (that's later
-- phases), so this simulates one by taking the same role/claims an internal
-- call would run with: postgres, with the acting admin's JWT still attached.

set local role postgres;
set local request.jwt.claims to
  '{"sub":"a0000000-0000-0000-0000-000000000001","role":"authenticated"}';

select lives_ok(
  $$ select public.log_admin_action('suspend_user', 'profiles',
       'b0000000-0000-0000-0000-000000000002', '{"reason":"test"}'::jsonb) $$,
  'log_admin_action succeeds when the JWT resolves to an admin, called from a privileged role'
);

set local request.jwt.claims to
  '{"sub":"b0000000-0000-0000-0000-000000000002","role":"authenticated"}';

select throws_ok(
  $$ select public.log_admin_action('suspend_user', 'profiles', 'x', '{}'::jsonb) $$,
  'P0001',
  'not authorized',
  'log_admin_action itself refuses to log an action for a non-admin JWT'
);

-- ── admin_audit_log() is the one read path ──────────────────────────────

set local role authenticated;
set local request.jwt.claims to
  '{"sub":"a0000000-0000-0000-0000-000000000001","role":"authenticated"}';

select is(
  (select count(*)::int from public.admin_audit_log()
    where action = 'suspend_user' and target_id = 'b0000000-0000-0000-0000-000000000002'),
  1,
  'the admin can read back the action that was logged'
);

select is(
  (select admin_display_name from public.admin_audit_log()
    where action = 'suspend_user' and target_id = 'b0000000-0000-0000-0000-000000000002'),
  'Admin One',
  'and it carries the acting admin''s name, not just their id'
);

set local request.jwt.claims to
  '{"sub":"c0000000-0000-0000-0000-000000000003","role":"authenticated"}';

select is(
  (select count(*)::int from public.admin_audit_log()),
  0,
  'a non-admin gets zero rows from admin_audit_log, not an error'
);

set local role anon;

select throws_ok(
  $$ select count(*) from public.admin_audit_log() $$,
  '42501',
  null,
  'anon has no grant to call admin_audit_log at all'
);

select * from finish();
rollback;
