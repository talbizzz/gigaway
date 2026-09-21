-- Milestone 6 — admin gated reads.
--
-- Every function here follows the same shape: SECURITY DEFINER, `set
-- search_path = public`, and a `where public.is_admin()` clause that makes a
-- non-admin caller get zero rows rather than an error — friendlier for a
-- frontend that calls these opportunistically than the raise-on-write
-- convention `log_admin_action` uses. None of them touch the existing
-- moderator views' own grants: `v_open_reports`, `v_user_summary`,
-- `v_stuck_notifications`, `v_pending_verifications` and `v_recent_signups`
-- stay exactly as revoked from anon/authenticated as they already are. These
-- functions can still read them because they execute as the function owner,
-- the same reason `export_user_data` can read tables the calling role can't.
--
-- CORRECTION FROM THE MILESTONE FILE: `v_docs_awaiting_purge` no longer
-- exists. 20260917090000_verification_only_signup.sql dropped it along with
-- docs_deletion_requested_at/docs_deleted_at when verification evidence
-- moved to email-only ("nothing left to purge"), and
-- 20260918180000_persist_verification_evidence.sql — which put evidence back
-- into Storage — never recreated it, because evidence now persists until
-- account deletion rather than being purged on decision. There is nothing
-- for an `admin_docs_awaiting_purge()` wrapper to wrap; the operational
-- dashboard in a later phase drops that item.

-- ───────────────────────────────────────────────────────────────────────────
-- Search indexes
--
-- pg_trgm is already installed (`extensions.gin_trgm_ops`, see
-- 20260813134328) and already backs `cities_name_trgm`. These two are new:
-- admin search needs to find someone by name or email, neither of which had
-- a reason to be indexed for trigram search before now.
-- ───────────────────────────────────────────────────────────────────────────
create index profiles_display_name_trgm on public.profiles
  using gin (display_name extensions.gin_trgm_ops);

create index contact_details_email_trgm on public.contact_details
  using gin (email extensions.gin_trgm_ops);

-- ───────────────────────────────────────────────────────────────────────────
-- admin_search_profiles — "find a user"
-- ───────────────────────────────────────────────────────────────────────────
create or replace function public.admin_search_profiles(p_query text default null)
returns table (
  profile_id   uuid,
  display_name text,
  status       public.profile_status,
  discipline   text,
  home_city    text,
  email        text,
  phone        text,
  joined_at    timestamptz
)
language sql
stable
security definer
set search_path = public
as $$
  select
    p.id, p.display_name, p.status, p.discipline, c.name, cd.email, cd.phone, p.created_at
  from public.profiles p
  left join public.cities c on c.id = p.home_city_id
  left join public.contact_details cd on cd.profile_id = p.id
  where public.is_admin()
    and (
      p_query is null or btrim(p_query) = ''
      or p.display_name ilike '%' || p_query || '%'
      or cd.email ilike '%' || p_query || '%'
      or cd.phone ilike '%' || p_query || '%'
      or c.name ilike '%' || p_query || '%'
    )
  order by p.created_at desc
  limit 50;
$$;

comment on function public.admin_search_profiles is
  'Empty query returns the 50 most recent profiles rather than nothing, so '
  'the users page has content to show before anyone types.';

-- ───────────────────────────────────────────────────────────────────────────
-- admin_get_user_detail — "find a profile"
--
-- v_user_summary already computes every count MODERATION.md's runbook reads
-- before acting on someone; this adds the contact details and verification
-- outcome a moderator would otherwise open two more views to get.
-- ───────────────────────────────────────────────────────────────────────────
create or replace function public.admin_get_user_detail(p_profile_id uuid)
returns table (
  profile_id           uuid,
  display_name         text,
  status               public.profile_status,
  discipline           text,
  home_city            text,
  joined_at            timestamptz,
  email                text,
  phone                text,
  whatsapp             text,
  trips                bigint,
  availability         bigint,
  stays_hosted         bigint,
  stays_as_guest       bigint,
  reviews_written      bigint,
  reviews_received     bigint,
  would_again_pct      integer,
  reports_filed        bigint,
  reports_received     bigint,
  distinct_reporters   bigint,
  blocks_made          bigint,
  blocks_received      bigint,
  verification_status  public.verification_status,
  verification_decision_reason text
)
language sql
stable
security definer
set search_path = public
as $$
  select
    v.profile_id, v.display_name, v.status, v.discipline, v.home_city, v.joined_at,
    cd.email, cd.phone, cd.whatsapp,
    v.trips, v.availability, v.stays_hosted, v.stays_as_guest,
    v.reviews_written, v.reviews_received, v.would_again_pct,
    v.reports_filed, v.reports_received, v.distinct_reporters,
    v.blocks_made, v.blocks_received,
    va.status, va.decision_reason
  from public.v_user_summary v
  left join public.contact_details cd on cd.profile_id = v.profile_id
  left join public.verification_applications va on va.profile_id = v.profile_id
  where public.is_admin() and v.profile_id = p_profile_id;
$$;

-- ───────────────────────────────────────────────────────────────────────────
-- admin_search_trips / admin_get_trip_detail — "find a trip"
-- ───────────────────────────────────────────────────────────────────────────
create or replace function public.admin_search_trips(p_query text default null)
returns table (
  trip_id      uuid,
  profile_id   uuid,
  owner_name   text,
  city         text,
  start_date   date,
  end_date     date,
  needs        text[],
  status       public.trip_status,
  created_at   timestamptz
)
language sql
stable
security definer
set search_path = public
as $$
  select
    t.id, t.profile_id, p.display_name, c.name, t.start_date, t.end_date, t.needs, t.status, t.created_at
  from public.trips t
  join public.profiles p on p.id = t.profile_id
  join public.cities c on c.id = t.city_id
  where public.is_admin()
    and (
      p_query is null or btrim(p_query) = ''
      or p.display_name ilike '%' || p_query || '%'
      or c.name ilike '%' || p_query || '%'
    )
  order by t.created_at desc
  limit 50;
$$;

create or replace function public.admin_get_trip_detail(p_trip_id uuid)
returns table (
  trip_id        uuid,
  profile_id     uuid,
  owner_name     text,
  city           text,
  start_date     date,
  end_date       date,
  needs          text[],
  note           text,
  status         public.trip_status,
  created_at     timestamptz,
  requests_count bigint,
  offers_count   bigint,
  stays_count    bigint
)
language sql
stable
security definer
set search_path = public
as $$
  select
    t.id, t.profile_id, p.display_name, c.name, t.start_date, t.end_date, t.needs, t.note,
    t.status, t.created_at,
    (select count(*) from public.requests r where r.trip_id = t.id),
    (select count(*) from public.offers o where o.trip_id = t.id),
    (select count(*) from public.offers o
       join public.stays s on s.offer_id = o.id
      where o.trip_id = t.id)
  from public.trips t
  join public.profiles p on p.id = t.profile_id
  join public.cities c on c.id = t.city_id
  where public.is_admin() and t.id = p_trip_id;
$$;

-- ───────────────────────────────────────────────────────────────────────────
-- Thin wrappers around the existing moderator views
-- ───────────────────────────────────────────────────────────────────────────
create or replace function public.admin_pending_verifications()
returns setof public.v_pending_verifications
language sql stable security definer set search_path = public
as $$
  select * from public.v_pending_verifications where public.is_admin();
$$;

create or replace function public.admin_open_reports()
returns setof public.v_open_reports
language sql stable security definer set search_path = public
as $$
  select * from public.v_open_reports where public.is_admin();
$$;

create or replace function public.admin_stuck_notifications()
returns setof public.v_stuck_notifications
language sql stable security definer set search_path = public
as $$
  select * from public.v_stuck_notifications where public.is_admin();
$$;

create or replace function public.admin_recent_signups()
returns setof public.v_recent_signups
language sql stable security definer set search_path = public
as $$
  select * from public.v_recent_signups where public.is_admin();
$$;

-- ───────────────────────────────────────────────────────────────────────────
-- admin_cron_status — the `cron` schema isn't exposed to the API at all, so
-- this is a read, not just a gate.
-- ───────────────────────────────────────────────────────────────────────────
create or replace function public.admin_cron_status()
returns table (
  jobname    text,
  schedule   text,
  active     boolean,
  last_run   timestamptz,
  last_status text
)
language sql
stable
security definer
set search_path = public
as $$
  select j.jobname, j.schedule, j.active, d.last_run, d.last_status
  from cron.job j
  left join lateral (
    select start_time as last_run, status as last_status
    from cron.job_run_details
    where jobid = j.jobid
    order by start_time desc
    limit 1
  ) d on true
  where public.is_admin()
  order by j.jobname;
$$;

-- ───────────────────────────────────────────────────────────────────────────
-- Grants — revoke the PUBLIC default, grant only to authenticated. anon has
-- no admin_users row it could ever match, but there is no reason to let it
-- attempt the call at all.
-- ───────────────────────────────────────────────────────────────────────────
revoke all on function public.admin_search_profiles(text) from public;
revoke all on function public.admin_get_user_detail(uuid) from public;
revoke all on function public.admin_search_trips(text) from public;
revoke all on function public.admin_get_trip_detail(uuid) from public;
revoke all on function public.admin_pending_verifications() from public;
revoke all on function public.admin_open_reports() from public;
revoke all on function public.admin_stuck_notifications() from public;
revoke all on function public.admin_recent_signups() from public;
revoke all on function public.admin_cron_status() from public;

grant execute on function public.admin_search_profiles(text) to authenticated;
grant execute on function public.admin_get_user_detail(uuid) to authenticated;
grant execute on function public.admin_search_trips(text) to authenticated;
grant execute on function public.admin_get_trip_detail(uuid) to authenticated;
grant execute on function public.admin_pending_verifications() to authenticated;
grant execute on function public.admin_open_reports() to authenticated;
grant execute on function public.admin_stuck_notifications() to authenticated;
grant execute on function public.admin_recent_signups() to authenticated;
grant execute on function public.admin_cron_status() to authenticated;

-- ───────────────────────────────────────────────────────────────────────────
-- verification-docs: the one storage read policy this milestone adds
--
-- 20260813142509_verification_applications.sql created this bucket with
-- "DELIBERATELY NO SELECT POLICY — not even for the owner"; 20260918180000
-- put real files back into it and said outright that Milestone 6 is what
-- reads them. This is that policy, scoped to admins only — an ordinary
-- member still cannot read anyone's evidence, including their own.
-- ───────────────────────────────────────────────────────────────────────────
create policy verification_docs_read_admin
  on storage.objects for select
  to authenticated
  using (bucket_id = 'verification-docs' and public.is_admin());

comment on policy verification_docs_read_admin on storage.objects is
  'Lets the admin app create signed URLs for a selfie or CV during '
  'verification review. The only select policy this bucket has ever had.';
