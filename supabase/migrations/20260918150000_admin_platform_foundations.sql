-- Milestone 6 — admin platform foundations.
--
-- This is the gate everything else in the milestone stands behind: a table of
-- who is an admin, a function that checks it, and a log of what admins do.
-- Nothing built on top of this migration is safe to ship until this part is
-- proven, so it lands and is pgTAP-tested on its own before any admin_*
-- read/write function exists.
--
-- admin_users and audit_log are readable and writable through SECURITY
-- DEFINER functions only — neither table carries a grant to anon or
-- authenticated, matching the pattern data_exports already uses. That means
-- there is exactly one thing that can be wrong (is_admin()), not one policy
-- per table to get right.

-- ───────────────────────────────────────────────────────────────────────────
-- admin_users
--
-- No self-service signup. A row is inserted by hand, after creating the
-- Supabase Auth user, the same way member zero was created through the Auth
-- API directly (Milestone 5).
-- ───────────────────────────────────────────────────────────────────────────
create table public.admin_users (
  id           uuid primary key references auth.users(id) on delete cascade,
  display_name text not null,
  created_at   timestamptz not null default now()
);

alter table public.admin_users enable row level security;
revoke all on public.admin_users from anon, authenticated;

comment on table public.admin_users is
  'Admin allowlist for the apps/admin platform (Milestone 6). Insert by hand '
  'after creating the Supabase Auth user — there is no signup flow. Never '
  'queried directly by a client; is_admin() is the only door.';

-- ───────────────────────────────────────────────────────────────────────────
-- audit_log
--
-- Every admin_* function that changes something calls log_admin_action() as
-- its last statement, inside the same transaction as the change itself — so
-- a change that isn't logged is a change that didn't happen (the transaction
-- rolls back), and there is exactly one place in the codebase that writes a
-- row here.
-- ───────────────────────────────────────────────────────────────────────────
create table public.audit_log (
  id            uuid primary key default gen_random_uuid(),
  admin_id      uuid not null references public.admin_users(id),
  action        text not null,
  target_table  text not null,
  target_id     text,
  detail        jsonb not null default '{}'::jsonb,
  created_at    timestamptz not null default now()
);

create index audit_log_created_at on public.audit_log (created_at desc);
create index audit_log_admin_id on public.audit_log (admin_id, created_at desc);

alter table public.audit_log enable row level security;
revoke all on public.audit_log from anon, authenticated;

comment on table public.audit_log is
  'Written only by log_admin_action(), called from inside every mutating '
  'admin_* function. Read only through admin_audit_log(). No client grant.';

-- ───────────────────────────────────────────────────────────────────────────
-- is_admin()
--
-- The single gate every admin_* function opens with, before touching
-- anything. No parameter, by design — every caller is asking "am I an
-- admin," never "is someone else." SECURITY DEFINER because admin_users
-- carries no grant to authenticated; search_path is pinned for the same
-- reason it is on every other SECURITY DEFINER function in this schema — an
-- unpinned one is a privilege-escalation vector.
-- ───────────────────────────────────────────────────────────────────────────
create or replace function public.is_admin()
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1 from public.admin_users where id = (select auth.uid())
  );
$$;

comment on function public.is_admin is
  'True only for rows in admin_users. False for every other authenticated '
  'user and for anon. The first statement in every admin_* function must be '
  '`if not is_admin() then raise exception ...`.';

-- ───────────────────────────────────────────────────────────────────────────
-- log_admin_action()
--
-- Revoked from public: the only callers are other SECURITY DEFINER admin_*
-- functions, which invoke it from inside their own already-elevated
-- execution context. auth.uid() still resolves to the original caller (the
-- acting admin) even from inside a SECURITY DEFINER function's body — only
-- the privilege level changes, not the JWT the session carries.
-- ───────────────────────────────────────────────────────────────────────────
create or replace function public.log_admin_action(
  p_action text,
  p_target_table text,
  p_target_id text,
  p_detail jsonb default '{}'::jsonb
)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  if not public.is_admin() then
    raise exception 'not authorized';
  end if;

  insert into public.audit_log (admin_id, action, target_table, target_id, detail)
  values ((select auth.uid()), p_action, p_target_table, p_target_id, p_detail);
end;
$$;

revoke all on function public.log_admin_action(text, text, text, jsonb) from public;

comment on function public.log_admin_action is
  'Called as the last statement of every mutating admin_* function, inside '
  'the same transaction as the change it records. Not callable directly.';

-- ───────────────────────────────────────────────────────────────────────────
-- admin_audit_log() — the one read path onto audit_log
-- ───────────────────────────────────────────────────────────────────────────
create or replace function public.admin_audit_log(
  p_limit int default 200,
  p_before timestamptz default null
)
returns setof public.audit_log
language sql
stable
security definer
set search_path = public
as $$
  select *
  from public.audit_log
  where public.is_admin()
    and (p_before is null or created_at < p_before)
  order by created_at desc
  limit greatest(p_limit, 0);
$$;

revoke all on function public.admin_audit_log(int, timestamptz) from public;
grant execute on function public.admin_audit_log(int, timestamptz) to authenticated;

comment on function public.admin_audit_log is
  'Paginated audit trail, newest first. Returns zero rows for a non-admin '
  'rather than raising, since a `where public.is_admin()` short-circuits the '
  'query instead of every row re-checking it.';
