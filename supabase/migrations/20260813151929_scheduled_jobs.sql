-- Milestone 1 — scheduled jobs.
--
-- Three jobs, all invoking Edge Functions through pg_net rather than doing the
-- work in SQL, because both need something the database cannot do: delete a
-- storage object, or send an email.
--
-- Secrets live in Vault, so local and production differ only in the stored
-- values. Nothing here hard-codes an environment.

-- ───────────────────────────────────────────────────────────────────────────
-- Secrets
--
-- Local defaults. `kong` is the hostname the database container uses to reach
-- the API gateway; from outside Docker the same gateway is 127.0.0.1:54321.
--
-- PRODUCTION: overwrite both with
--   select vault.update_secret(id, '<value>') from vault.secrets where name = '...';
-- ───────────────────────────────────────────────────────────────────────────
do $$
begin
  if not exists (select 1 from vault.secrets where name = 'edge_function_base_url') then
    perform vault.create_secret(
      'http://kong:8000/functions/v1',
      'edge_function_base_url',
      'Base URL used by pg_cron to invoke Edge Functions'
    );
  end if;

  if not exists (select 1 from vault.secrets where name = 'edge_function_service_key') then
    perform vault.create_secret(
      'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZS1kZW1vIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImV4cCI6MTk4MzgxMjk5Nn0.EGIM96RAZx35lJzdJsyH-qQwv8Hdp7fsn3W0YpN81IU',
      'edge_function_service_key',
      'Service role key used by pg_cron to authenticate to Edge Functions. '
      'This is the well-known LOCAL demo key — replace in production.'
    );
  end if;
end;
$$;

create or replace function public.call_edge_function(fn_name text, payload jsonb default '{}'::jsonb)
returns bigint
language plpgsql
security definer
set search_path = public
as $$
declare
  base_url    text;
  service_key text;
  request_id  bigint;
begin
  select decrypted_secret into base_url
    from vault.decrypted_secrets where name = 'edge_function_base_url';
  select decrypted_secret into service_key
    from vault.decrypted_secrets where name = 'edge_function_service_key';

  if base_url is null or service_key is null then
    -- Warn rather than raise: a missing secret must not abort the cron
    -- transaction and leave rows in a half-processed state.
    raise warning 'call_edge_function(%): vault secrets missing, skipping', fn_name;
    return null;
  end if;

  select net.http_post(
    url     := base_url || '/' || fn_name,
    body    := payload,
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'Authorization', 'Bearer ' || service_key
    ),
    timeout_milliseconds := 20000
  ) into request_id;

  return request_id;
end;
$$;

revoke all on function public.call_edge_function(text, jsonb) from public, anon, authenticated;

-- ───────────────────────────────────────────────────────────────────────────
-- Expiry of undecided applications
--
-- After 90 days a pending application has been genuinely lost track of. The
-- documents go; the APPLICATION DOES NOT. Its status becomes 'docs_expired',
-- the applicant is told, and one tap restores it to the queue with its place
-- intact. Purging never rejects anybody.
-- ───────────────────────────────────────────────────────────────────────────
create or replace function public.expire_verification_docs()
returns integer
language plpgsql
security definer
set search_path = public
as $$
declare
  affected integer;
begin
  with expired as (
    update public.verification_applications
      set status = 'docs_expired'
      where status = 'pending'
        and submitted_at < now() - (public.config_int('doc_purge_days') || ' days')::interval
        and coalesce(array_length(doc_paths, 1), 0) > 0
      returning id
  )
  select count(*)::integer into affected from expired;

  return affected;
end;
$$;

-- ───────────────────────────────────────────────────────────────────────────
-- Jobs
-- ───────────────────────────────────────────────────────────────────────────

-- Every minute: delete storage objects for applications whose documents have
-- been marked for purge. Retried on every tick until it succeeds.
select cron.schedule(
  'purge-verification-docs',
  '* * * * *',
  $$ select public.call_edge_function('purge-verification-docs'); $$
);

-- Daily 03:00 UTC: expire undecided applications older than the configured
-- window, which in turn requests the purge above.
select cron.schedule(
  'expire-verification-docs',
  '0 3 * * *',
  $$ select public.expire_verification_docs(); $$
);

-- Daily 09:00 UTC: tell the moderator about applications waiting longer than
-- the configured nudge window. This is what actually fixes slow review —
-- retention was never the right tool for it.
select cron.schedule(
  'notify-pending-verifications',
  '0 9 * * *',
  $$ select public.call_edge_function('moderation-digest'); $$
);

-- ───────────────────────────────────────────────────────────────────────────
-- Moderator views
--
-- There is no admin UI in v1; these are saved queries for the Supabase
-- dashboard, shaped so the daily workflow is "open, act" rather than
-- "reconstruct a join at 11pm".
-- ───────────────────────────────────────────────────────────────────────────
create or replace view public.v_pending_verifications as
select
  a.id                                                as application_id,
  p.display_name,
  p.discipline,
  p.specialisation,
  u.email,
  a.note,
  a.links,
  a.doc_paths,
  a.submitted_at,
  extract(day from now() - a.submitted_at)::integer   as days_waiting
from public.verification_applications a
join public.profiles p on p.id = a.profile_id
join auth.users u on u.id = a.profile_id
where a.status = 'pending'
order by a.submitted_at asc;

comment on view public.v_pending_verifications is
  'Moderator queue. To decide: update verification_applications set status = '
  '''approved''|''rejected'', decision_reason = ''…'' where id = …; the profile '
  'is promoted and the documents are queued for deletion automatically.';

create or replace view public.v_recent_signups as
select
  p.id,
  p.display_name,
  p.discipline,
  p.status,
  c.name                                              as home_city,
  inviter.display_name                                as invited_by,
  case when r.id is not null then 'invite' else 'application' end as joined_via,
  p.created_at
from public.profiles p
left join public.cities c on c.id = p.home_city_id
left join public.profiles inviter on inviter.id = p.invited_by
left join public.invite_redemptions r on r.redeemed_by = p.id
order by p.created_at desc;

create or replace view public.v_docs_awaiting_purge as
select
  a.id                                                as application_id,
  a.status,
  a.doc_paths,
  a.docs_deletion_requested_at,
  extract(epoch from now() - a.docs_deletion_requested_at)::integer as seconds_waiting
from public.verification_applications a
where a.docs_deletion_requested_at is not null
  and a.docs_deleted_at is null
order by a.docs_deletion_requested_at asc;

comment on view public.v_docs_awaiting_purge is
  'Operational check on the deletion promise. Rows should clear within a '
  'minute; anything lingering means purge-verification-docs is failing.';

-- These views expose other members' data and must never be readable by the
-- app. They are for the dashboard, which connects as a privileged role.
revoke all on public.v_pending_verifications from anon, authenticated;
revoke all on public.v_recent_signups from anon, authenticated;
revoke all on public.v_docs_awaiting_purge from anon, authenticated;
