-- Milestone 6 — two real bugs, found by actually running pgTAP against a
-- live database instead of only ever dry-running.
--
-- BUG 1: `revoke all on function ... from public` does nothing here.
-- Confirmed via psql against dev: every admin_* function had EXECUTE
-- granted directly to anon and authenticated, despite the revoke, because
-- this project's default privileges grant EXECUTE on new functions to
-- anon/authenticated/service_role directly — not by way of PUBLIC, which
-- is the only grantee `revoke ... from public` actually touches. The
-- existing delete_account/export_user_data already got this right
-- (`revoke all ... from public, anon, authenticated`, naming every role);
-- every admin_* revoke in this milestone shortened that to `from public`
-- alone and silently locked out nothing. Every one is corrected below —
-- log_admin_action fully (no client should ever reach it directly), the
-- rest to remove anon while keeping the intended `grant ... to
-- authenticated` that already followed.
--
-- BUG 2: `update profiles set status = p_status` — p_status is a plpgsql
-- `text` parameter, not a bare string literal, and Postgres does not
-- implicitly cast a typed value into an enum the way it coerces an
-- untyped literal. All three decision functions needed an explicit cast.

revoke all on function public.log_admin_action(text, text, text, jsonb) from public, anon, authenticated;

revoke all on function public.admin_audit_log(int, timestamptz) from public, anon;
revoke all on function public.admin_search_profiles(text) from public, anon;
revoke all on function public.admin_get_user_detail(uuid) from public, anon;
revoke all on function public.admin_search_trips(text) from public, anon;
revoke all on function public.admin_get_trip_detail(uuid) from public, anon;
revoke all on function public.admin_pending_verifications() from public, anon;
revoke all on function public.admin_open_reports() from public, anon;
revoke all on function public.admin_stuck_notifications() from public, anon;
revoke all on function public.admin_recent_signups() from public, anon;
revoke all on function public.admin_cron_status() from public, anon;
revoke all on function public.admin_set_user_status(uuid, text) from public, anon;
revoke all on function public.admin_delete_trip(uuid) from public, anon;
revoke all on function public.admin_decide_verification(uuid, text, text) from public, anon;
revoke all on function public.admin_decide_report(uuid, text, text) from public, anon;

-- Every one of the above already has `grant execute ... to authenticated`
-- from its own migration; revoking anon afterward does not touch that.

create or replace function public.admin_set_user_status(p_profile_id uuid, p_status text)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_old_status public.profile_status;
  v_display_name text;
begin
  if not public.is_admin() then
    raise exception 'not authorized';
  end if;

  if p_status not in ('approved', 'suspended') then
    raise exception 'invalid status: %, must be approved or suspended', p_status;
  end if;

  select status, display_name into v_old_status, v_display_name
  from public.profiles
  where id = p_profile_id;

  if not found then
    raise exception 'profile not found: %', p_profile_id;
  end if;

  update public.profiles set status = p_status::public.profile_status where id = p_profile_id;

  perform public.log_admin_action(
    'set_user_status',
    'profiles',
    p_profile_id::text,
    jsonb_build_object('displayName', v_display_name, 'from', v_old_status, 'to', p_status)
  );
end;
$$;

create or replace function public.admin_decide_verification(
  p_application_id uuid,
  p_decision text,
  p_reason text default null
)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_profile_id uuid;
  v_display_name text;
begin
  if not public.is_admin() then
    raise exception 'not authorized';
  end if;

  if p_decision not in ('approved', 'rejected') then
    raise exception 'invalid decision: %, must be approved or rejected', p_decision;
  end if;

  select a.profile_id, p.display_name into v_profile_id, v_display_name
  from public.verification_applications a
  join public.profiles p on p.id = a.profile_id
  where a.id = p_application_id;

  if not found then
    raise exception 'verification application not found: %', p_application_id;
  end if;

  update public.verification_applications
     set status = p_decision::public.verification_status, decision_reason = p_reason
   where id = p_application_id;

  perform public.log_admin_action(
    'decide_verification',
    'verification_applications',
    p_application_id::text,
    jsonb_build_object(
      'profileId', v_profile_id, 'displayName', v_display_name,
      'decision', p_decision, 'reason', p_reason
    )
  );
end;
$$;

create or replace function public.admin_decide_report(
  p_report_id uuid,
  p_decision text,
  p_note text default null
)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_subject_id uuid;
begin
  if not public.is_admin() then
    raise exception 'not authorized';
  end if;

  if p_decision not in ('actioned', 'dismissed', 'reviewing') then
    raise exception 'invalid decision: %, must be actioned, dismissed or reviewing', p_decision;
  end if;

  select subject_id into v_subject_id
  from public.reports
  where id = p_report_id;

  if not found then
    raise exception 'report not found: %', p_report_id;
  end if;

  update public.reports
     set status = p_decision::public.report_status, moderator_note = p_note, resolved_at = now()
   where id = p_report_id;

  perform public.log_admin_action(
    'decide_report',
    'reports',
    p_report_id::text,
    jsonb_build_object('subjectId', v_subject_id, 'decision', p_decision, 'note', p_note)
  );
end;
$$;
