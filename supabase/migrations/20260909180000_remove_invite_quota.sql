-- Remove the per-member invite quota.
--
-- Beta feedback: rationing invites to five throttled the thing the network most
-- needs early on, which is members bringing in the colleagues they trust. The
-- quota was a dilution guard; authenticity will be addressed another way.
--
-- WHAT IS DELIBERATELY NOT DONE HERE
--
-- profiles.invite_quota stays, and redeem_invite keeps decrementing it. Both are
-- now inert, and removing them is tempting — but installed apps still call
-- remaining_invite_quota(), and CONTRIBUTING rule 1 is that a migration must not
-- break the oldest build in the wild. Dropping the column would also lose the
-- record of what was spent under the old rules. It can go a release after
-- nobody is running a build that reads it.


-- ───────────────────────────────────────────────────────────────────────────
-- 1. The policy that actually enforced it
-- ───────────────────────────────────────────────────────────────────────────
-- This is the security boundary. Everything else about the quota was display.
-- The remaining conditions are the ones that matter: you may only create
-- invites as yourself, and only once approved.

drop policy if exists invites_insert_within_quota on public.invites;

create policy invites_insert_own
  on public.invites for insert
  to authenticated
  with check (
    created_by = (select auth.uid())
    and public.is_approved()
  );

comment on policy invites_insert_own on public.invites is
  'Approved members may create invites for themselves, without limit. The '
  'former quota lives on as profiles.invite_quota, now unread by any policy.';


-- ───────────────────────────────────────────────────────────────────────────
-- 2. Keep the RPC honest for builds already on people's phones
-- ───────────────────────────────────────────────────────────────────────────
-- Settings renders "{n} left" and disables the button at n <= 0. Computing the
-- old way would now report 0 for anyone who had spent their five, taking the
-- feature away from exactly the members who used it most.
--
-- A large constant keeps those builds working. Newer builds ignore the number
-- and stop claiming there is a limit.

create or replace function public.remaining_invite_quota()
returns integer
language sql
immutable
set search_path = public
as $$
  select 999;
$$;

comment on function public.remaining_invite_quota is
  'Vestigial. Returns a large constant so builds shipped before the quota was '
  'removed keep showing an enabled invite button. Nothing enforces a limit any '
  'more — see policy invites_insert_own. Safe to drop once no build in the '
  'wild calls it.';
