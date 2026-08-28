-- Milestone 4 — blocking.
--
-- This migration retroactively switches blocking on across the whole
-- application. Every policy written in Milestones 1–3 already calls
-- is_blocked(); replacing the stub body is all that is needed for those.
--
-- EXCEPT WHERE IT ISN'T. Auditing every policy before writing this found three
-- that never called it, all of them added later than the rule they should have
-- followed:
--
--   requests_select_parties   — a blocked pair could still read each other's
--   offers_select_parties       requests and offers
--   contact_grants_select_own — a blocked person stayed in your contacts list
--
-- All three are corrected below. `stays_select_parties` is deliberately NOT
-- corrected: blocking must not erase stay history, or it becomes a tool for
-- deleting a bad review.

-- ───────────────────────────────────────────────────────────────────────────
-- blocks
--
-- One-sided to create, symmetric in effect. Either party blocking makes the
-- pair mutually invisible; only the person who created the row can remove it.
-- ───────────────────────────────────────────────────────────────────────────
create table public.blocks (
  blocker_id uuid not null references public.profiles(id) on delete cascade,
  blocked_id uuid not null references public.profiles(id) on delete cascade,
  created_at timestamptz not null default now(),

  primary key (blocker_id, blocked_id),
  constraint no_self_block check (blocker_id <> blocked_id)
);

create index blocks_blocked on public.blocks (blocked_id);

comment on table public.blocks is
  'Blocking is one-sided to create and symmetric in effect. It hides people '
  'from each other; it never deletes history, because a block that erased a '
  'bad review would be a reputation-laundering tool.';

-- ───────────────────────────────────────────────────────────────────────────
-- are_blocked / is_blocked
--
-- Two forms, deliberately.
--
-- is_blocked(other) is the policy-facing one and keys off auth.uid(). It is
-- what every policy from Milestone 1 onwards already calls.
--
-- are_blocked(a, b) takes both parties explicitly, because auth.uid() is NULL
-- inside a trigger fired by cron or by a service_role function — and that is
-- exactly where the notification outbox runs. Without this form, "no
-- notifications flow between a blocked pair" would be unenforceable.
-- ───────────────────────────────────────────────────────────────────────────
create or replace function public.are_blocked(a uuid, b uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select a is not null and b is not null and exists (
    select 1 from public.blocks
    where (blocker_id = a and blocked_id = b)
       or (blocker_id = b and blocked_id = a)
  );
$$;

comment on function public.are_blocked is
  'Direction-agnostic block check between two named profiles. Use this from '
  'triggers and scheduled jobs, where auth.uid() is null.';

-- Replaces the Milestone 1 stub. Every policy written since then calls this,
-- so blocking takes effect everywhere the moment this runs.
create or replace function public.is_blocked(other uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select public.are_blocked((select auth.uid()), other);
$$;

comment on function public.is_blocked is
  'True when the caller and `other` have blocked each other in either '
  'direction. Called by policies from Milestone 1 onwards; Milestone 4 '
  'replaced the stub body with this real implementation.';

-- ───────────────────────────────────────────────────────────────────────────
-- The three policies that forgot to call it
--
-- Dropped and recreated rather than patched, so the corrected rule is visible
-- in one place rather than reconstructed from a diff.
-- ───────────────────────────────────────────────────────────────────────────
drop policy requests_select_parties on public.requests;
create policy requests_select_parties
  on public.requests for select
  to authenticated
  using (
    (from_profile = (select auth.uid()) and not public.is_blocked(to_profile))
    or
    (to_profile = (select auth.uid()) and not public.is_blocked(from_profile))
  );

drop policy offers_select_parties on public.offers;
create policy offers_select_parties
  on public.offers for select
  to authenticated
  using (
    (from_profile = (select auth.uid()) and not public.is_blocked(to_profile))
    or
    (to_profile = (select auth.uid()) and not public.is_blocked(from_profile))
  );

drop policy contact_grants_select_own on public.contact_grants;
create policy contact_grants_select_own
  on public.contact_grants for select
  to authenticated
  using (
    (profile_a = (select auth.uid()) and not public.is_blocked(profile_b))
    or
    (profile_b = (select auth.uid()) and not public.is_blocked(profile_a))
  );

-- ───────────────────────────────────────────────────────────────────────────
-- No notification may cross a block
--
-- enqueue_notification is the single door every notification goes through, so
-- the rule belongs here rather than in each of the six triggers that call it.
--
-- The counterparty is whichever profile the payload names — the triggers write
-- one of fromProfileId, toProfileId or withProfileId depending on the type.
-- ───────────────────────────────────────────────────────────────────────────
create or replace function public.enqueue_notification(
  p_profile_id uuid,
  p_type       text,
  p_payload    jsonb default '{}'::jsonb
)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_id           uuid;
  v_counterparty uuid;
begin
  -- Never notify a profile that cannot act on it. A suspended or deleted
  -- account receiving a push about a couch it can no longer take is both
  -- useless and a small privacy leak.
  if not exists (
    select 1 from public.profiles p
    where p.id = p_profile_id and p.status = 'approved'
  ) then
    return null;
  end if;

  v_counterparty := coalesce(
    (p_payload ->> 'fromProfileId')::uuid,
    (p_payload ->> 'withProfileId')::uuid,
    (p_payload ->> 'toProfileId')::uuid
  );

  -- Blocking means silence in both directions, including the notification a
  -- withdrawal would otherwise generate — which would itself announce the
  -- block to the person who was blocked.
  if public.are_blocked(p_profile_id, v_counterparty) then
    return null;
  end if;

  insert into public.notifications (profile_id, type, payload)
  values (p_profile_id, p_type, coalesce(p_payload, '{}'::jsonb))
  returning id into v_id;

  return v_id;
end;
$$;

revoke all on function public.enqueue_notification(uuid, text, jsonb)
  from public, anon, authenticated;

-- ───────────────────────────────────────────────────────────────────────────
-- Blocking closes anything still open between the pair
--
-- A pending request or offer left alive would sit in a list neither party can
-- see any more, and would still be acceptable through the Edge Functions,
-- which read as service_role and so are not filtered by RLS.
--
-- The notification these updates would normally produce is suppressed by the
-- rule above — telling somebody "X withdrew their request" the instant they
-- are blocked would announce the block.
-- ───────────────────────────────────────────────────────────────────────────
create or replace function public.withdraw_on_block()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  update public.requests
    set status = 'withdrawn', responded_at = now()
    where status = 'pending'
      and (
        (from_profile = new.blocker_id and to_profile = new.blocked_id)
        or (from_profile = new.blocked_id and to_profile = new.blocker_id)
      );

  update public.offers
    set status = 'withdrawn', responded_at = now()
    where status = 'pending'
      and (
        (from_profile = new.blocker_id and to_profile = new.blocked_id)
        or (from_profile = new.blocked_id and to_profile = new.blocker_id)
      );

  return null;
end;
$$;

create trigger blocks_withdraw_pending
  after insert on public.blocks
  for each row execute function public.withdraw_on_block();

-- Unblocking restores visibility but NOT anything that was withdrawn. The
-- withdrawal was a real decision at the time, and silently resurrecting a
-- request somebody thought was gone would be worse than making them ask again.

-- ───────────────────────────────────────────────────────────────────────────
-- RLS
-- ───────────────────────────────────────────────────────────────────────────
alter table public.blocks enable row level security;

-- Only the blocker sees the row. The blocked party must never be able to learn
-- they were blocked — that is the whole point of the feature working quietly.
create policy blocks_select_own
  on public.blocks for select
  to authenticated
  using (blocker_id = (select auth.uid()));

create policy blocks_insert_own
  on public.blocks for insert
  to authenticated
  with check (blocker_id = (select auth.uid()) and public.is_approved());

create policy blocks_delete_own
  on public.blocks for delete
  to authenticated
  using (blocker_id = (select auth.uid()));

-- No update policy: a block is created or removed, never edited.

grant select, insert, delete on public.blocks to authenticated;
