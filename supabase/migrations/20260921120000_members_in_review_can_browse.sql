-- Lets a member whose verification is under review into the app, read-mostly.
--
-- THE RULE. Until now `is_approved()` was the single gate: nothing was visible
-- or writable until a human approved the member. Now a member whose
-- verification application has been SUBMITTED and is awaiting a decision
-- ("in review") may also browse, and post their own trips and availability.
-- They still cannot do anything that involves another person acting on it:
-- requests, offers, stays, reviews, blocks and contact details all stay behind
-- `is_approved()` and are deliberately not touched here.
--
-- WHO COUNTS AS IN REVIEW. profiles.status = 'pending' AND an application in
-- 'pending'. The existing invariant (see verification_reopen_and_approval_check)
-- is that a profile is 'pending' exactly while its application is, and that a
-- rejected member who reapplies goes back to 'pending'. So:
--   signed up, nothing submitted      → no application → still at the gate
--   submitted                         → in review      → browses
--   rejected                          → profile 'rejected' → back at the gate
--   reapplied                         → in review again
-- No new status is introduced; 'suspended' stays a moderation state.
--
-- WHAT THEY CANNOT BE SEEN DOING. Every policy that shows one member to another
-- already requires the OWNER to be 'approved' (trips and availability check
-- the owner's profile; profiles_select_members checks `status = 'approved'`).
-- That is unchanged, so a member in review is invisible to everyone else, and
-- a trip they post stays invisible until they are approved — and invisible
-- again if they are rejected. Only the VIEWER side of each policy is widened.
--
-- invoker-rights functions (home_feed, search_matches, search_open_trips) are
-- governed entirely by these policies, so they start working for members in
-- review without being touched.

create or replace function public.is_in_review()
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1
    from public.profiles p
    where p.id = (select auth.uid())
      and p.status = 'pending'
      and exists (
        select 1 from public.verification_applications a
        where a.profile_id = p.id and a.status = 'pending'
      )
  );
$$;

comment on function public.is_in_review is
  'True for a signed-in member whose profile and application are both pending '
  '— submitted, awaiting a decision. False before submitting, after a '
  'rejection, and for every other status.';

create or replace function public.can_browse()
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select public.is_approved() or public.is_in_review();
$$;

comment on function public.can_browse is
  'Approved members and members in review. Used for READING other members and '
  'for posting your own trips and availability. Anything that involves another '
  'member acting on you still requires is_approved().';

-- ── reading other members ─────────────────────────────────────────────────
drop policy if exists profiles_select_members on public.profiles;
create policy profiles_select_members
  on public.profiles for select
  to authenticated
  using (
    id <> (select auth.uid())
    and status = 'approved'
    and public.can_browse()
    and not public.is_blocked(id)
  );

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
  );

drop policy if exists availability_select_members on public.availability;
create policy availability_select_members
  on public.availability for select
  to authenticated
  using (
    profile_id <> (select auth.uid())
    and status = 'active'
    and public.can_browse()
    and not public.is_blocked(profile_id)
    and exists (
      select 1 from public.profiles p
      where p.id = availability.profile_id and p.status = 'approved'
    )
  );

-- A member's profile page shows the reviews written about them.
drop policy if exists reviews_select_published on public.reviews;
create policy reviews_select_published
  on public.reviews for select
  to authenticated
  using (
    published_at is not null
    and public.can_browse()
    and not public.is_blocked(author_id)
    and not public.is_blocked(subject_id)
  );

-- ── posting your own ──────────────────────────────────────────────────────
drop policy if exists trips_insert_own on public.trips;
create policy trips_insert_own
  on public.trips for insert
  to authenticated
  with check (profile_id = (select auth.uid()) and public.can_browse());

drop policy if exists availability_insert_own on public.availability;
create policy availability_insert_own
  on public.availability for insert
  to authenticated
  with check (profile_id = (select auth.uid()) and public.can_browse());
