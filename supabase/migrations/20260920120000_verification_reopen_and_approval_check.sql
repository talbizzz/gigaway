-- A member rejected once could never be approved afterwards.
--
-- THE BUG. handle_verification_decision() only ever moves a profile while
-- `profiles.status = 'pending'` — true for a first application, which is all
-- it was written for. But submit-verification deliberately lets a REJECTED
-- member reapply, reopening the same application row back to 'pending' — and
-- it never touches profiles.status, so the profile stayed 'rejected'. Approve
-- that application and the trigger's `where status = 'pending'` matched no
-- row: the application became 'approved', the profile stayed 'rejected', and
-- the member stayed locked out with nothing anywhere saying so. (Observed on
-- dev: application approved twice, profile still rejected.)
--
-- THE FIX. The trigger already assumes an invariant — "the profile is
-- 'pending' whenever its application is" — and reapplying is the one place
-- that quietly breaks it. Restore it there: reopening a rejected application
-- puts the profile back to 'pending'. That is also simply true (a decision is
-- awaited again), and it leaves both decision branches below exactly as they
-- were, so a second rejection and an approval both work from 'pending'.
--
-- This deliberately reverses one assertion in tests/verification.sql, which
-- expected the profile to stay 'rejected' during re-review. What that test was
-- guarding — that reopening must not silently RE-APPROVE — still holds; it just
-- never covered the reapplication being decided, which is the step that broke.

create or replace function public.handle_verification_decision()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if old.status = 'pending' and new.status in ('approved', 'rejected')
     and new.reviewed_at is null
  then
    new.reviewed_at = now();
  end if;

  -- Reapplication: submit-verification upserts the same row back to 'pending'.
  if old.status = 'rejected' and new.status = 'pending' then
    update public.profiles
      set status = 'pending'
      where id = new.profile_id and status = 'rejected';
  end if;

  if new.status = 'approved' and old.status <> 'approved' then
    update public.profiles
      set status = 'approved', verified_at = now()
      where id = new.profile_id and status = 'pending';
  elsif new.status = 'rejected' and old.status <> 'rejected' then
    update public.profiles
      set status = 'rejected'
      where id = new.profile_id and status = 'pending';
  end if;

  return new;
end;
$$;

-- ───────────────────────────────────────────────────────────────────────────
-- Repair rows the bug already left behind. Both are idempotent and touch only
-- profiles that contradict their own application; suspended and deleted
-- profiles are never in scope. Rows are counted in the migration log only via
-- the statements' own command tags, so the two cases are kept separate.
-- ───────────────────────────────────────────────────────────────────────────

-- An application was approved but the profile never moved: finish the job.
update public.profiles p
   set status = 'approved', verified_at = coalesce(p.verified_at, now())
  from public.verification_applications a
 where a.profile_id = p.id
   and a.status = 'approved'
   and p.status in ('pending', 'rejected');

-- A rejected member reapplied before this fix and is still waiting: put them
-- back to 'pending' so approving their application will actually work.
update public.profiles p
   set status = 'pending'
  from public.verification_applications a
 where a.profile_id = p.id
   and a.status = 'pending'
   and p.status = 'rejected';

-- ───────────────────────────────────────────────────────────────────────────
-- admin_decide_verification: never report success for an approval that did
-- not actually approve anybody.
--
-- The trigger above only promotes a 'pending' profile, so an application
-- belonging to a suspended or deleted member used to flip to 'approved' while
-- the profile stayed exactly as it was — the same silent half-success that hid
-- the bug above. Now the call fails, and because it is one statement the
-- application update is rolled back with it. Approvals only: rejecting needs
-- no such check, because leaving a suspended member suspended is correct.
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
  v_profile_status public.profile_status;
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

  if p_decision = 'approved' then
    select status into v_profile_status from public.profiles where id = v_profile_id;
    if v_profile_status is distinct from 'approved' then
      raise exception
        'cannot approve %: their profile is %, and approval only promotes a pending profile. Nothing was changed.',
        v_display_name, v_profile_status;
    end if;
  end if;

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
