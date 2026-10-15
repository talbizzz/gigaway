-- "Friends" become "connections", all the way down.
--
-- Members read "connections"; the code now says so too. This renames the table,
-- its helpers, the stored trip visibility value, the notification types and the
-- setting, so nothing says one thing in the app and another in the database.
--
-- Done as a rename migration because the earlier ones are already applied. Two
-- kinds of thing needed care:
--
--   * Renamed in place (ALTER ... RENAME), which keeps every dependency: the
--     table, the enum, indexes, constraints, policies, triggers, and the
--     functions the triggers and the trips policy point to.
--   * Redefined, because a function body names the table and the helpers as TEXT
--     and a rename does not reach inside it: are_connected, is_connected, the
--     request function, the notification and block triggers, search_members,
--     home_feed and delete_account.
--
-- Values stored in data are updated too: trips.visibility 'friends' becomes
-- 'connections', and notification types 'friend_request_*' become
-- 'connection_request_*'.
--
-- Written to be re-runnable.

-- ── the table and what hangs off it ───────────────────────────────────────
do $$
begin
  if to_regclass('public.friendships') is not null then
    alter table public.friendships rename to connections;
  end if;
  if exists (select 1 from pg_type where typname = 'friendship_status') then
    alter type public.friendship_status rename to connection_status;
  end if;
end $$;

alter index if exists public.friendships_pair rename to connections_pair;
alter index if exists public.friendships_addressee rename to connections_addressee;
alter index if exists public.friendships_requester rename to connections_requester;

do $$
begin
  if exists (select 1 from pg_constraint where conname = 'friendships_pkey') then
    alter table public.connections rename constraint friendships_pkey to connections_pkey;
  end if;
  if exists (select 1 from pg_constraint where conname = 'friendships_requester_id_fkey') then
    alter table public.connections
      rename constraint friendships_requester_id_fkey to connections_requester_id_fkey;
  end if;
  if exists (select 1 from pg_constraint where conname = 'friendships_addressee_id_fkey') then
    alter table public.connections
      rename constraint friendships_addressee_id_fkey to connections_addressee_id_fkey;
  end if;
  if exists (select 1 from pg_constraint where conname = 'no_self_friendship') then
    alter table public.connections rename constraint no_self_friendship to no_self_connection;
  end if;

  if exists (select 1 from pg_policies where tablename = 'connections' and policyname = 'friendships_select_parties') then
    alter policy friendships_select_parties on public.connections rename to connections_select_parties;
  end if;
  if exists (select 1 from pg_policies where tablename = 'connections' and policyname = 'friendships_accept') then
    alter policy friendships_accept on public.connections rename to connections_accept;
  end if;
  if exists (select 1 from pg_policies where tablename = 'connections' and policyname = 'friendships_delete_parties') then
    alter policy friendships_delete_parties on public.connections rename to connections_delete_parties;
  end if;

  if exists (select 1 from pg_trigger where tgname = 'friendships_guard_columns') then
    alter trigger friendships_guard_columns on public.connections rename to connections_guard_columns;
  end if;
  if exists (select 1 from pg_trigger where tgname = 'friendships_notify_on_insert') then
    alter trigger friendships_notify_on_insert on public.connections rename to connections_notify_on_insert;
  end if;
  if exists (select 1 from pg_trigger where tgname = 'friendships_notify_on_accept') then
    alter trigger friendships_notify_on_accept on public.connections rename to connections_notify_on_accept;
  end if;
  if exists (select 1 from pg_trigger where tgname = 'blocks_remove_friendship') then
    alter trigger blocks_remove_friendship on public.blocks rename to blocks_remove_connection;
  end if;
end $$;

comment on table public.connections is
  'One row per pair of members. pending until the addressee accepts; deleted to '
  'decline, cancel or remove the connection.';

-- ── the functions: renamed in place, then given bodies that use the new names ──
do $$
begin
  if to_regprocedure('public.are_friends(uuid,uuid)') is not null then
    alter function public.are_friends(uuid, uuid) rename to are_connected;
  end if;
  if to_regprocedure('public.is_friend(uuid)') is not null then
    alter function public.is_friend(uuid) rename to is_connected;
  end if;
  if to_regprocedure('public.guard_friendship_columns()') is not null then
    alter function public.guard_friendship_columns() rename to guard_connection_columns;
  end if;
  if to_regprocedure('public.notify_on_friendship()') is not null then
    alter function public.notify_on_friendship() rename to notify_on_connection;
  end if;
  if to_regprocedure('public.remove_friendship_on_block()') is not null then
    alter function public.remove_friendship_on_block() rename to remove_connection_on_block;
  end if;
  if to_regprocedure('public.send_friend_request(uuid)') is not null then
    alter function public.send_friend_request(uuid) rename to send_connection_request;
  end if;
end $$;

create or replace function public.are_connected(a uuid, b uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select a is not null and b is not null and exists (
    select 1 from public.connections f
    where f.status = 'accepted'
      and ((f.requester_id = a and f.addressee_id = b)
        or (f.requester_id = b and f.addressee_id = a))
  );
$$;

create or replace function public.is_connected(other uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select public.are_connected((select auth.uid()), other);
$$;

create or replace function public.guard_connection_columns()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  if current_user in ('service_role', 'postgres', 'supabase_admin') then
    return new;
  end if;

  if new.id is distinct from old.id
     or new.requester_id is distinct from old.requester_id
     or new.addressee_id is distinct from old.addressee_id
     or new.created_at   is distinct from old.created_at then
    raise exception 'only connections.status is client-updatable'
      using errcode = '42501';
  end if;

  if new.status is distinct from old.status then
    new.responded_at := now();
  end if;

  return new;
end;
$$;

create or replace function public.send_connection_request(p_user uuid)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_me       uuid := (select auth.uid());
  v_existing public.connections%rowtype;
begin
  if v_me is null then
    return jsonb_build_object('ok', false, 'error', 'unauthenticated');
  end if;

  if v_me = p_user then
    return jsonb_build_object('ok', false, 'error', 'self');
  end if;

  if not exists (select 1 from public.profiles p where p.id = v_me and p.status = 'approved') then
    return jsonb_build_object('ok', false, 'error', 'not_approved');
  end if;

  -- A blocked or unapproved target looks exactly like one that does not exist.
  if not exists (select 1 from public.profiles p where p.id = p_user and p.status = 'approved')
     or public.are_blocked(v_me, p_user) then
    return jsonb_build_object('ok', false, 'error', 'user_not_found');
  end if;

  select * into v_existing from public.connections f
   where least(f.requester_id, f.addressee_id) = least(v_me, p_user)
     and greatest(f.requester_id, f.addressee_id) = greatest(v_me, p_user);

  if found then
    if v_existing.status = 'accepted' then
      return jsonb_build_object('ok', true, 'status', 'connected');
    end if;

    -- They asked first: asking back is saying yes.
    if v_existing.requester_id = p_user then
      update public.connections set status = 'accepted' where id = v_existing.id;
      return jsonb_build_object('ok', true, 'status', 'connected');
    end if;

    return jsonb_build_object('ok', true, 'status', 'requested');
  end if;

  if (select count(*) from public.connections f
       where f.requester_id = v_me and f.status = 'pending')
     >= public.config_int('max_pending_connection_requests') then
    return jsonb_build_object('ok', false, 'error', 'too_many_pending');
  end if;

  insert into public.connections (requester_id, addressee_id) values (v_me, p_user);
  return jsonb_build_object('ok', true, 'status', 'requested');
end;
$$;

revoke all on function public.send_connection_request(uuid) from public, anon, authenticated;
grant execute on function public.send_connection_request(uuid) to authenticated;

create or replace function public.notify_on_connection()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if tg_op = 'INSERT' then
    perform public.enqueue_notification(
      new.addressee_id,
      'connection_request_received',
      jsonb_build_object(
        'fromProfileId', new.requester_id,
        'fromName', public.display_name_of(new.requester_id)
      )
    );
  elsif new.status = 'accepted' and old.status = 'pending' then
    perform public.enqueue_notification(
      new.requester_id,
      'connection_request_accepted',
      jsonb_build_object(
        'fromProfileId', new.addressee_id,
        'fromName', public.display_name_of(new.addressee_id)
      )
    );
  end if;

  return null;
end;
$$;

create or replace function public.remove_connection_on_block()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  delete from public.connections f
   where (f.requester_id = new.blocker_id and f.addressee_id = new.blocked_id)
      or (f.requester_id = new.blocked_id and f.addressee_id = new.blocker_id);
  return null;
end;
$$;

create or replace function public.search_members(p_query text, p_limit integer default 20)
returns table (
  profile_id     uuid,
  display_name   text,
  username       text,
  discipline     text,
  specialisation text,
  photo_path     text,
  home_city      text,
  relationship   text
)
language sql
stable
set search_path = public
as $$
  with q as (
    select btrim(coalesce(p_query, '')) as raw,
           lower(regexp_replace(btrim(coalesce(p_query, '')), '^@', '')) as norm
  )
  select
    p.id, p.display_name, p.username, p.discipline, p.specialisation, p.photo_path, c.name,
    case
      when f.id is null then 'none'
      when f.status = 'accepted' then 'connected'
      when f.requester_id = (select auth.uid()) then 'requested'
      else 'incoming'
    end
  from public.profiles p
  cross join q
  left join public.cities c on c.id = p.home_city_id
  left join public.connections f
    on (f.requester_id = p.id and f.addressee_id = (select auth.uid()))
    or (f.addressee_id = p.id and f.requester_id = (select auth.uid()))
  where length(q.norm) >= 2
    and p.id <> (select auth.uid())
    and p.status = 'approved'
    and (
      starts_with(p.username, q.norm)
      or strpos(lower(concat_ws(' ', p.first_name, p.last_name)), lower(q.raw)) > 0
      or strpos(lower(p.display_name), lower(q.raw)) > 0
    )
  order by (p.username = q.norm) desc,
           (f.status = 'accepted') desc nulls last,
           p.display_name
  limit least(greatest(coalesce(p_limit, 20), 1), 50)
$$;

-- ── the setting ───────────────────────────────────────────────────────────
update public.app_config set key = 'max_pending_connection_requests'
 where key = 'max_pending_friend_requests';

-- ── what is stored in data ────────────────────────────────────────────────
-- Trip visibility: 'friends' becomes 'connections'. The constraint is dropped
-- first, because it still forbids the new word.
alter table public.trips drop constraint if exists trip_visibility_known;
update public.trips set visibility = 'connections' where visibility = 'friends';
alter table public.trips
  add constraint trip_visibility_known check (visibility in ('public', 'connections', 'private'));

comment on column public.trips.visibility is
  'public: connections, residents of the destination and overlapping visitors. '
  'connections: connections only. private: only people it was sent to.';

-- The viewing policy names the stored value, so it is recreated.
drop policy if exists trips_select_members on public.trips;
create policy trips_select_members
  on public.trips for select
  to authenticated
  using (
    profile_id <> (select auth.uid())
    and status = 'active'
    and public.can_browse()
    and not public.is_blocked(profile_id)
    and exists (
      select 1 from public.profiles p
      where p.id = trips.profile_id and p.status = 'approved'
    )
    and (
      public.is_party_to_trip(id)
      or (visibility in ('public', 'connections') and public.is_connected(profile_id))
      or (visibility = 'public' and public.in_city_during(city_id, start_date, end_date))
    )
  );

-- Notification types: 'friend_request_*' become 'connection_request_*'.
alter table public.notifications drop constraint if exists notification_type_known;
update public.notifications set type = 'connection_request_received' where type = 'friend_request_received';
update public.notifications set type = 'connection_request_accepted' where type = 'friend_request_accepted';
alter table public.notifications add constraint notification_type_known check (type in (
  'request_received',
  'co_request_received',
  'offer_received',
  'offer_accepted',
  'offer_confirmed',
  'offer_declined',
  'co_request_accepted',
  'co_request_declined',
  'request_withdrawn',
  'review_prompt',
  'review_reminder',
  'review_published',
  'report_received',
  'connection_request_received',
  'connection_request_accepted',
  'tips_request_received',
  'coffee_request_received'
));

-- ── triggers that name a function that has just been redefined ────────────
drop trigger if exists connections_guard_columns on public.connections;
create trigger connections_guard_columns
  before update on public.connections
  for each row execute function public.guard_connection_columns();

drop trigger if exists connections_notify_on_insert on public.connections;
create trigger connections_notify_on_insert
  after insert on public.connections
  for each row execute function public.notify_on_connection();

drop trigger if exists connections_notify_on_accept on public.connections;
create trigger connections_notify_on_accept
  after update of status on public.connections
  for each row execute function public.notify_on_connection();

drop trigger if exists blocks_remove_connection on public.blocks;
create trigger blocks_remove_connection
  after insert on public.blocks
  for each row execute function public.remove_connection_on_block();

-- ── the home feed and account deletion, which name the table ──────────────
create or replace function public.home_feed()
returns jsonb
language plpgsql
stable
set search_path = public
as $$
declare
  v_me           uuid := (select auth.uid());
  v_home_city    uuid;
  v_home_name    text;
  v_today        date := current_date;
  v_here         jsonb;
  v_coming       jsonb;
  v_destinations jsonb;
  v_connections      jsonb;
begin
  -- The name comes back with the id because the feed titles two of its bands
  -- with it, and a second round trip for one string is not worth it.
  select p.home_city_id, c.name into v_home_city, v_home_name
  from public.profiles p
  left join public.cities c on c.id = p.home_city_id
  where p.id = v_me;

  -- ── in my city today ─────────────────────────────────────────────────────
  --
  -- Guarded on the home city rather than returning early: a member who has not
  -- set one still gets their destinations, which do not depend on it.
  select coalesce(
    jsonb_agg(
      jsonb_build_object(
        'tripId', m.trip_id,
        'profile', jsonb_build_object(
          'id', m.profile_id,
          'displayName', m.display_name,
          'discipline', m.discipline,
          'specialisation', m.specialisation,
          'photoPath', m.photo_path,
          'homeDistrict', m.home_district
        ),
        'start', m.start_date,
        'end', m.end_date,
        'needs', m.needs
      )
      order by m.end_date asc
    ),
    '[]'::jsonb
  )
  into v_here
  from (
    select t.id as trip_id, p.id as profile_id, p.display_name, p.discipline,
           p.specialisation, p.photo_path, p.home_district,
           t.start_date, t.end_date, t.needs
    from public.trips t
    join public.profiles p on p.id = t.profile_id
    where v_home_city is not null
      and t.city_id = v_home_city
      and t.status = 'active'
      and t.profile_id <> v_me
      and v_today between t.start_date and t.end_date
    order by t.end_date asc
    limit 20
  ) m;

  -- ── arriving in my city within the month ─────────────────────────────────
  select coalesce(
    jsonb_agg(
      jsonb_build_object(
        'tripId', m.trip_id,
        'profile', jsonb_build_object(
          'id', m.profile_id,
          'displayName', m.display_name,
          'discipline', m.discipline,
          'specialisation', m.specialisation,
          'photoPath', m.photo_path,
          'homeDistrict', m.home_district
        ),
        'start', m.start_date,
        'end', m.end_date,
        'needs', m.needs
      )
      order by m.start_date asc
    ),
    '[]'::jsonb
  )
  into v_coming
  from (
    select t.id as trip_id, p.id as profile_id, p.display_name, p.discipline,
           p.specialisation, p.photo_path, p.home_district,
           t.start_date, t.end_date, t.needs
    from public.trips t
    join public.profiles p on p.id = t.profile_id
    where v_home_city is not null
      and t.city_id = v_home_city
      and t.status = 'active'
      and t.profile_id <> v_me
      and t.start_date > v_today
      and t.start_date <= v_today + interval '1 month'
    order by t.start_date asc
    limit 20
  ) m;

  -- ── who will be in the cities I am going to ──────────────────────────────
  --
  -- Three kinds of person, ranked in the order they are useful to a traveller:
  -- someone offering nights that cover the trip, then someone who simply lives
  -- there and has no trip taking them away, then a colleague who will be
  -- visiting at the same time. One row per person — a local who has also posted
  -- availability is a host, not both, which is what the distinct on settles.
  --
  -- The feed shows the first three and links into the trip screen for the rest,
  -- so the total is counted before the cut.
  with my_trips as (
    select t.id, t.city_id, c.name as city_name, t.start_date, t.end_date
    from public.trips t
    join public.cities c on c.id = t.city_id
    where t.profile_id = v_me
      and t.status = 'active'
      and t.end_date >= v_today
    order by t.start_date asc
    limit 10
  ),
  candidates as (
    select distinct on (u.trip_id, u.profile_id) u.*
    from (
      select
        mt.id                 as trip_id,
        1                     as sort_rank,
        'host'::text          as kind,
        a.id                  as availability_id,
        null::uuid            as matched_trip_id,
        p.id                  as profile_id,
        p.display_name,
        p.discipline,
        p.specialisation,
        p.photo_path,
        p.home_district
      from my_trips mt
      join public.availability a
        on a.city_id = mt.city_id
       and a.status = 'active'
       and a.profile_id <> v_me
       and daterange(a.start_date, a.end_date, '[]')
           && daterange(mt.start_date, mt.end_date, '[]')
      join public.profiles p on p.id = a.profile_id

      union all

      select
        mt.id, 2, 'local'::text, null::uuid, null::uuid,
        p.id, p.display_name, p.discipline, p.specialisation, p.photo_path,
        p.home_district
      from my_trips mt
      join public.profiles p
        on p.home_city_id = mt.city_id
       and p.id <> v_me
      where not exists (
        select 1
        from public.trips away
        where away.profile_id = p.id
          and away.status = 'active'
          and daterange(away.start_date, away.end_date, '[]')
              && daterange(mt.start_date, mt.end_date, '[]')
      )

      union all

      select
        mt.id, 3, 'traveller'::text, null::uuid, other.id,
        p.id, p.display_name, p.discipline, p.specialisation, p.photo_path,
        p.home_district
      from my_trips mt
      join public.trips other
        on other.city_id = mt.city_id
       and other.status = 'active'
       and other.profile_id <> v_me
       and other.id <> mt.id
       and daterange(other.start_date, other.end_date, '[]')
           && daterange(mt.start_date, mt.end_date, '[]')
      join public.profiles p on p.id = other.profile_id
    ) u
    order by u.trip_id, u.profile_id, u.sort_rank asc
  ),
  -- Numbered here rather than with a per-trip LIMIT below: a subquery in a FROM
  -- clause cannot see the outer trip without LATERAL, and a window function
  -- says the same thing without the ceremony.
  ranked as (
    select
      c.*,
      row_number() over (
        partition by c.trip_id
        order by c.sort_rank asc, c.display_name asc
      ) as position
    from candidates c
  )
  select coalesce(
    jsonb_agg(
      jsonb_build_object(
        'tripId', mt.id,
        'cityId', mt.city_id,
        'cityName', mt.city_name,
        'start', mt.start_date,
        'end', mt.end_date,
        'total', (select count(*) from candidates c where c.trip_id = mt.id),
        'people', coalesce(
          (
            select jsonb_agg(
              jsonb_build_object(
                'kind', r.kind,
                'availabilityId', r.availability_id,
                'tripId', r.matched_trip_id,
                'profile', jsonb_build_object(
                  'id', r.profile_id,
                  'displayName', r.display_name,
                  'discipline', r.discipline,
                  'specialisation', r.specialisation,
                  'photoPath', r.photo_path,
                  'homeDistrict', r.home_district
                )
              )
              order by r.position asc
            )
            from ranked r
            where r.trip_id = mt.id
              and r.position <= 3
          ),
          '[]'::jsonb
        )
      )
      order by mt.start_date asc
    ),
    '[]'::jsonb
  )
  into v_destinations
  from my_trips mt;

  -- ── what my connections are doing ────────────────────────────────────────────
  --
  -- Connections' trips that have not finished, soonest first, wherever they are
  -- going. Which trips I may see at all is the trips policy's decision (a connection's
  -- public and connections-only trips, never a private one), so nothing here repeats
  -- that. A trip already shown above, because it is in my own city, is left out so
  -- it does not appear twice.
  select coalesce(
    jsonb_agg(
      jsonb_build_object(
        'tripId', m.trip_id,
        'cityId', m.city_id,
        'cityName', m.city_name,
        'profile', jsonb_build_object(
          'id', m.profile_id,
          'displayName', m.display_name,
          'discipline', m.discipline,
          'specialisation', m.specialisation,
          'photoPath', m.photo_path,
          'homeDistrict', m.home_district
        ),
        'start', m.start_date,
        'end', m.end_date,
        'needs', m.needs
      )
      order by m.start_date asc
    ),
    '[]'::jsonb
  )
  into v_connections
  from (
    select t.id as trip_id, t.city_id, c.name as city_name, p.id as profile_id,
           p.display_name, p.discipline, p.specialisation, p.photo_path, p.home_district,
           t.start_date, t.end_date, t.needs
    from public.trips t
    join public.profiles p on p.id = t.profile_id
    join public.cities c on c.id = t.city_id
    where t.status = 'active'
      and t.profile_id <> v_me
      and t.end_date >= v_today
      and public.are_connected(v_me, t.profile_id)
      and not (
        v_home_city is not null
        and t.city_id = v_home_city
        and (
          v_today between t.start_date and t.end_date
          or (t.start_date > v_today and t.start_date <= v_today + interval '1 month')
        )
      )
    order by t.start_date asc
    limit 20
  ) m;

  return jsonb_build_object(
    'homeCityName', v_home_name,
    'inYourCity', v_here,
    'comingToYourCity', v_coming,
    'destinations', v_destinations,
    'connections', v_connections
  );
end;
$$;

create or replace function public.delete_account(p_user uuid)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_photo_path text;
  v_email      text;
  v_legal_name text;
  v_reported   boolean;
  v_actioned   boolean;
  v_days       integer;
begin
  select photo_path into v_photo_path from public.profiles where id = p_user;

  -- ── the hold: keep who this was, for a limited time ─────────────────────
  -- Everything below erases the member, which also erases the only link
  -- between a retained report or stay and a real person. So first copy the
  -- identity into deletion_holds, where it waits out a short window (or a long
  -- one if anyone reported them) before purge-deletion-holds erases it, files
  -- included. Taken before anything is deleted, in this same transaction.
  select email into v_email from auth.users where id = p_user;

  select exists (
           select 1 from public.reports r
            where r.subject_id = p_user and r.status in ('open', 'reviewing', 'actioned')),
         exists (
           select 1 from public.reports r
            where r.subject_id = p_user and r.status = 'actioned')
    into v_reported, v_actioned;

  v_days := case when v_reported
                 then public.config_int('deletion_hold_reported_days')
                 else public.config_int('deletion_hold_days') end;

  insert into public.deletion_holds
    (profile_id, tier, held_until, email, first_name, last_name, full_legal_name,
     phone, links, selfie_path, cv_path)
  select p.id,
         case when v_reported then 'reported' else 'standard' end,
         now() + make_interval(days => v_days),
         v_email, p.first_name, p.last_name, a.full_legal_name,
         cd.phone, a.links, a.selfie_path, a.cv_path
    from public.profiles p
    left join public.contact_details cd on cd.profile_id = p.id
    left join public.verification_applications a on a.profile_id = p.id
   where p.id = p_user and p.status <> 'deleted'
  on conflict (profile_id) do nothing;

  -- Someone whose reports were acted on leaves a one-way fingerprint behind,
  -- so signing up again as the same person is flagged to a moderator. Only
  -- the fingerprints are kept, and only for this case.
  if v_actioned then
    select full_legal_name into v_legal_name
      from public.verification_applications where profile_id = p_user;
    insert into public.conduct_bans (email_hash, name_hash, source_profile_id)
    values (public.fingerprint(v_email), public.fingerprint(v_legal_name), p_user);
  end if;

  -- ── things nobody else needs ────────────────────────────────────────────
  delete from public.contact_details where profile_id = p_user;
  delete from public.push_tokens where profile_id = p_user;
  delete from public.notifications where profile_id = p_user;
  delete from public.verification_applications where profile_id = p_user;
  delete from public.data_exports where profile_id = p_user;

  -- The grant is meaningless once contact_details are gone, and leaving it
  -- would show the counterparty a contact with nothing behind it.
  delete from public.contact_grants
    where profile_a = p_user or profile_b = p_user;

  -- Blocks THEY created go. Blocks created AGAINST them stay, so that somebody
  -- who blocked this person for a reason is not quietly re-exposed to them if
  -- the account is ever recreated.
  delete from public.blocks where blocker_id = p_user;

  -- Connections go with the member: they were between two people, and one of
  -- them no longer exists. Their connections are not told.
  delete from public.connections
    where requester_id = p_user or addressee_id = p_user;

  -- Reviews about them serve no purpose once they are gone. Reviews they WROTE
  -- about other people stay if published — see the note above — and the author
  -- now points at the tombstone, which renders as "Deleted member".
  delete from public.reviews where subject_id = p_user;
  delete from public.reviews where author_id = p_user and published_at is null;

  -- ── anything not underpinning a stay ────────────────────────────────────
  -- Order matters: requests and offers cascade from trips, and stays cascade
  -- from offers, so a naive "delete their trips" would take somebody else's
  -- stay with it.
  delete from public.requests
    where (from_profile = p_user or to_profile = p_user)
      and status <> 'accepted';

  delete from public.offers o
    where (o.from_profile = p_user or o.to_profile = p_user)
      and not exists (select 1 from public.stays s where s.offer_id = o.id);

  delete from public.availability where profile_id = p_user;

  delete from public.trips t
    where t.profile_id = p_user
      and not exists (
        select 1 from public.offers o
        join public.stays s on s.offer_id = o.id
        where o.trip_id = t.id
      );

  -- A trip that produced a stay survives, stripped of its free text. The dates
  -- and city are the counterparty's record of where they hosted somebody.
  update public.trips set note = null where profile_id = p_user;

  -- ── the tombstone ───────────────────────────────────────────────────────
  update public.profiles
    set display_name   = 'Deleted member',
        specialisation = null,
        bio            = null,
        home_district  = null,
        home_city_id   = null,
        photo_path     = null,
        links          = '[]'::jsonb,
        status         = 'deleted'
    where id = p_user;

  -- stays, published reviews they wrote, and reports in both directions are
  -- all retained deliberately and now point at the tombstone.

  -- The selfie and CV are deliberately NOT returned: the Edge Function that
  -- calls this used to delete them straight away, and now must not. They stay
  -- in Storage until the hold expires.
  return jsonb_build_object('ok', true, 'photoPath', v_photo_path);
end;
$$;
