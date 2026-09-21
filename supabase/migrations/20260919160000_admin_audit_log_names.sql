-- Milestone 6 — phase 7, part 1: name the admin in the audit log.
--
-- admin_audit_log() returned `setof public.audit_log` — just admin_id, a
-- uuid nobody wants to read in a table meant to answer "who did this." A
-- setof-a-table return type can't gain a joined column via CREATE OR
-- REPLACE (that only allows appending OUT columns to an existing `returns
-- table(...)`, and this wasn't declared that way) — the function has to be
-- dropped and recreated, which also drops its grants, so those are redone
-- below.

drop function if exists public.admin_audit_log(int, timestamptz);

create or replace function public.admin_audit_log(
  p_limit int default 200,
  p_before timestamptz default null
)
returns table (
  id uuid,
  admin_id uuid,
  admin_display_name text,
  action text,
  target_table text,
  target_id text,
  detail jsonb,
  created_at timestamptz
)
language sql
stable
security definer
set search_path = public
as $$
  select
    a.id, a.admin_id, u.display_name, a.action, a.target_table, a.target_id,
    a.detail, a.created_at
  from public.audit_log a
  join public.admin_users u on u.id = a.admin_id
  where public.is_admin()
    and (p_before is null or a.created_at < p_before)
  order by a.created_at desc
  limit greatest(p_limit, 0);
$$;

revoke all on function public.admin_audit_log(int, timestamptz) from public;
grant execute on function public.admin_audit_log(int, timestamptz) to authenticated;

comment on function public.admin_audit_log is
  'Paginated audit trail, newest first, with the acting admin''s name '
  'joined in. Returns zero rows for a non-admin rather than raising.';
