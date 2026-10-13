-- Services: one per post, and each can be "always available".
--
-- WHAT CHANGES. An availability row is now ONE service (a couch, a spare room,
-- a coffee, or local tips), and it can be marked always available: no dates,
-- open until the member turns it off. Matching, offers and the home feed treat
-- it as free on any dates, so requests keep arriving for it as if it were posted
-- for the long term.
--
-- HOW "NO DATES" WORKS WITHOUT TOUCHING THE MATCHING. daterange(NULL, NULL, '[]')
-- is the unbounded range, which overlaps and contains every other range, so every
-- existing `daterange(a.start_date, a.end_date, '[]') && ...` is already right. The
-- overlap arithmetic uses greatest() and least(), which skip NULLs, so an
-- always-available row overlaps a trip for exactly the trip's own nights.
--
-- RULES (checked here, not just in the app)
--   * always_available means start_date and end_date are both null, and the
--     other way round: a dated row must have both
--   * an always-available row is exactly one service
--   * at most one active always-available row per member, city and service, so
--     the toggle cannot be turned on twice
--
-- EXISTING ROWS that bundled several services are split, one row per service,
-- with the same city and dates. Hosting conditions (women only, no pets, ...) and
-- the maximum number of nights belong to a couch or a room, so they stay with
-- the first service if that is one, and are dropped from a coffee or tips row.
--
-- Older app builds can still post a row with several services; only an
-- always-available row is limited to one. Written to be re-runnable.

alter table public.availability add column if not exists always_available boolean not null default false;

alter table public.availability
  alter column start_date drop not null,
  alter column end_date drop not null;

-- ── split rows that bundle several services ───────────────────────────────
insert into public.availability
  (profile_id, city_id, start_date, end_date, offers, constraints, max_nights, note, status, created_at)
select a.profile_id, a.city_id, a.start_date, a.end_date, array[o.offer],
       case when o.offer in ('couch', 'spare_room') then a.constraints else '{}'::text[] end,
       case when o.offer in ('couch', 'spare_room') then a.max_nights else null end,
       a.note, a.status, a.created_at
  from public.availability a
  cross join lateral unnest(a.offers) with ordinality as o(offer, position)
 where coalesce(array_length(a.offers, 1), 0) > 1
   and o.position > 1;

update public.availability
   set offers      = array[offers[1]],
       constraints = case when offers[1] in ('couch', 'spare_room') then constraints else '{}'::text[] end,
       max_nights  = case when offers[1] in ('couch', 'spare_room') then max_nights else null end
 where coalesce(array_length(offers, 1), 0) > 1;

-- ── the rules ─────────────────────────────────────────────────────────────
alter table public.availability drop constraint if exists availability_dates_or_always;
alter table public.availability
  add constraint availability_dates_or_always check (
    (always_available and start_date is null and end_date is null)
    or (not always_available and start_date is not null and end_date is not null)
  );

alter table public.availability drop constraint if exists availability_always_is_one_service;
alter table public.availability
  add constraint availability_always_is_one_service check (
    not always_available or coalesce(array_length(offers, 1), 0) = 1
  );

create unique index if not exists availability_one_always_per_service
  on public.availability (profile_id, city_id, (offers[1]))
  where always_available and status = 'active';

comment on column public.availability.always_available is
  'True for a service with no dates, open until switched off. start_date and '
  'end_date are then null, which matching reads as free on any dates.';
