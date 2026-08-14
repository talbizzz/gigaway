-- Milestone 1 — row-level security helpers and policies.
--
-- RLS is this product's privacy guarantee, not a hardening pass. Every rule in
-- Project-Raw.md's non-functional requirements is enforced here rather than in
-- client code:
--
--   * A pending applicant sees no member content at all.
--   * Contact details are invisible without an accepted offer.
--   * Blocked pairs are mutually invisible.
--   * Suspension takes effect on the next query.
--
-- Helpers are SECURITY DEFINER so they bypass RLS internally. Without that, a
-- policy on `profiles` that calls a helper which itself reads `profiles` would
-- recurse. search_path is pinned on every one — an unpinned search_path on a
-- SECURITY DEFINER function is a privilege-escalation vector.

-- ───────────────────────────────────────────────────────────────────────────
-- Helpers
-- ───────────────────────────────────────────────────────────────────────────

create or replace function public.current_status()
returns public.profile_status
language sql
stable
security definer
set search_path = public
as $$
  select status from public.profiles where id = (select auth.uid());
$$;

create or replace function public.is_approved()
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select coalesce(
    (select status = 'approved' from public.profiles where id = (select auth.uid())),
    false
  );
$$;

comment on function public.is_approved is
  'The single gate on member content. False for pending, rejected, suspended '
  'and deleted profiles, and for unauthenticated callers.';

-- Blocking arrives in Milestone 4. This stub is defined now so that every
-- policy written in Milestones 1–3 can already call it, and Milestone 4 only
-- has to replace the function body — no policy rewrites.
create or replace function public.is_blocked(other uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select false;
$$;

comment on function public.is_blocked is
  'STUB until Milestone 4, which replaces the body with a bidirectional check '
  'against the blocks table. Called by policies from Milestone 1 onwards so '
  'that blocking applies everywhere the moment it is implemented.';

create or replace function public.has_contact_grant(other uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1
    from public.contact_grants g
    where g.profile_a = least((select auth.uid()), other)
      and g.profile_b = greatest((select auth.uid()), other)
  );
$$;

comment on function public.has_contact_grant is
  'True once an accepted offer or co-accommodation request links the two '
  'profiles. The only thing that makes contact_details readable.';

-- ───────────────────────────────────────────────────────────────────────────
-- profiles
-- ───────────────────────────────────────────────────────────────────────────

-- Own row is always visible, whatever the status — a pending applicant must be
-- able to see their own application state.
create policy profiles_select_own
  on public.profiles for select
  to authenticated
  using (id = (select auth.uid()));

-- Other members are visible only between two approved profiles that have not
-- blocked each other.
create policy profiles_select_members
  on public.profiles for select
  to authenticated
  using (
    id <> (select auth.uid())
    and status = 'approved'
    and public.is_approved()
    and not public.is_blocked(id)
  );

-- Privileged columns are additionally protected by the guard trigger in the
-- previous migration; this policy only controls which row may be touched.
create policy profiles_update_own
  on public.profiles for update
  to authenticated
  using (id = (select auth.uid()))
  with check (id = (select auth.uid()));

-- No insert or delete policy: profiles are created by the auth trigger and
-- removed by the delete-account Edge Function.

-- ───────────────────────────────────────────────────────────────────────────
-- contact_details
-- ───────────────────────────────────────────────────────────────────────────

create policy contact_details_select_own
  on public.contact_details for select
  to authenticated
  using (profile_id = (select auth.uid()));

create policy contact_details_select_granted
  on public.contact_details for select
  to authenticated
  using (
    profile_id <> (select auth.uid())
    and public.is_approved()
    and public.has_contact_grant(profile_id)
    and not public.is_blocked(profile_id)
  );

create policy contact_details_insert_own
  on public.contact_details for insert
  to authenticated
  with check (profile_id = (select auth.uid()));

create policy contact_details_update_own
  on public.contact_details for update
  to authenticated
  using (profile_id = (select auth.uid()))
  with check (profile_id = (select auth.uid()));

-- ───────────────────────────────────────────────────────────────────────────
-- contact_grants
--
-- Readable by the two parties so the app can tell whether a reveal has
-- happened. Written only by Edge Functions running as service_role.
-- ───────────────────────────────────────────────────────────────────────────

create policy contact_grants_select_own
  on public.contact_grants for select
  to authenticated
  using (
    profile_a = (select auth.uid()) or profile_b = (select auth.uid())
  );

-- ───────────────────────────────────────────────────────────────────────────
-- Grants
--
-- RLS decides which rows a role may see; grants decide whether it may touch the
-- table at all. Both are required, and the grants are deliberately narrow:
-- no INSERT or DELETE on profiles (auth trigger and Edge Functions only), and
-- nothing but SELECT on contact_grants (written by accept-offer as
-- service_role).
-- ───────────────────────────────────────────────────────────────────────────
grant select, update on public.profiles to authenticated;
grant select, insert, update on public.contact_details to authenticated;
grant select on public.contact_grants to authenticated;
