-- Connections: request, accept, decline, unconnection, search.

begin;

-- See rls_profiles.sql: the CLI's login role needs this to write auth.users.
set local role postgres;
select plan(31);

-- ── fixtures ───────────────────────────────────────────────────────────────
--   Anna, Bruno, Clara, Eva: approved.  Dieter: still pending.
insert into auth.users (id, email, raw_user_meta_data) values
  ('11111111-1111-1111-1111-111111111111', 'anna@example.test',
   '{"first_name":"Anna","last_name":"Weber","username":"anna_w","discipline":"singer"}'::jsonb),
  ('22222222-2222-2222-2222-222222222222', 'bruno@example.test',
   '{"first_name":"Bruno","last_name":"Kraus","username":"bruno.k","discipline":"instrumentalist"}'::jsonb),
  ('33333333-3333-3333-3333-333333333333', 'clara@example.test',
   '{"first_name":"Clara","last_name":"Ortiz","username":"clara_o","discipline":"dancer"}'::jsonb),
  ('44444444-4444-4444-4444-444444444444', 'dieter@example.test',
   '{"first_name":"Dieter","last_name":"Hahn","username":"dieter_h","discipline":"other"}'::jsonb),
  ('55555555-5555-5555-5555-555555555555', 'eva@example.test',
   '{"first_name":"Eva","last_name":"Lind","username":"eva_l","discipline":"actor"}'::jsonb);

update public.profiles set status = 'approved'
  where id in ('11111111-1111-1111-1111-111111111111', '22222222-2222-2222-2222-222222222222',
               '33333333-3333-3333-3333-333333333333', '55555555-5555-5555-5555-555555555555');

-- ── sending ────────────────────────────────────────────────────────────────
set local role authenticated;
set local request.jwt.claims to
  '{"sub":"11111111-1111-1111-1111-111111111111","role":"authenticated"}';

select is(
  public.send_connection_request('22222222-2222-2222-2222-222222222222') ->> 'status',
  'requested',
  'a member can ask another to be connections'
);

select is(
  public.send_connection_request('22222222-2222-2222-2222-222222222222') ->> 'status',
  'requested',
  'asking twice is harmless'
);

select is(
  (select count(*)::int from public.connections), 1,
  'and still one row for the pair'
);

select throws_ok(
  $$ insert into public.connections (requester_id, addressee_id)
     values ('11111111-1111-1111-1111-111111111111', '33333333-3333-3333-3333-333333333333') $$,
  '42501', null,
  'a request cannot be written directly: sending goes through the function'
);

select is(public.send_connection_request('11111111-1111-1111-1111-111111111111') ->> 'error', 'self',
  'you cannot beconnection yourself');
select is(public.send_connection_request('44444444-4444-4444-4444-444444444444') ->> 'error', 'user_not_found',
  'nor a member who is not approved yet');

-- ── who sees the request ───────────────────────────────────────────────────
set local request.jwt.claims to
  '{"sub":"33333333-3333-3333-3333-333333333333","role":"authenticated"}';
select is((select count(*)::int from public.connections), 0,
  'a third member sees nobody else''s connections');

set local request.jwt.claims to
  '{"sub":"22222222-2222-2222-2222-222222222222","role":"authenticated"}';
select is((select count(*)::int from public.connections where status = 'pending'), 1,
  'the person asked sees the request');

set local role postgres;
select is(
  (select count(*)::int from public.notifications
    where profile_id = '22222222-2222-2222-2222-222222222222'
      and type = 'connection_request_received'),
  1, 'and is notified');
set local role authenticated;
set local request.jwt.claims to
  '{"sub":"11111111-1111-1111-1111-111111111111","role":"authenticated"}';

-- ── accepting ──────────────────────────────────────────────────────────────
select results_eq(
  $$ with u as (update public.connections set status = 'accepted' returning 1)
     select count(*)::int from u $$,
  $$ values (0) $$,
  'the person who asked cannot accept their own request'
);

set local request.jwt.claims to
  '{"sub":"22222222-2222-2222-2222-222222222222","role":"authenticated"}';

select results_eq(
  $$ with u as (update public.connections set status = 'accepted' returning 1)
     select count(*)::int from u $$,
  $$ values (1) $$,
  'the person asked can accept'
);

select ok(public.is_connected('11111111-1111-1111-1111-111111111111'), 'and they are connections');

set local request.jwt.claims to
  '{"sub":"11111111-1111-1111-1111-111111111111","role":"authenticated"}';
select ok(public.is_connected('22222222-2222-2222-2222-222222222222'), 'in both directions');

set local role postgres;
select is(
  (select count(*)::int from public.notifications
    where profile_id = '11111111-1111-1111-1111-111111111111'
      and type = 'connection_request_accepted'),
  1, 'the one who asked is told it was accepted');
set local role authenticated;
set local request.jwt.claims to
  '{"sub":"11111111-1111-1111-1111-111111111111","role":"authenticated"}';

select is(
  public.send_connection_request('22222222-2222-2222-2222-222222222222') ->> 'status',
  'connected', 'asking an existing connection just says so');

-- ── asking back is saying yes ──────────────────────────────────────────────
set local request.jwt.claims to
  '{"sub":"33333333-3333-3333-3333-333333333333","role":"authenticated"}';
select public.send_connection_request('55555555-5555-5555-5555-555555555555');
set local request.jwt.claims to
  '{"sub":"55555555-5555-5555-5555-555555555555","role":"authenticated"}';
select is(
  public.send_connection_request('33333333-3333-3333-3333-333333333333') ->> 'status',
  'connected',
  'if they asked first, asking back accepts it'
);
select is(
  (select count(*)::int from public.connections
    where status = 'accepted'
      and '33333333-3333-3333-3333-333333333333' in (requester_id, addressee_id)),
  1, 'with no second row');

-- ── declining and unconnectioning delete the row ───────────────────────────────
set local request.jwt.claims to
  '{"sub":"11111111-1111-1111-1111-111111111111","role":"authenticated"}';
select public.send_connection_request('55555555-5555-5555-5555-555555555555');
set local request.jwt.claims to
  '{"sub":"55555555-5555-5555-5555-555555555555","role":"authenticated"}';
select results_eq(
  $$ with d as (delete from public.connections
                 where requester_id = '11111111-1111-1111-1111-111111111111' returning 1)
     select count(*)::int from d $$,
  $$ values (1) $$,
  'the person asked can decline, which leaves no trace'
);

set local request.jwt.claims to
  '{"sub":"33333333-3333-3333-3333-333333333333","role":"authenticated"}';
select results_eq(
  $$ with d as (delete from public.connections
                 where '11111111-1111-1111-1111-111111111111' in (requester_id, addressee_id)
                 returning 1)
     select count(*)::int from d $$,
  $$ values (0) $$,
  'a stranger cannot remove somebody else''s connection'
);

set local request.jwt.claims to
  '{"sub":"22222222-2222-2222-2222-222222222222","role":"authenticated"}';
select results_eq(
  $$ with d as (delete from public.connections
                 where '11111111-1111-1111-1111-111111111111' in (requester_id, addressee_id)
                 returning 1)
     select count(*)::int from d $$,
  $$ values (1) $$,
  'either connection can unconnection'
);

-- ── blocking ───────────────────────────────────────────────────────────────
select public.send_connection_request('33333333-3333-3333-3333-333333333333');
set local request.jwt.claims to
  '{"sub":"33333333-3333-3333-3333-333333333333","role":"authenticated"}';
update public.connections set status = 'accepted';
insert into public.blocks (blocker_id, blocked_id)
values ('33333333-3333-3333-3333-333333333333', '22222222-2222-2222-2222-222222222222');

select is(
  (select count(*)::int from public.connections
    where '22222222-2222-2222-2222-222222222222' in (requester_id, addressee_id)
      and '33333333-3333-3333-3333-333333333333' in (requester_id, addressee_id)),
  0, 'blocking ends the connection');

select is(
  public.send_connection_request('22222222-2222-2222-2222-222222222222') ->> 'error',
  'user_not_found', 'and a blocked pair cannot ask each other again');

-- ── the cap ────────────────────────────────────────────────────────────────
set local role postgres;
update public.app_config set value = '1'::jsonb where key = 'max_pending_connection_requests';
set local role authenticated;
set local request.jwt.claims to
  '{"sub":"55555555-5555-5555-5555-555555555555","role":"authenticated"}';
select public.send_connection_request('22222222-2222-2222-2222-222222222222');
select is(
  public.send_connection_request('11111111-1111-1111-1111-111111111111') ->> 'error',
  'too_many_pending', 'requests waiting for an answer are capped');
set local role postgres;
update public.app_config set value = '50'::jsonb where key = 'max_pending_connection_requests';
set local role authenticated;
set local request.jwt.claims to
  '{"sub":"11111111-1111-1111-1111-111111111111","role":"authenticated"}';

-- ── a member not yet approved cannot ask ───────────────────────────────────
set local request.jwt.claims to
  '{"sub":"44444444-4444-4444-4444-444444444444","role":"authenticated"}';
select is(
  public.send_connection_request('11111111-1111-1111-1111-111111111111') ->> 'error',
  'not_approved', 'a member still waiting for approval cannot send a request');

-- ── finding people ─────────────────────────────────────────────────────────
set local request.jwt.claims to
  '{"sub":"11111111-1111-1111-1111-111111111111","role":"authenticated"}';

select is(
  (select username from public.search_members('bruno')), 'bruno.k',
  'search finds a member by the start of their username');
select is(
  (select username from public.search_members('Kraus')), 'bruno.k',
  'or by family name');
select is(
  (select username from public.search_members('@clara')), 'clara_o',
  'and takes a leading @');
select is((select count(*)::int from public.search_members('dieter')), 0,
  'a member not approved yet is not found');
select is((select count(*)::int from public.search_members('a')), 0,
  'one letter is too short to search');
select is((select count(*)::int from public.search_members('anna')), 0,
  'and you do not find yourself');

-- ── deleting an account ────────────────────────────────────────────────────
set local role postgres;
select public.delete_account('55555555-5555-5555-5555-555555555555');
select is(
  (select count(*)::int from public.connections
    where '55555555-5555-5555-5555-555555555555' in (requester_id, addressee_id)),
  0, 'deleting an account removes its connections');

select * from finish();
rollback;
