-- Milestone 1 — the invite chain.
--
-- The primary way into the community, and the reason a stranger is trusted
-- enough to be hosted: every member is traceable to a voucher. Quotas exist so
-- the chain cannot be diluted faster than the community can absorb.

-- ───────────────────────────────────────────────────────────────────────────
-- Code generation
--
-- Alphabet excludes I, O, 0 and 1 so a code read aloud or retyped from a
-- screenshot cannot be transcribed wrongly. Duplicated in TypeScript at
-- packages/shared/src/schemas/invite-code.ts — change both together.
-- ───────────────────────────────────────────────────────────────────────────
create or replace function public.generate_invite_code()
returns text
language plpgsql
volatile
set search_path = public
as $$
declare
  alphabet constant text := 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  result   text := '';
begin
  for _ in 1..8 loop
    result := result || substr(alphabet, 1 + floor(random() * length(alphabet))::int, 1);
  end loop;
  return result;
end;
$$;

create table public.invites (
  id         uuid primary key default gen_random_uuid(),
  -- Defaulted rather than trigger-only so that generated TypeScript types treat
  -- `code` as optional on insert. The trigger below still handles collisions.
  code       text not null unique default public.generate_invite_code(),
  created_by uuid not null references public.profiles(id) on delete cascade,
  uses       integer not null default 0,
  max_uses   integer not null default 1,
  expires_at timestamptz not null
    default (now() + (public.config_int('invite_ttl_days') || ' days')::interval),
  revoked_at timestamptz,
  created_at timestamptz not null default now(),

  constraint uses_within_max check (uses >= 0 and uses <= max_uses),
  constraint max_uses_positive check (max_uses > 0)
);

create index invites_creator on public.invites (created_by);
create index invites_code_lookup on public.invites (code)
  where revoked_at is null;

-- Retry on collision rather than surfacing a unique-violation to the user.
-- At 32^8 combinations a collision is vanishingly unlikely, but a failed
-- "invite a colleague" tap is a bad first impression to risk.
create or replace function public.set_invite_code()
returns trigger
language plpgsql
set search_path = public
as $$
declare
  candidate text;
  attempts  integer := 0;
begin
  -- The column default has usually already produced a code; keep it unless it
  -- happens to collide with an existing one.
  if new.code is not null
     and not exists (select 1 from public.invites where code = new.code)
  then
    return new;
  end if;

  loop
    candidate := public.generate_invite_code();
    exit when not exists (select 1 from public.invites where code = candidate);
    attempts := attempts + 1;
    if attempts > 10 then
      raise exception 'could not generate a unique invite code after % attempts', attempts;
    end if;
  end loop;

  new.code := candidate;
  return new;
end;
$$;

create trigger invites_set_code
  before insert on public.invites
  for each row execute function public.set_invite_code();

-- ───────────────────────────────────────────────────────────────────────────
-- invite_redemptions
--
-- One row per member who joined via the chain. The unique constraint on
-- redeemed_by is what makes redemption once-per-account at the database level,
-- independent of any check in the Edge Function.
-- ───────────────────────────────────────────────────────────────────────────
create table public.invite_redemptions (
  id          uuid primary key default gen_random_uuid(),
  invite_id   uuid not null references public.invites(id) on delete cascade,
  redeemed_by uuid not null unique references public.profiles(id) on delete cascade,
  redeemed_at timestamptz not null default now()
);

create index invite_redemptions_invite on public.invite_redemptions (invite_id);

-- ───────────────────────────────────────────────────────────────────────────
-- Quota helpers
--
-- SECURITY DEFINER so the count is not itself filtered by the invites policy —
-- a policy that queries its own table through RLS recurses.
-- ───────────────────────────────────────────────────────────────────────────
create or replace function public.live_invite_count()
returns integer
language sql
stable
security definer
set search_path = public
as $$
  select count(*)::integer
  from public.invites
  where created_by = (select auth.uid())
    and revoked_at is null
    and expires_at > now()
    and uses < max_uses;
$$;

create or replace function public.remaining_invite_quota()
returns integer
language sql
stable
security definer
set search_path = public
as $$
  select greatest(
    0,
    coalesce((select invite_quota from public.profiles where id = (select auth.uid())), 0)
      - public.live_invite_count()
  );
$$;

comment on function public.remaining_invite_quota is
  'How many further invites this member may create right now. Quota is spent '
  'on redemption; outstanding live invites are held against it meanwhile, so '
  'a member cannot mint an unlimited number of unused codes.';

-- ───────────────────────────────────────────────────────────────────────────
-- RLS
-- ───────────────────────────────────────────────────────────────────────────
alter table public.invites enable row level security;
alter table public.invite_redemptions enable row level security;

create policy invites_select_own
  on public.invites for select
  to authenticated
  using (created_by = (select auth.uid()));

create policy invites_insert_within_quota
  on public.invites for insert
  to authenticated
  with check (
    created_by = (select auth.uid())
    and public.is_approved()
    and public.remaining_invite_quota() > 0
  );

-- Revocation only. Codes, expiry and use counts are not client-editable;
-- redemption goes through the redeem-invite Edge Function as service_role.
create policy invites_revoke_own
  on public.invites for update
  to authenticated
  using (created_by = (select auth.uid()))
  with check (created_by = (select auth.uid()));

create or replace function public.guard_invite_columns()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  if current_user in ('service_role', 'postgres', 'supabase_admin') then
    return new;
  end if;

  if new.code is distinct from old.code
     or new.uses is distinct from old.uses
     or new.max_uses is distinct from old.max_uses
     or new.expires_at is distinct from old.expires_at
     or new.created_by is distinct from old.created_by
  then
    raise exception 'only revoked_at is client-updatable on invites'
      using errcode = '42501';
  end if;

  return new;
end;
$$;

create trigger invites_guard_columns
  before update on public.invites
  for each row execute function public.guard_invite_columns();

create policy invite_redemptions_select_involved
  on public.invite_redemptions for select
  to authenticated
  using (
    redeemed_by = (select auth.uid())
    or exists (
      select 1 from public.invites i
      where i.id = invite_id and i.created_by = (select auth.uid())
    )
  );

grant select, insert, update on public.invites to authenticated;
grant select on public.invite_redemptions to authenticated;
