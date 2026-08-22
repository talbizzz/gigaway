-- Milestone 3 — requests, offers and stays.
--
-- The core loop: a traveller asks, a host commits to specific nights, and
-- acceptance produces a contact grant and a stay. This migration is everything
-- the loop needs except the acceptance transaction itself, which cannot be a
-- policy (it spans four tables) and lives in the accept-offer Edge Function.
--
-- DATE SEMANTICS, unchanged from Milestone 2: start_date and end_date are the
-- FIRST and LAST NIGHT, inclusive, and every daterange is built with '[]'.
-- See packages/shared/src/domain/dates.ts.

-- ───────────────────────────────────────────────────────────────────────────
-- Tunables
--
-- The request cap is a spam guard, not a product rule, so it belongs where it
-- can be changed without a deploy.
--
-- nearby_radius_km MUST agree with the literal 100 in search_matches (see the
-- note on the offer containment trigger below). It is seeded to the same value
-- rather than left implicit so there is one place to look when it changes.
-- ───────────────────────────────────────────────────────────────────────────
insert into public.app_config (key, value) values
  ('max_requests_per_trip', '10'::jsonb),
  ('nearby_radius_km',      '100'::jsonb)
on conflict (key) do nothing;

-- ───────────────────────────────────────────────────────────────────────────
-- requests
--
-- Two kinds that behave differently after they are sent:
--
--   host_stay        → the host responds by creating an OFFER, which may cover
--                      fewer nights than were asked for.
--   co_accommodation → sent to another traveller. There is no offer step:
--                      neither party has a couch, so nothing is being
--                      negotiated on-platform. Accepting reveals contact and
--                      the two of them book something together off-platform.
-- ───────────────────────────────────────────────────────────────────────────
create type public.request_kind   as enum ('host_stay', 'co_accommodation');
create type public.request_status as enum
  ('pending', 'accepted', 'declined', 'withdrawn', 'expired');

create table public.requests (
  id           uuid primary key default gen_random_uuid(),
  kind         public.request_kind not null,
  trip_id      uuid not null references public.trips(id) on delete cascade,
  from_profile uuid not null references public.profiles(id) on delete cascade,
  to_profile   uuid not null references public.profiles(id) on delete cascade,
  message      text,
  status       public.request_status not null default 'pending',
  created_at   timestamptz not null default now(),
  responded_at timestamptz,

  constraint no_self_request check (from_profile <> to_profile),
  constraint request_message_length check (message is null or char_length(message) <= 500),
  -- One ask per person per trip. A withdrawn request therefore cannot be
  -- re-sent to the same person for the same trip; that is deliberate for v1 —
  -- it is the spam guard. If the beta complains, relax this to a partial
  -- unique index over pending rows only.
  unique (trip_id, to_profile, kind)
);

create index requests_to   on public.requests (to_profile, status);
create index requests_trip on public.requests (trip_id);
create index requests_from on public.requests (from_profile, created_at desc);

comment on table public.requests is
  'A traveller signalling interest, in one tap from the match screen. '
  'host_stay is answered with an offer; co_accommodation is accepted directly.';

-- ───────────────────────────────────────────────────────────────────────────
-- offers
--
-- PARTIAL DATE RANGES ARE FIRST-CLASS. A host offering three nights of a
-- seven-night trip is the product working, not falling short, and both the
-- schema and the copy treat it that way.
--
-- request_id is nullable: a host may offer proactively against an open trip
-- they found themselves, with no prior request.
-- ───────────────────────────────────────────────────────────────────────────
create type public.offer_status as enum
  ('pending', 'accepted', 'declined', 'withdrawn', 'expired');

create table public.offers (
  id            uuid primary key default gen_random_uuid(),
  request_id    uuid references public.requests(id) on delete set null,
  trip_id       uuid not null references public.trips(id) on delete cascade,
  from_profile  uuid not null references public.profiles(id) on delete cascade,
  to_profile    uuid not null references public.profiles(id) on delete cascade,
  -- Set by the containment trigger from the availability row that covers the
  -- offered nights. For a nearby-city host this is NOT the trip's destination
  -- city, and it is the city the guest actually sleeps in — so it is what the
  -- stay records.
  city_id       uuid references public.cities(id),
  start_date    date not null,
  end_date      date not null,
  message       text,
  status        public.offer_status not null default 'pending',
  auto_declined boolean not null default false,
  created_at    timestamptz not null default now(),
  responded_at  timestamptz,

  constraint offer_dates_ordered check (end_date >= start_date),
  constraint no_self_offer check (from_profile <> to_profile),
  constraint offer_message_length check (message is null or char_length(message) <= 500)
);

create index offers_to   on public.offers (to_profile, status);
create index offers_trip on public.offers (trip_id, status);
create index offers_from on public.offers (from_profile, created_at desc);
create index offers_request on public.offers (request_id);

comment on column public.offers.auto_declined is
  'True when accept-offer declined this row because a sibling offer on the '
  'same trip was accepted, rather than the traveller declining it by hand. '
  'The notification copy differs.';

-- ───────────────────────────────────────────────────────────────────────────
-- stays
--
-- The reviewable unit. Created by accept-offer, never by a client. Records the
-- nights that were actually agreed, which may be fewer than the trip's.
--
-- Co-accommodation produces NO stay: nobody hosted anybody, and "would host
-- again" does not map onto splitting a flat.
-- ───────────────────────────────────────────────────────────────────────────
create table public.stays (
  id         uuid primary key default gen_random_uuid(),
  offer_id   uuid not null unique references public.offers(id) on delete cascade,
  host_id    uuid not null references public.profiles(id) on delete cascade,
  guest_id   uuid not null references public.profiles(id) on delete cascade,
  city_id    uuid not null references public.cities(id),
  start_date date not null,
  end_date   date not null,
  created_at timestamptz not null default now(),

  constraint stay_dates_ordered check (end_date >= start_date),
  constraint no_self_stay check (host_id <> guest_id)
);

-- Milestone 4 sweeps this to prompt reviews once a stay has ended.
create index stays_end on public.stays (end_date);
create index stays_host on public.stays (host_id);
create index stays_guest on public.stays (guest_id);

comment on column public.stays.end_date is
  'Last night, inclusive. Milestone 4 compares this against current_date in '
  'Postgres — never a client clock — to decide when to prompt for a review.';

-- ───────────────────────────────────────────────────────────────────────────
-- Request cap
--
-- SECURITY DEFINER because a policy on `requests` that counted `requests`
-- directly would recurse: Postgres applies the table's own policies to the
-- subquery and raises 'infinite recursion detected in policy'.
-- ───────────────────────────────────────────────────────────────────────────
create or replace function public.trip_request_count(p_trip_id uuid)
returns integer
language sql
stable
security definer
set search_path = public
as $$
  select count(*)::integer from public.requests where trip_id = p_trip_id;
$$;

comment on function public.trip_request_count is
  'Counts every request ever sent for a trip, including withdrawn ones. '
  'Withdrawing does not buy another slot — otherwise the cap is not a cap.';

-- ───────────────────────────────────────────────────────────────────────────
-- Offer range containment
--
-- Done Criteria: "The offer form rejects a range outside trip ∩ availability,
-- at the database level." A client-side check is a courtesy; this is the rule.
--
-- SECURITY DEFINER so the check sees the trip and the availability regardless
-- of the caller's own visibility. The error messages deliberately reveal
-- nothing about rows the caller could not otherwise read.
--
-- NEARBY HOSTS: Milestone 2's match screen surfaces hosts in cities within
-- 100 km when the destination is thin, and a traveller can request them. If
-- containment demanded availability in the trip's city exactly, those hosts
-- could never answer and the flow would dead-end on the one path built to
-- solve cold start. So availability in any city within nearby_radius_km of the
-- destination counts. Keep that key in step with the literal in
-- search_matches.
-- ───────────────────────────────────────────────────────────────────────────
create or replace function public.enforce_offer_range()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_trip    public.trips%rowtype;
  v_city    public.cities%rowtype;
  v_radius  integer := public.config_int('nearby_radius_km');
  v_city_id uuid;
begin
  select * into v_trip from public.trips t where t.id = new.trip_id;
  if not found then
    raise exception 'that trip no longer exists' using errcode = '23503';
  end if;

  if new.to_profile <> v_trip.profile_id then
    raise exception 'an offer must be addressed to the traveller who posted the trip'
      using errcode = '23514';
  end if;

  if not (daterange(v_trip.start_date, v_trip.end_date, '[]')
          @> daterange(new.start_date, new.end_date, '[]')) then
    raise exception 'the offered nights fall outside the trip'
      using errcode = '23514';
  end if;

  select * into v_city from public.cities c where c.id = v_trip.city_id;

  -- The availability row that covers the offered nights also decides where the
  -- stay happens. Nearest city first, so a host with availability in both the
  -- destination and a neighbouring city resolves to the destination.
  select a.city_id into v_city_id
  from public.availability a
  join public.cities c on c.id = a.city_id
  where a.profile_id = new.from_profile
    and a.status = 'active'
    and daterange(a.start_date, a.end_date, '[]')
        @> daterange(new.start_date, new.end_date, '[]')
    and (
      a.city_id = v_trip.city_id
      or public.distance_km(v_city.lat, v_city.lon, c.lat, c.lon) <= v_radius
    )
  order by public.distance_km(v_city.lat, v_city.lon, c.lat, c.lon) asc
  limit 1;

  if v_city_id is null then
    raise exception 'those nights are not inside any availability you have posted'
      using errcode = '23514';
  end if;

  new.city_id := v_city_id;
  return new;
end;
$$;

create trigger offers_enforce_range
  before insert or update of trip_id, from_profile, to_profile, start_date, end_date
  on public.offers
  for each row execute function public.enforce_offer_range();

-- ───────────────────────────────────────────────────────────────────────────
-- Column guards
--
-- Same shape as profiles_guard_privileged_columns in Milestone 1, and load-
-- bearing for the same reason: the update policies below decide WHICH row may
-- be touched, not which columns. Without these, a host withdrawing an offer
-- could also rewrite its dates, and a traveller declining one could rewrite
-- its message.
--
-- Invoker rights deliberately — in a SECURITY DEFINER function current_user is
-- the owner, which would silently disable the guard for everybody.
-- ───────────────────────────────────────────────────────────────────────────
create or replace function public.guard_request_columns()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  if current_user in ('service_role', 'postgres', 'supabase_admin') then
    return new;
  end if;

  if new.id           is distinct from old.id
     or new.kind         is distinct from old.kind
     or new.trip_id      is distinct from old.trip_id
     or new.from_profile is distinct from old.from_profile
     or new.to_profile   is distinct from old.to_profile
     or new.message      is distinct from old.message
     or new.created_at   is distinct from old.created_at then
    raise exception 'only requests.status is client-updatable'
      using errcode = '42501';
  end if;

  if new.status is distinct from old.status then
    new.responded_at := now();
  end if;

  return new;
end;
$$;

create trigger requests_guard_columns
  before update on public.requests
  for each row execute function public.guard_request_columns();

create or replace function public.guard_offer_columns()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  if current_user in ('service_role', 'postgres', 'supabase_admin') then
    return new;
  end if;

  if new.id            is distinct from old.id
     or new.request_id    is distinct from old.request_id
     or new.trip_id       is distinct from old.trip_id
     or new.from_profile  is distinct from old.from_profile
     or new.to_profile    is distinct from old.to_profile
     or new.city_id       is distinct from old.city_id
     or new.start_date    is distinct from old.start_date
     or new.end_date      is distinct from old.end_date
     or new.message       is distinct from old.message
     or new.auto_declined is distinct from old.auto_declined
     or new.created_at    is distinct from old.created_at then
    raise exception 'only offers.status is client-updatable'
      using errcode = '42501';
  end if;

  if new.status is distinct from old.status then
    new.responded_at := now();
  end if;

  return new;
end;
$$;

create trigger offers_guard_columns
  before update on public.offers
  for each row execute function public.guard_offer_columns();

-- ───────────────────────────────────────────────────────────────────────────
-- RLS
--
-- Requests and offers are private to their two parties. A third member — even
-- an approved one, even the host of a competing offer on the same trip — sees
-- nothing. is_blocked() is still the Milestone 1 stub; calling it here means
-- Milestone 4 needs no policy rewrites.
-- ───────────────────────────────────────────────────────────────────────────
alter table public.requests enable row level security;
alter table public.offers   enable row level security;
alter table public.stays    enable row level security;

create policy requests_select_parties
  on public.requests for select
  to authenticated
  using (
    from_profile = (select auth.uid()) or to_profile = (select auth.uid())
  );

create policy requests_insert_own
  on public.requests for insert
  to authenticated
  with check (
    from_profile = (select auth.uid())
    and public.is_approved()
    and not public.is_blocked(to_profile)
    -- The caller must own the trip they are requesting against, and it must
    -- still be live. Without the ownership check, anyone could send requests
    -- in someone else's name by passing their trip id.
    and exists (
      select 1 from public.trips t
      where t.id = trip_id
        and t.profile_id = (select auth.uid())
        and t.status = 'active'
    )
    and exists (
      select 1 from public.profiles p
      where p.id = to_profile and p.status = 'approved'
    )
    and public.trip_request_count(trip_id) < public.config_int('max_requests_per_trip')
  );

-- Withdrawal only. Acceptance goes through an Edge Function, because it has to
-- write a contact grant and a stay in the same transaction.
create policy requests_withdraw_own
  on public.requests for update
  to authenticated
  using (from_profile = (select auth.uid()) and status = 'pending')
  with check (from_profile = (select auth.uid()) and status = 'withdrawn');

-- The recipient of a co-accommodation request may decline it outright.
-- Accepting is the Edge Function's job.
create policy requests_decline_received
  on public.requests for update
  to authenticated
  using (to_profile = (select auth.uid()) and status = 'pending')
  with check (to_profile = (select auth.uid()) and status = 'declined');

create policy offers_select_parties
  on public.offers for select
  to authenticated
  using (
    from_profile = (select auth.uid()) or to_profile = (select auth.uid())
  );

create policy offers_insert_own
  on public.offers for insert
  to authenticated
  with check (
    from_profile = (select auth.uid())
    and public.is_approved()
    and not public.is_blocked(to_profile)
    and status = 'pending'
    and not auto_declined
    -- Proactive offers are allowed, so no request is required here — only a
    -- live trip. The range containment trigger does the rest.
    and exists (
      select 1 from public.trips t
      where t.id = trip_id and t.status = 'active'
    )
    and exists (
      select 1 from public.profiles p
      where p.id = to_profile and p.status = 'approved'
    )
  );

create policy offers_withdraw_own
  on public.offers for update
  to authenticated
  using (from_profile = (select auth.uid()) and status = 'pending')
  with check (from_profile = (select auth.uid()) and status = 'withdrawn');

create policy offers_decline_received
  on public.offers for update
  to authenticated
  using (to_profile = (select auth.uid()) and status = 'pending')
  with check (to_profile = (select auth.uid()) and status = 'declined');

-- Stays are written by accept-offer as service_role and read by the two
-- parties. No client insert, update or delete policy exists at all.
create policy stays_select_parties
  on public.stays for select
  to authenticated
  using (
    host_id = (select auth.uid()) or guest_id = (select auth.uid())
  );

-- ───────────────────────────────────────────────────────────────────────────
-- Grants
--
-- Per the Milestone 1 convention, `authenticated` is granted table by table
-- next to the policies it accompanies. No delete anywhere: a withdrawn request
-- and a declined offer are history, and Milestone 4's reviews hang off it.
-- ───────────────────────────────────────────────────────────────────────────
grant select, insert, update on public.requests to authenticated;
grant select, insert, update on public.offers to authenticated;
grant select on public.stays to authenticated;

-- ───────────────────────────────────────────────────────────────────────────
-- offerable_windows
--
-- The nights this host could legally offer against a trip: their active
-- availability, clipped to the trip, under exactly the rule enforce_offer_range
-- enforces — including the nearby-city allowance.
--
-- It exists so the offer form can bound its date picker without restating that
-- rule in TypeScript. A client-side copy of a security rule is a client-side
-- copy that drifts; this way the form and the trigger cannot disagree, because
-- there is only one rule.
--
-- INVOKER RIGHTS, like search_matches: RLS must stay active so a host can only
-- ask about a trip they are allowed to see.
-- ───────────────────────────────────────────────────────────────────────────
create or replace function public.offerable_windows(p_trip_id uuid)
returns table (
  availability_id uuid,
  city_id         uuid,
  city_name       text,
  distance_km     numeric,
  window_start    date,
  window_end      date,
  max_nights      integer
)
language plpgsql
stable
set search_path = public
as $$
declare
  v_trip   public.trips%rowtype;
  v_city   public.cities%rowtype;
  v_radius integer := public.config_int('nearby_radius_km');
begin
  select * into v_trip from public.trips t
   where t.id = p_trip_id and t.status = 'active';
  if not found then
    return;
  end if;

  select * into v_city from public.cities c where c.id = v_trip.city_id;

  return query
  select
    a.id,
    a.city_id,
    c.name,
    round(public.distance_km(v_city.lat, v_city.lon, c.lat, c.lon)::numeric, 1),
    greatest(a.start_date, v_trip.start_date),
    least(a.end_date, v_trip.end_date),
    a.max_nights
  from public.availability a
  join public.cities c on c.id = a.city_id
  where a.profile_id = (select auth.uid())
    and a.status = 'active'
    and daterange(a.start_date, a.end_date, '[]')
        && daterange(v_trip.start_date, v_trip.end_date, '[]')
    and (
      a.city_id = v_trip.city_id
      or public.distance_km(v_city.lat, v_city.lon, c.lat, c.lon) <= v_radius
    )
  order by 4 asc, 5 asc;
end;
$$;

grant execute on function public.offerable_windows(uuid) to authenticated;
