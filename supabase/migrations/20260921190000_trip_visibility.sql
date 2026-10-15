-- Who can see a trip: public, friends only, or private.
--
-- A trip's owner always sees it. Everyone else needs one of:
--
--   public   a friend of the owner; or anyone who LIVES in the destination
--            city; or anyone who will BE in that city on overlapping dates (one
--            of their own trips there, or availability they posted there)
--   friends  a friend of the owner
--   private  only someone the owner has sent a request to about this trip, or a
--            host who has made an offer on it
--
-- The rule is in row-level security, so everything that reads trips as the
-- caller inherits it: matching, the open-trips search and the home feed are
-- invoker-rights functions and need no change.
--
-- EXISTING TRIPS become public. That is much narrower than before, when every
-- approved member saw every active trip.
--
-- Only the VIEWER side of the old policy changes: the owner still has to be
-- approved, the trip active, the pair not blocked, and the viewer allowed to
-- browse (approved, or in review).
--
-- Written to be re-runnable.

alter table public.trips add column if not exists visibility text not null default 'public';

alter table public.trips drop constraint if exists trip_visibility_known;
alter table public.trips
  add constraint trip_visibility_known check (visibility in ('public', 'friends', 'private'));

comment on column public.trips.visibility is
  'public: friends, residents of the destination and overlapping visitors. '
  'friends: friends only. private: only people it was sent to.';

-- ── helpers ───────────────────────────────────────────────────────────────
-- The caller lives in that city, or has a trip or availability there that
-- overlaps the dates. SECURITY DEFINER so the check reads the caller's own rows
-- regardless of the policy being evaluated.
create or replace function public.in_city_during(p_city uuid, p_start date, p_end date)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select
    exists (
      select 1 from public.profiles p
      where p.id = (select auth.uid()) and p.home_city_id = p_city
    )
    or exists (
      select 1 from public.trips t
      where t.profile_id = (select auth.uid())
        and t.status = 'active'
        and t.city_id = p_city
        and daterange(t.start_date, t.end_date, '[]') && daterange(p_start, p_end, '[]')
    )
    or exists (
      select 1 from public.availability a
      where a.profile_id = (select auth.uid())
        and a.status = 'active'
        and a.city_id = p_city
        and daterange(a.start_date, a.end_date, '[]') && daterange(p_start, p_end, '[]')
    )
$$;

comment on function public.in_city_during is
  'True when the signed-in member lives in the city, or has a trip or availability there overlapping the dates.';

-- The caller has been sent a request about the trip, or has offered on it.
create or replace function public.is_party_to_trip(p_trip uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select
    exists (
      select 1 from public.requests r
      where r.trip_id = p_trip and r.to_profile = (select auth.uid())
    )
    or exists (
      select 1 from public.offers o
      where o.trip_id = p_trip and o.from_profile = (select auth.uid())
    )
$$;

comment on function public.is_party_to_trip is
  'True when the owner of the trip has sent the signed-in member a request about it, or the member has made an offer on it.';

-- ── the policy ────────────────────────────────────────────────────────────
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
      or (visibility in ('public', 'friends') and public.is_friend(profile_id))
      or (visibility = 'public' and public.in_city_during(city_id, start_date, end_date))
    )
  );
