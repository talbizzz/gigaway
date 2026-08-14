-- Invite chain: quota enforcement, redemption, and the guarantee that a
-- single-use code cannot be spent twice.

begin;
select plan(16);

insert into auth.users (id, email, raw_user_meta_data) values
  ('11111111-1111-1111-1111-111111111111', 'anna@example.test',
   '{"display_name":"Anna Weber","discipline":"voice"}'::jsonb),
  ('22222222-2222-2222-2222-222222222222', 'bruno@example.test',
   '{"display_name":"Bruno Kraus","discipline":"strings"}'::jsonb),
  ('33333333-3333-3333-3333-333333333333', 'clara@example.test',
   '{"display_name":"Clara Ortiz","discipline":"dance"}'::jsonb);

update public.profiles set status = 'approved'
  where id = '11111111-1111-1111-1111-111111111111';
-- Bruno and Clara stay pending; they are the ones joining.

-- ── code generation ────────────────────────────────────────────────────────
insert into public.invites (created_by)
values ('11111111-1111-1111-1111-111111111111');

select matches(
  (select code from public.invites limit 1),
  '^[ABCDEFGHJKLMNPQRSTUVWXYZ23456789]{8}$',
  'a generated code is 8 characters from the unambiguous alphabet'
);

select ok(
  (select expires_at > now() + interval '29 days' from public.invites limit 1),
  'a new invite expires roughly 30 days out, per app_config'
);

-- ── quota ──────────────────────────────────────────────────────────────────
set local role authenticated;
set local request.jwt.claims to
  '{"sub":"11111111-1111-1111-1111-111111111111","role":"authenticated"}';

select is(
  (select public.remaining_invite_quota()),
  4,
  'one live invite consumes one of the five quota slots'
);

select lives_ok(
  $$ insert into public.invites (created_by)
     select '11111111-1111-1111-1111-111111111111' from generate_series(1, 4) $$,
  'a member may create invites up to their quota'
);

select is(
  (select public.remaining_invite_quota()),
  0,
  'quota is exhausted once five live invites exist'
);

select throws_ok(
  $$ insert into public.invites (created_by)
     values ('11111111-1111-1111-1111-111111111111') $$,
  '42501',
  null,
  'the sixth invite is refused by policy, not merely hidden in the UI'
);

-- ── column guard ───────────────────────────────────────────────────────────
select throws_ok(
  $$ update public.invites set max_uses = 100
       where created_by = '11111111-1111-1111-1111-111111111111' $$,
  '42501',
  'only revoked_at is client-updatable on invites',
  'a member cannot widen their own invite to unlimited uses'
);

select lives_ok(
  $$ update public.invites set revoked_at = now()
       where id = (select id from public.invites order by created_at desc limit 1) $$,
  'a member can revoke their own invite'
);

-- ── another member sees nothing ────────────────────────────────────────────
set local role postgres;
set local role authenticated;
set local request.jwt.claims to
  '{"sub":"22222222-2222-2222-2222-222222222222","role":"authenticated"}';

select is(
  (select count(*)::int from public.invites),
  0,
  'invites are invisible to everyone except their creator'
);

-- ── redemption ─────────────────────────────────────────────────────────────
set local role postgres;

select is(
  (select public.redeem_invite(
     (select code from public.invites where revoked_at is null order by created_at limit 1),
     '22222222-2222-2222-2222-222222222222') ->> 'ok'),
  'true',
  'a pending applicant can redeem a valid code'
);

select is(
  (select status::text from public.profiles
    where id = '22222222-2222-2222-2222-222222222222'),
  'approved',
  'redemption approves the applicant immediately'
);

select is(
  (select invited_by from public.profiles
    where id = '22222222-2222-2222-2222-222222222222'),
  '11111111-1111-1111-1111-111111111111'::uuid,
  'every member is traceable to the colleague who vouched for them'
);

select is(
  (select invite_quota from public.profiles
    where id = '11111111-1111-1111-1111-111111111111'),
  4,
  'the inviter''s quota is spent on redemption'
);

-- ── a single-use code cannot be spent twice ────────────────────────────────
select is(
  (select public.redeem_invite(
     (select i.code from public.invites i
       join public.invite_redemptions r on r.invite_id = i.id limit 1),
     '33333333-3333-3333-3333-333333333333') ->> 'error'),
  'invite_exhausted',
  'a used single-use code is refused for the next person'
);

select is(
  (select status::text from public.profiles
    where id = '33333333-3333-3333-3333-333333333333'),
  'pending',
  'the refused applicant stays pending'
);

-- ── one redemption per account, ever ───────────────────────────────────────
select is(
  (select public.redeem_invite(
     (select code from public.invites
       where revoked_at is null
         and id not in (select invite_id from public.invite_redemptions)
       limit 1),
     '22222222-2222-2222-2222-222222222222') ->> 'error'),
  'already_approved',
  'an approved member cannot redeem a second invite'
);

select * from finish();
rollback;
