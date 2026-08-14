-- Milestone 1 — grants for service_role.
--
-- Edge Functions run as service_role. That role bypasses RLS, but it still
-- needs ordinary table privileges, and Supabase's default privileges do not
-- cover tables created by project migrations. Without this, every Edge
-- Function fails with 'permission denied for table …' despite holding the
-- service key.
--
-- Applies to everything that exists now, and — via ALTER DEFAULT PRIVILEGES —
-- to tables added by later milestones.
--
-- CONVENTION for later milestones: keep granting `authenticated` explicitly,
-- table by table, alongside each policy. Those grants are part of the security
-- surface and should be visible next to the rules they accompany. service_role
-- is different: it is all-or-nothing by design, so it is handled here once.

grant usage on schema public to service_role;

grant all on all tables in schema public to service_role;
grant all on all sequences in schema public to service_role;
grant all on all routines in schema public to service_role;

alter default privileges in schema public
  grant all on tables to service_role;
alter default privileges in schema public
  grant all on sequences to service_role;
alter default privileges in schema public
  grant all on routines to service_role;

-- The moderator views expose other members' data and are for the dashboard
-- only. Re-revoke after the blanket grant above.
revoke all on public.v_pending_verifications from anon, authenticated;
revoke all on public.v_recent_signups from anon, authenticated;
revoke all on public.v_docs_awaiting_purge from anon, authenticated;
