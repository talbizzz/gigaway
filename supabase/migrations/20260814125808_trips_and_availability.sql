-- Milestone 2 — trips and host availability.
--
-- DATE SEMANTICS (must match packages/shared/src/domain/dates.ts)
--
--   start_date and end_date are the FIRST and LAST NIGHT, inclusive.
--   Nights = end_date - start_date + 1, so a single-date range is one night.
--
-- Every daterange here is therefore built with '[]'. The Postgres default '[)'
-- would exclude the last night and silently drop matches where a host is free
-- on exactly the traveller's final night — the case the brief's own example
-- turns on ("the 3rd to the 5th ... three nights").

create type public.trip_status as enum ('active', 'cancelled', 'completed');
create type public.availability_status as enum ('active', 'cancelled');

-- ───────────────────────────────────────────────────────────────────────────
-- trips
-- ───────────────────────────────────────────────────────────────────────────
create table public.trips (
  id         uuid primary key default gen_random_uuid(),
  profile_id uuid not null references public.profiles(id) on delete cascade,
  city_id    uuid not null references public.cities(id),
  start_date date not null,
  end_date   date not null,
  needs      text[] not null default '{}',
  note       text,
  status     public.trip_status not null default 'active',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),

  constraint trip_dates_ordered check (end_date >= start_date),
  -- A guard against someone posting a whole year and dominating every search
  -- in their city. 60 nights is far beyond any real audition trip.
  constraint trip_span_sane check (end_date - start_date <= 60),
  constraint trip_note_length check (note is null or char_length(note) <= 400),
  -- coalesce is load-bearing: array_length('{}', 1) is NULL, not 0, and a CHECK
  -- that evaluates to NULL passes. Without it an empty needs array slips through.
  constraint trip_needs_present check (coalesce(array_length(needs, 1), 0) >= 1),
  constraint trip_needs_known check (
    needs <@ array['couch', 'tips', 'company', 'co_accommodation']::text[]
  )
);

comment on column public.trips.start_date is
  'First night in the destination city, inclusive.';
comment on column public.trips.end_date is
  'Last night in the destination city, inclusive. Nights = end - start + 1.';

create index trips_city_dates on public.trips
  using gist (city_id, daterange(start_date, end_date, '[]'))
  where status = 'active';
create index trips_profile on public.trips (profile_id, start_date desc);

create trigger trips_set_updated_at
  before update on public.trips
  for each row execute function public.set_updated_at();

-- ───────────────────────────────────────────────────────────────────────────
-- availability
-- ───────────────────────────────────────────────────────────────────────────
create table public.availability (
  id          uuid primary key default gen_random_uuid(),
  profile_id  uuid not null references public.profiles(id) on delete cascade,
  city_id     uuid not null references public.cities(id),
  start_date  date not null,
  end_date    date not null,
  offers      text[] not null default '{}',
  constraints text[] not null default '{}',
  max_nights  integer,
  note        text,
  status      public.availability_status not null default 'active',
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now(),

  constraint availability_dates_ordered check (end_date >= start_date),
  constraint availability_span_sane check (end_date - start_date <= 60),
  constraint availability_note_length check (note is null or char_length(note) <= 400),
  constraint availability_max_nights_positive check (max_nights is null or max_nights > 0),
  constraint availability_offers_present check (coalesce(array_length(offers, 1), 0) >= 1),
  constraint availability_offers_known check (
    offers <@ array['couch', 'spare_room', 'tips', 'coffee']::text[]
  ),
  constraint availability_constraints_known check (
    constraints <@ array[
      'no_pets', 'no_smoking', 'women_only', 'no_children', 'quiet_household'
    ]::text[]
  )
);

comment on column public.availability.constraints is
  'Host-side conditions. women_only is a safety feature from the brief, not a '
  'preference: it is shown prominently and enforced by the host when they '
  'respond. It does not filter results — there is no gender field to filter on, '
  'and adding one carries its own privacy cost.';

create index availability_city_dates on public.availability
  using gist (city_id, daterange(start_date, end_date, '[]'))
  where status = 'active';
create index availability_profile on public.availability (profile_id, start_date desc);

create trigger availability_set_updated_at
  before update on public.availability
  for each row execute function public.set_updated_at();

-- ───────────────────────────────────────────────────────────────────────────
-- RLS
--
-- Same shape as every other member table: own rows always; other members' rows
-- only between two approved profiles that have not blocked each other, and
-- only while the row is active. is_blocked() is still the Milestone 1 stub —
-- calling it here means Milestone 4 needs no policy rewrites.
-- ───────────────────────────────────────────────────────────────────────────
alter table public.trips enable row level security;
alter table public.availability enable row level security;

create policy trips_select_own
  on public.trips for select
  to authenticated
  using (profile_id = (select auth.uid()));

create policy trips_select_members
  on public.trips for select
  to authenticated
  using (
    profile_id <> (select auth.uid())
    and status = 'active'
    and public.is_approved()
    and not public.is_blocked(profile_id)
    and exists (
      select 1 from public.profiles p
      where p.id = trips.profile_id and p.status = 'approved'
    )
  );

create policy trips_insert_own
  on public.trips for insert
  to authenticated
  with check (profile_id = (select auth.uid()) and public.is_approved());

create policy trips_update_own
  on public.trips for update
  to authenticated
  using (profile_id = (select auth.uid()))
  with check (profile_id = (select auth.uid()));

-- No delete policy: cancelling sets status = 'cancelled'. Milestone 4's reviews
-- hang off the stay a trip produced, so trip history has to survive.

create policy availability_select_own
  on public.availability for select
  to authenticated
  using (profile_id = (select auth.uid()));

create policy availability_select_members
  on public.availability for select
  to authenticated
  using (
    profile_id <> (select auth.uid())
    and status = 'active'
    and public.is_approved()
    and not public.is_blocked(profile_id)
    and exists (
      select 1 from public.profiles p
      where p.id = availability.profile_id and p.status = 'approved'
    )
  );

create policy availability_insert_own
  on public.availability for insert
  to authenticated
  with check (profile_id = (select auth.uid()) and public.is_approved());

create policy availability_update_own
  on public.availability for update
  to authenticated
  using (profile_id = (select auth.uid()))
  with check (profile_id = (select auth.uid()));

grant select, insert, update on public.trips to authenticated;
grant select, insert, update on public.availability to authenticated;
