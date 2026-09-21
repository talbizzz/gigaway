-- Milestone 6 — verification and report decisions (phase 6, part 1).
--
-- Same shape as 20260918200000's write functions: SECURITY DEFINER,
-- is_admin() first, raise rather than go quiet, log before/after the change
-- inside the same transaction. Both wrap exactly the manual SQL
-- MODERATION.md already documents — the existing triggers
-- (handle_verification_decision, and reports' own downstream effects) fire
-- unchanged, because these functions do nothing but the same UPDATE a
-- moderator would type by hand.

-- ───────────────────────────────────────────────────────────────────────────
-- admin_decide_verification
--
-- handle_verification_decision (Milestone 1) already stamps reviewed_at and
-- promotes/rejects the profile when status moves off 'pending' — this
-- function's whole job is the UPDATE that triggers it.
-- ───────────────────────────────────────────────────────────────────────────
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
     set status = p_decision, decision_reason = p_reason
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

revoke all on function public.admin_decide_verification(uuid, text, text) from public;
grant execute on function public.admin_decide_verification(uuid, text, text) to authenticated;

comment on function public.admin_decide_verification is
  'Approve or reject a verification application. Identical in effect to the '
  'manual SQL in MODERATION.md — the profile is promoted or rejected by the '
  'existing handle_verification_decision trigger, not by this function.';

-- ───────────────────────────────────────────────────────────────────────────
-- admin_decide_report
--
-- MODERATION.md's own manual SQL stamps resolved_at = now() for all three
-- decisions, including 'reviewing' — kept exactly as-is; this milestone
-- reproduces the runbook, it doesn't redesign it.
-- ───────────────────────────────────────────────────────────────────────────
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
     set status = p_decision, moderator_note = p_note, resolved_at = now()
   where id = p_report_id;

  perform public.log_admin_action(
    'decide_report',
    'reports',
    p_report_id::text,
    jsonb_build_object('subjectId', v_subject_id, 'decision', p_decision, 'note', p_note)
  );
end;
$$;

revoke all on function public.admin_decide_report(uuid, text, text) from public;
grant execute on function public.admin_decide_report(uuid, text, text) to authenticated;

comment on function public.admin_decide_report is
  'Records a decision on a report. Changes nothing else — same as '
  'MODERATION.md''s own note: "a record of what you decided, not the action '
  'itself." Never notifies the reporter or the subject.';
