-- The home feed's connections band: what connections are doing, wherever they are going.

begin;

-- See rls_profiles.sql: the CLI's login role needs this to write auth.users.
set local role postgres;
select plan(9);

--   Anna  (me) lives in Berlin.   Bruno: my connection, Hamburg.   Clara: not a connection.
insert into auth.users (id, email, raw_user_meta_data) values
  ('11111111-1111-1111-1111-111111111111', 'anna@example.test',  '{"first_name":"Anna","last_name":"A"}'::jsonb),
  ('22222222-2222-2222-2222-222222222222', 'bruno@example.test', '{"first_name":"Bruno","last_name":"B"}'::jsonb),
  ('33333333-3333-3333-3333-333333333333', 'clara@example.test', '{"first_name":"Clara","last_name":"C"}'::jsonb);

update public.profiles set status = 'approved';
update public.profiles set home_city_id = (select id from public.cities where name = 'Berlin' limit 1)
  where id = '11111111-1111-1111-1111-111111111111';
update public.profiles set home_city_id = (select id from public.cities where name = 'Hamburg' limit 1)
  where id in ('22222222-2222-2222-2222-222222222222', '33333333-3333-3333-3333-333333333333');

insert into public.connections (requester_id, addressee_id, status)
values ('11111111-1111-1111-1111-111111111111', '22222222-2222-2222-2222-222222222222', 'accepted');

-- Bruno's trips, and one of Clara's.
insert into public.trips (id, profile_id, city_id, start_date, end_date, needs, visibility)
select v.id::uuid, v.owner::uuid, (select id from public.cities where name = v.city limit 1),
       current_date + v.starts, current_date + v.ends, array['couch'], v.visibility
from (values
  ('b0000000-0000-0000-0000-000000000001', '22222222-2222-2222-2222-222222222222', 'Munich',  20,  25, 'public'),
  ('b0000000-0000-0000-0000-000000000002', '22222222-2222-2222-2222-222222222222', 'Vienna',  30,  33, 'connections'),
  ('b0000000-0000-0000-0000-000000000003', '22222222-2222-2222-2222-222222222222', 'Rome',    40,  44, 'private'),
  ('b0000000-0000-0000-0000-000000000004', '22222222-2222-2222-2222-222222222222', 'Paris',  -30, -20, 'public'),
  ('b0000000-0000-0000-0000-000000000005', '22222222-2222-2222-2222-222222222222', 'Berlin',  -1,   3, 'public'),
  ('b0000000-0000-0000-0000-000000000006', '22222222-2222-2222-2222-222222222222', 'Berlin', 200, 204, 'public'),
  ('c0000000-0000-0000-0000-000000000001', '33333333-3333-3333-3333-333333333333', 'Munich',  20,  25, 'public')
) as v(id, owner, city, starts, ends, visibility);

set local role authenticated;
set local request.jwt.claims to '{"sub":"11111111-1111-1111-1111-111111111111","role":"authenticated"}';

select ok(public.home_feed() ? 'connections', 'the feed has a connections band');

select is(
  (select array_agg(t ->> 'cityName' order by t ->> 'cityName')
     from jsonb_array_elements(public.home_feed() -> 'connections') t),
  array['Berlin', 'Munich', 'Vienna'],
  'it lists a connection''s public and connections-only trips that have not finished, and a far-off one at home'
);

select is(
  (select count(*)::int from jsonb_array_elements(public.home_feed() -> 'connections') t
    where t ->> 'cityName' = 'Rome'),
  0, 'but never a private trip');

select is(
  (select count(*)::int from jsonb_array_elements(public.home_feed() -> 'connections') t
    where t ->> 'cityName' = 'Paris'),
  0, 'nor one that is already over');

select is(
  (select count(*)::int from jsonb_array_elements(public.home_feed() -> 'connections') t
    where t -> 'profile' ->> 'id' = '33333333-3333-3333-3333-333333333333'),
  0, 'nor a trip of somebody who is not a connection');

select is(
  (select jsonb_array_length(public.home_feed() -> 'inYourCity')), 1,
  'a connection in my own city right now is in the in-my-city band');

select is(
  (select count(*)::int from jsonb_array_elements(public.home_feed() -> 'connections') t
    where t ->> 'tripId' = 'b0000000-0000-0000-0000-000000000005'),
  0, 'and is not repeated in the connections band');

select is(
  (select (t ->> 'start')::date from jsonb_array_elements(public.home_feed() -> 'connections') t
    order by (t ->> 'start')::date limit 1),
  current_date + 20, 'soonest first');

set local role postgres;
delete from public.connections;
set local role authenticated;
set local request.jwt.claims to '{"sub":"11111111-1111-1111-1111-111111111111","role":"authenticated"}';
select is(jsonb_array_length(public.home_feed() -> 'connections'), 0,
  'with no connections the band is empty');

select * from finish();
rollback;
