-- Profile numbers: connections, trips, and services given.
--
-- Anyone who can see a member's profile sees three numbers on it, Instagram
-- style. The DETAILS behind them are for the member and their connections only:
--
--   connections  who the member is connected with
--   trips        the member's trips that are not private
--   services     what the member has given, and to whom
--
-- WHAT COUNTS
--   connections  accepted connections whose other member is approved
--   trips        trips that are not cancelled and not private. Private ones are
--                left out of the number as well as the list, so the number
--                reveals nothing about them. The member sees their own total.
--   services     given AND completed, both ways:
--                  couch    a stay the member hosted whose last night has passed.
--                           A stay only exists once the traveller accepted the
--                           offer, so "accepted both ways" is built in
--                  tips / coffee   a request the member ACCEPTED, for a trip
--                           that has ended and was not cancelled
--
-- A tips or coffee request has no completion step of its own, so the end of the
-- trip it was for stands in for it, in the same way a stay is complete when its
-- last night has passed (which is also when reviews open).
--
-- PRIVACY OF THE LIST OF SERVICES. It names who was helped. Where that
-- person's trip was private, the city is left out for everyone but the member
-- themselves: the trip is not the host's connections' business.
--
-- All of these are SECURITY DEFINER, because they count and list rows the
-- caller could not read directly, and so each checks for itself who is asking.

-- Whether the caller may see this member's numbers at all: themselves, or
-- anyone who can browse and sees an approved member they have not blocked.
create or replace function public.can_see_member(p_profile uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select (select auth.uid()) is not null
     and p_profile is not null
     and (
       p_profile = (select auth.uid())
       or (
         public.can_browse()
         and exists (select 1 from public.profiles p where p.id = p_profile and p.status = 'approved')
         and not public.is_blocked(p_profile)
       )
     )
$$;

-- Whether the caller may open the details: the member, or their connection.
create or replace function public.can_see_member_details(p_profile uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select public.can_see_member(p_profile)
     and (p_profile = (select auth.uid()) or public.is_connected(p_profile))
$$;

-- What the member has given and finished. Internal: the functions below decide
-- who may see which part of it.
create or replace function public.completed_services(p_profile uuid)
returns table (
  kind            text,
  recipient_id    uuid,
  trip_id         uuid,
  city_name       text,
  trip_is_private boolean,
  completed_on    date
)
language sql
stable
security definer
set search_path = public
as $$
  select 'couch'::text, s.guest_id, o.trip_id, c.name, (t.visibility = 'private'), s.end_date
    from public.stays s
    join public.offers o on o.id = s.offer_id
    join public.trips t on t.id = o.trip_id
    join public.cities c on c.id = s.city_id
   where s.host_id = p_profile
     and s.end_date < current_date

  union all

  select r.kind::text, r.from_profile, r.trip_id, c.name, (t.visibility = 'private'), t.end_date
    from public.requests r
    join public.trips t on t.id = r.trip_id
    join public.cities c on c.id = t.city_id
   where r.to_profile = p_profile
     and r.kind in ('tips', 'coffee')
     and r.status = 'accepted'
     and t.status <> 'cancelled'
     and t.end_date < current_date
$$;

revoke all on function public.completed_services(uuid) from public, anon, authenticated;
revoke all on function public.can_see_member(uuid) from public, anon;
revoke all on function public.can_see_member_details(uuid) from public, anon;
grant execute on function public.can_see_member(uuid) to authenticated;
grant execute on function public.can_see_member_details(uuid) to authenticated;

-- ── the three numbers ─────────────────────────────────────────────────────
create or replace function public.member_stats(p_profile uuid)
returns table (connections integer, trips integer, services integer)
language sql
stable
security definer
set search_path = public
as $$
  select
    (select count(*)::integer
       from public.connections c
       join public.profiles o
         on o.id = case when c.requester_id = p_profile then c.addressee_id else c.requester_id end
      where c.status = 'accepted'
        and p_profile in (c.requester_id, c.addressee_id)
        and o.status = 'approved'),
    (select count(*)::integer
       from public.trips t
      where t.profile_id = p_profile
        and t.status in ('active', 'completed')
        and (t.visibility <> 'private' or p_profile = (select auth.uid()))),
    (select count(*)::integer from public.completed_services(p_profile))
  where public.can_see_member(p_profile)
$$;

revoke all on function public.member_stats(uuid) from public, anon;
grant execute on function public.member_stats(uuid) to authenticated;

-- ── the details, for the member and their connections ─────────────────────
create or replace function public.member_trips(p_profile uuid)
returns table (
  id          uuid,
  city_id     uuid,
  city_name   text,
  start_date  date,
  end_date    date,
  needs       text[],
  note        text,
  visibility  text
)
language sql
stable
security definer
set search_path = public
as $$
  select t.id, t.city_id, c.name, t.start_date, t.end_date, t.needs, t.note, t.visibility
    from public.trips t
    join public.cities c on c.id = t.city_id
   where public.can_see_member_details(p_profile)
     and t.profile_id = p_profile
     and t.status in ('active', 'completed')
     and (t.visibility <> 'private' or p_profile = (select auth.uid()))
   order by t.start_date desc
$$;

create or replace function public.member_connections(p_profile uuid)
returns table (
  profile_id     uuid,
  display_name   text,
  username       text,
  discipline     text,
  specialisation text,
  photo_path     text,
  relationship   text
)
language sql
stable
security definer
set search_path = public
as $$
  with mine as (select (select auth.uid()) as me)
  select
    o.id, o.display_name, o.username, o.discipline, o.specialisation, o.photo_path,
    case
      when o.id = mine.me then 'self'
      when public.are_connected(mine.me, o.id) then 'connected'
      when exists (select 1 from public.connections x
                    where x.status = 'pending' and x.requester_id = mine.me and x.addressee_id = o.id)
        then 'requested'
      when exists (select 1 from public.connections x
                    where x.status = 'pending' and x.addressee_id = mine.me and x.requester_id = o.id)
        then 'incoming'
      else 'none'
    end
  from mine
  join public.connections c on c.status = 'accepted' and p_profile in (c.requester_id, c.addressee_id)
  join public.profiles o
    on o.id = case when c.requester_id = p_profile then c.addressee_id else c.requester_id end
  where public.can_see_member_details(p_profile)
    and o.status = 'approved'
    and not public.are_blocked(mine.me, o.id)
  order by o.display_name
$$;

create or replace function public.member_services(p_profile uuid)
returns table (
  kind           text,
  recipient_id   uuid,
  recipient_name text,
  username       text,
  discipline     text,
  photo_path     text,
  city_name      text,
  completed_on   date
)
language sql
stable
security definer
set search_path = public
as $$
  select
    s.kind,
    case when public.are_blocked((select auth.uid()), s.recipient_id) then null else s.recipient_id end,
    case when public.are_blocked((select auth.uid()), s.recipient_id) then null else r.display_name end,
    case when public.are_blocked((select auth.uid()), s.recipient_id) then null else r.username end,
    case when public.are_blocked((select auth.uid()), s.recipient_id) then null else r.discipline end,
    case when public.are_blocked((select auth.uid()), s.recipient_id) then null else r.photo_path end,
    -- The recipient's private trip is not shown to anyone but the member.
    case when s.trip_is_private and p_profile <> (select auth.uid()) then null else s.city_name end,
    s.completed_on
  from public.completed_services(p_profile) s
  join public.profiles r on r.id = s.recipient_id
  where public.can_see_member_details(p_profile)
  order by s.completed_on desc
$$;

revoke all on function public.member_trips(uuid) from public, anon;
revoke all on function public.member_connections(uuid) from public, anon;
revoke all on function public.member_services(uuid) from public, anon;
grant execute on function public.member_trips(uuid) to authenticated;
grant execute on function public.member_connections(uuid) to authenticated;
grant execute on function public.member_services(uuid) to authenticated;
