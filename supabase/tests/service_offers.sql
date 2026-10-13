-- Offering a coffee or local tips unprompted, on a trip you can see.

begin;

-- See rls_profiles.sql: the CLI's login role needs this to write auth.users.
set local role postgres;
select plan(25);

--   Anna    offers a coffee (always) and local tips in Munich; lives in Munich
--   Bruno   has trips to Munich, one public and one private; lives in Berlin
--   Clara   offers nothing; Dieter is waiting for approval but has posted a coffee
insert into auth.users (id, email, raw_user_meta_data) values
  ('11111111-1111-1111-1111-111111111111', 'anna@example.test',   '{"first_name":"Anna","last_name":"A"}'::jsonb),
  ('22222222-2222-2222-2222-222222222222', 'bruno@example.test',  '{"first_name":"Bruno","last_name":"B"}'::jsonb),
  ('33333333-3333-3333-3333-333333333333', 'clara@example.test',  '{"first_name":"Clara","last_name":"C"}'::jsonb),
  ('44444444-4444-4444-4444-444444444444', 'dieter@example.test', '{"first_name":"Dieter","last_name":"D"}'::jsonb);
update public.profiles set status = 'approved' where id <> '44444444-4444-4444-4444-444444444444';
update public.profiles set home_city_id = (select id from public.cities where name = 'Munich' limit 1)
  where id in ('11111111-1111-1111-1111-111111111111', '44444444-4444-4444-4444-444444444444');
update public.profiles set home_city_id = (select id from public.cities where name = 'Berlin' limit 1)
  where id in ('22222222-2222-2222-2222-222222222222', '33333333-3333-3333-3333-333333333333');
update public.contact_details set phone = '+4917011111111' where profile_id = '11111111-1111-1111-1111-111111111111';
update public.contact_details set phone = '+4917022222222' where profile_id = '22222222-2222-2222-2222-222222222222';

insert into public.verification_applications (profile_id, full_legal_name, selfie_prompt, selfie_path, links)
values ('44444444-4444-4444-4444-444444444444', 'Dieter D', 'p', 'x/selfie.jpg', '["https://x.example"]'::jsonb);

insert into public.availability (profile_id, city_id, offers, always_available)
select p.id, (select id from public.cities where name = 'Munich' limit 1), array[o], true
from (values ('11111111-1111-1111-1111-111111111111'::uuid, 'coffee'),
             ('11111111-1111-1111-1111-111111111111'::uuid, 'tips'),
             ('44444444-4444-4444-4444-444444444444'::uuid, 'coffee')) as p(id, o);

insert into public.trips (id, profile_id, city_id, start_date, end_date, needs, visibility)
select v.id::uuid, '22222222-2222-2222-2222-222222222222',
       (select id from public.cities where name = 'Munich' limit 1),
       current_date + v.s, current_date + v.e, array['tips', 'company'], v.visibility
from (values
  ('b1000000-0000-0000-0000-000000000001', 20, 25, 'public'),
  ('b2000000-0000-0000-0000-000000000002', 30, 33, 'private'),
  ('b3000000-0000-0000-0000-000000000003', 40, 44, 'public')
) as v(id, s, e, visibility);

-- ── offering ───────────────────────────────────────────────────────────────
set local role authenticated;
set local request.jwt.claims to '{"sub":"11111111-1111-1111-1111-111111111111","role":"authenticated"}';

select lives_ok(
  $$ insert into public.service_offers (id, kind, trip_id, from_profile, to_profile, message)
     values ('c1000000-0000-0000-0000-000000000001', 'coffee', 'b1000000-0000-0000-0000-000000000001',
             '11111111-1111-1111-1111-111111111111', '22222222-2222-2222-2222-222222222222', 'Café near the Hochschule?') $$,
  'a member can offer a coffee on a trip they can see, without being asked');

select throws_ok(
  $$ insert into public.service_offers (kind, trip_id, from_profile, to_profile)
     values ('coffee', 'b1000000-0000-0000-0000-000000000001',
             '11111111-1111-1111-1111-111111111111', '22222222-2222-2222-2222-222222222222') $$,
  '23505', null, 'but not the same service twice on one trip');

select lives_ok(
  $$ insert into public.service_offers (id, kind, trip_id, from_profile, to_profile)
     values ('c2000000-0000-0000-0000-000000000002', 'tips', 'b1000000-0000-0000-0000-000000000001',
             '11111111-1111-1111-1111-111111111111', '22222222-2222-2222-2222-222222222222') $$,
  'another service on the same trip is fine');

select throws_ok(
  $$ insert into public.service_offers (kind, trip_id, from_profile, to_profile)
     values ('coffee', 'b2000000-0000-0000-0000-000000000002',
             '11111111-1111-1111-1111-111111111111', '22222222-2222-2222-2222-222222222222') $$,
  '42501', null, 'a private trip cannot be offered on: it is not visible');

select throws_ok(
  $$ insert into public.service_offers (kind, trip_id, from_profile, to_profile)
     values ('coffee', 'b3000000-0000-0000-0000-000000000003',
             '11111111-1111-1111-1111-111111111111', '33333333-3333-3333-3333-333333333333') $$,
  '23514', null, 'and the offer must go to the trip''s owner');

-- ── the giver must have posted the service ────────────────────────────────
set local request.jwt.claims to '{"sub":"33333333-3333-3333-3333-333333333333","role":"authenticated"}';
select throws_ok(
  $$ insert into public.service_offers (kind, trip_id, from_profile, to_profile)
     values ('coffee', 'b1000000-0000-0000-0000-000000000001',
             '33333333-3333-3333-3333-333333333333', '22222222-2222-2222-2222-222222222222') $$,
  '23514', null, 'someone who has not offered that service in the city cannot');

set local request.jwt.claims to '{"sub":"44444444-4444-4444-4444-444444444444","role":"authenticated"}';
select throws_ok(
  $$ insert into public.service_offers (kind, trip_id, from_profile, to_profile)
     values ('coffee', 'b1000000-0000-0000-0000-000000000001',
             '44444444-4444-4444-4444-444444444444', '22222222-2222-2222-2222-222222222222') $$,
  '42501', null, 'and a member still waiting for approval cannot offer');

-- ── who sees it ───────────────────────────────────────────────────────────
set local request.jwt.claims to '{"sub":"33333333-3333-3333-3333-333333333333","role":"authenticated"}';
select is((select count(*)::int from public.service_offers), 0, 'a third member sees no offers');

set local request.jwt.claims to '{"sub":"22222222-2222-2222-2222-222222222222","role":"authenticated"}';
select is((select count(*)::int from public.service_offers), 2, 'the trip''s owner sees both');

set local role postgres;
select is(
  (select payload ->> 'kind' from public.notifications
    where profile_id = '22222222-2222-2222-2222-222222222222'
      and type = 'service_offer_received' and payload ->> 'offerId' = 'c1000000-0000-0000-0000-000000000001'),
  'coffee', 'and is told about each, naming the service');

-- ── only the status can change ────────────────────────────────────────────
set local role authenticated;
set local request.jwt.claims to '{"sub":"22222222-2222-2222-2222-222222222222","role":"authenticated"}';
select throws_ok(
  $$ update public.service_offers set message = 'changed' where id = 'c1000000-0000-0000-0000-000000000001' $$,
  '42501', null, 'the person offered to cannot rewrite the offer');

-- ── accepting ─────────────────────────────────────────────────────────────
select is(
  public.accept_service_offer('c1000000-0000-0000-0000-000000000001') ->> 'grantedWith',
  '11111111-1111-1111-1111-111111111111', 'the owner can accept');

select is(
  public.accept_service_offer('c1000000-0000-0000-0000-000000000001') ->> 'ok',
  'true', 'and accepting twice is harmless');

select is(
  (select phone from public.contact_details where profile_id = '11111111-1111-1111-1111-111111111111'),
  '+4917011111111', 'accepting shares the giver''s contact with the owner');

set local request.jwt.claims to '{"sub":"11111111-1111-1111-1111-111111111111","role":"authenticated"}';
select is(
  (select phone from public.contact_details where profile_id = '22222222-2222-2222-2222-222222222222'),
  '+4917022222222', 'and the owner''s with the giver');

select is(
  public.accept_service_offer('c2000000-0000-0000-0000-000000000002') ->> 'error',
  'offer_not_found', 'the giver cannot accept their own offer');

set local role postgres;
select is(
  (select count(*)::int from public.notifications
    where type = 'service_offer_accepted' and payload ->> 'kind' = 'coffee'),
  2, 'both sides are told it was accepted');

-- ── declining and withdrawing ─────────────────────────────────────────────
set local role authenticated;
set local request.jwt.claims to '{"sub":"22222222-2222-2222-2222-222222222222","role":"authenticated"}';
update public.service_offers set status = 'declined' where id = 'c2000000-0000-0000-0000-000000000002';

set local role postgres;
select is(
  (select count(*)::int from public.notifications
    where profile_id = '11111111-1111-1111-1111-111111111111'
      and type = 'service_offer_declined' and payload ->> 'kind' = 'tips'),
  1, 'declining tells the giver');

set local role authenticated;
set local request.jwt.claims to '{"sub":"11111111-1111-1111-1111-111111111111","role":"authenticated"}';
insert into public.service_offers (id, kind, trip_id, from_profile, to_profile)
values ('c3000000-0000-0000-0000-000000000003', 'coffee', 'b3000000-0000-0000-0000-000000000003',
        '11111111-1111-1111-1111-111111111111', '22222222-2222-2222-2222-222222222222');
update public.service_offers set status = 'withdrawn' where id = 'c3000000-0000-0000-0000-000000000003';
select is(
  (select status from public.service_offers where id = 'c3000000-0000-0000-0000-000000000003'),
  'withdrawn', 'the giver can withdraw an offer that has not been answered');

-- ── blocking withdraws what is open ───────────────────────────────────────
set local role postgres;
update public.service_offers set status = 'pending' where id = 'c3000000-0000-0000-0000-000000000003';
set local role authenticated;
insert into public.blocks (blocker_id, blocked_id)
values ('11111111-1111-1111-1111-111111111111', '22222222-2222-2222-2222-222222222222');
set local role postgres;
select is(
  (select status from public.service_offers where id = 'c3000000-0000-0000-0000-000000000003'),
  'withdrawn', 'blocking withdraws a pending offer');
delete from public.blocks;

-- ── a trip that has ended ─────────────────────────────────────────────────
update public.service_offers set status = 'pending' where id = 'c2000000-0000-0000-0000-000000000002';
update public.trips set start_date = current_date - 20, end_date = current_date - 15
  where id = 'b1000000-0000-0000-0000-000000000001';

select is(
  public.expire_stale_requests_and_offers() >= 1, true,
  'the daily sweep expires offers on a trip that is over');
select is(
  (select status from public.service_offers where id = 'c2000000-0000-0000-0000-000000000002'),
  'expired', 'including this one');

-- ── what it counts for ────────────────────────────────────────────────────
select is(
  (select count(*)::int from public.completed_services('11111111-1111-1111-1111-111111111111')
    where kind = 'coffee'),
  1, 'an accepted offer on a finished trip counts as a service given');

set local role authenticated;
set local request.jwt.claims to '{"sub":"33333333-3333-3333-3333-333333333333","role":"authenticated"}';
select is(
  (select services from public.member_stats('11111111-1111-1111-1111-111111111111')),
  1, 'and shows in the number on their profile');

-- ── deleting an account ───────────────────────────────────────────────────
set local role postgres;
insert into public.trips (id, profile_id, city_id, start_date, end_date, needs)
values ('b4000000-0000-0000-0000-000000000004', '22222222-2222-2222-2222-222222222222',
        (select id from public.cities where name = 'Munich' limit 1),
        current_date + 50, current_date + 52, array['tips']);
insert into public.service_offers (kind, trip_id, from_profile, to_profile)
values ('coffee', 'b4000000-0000-0000-0000-000000000004',
        '11111111-1111-1111-1111-111111111111', '22222222-2222-2222-2222-222222222222');
select public.delete_account('22222222-2222-2222-2222-222222222222');
select is(
  (select array_agg(status order by status) from public.service_offers
    where from_profile = '11111111-1111-1111-1111-111111111111' and status in ('pending', 'accepted')),
  array['accepted'],
  'deleting an account removes unanswered offers and keeps accepted ones');

select * from finish();
rollback;
