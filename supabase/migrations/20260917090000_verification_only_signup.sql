-- Replaces the invite chain with mandatory verification for every signup.
--
-- THE CHANGE
--
-- There is no longer a fast path into the network. Every new profile starts
-- and stays 'pending' until a human decides it — there is no invite code that
-- promotes someone straight to 'approved' any more. The evidence a human
-- reviews is no longer stored anywhere in Supabase either: the submit-
-- verification Edge Function emails it to verify@gigaway.app (a selfie
-- holding ID against a prompt that changes every submission, an optional CV,
-- and links) and only ever writes a metadata row here — who applied, what
-- they claimed, when, and the eventual decision. The photos themselves exist
-- only in that mailbox.
--
-- That makes the entire two-stage document-purge machinery from the previous
-- design (storage bucket, docs_deletion_requested_at/docs_deleted_at,
-- doc_paths, the per-minute purge cron, the 90-day expiry cron) unnecessary:
-- there is nothing left to purge, because nothing is ever written to disk in
-- the first place. All of it goes.
--
-- verification_status keeps its 'docs_expired' value even though nothing can
-- reach it any more — Postgres enums cannot drop a value without rebuilding
-- the type, and there is no live row using it to migrate. Treat it as
-- vestigial, the same way remove_invite_quota.sql left remaining_invite_quota()
-- in place returning a constant.
--
-- ORDERING NOTE, because it cost real time to discover: three views
-- (v_recent_signups, v_user_summary, v_pending_verifications) and one more
-- (v_docs_awaiting_purge) hold real dependencies — via pg_depend, not just
-- textually — on the tables, columns and a column default this migration
-- removes. Postgres refuses a DROP while a view still depends on it. So this
-- file adds new columns first, redefines every dependent view to stop
-- referencing what's leaving, and only then drops anything. Every DROP below
-- is still `if exists`, because a project that already had
-- feature/artist-verification-gate's migration applied (dev, mid-development
-- — never merged to develop) is ahead of one that never got it (prod), and
-- this needs to run cleanly on both.

-- ═══════════════════════════════════════════════════════════════════════════
-- PART 1 — add what the new verification flow needs, before anything is
-- redefined or removed
-- ═══════════════════════════════════════════════════════════════════════════

alter table public.verification_applications
  add column if not exists full_legal_name text,
  add column if not exists selfie_prompt   text,
  add column if not exists cv_attached     boolean not null default false,
  add column if not exists resend_email_id text;

-- Backfill every pre-existing row with honest placeholders rather than an
-- empty string or false, either of which would fail the checks added in
-- Part 4. cv_attached is set unconditionally to true rather than inspected
-- from doc_paths: the old apply.tsx form refused to submit with zero files,
-- so it is true by construction of the flow every historical row went
-- through — and for an already-decided row, doc_paths may already read empty
-- because the purge that used to run on decision already cleared it.
update public.verification_applications
  set cv_attached     = true,
      full_legal_name = 'Unknown — submitted before this field existed',
      selfie_prompt   = 'N/A — submitted before this requirement existed'
  where full_legal_name is null;

alter table public.verification_applications
  alter column full_legal_name set not null,
  alter column selfie_prompt set not null;

-- ═══════════════════════════════════════════════════════════════════════════
-- PART 2 — redefine every view that depends on what's being removed
-- ═══════════════════════════════════════════════════════════════════════════

-- Nothing left to purge, and doc_paths (which this depended on) is going —
-- dropped outright rather than redefined, since there is no replacement
-- concept for it any more.
drop view if exists public.v_docs_awaiting_purge;

-- Dropped and recreated, not CREATE OR REPLACE: Postgres allows that only to
-- append columns at the end, never to rename, reorder or remove an existing
-- one, and this reshapes the view from the ground up (profile_id moves next
-- to id, doc_paths is gone). Uses only the new columns from Part 1 plus
-- profile_id — no doc_paths.
drop view if exists public.v_pending_verifications;
create view public.v_pending_verifications as
select
  a.id                                                as application_id,
  a.profile_id,
  p.display_name,
  p.discipline,
  p.specialisation,
  u.email,
  a.full_legal_name,
  a.selfie_prompt,
  a.note,
  a.links,
  a.cv_attached,
  a.submitted_at,
  extract(day from now() - a.submitted_at)::integer   as days_waiting
from public.verification_applications a
join public.profiles p on p.id = a.profile_id
join auth.users u on u.id = a.profile_id
where a.status = 'pending'
order by a.submitted_at asc;

comment on view public.v_pending_verifications is
  'Moderator queue. The selfie, ID and CV are in the verify@gigaway.app '
  'inbox, subject-lined with profile_id — this view is everything the '
  'applicant claimed alongside it. To decide: update verification_applications '
  'set status = ''approved''|''rejected'', decision_reason = ''…'' where '
  'profile_id = ''…''; the profile is promoted or rejected automatically. '
  'Delete the email once you have decided — that inbox is the only place '
  'this evidence exists.';

-- Dropped and recreated for the same reason as above: invited_by and
-- joined_via sat in the middle of the old column order, and CREATE OR
-- REPLACE VIEW cannot remove or reorder existing columns, only append.
drop view if exists public.v_recent_signups;
create view public.v_recent_signups as
select
  p.id,
  p.display_name,
  p.discipline,
  p.status,
  c.name                                              as home_city,
  p.created_at
from public.profiles p
left join public.cities c on c.id = p.home_city_id
order by p.created_at desc;

-- Dropped and recreated for the same reason as above: invited_by sat in the
-- middle of the old column order.
drop view if exists public.v_user_summary;
create view public.v_user_summary as
select
  p.id                                              as profile_id,
  p.display_name,
  p.status,
  p.discipline,
  c.name                                            as home_city,
  p.created_at                                      as joined_at,
  (select count(*) from public.trips t where t.profile_id = p.id)              as trips,
  (select count(*) from public.availability a where a.profile_id = p.id)       as availability,
  (select count(*) from public.stays s
    where s.host_id = p.id)                                                    as stays_hosted,
  (select count(*) from public.stays s
    where s.guest_id = p.id)                                                   as stays_as_guest,
  (select count(*) from public.reviews r
    where r.author_id = p.id and r.published_at is not null)                   as reviews_written,
  (select count(*) from public.reviews r
    where r.subject_id = p.id and r.published_at is not null)                  as reviews_received,
  -- The reputation signal, as a fraction rather than a score. Null when there
  -- is nothing to average, which is honest — "no reviews" is not "zero".
  (select round(avg(case when r.would_again then 1 else 0 end) * 100)::integer
     from public.reviews r
    where r.subject_id = p.id and r.published_at is not null)                  as would_again_pct,
  (select count(*) from public.reports rep where rep.reporter_id = p.id)       as reports_filed,
  (select count(*) from public.reports rep where rep.subject_id = p.id)        as reports_received,
  (select count(distinct rep.reporter_id) from public.reports rep
    where rep.subject_id = p.id)                                              as distinct_reporters,
  (select count(*) from public.blocks b where b.blocker_id = p.id)             as blocks_made,
  (select count(*) from public.blocks b where b.blocked_id = p.id)             as blocks_received
from public.profiles p
left join public.cities c on c.id = p.home_city_id;

revoke all on public.v_pending_verifications from anon, authenticated;
revoke all on public.v_recent_signups from anon, authenticated;
revoke all on public.v_user_summary from anon, authenticated;

-- ═══════════════════════════════════════════════════════════════════════════
-- PART 3 — now safe to drop: the invite chain, and the storage-based
-- verification machinery
-- ═══════════════════════════════════════════════════════════════════════════

-- Tables first: invites.code defaults to generate_invite_code(), so that
-- function cannot go while the default still exists. Dropping the tables
-- also takes their own triggers (invites_guard_columns, invites_set_code)
-- and invite_redemptions' foreign key with them, so those never need a
-- separate drop.
drop function if exists public.redeem_invite(text, uuid);
drop table if exists public.invite_redemptions;
drop table if exists public.invites;

drop function if exists public.guard_invite_columns();
drop function if exists public.set_invite_code();
drop function if exists public.remaining_invite_quota();
drop function if exists public.live_invite_count();
drop function if exists public.generate_invite_code();

-- Client-side submission is gone — submit-verification writes this table as
-- service_role, in the same request that sends the email, so the metadata
-- row and the email can never disagree about whether an application exists.
--
-- This has to happen BEFORE profiles.invited_by is dropped below: on a
-- project that had feature/artist-verification-gate's migration applied
-- (dev), verification_insert_own's USING/WITH CHECK expression references
-- invited_by directly, which blocks the column drop while the policy exists.
drop policy if exists verification_insert_own on public.verification_applications;
drop policy if exists verification_update_own_while_open on public.verification_applications;
drop trigger if exists verification_guard_columns on public.verification_applications;
drop function if exists public.guard_verification_columns();
revoke insert, update on public.verification_applications from authenticated;

-- Nothing left to promote a profile on redemption, and nothing left to spend.
alter table public.profiles drop column if exists invited_by;
alter table public.profiles drop column if exists invite_quota;

delete from public.app_config
  where key in ('default_invite_quota', 'invite_ttl_days');

-- The write/delete policies that let an applicant populate the storage
-- bucket. submit-verification never writes here, so nobody can write to it
-- at all any more.
--
-- The bucket row itself is deliberately NOT deleted: storage.objects has a
-- protect_delete trigger that refuses direct deletion outside the Storage
-- API (see verification_applications.sql for why), so removing the bucket
-- would fail in any environment where a document was ever actually uploaded
-- through the old apply flow. It was already unreadable by anyone but a
-- privileged role — see "DELIBERATELY NO SELECT POLICY" in that same
-- migration — so leaving it in place, write-dead, costs nothing.
drop policy if exists verification_docs_write_own on storage.objects;
drop policy if exists verification_docs_delete_own on storage.objects;

select cron.unschedule('purge-verification-docs');
select cron.unschedule('expire-verification-docs');
drop function if exists public.expire_verification_docs();

delete from public.app_config where key in ('doc_purge_days');

-- selfie_with_id_path and at_most_six_docs only exist on a project that had
-- feature/artist-verification-gate's migration applied ahead of this one.
-- `if exists` makes dropping them a safe no-op anywhere that never happened.
alter table public.verification_applications
  drop column if exists doc_paths,
  drop column if exists docs_deletion_requested_at,
  drop column if exists docs_deleted_at,
  drop column if exists selfie_with_id_path,
  drop constraint if exists at_most_three_docs,
  drop constraint if exists at_most_six_docs;

-- ═══════════════════════════════════════════════════════════════════════════
-- PART 4 — redefine what's left to stop referencing any of the above, and
-- finish the new verification_applications shape
-- ═══════════════════════════════════════════════════════════════════════════

comment on table public.profiles is
  'A profile may outlive its auth.users row. delete-account erases the auth '
  'user outright and leaves this row as an anonymised tombstone, so that the '
  'stays, reviews and blocks belonging to OTHER people survive.';

-- handle_new_user() no longer has an invite_quota column to seed.
create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  meta_name       text := nullif(trim(new.raw_user_meta_data ->> 'display_name'), '');
  meta_discipline text := nullif(trim(new.raw_user_meta_data ->> 'discipline'), '');
begin
  insert into public.profiles (id, display_name, discipline)
  values (
    new.id,
    -- Fall back to the email local part so the NOT NULL constraint can never
    -- block account creation if metadata is missing.
    coalesce(meta_name, split_part(new.email, '@', 1)),
    case
      when meta_discipline in ('voice', 'strings', 'keyboard', 'winds', 'brass',
                               'percussion', 'dance', 'conducting', 'composition', 'other')
        then meta_discipline
      else 'other'
    end
  );

  insert into public.contact_details (profile_id, email)
  values (new.id, new.email);

  return new;
end;
$$;

-- The column guard no longer has invite_quota / invited_by to police.
create or replace function public.guard_profile_privileged_columns()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  if current_user in ('service_role', 'postgres', 'supabase_admin') then
    return new;
  end if;

  if new.status is distinct from old.status then
    raise exception 'profiles.status is not client-updatable'
      using errcode = '42501';
  end if;

  if new.verified_at is distinct from old.verified_at then
    raise exception 'profiles.verified_at is not client-updatable'
      using errcode = '42501';
  end if;

  if new.suspended_at is distinct from old.suspended_at then
    raise exception 'profiles.suspended_at is not client-updatable'
      using errcode = '42501';
  end if;

  return new;
end;
$$;

-- export_user_data no longer has an invite chain to report.
create or replace function public.export_user_data(p_user uuid)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_data jsonb;
begin
  select jsonb_build_object(
    'profile', (
      select to_jsonb(p) - 'photo_path'
        || jsonb_build_object('homeCity', c.name)
      from public.profiles p
      left join public.cities c on c.id = p.home_city_id
      where p.id = p_user
    ),
    'contactDetails', (
      select to_jsonb(cd) from public.contact_details cd where cd.profile_id = p_user
    ),
    'trips', coalesce((
      select jsonb_agg(to_jsonb(t) || jsonb_build_object('city', c.name) order by t.start_date)
      from public.trips t join public.cities c on c.id = t.city_id
      where t.profile_id = p_user
    ), '[]'::jsonb),
    'availability', coalesce((
      select jsonb_agg(to_jsonb(a) || jsonb_build_object('city', c.name) order by a.start_date)
      from public.availability a join public.cities c on c.id = a.city_id
      where a.profile_id = p_user
    ), '[]'::jsonb),
    'requestsSent', coalesce((
      select jsonb_agg(to_jsonb(r) order by r.created_at)
      from public.requests r where r.from_profile = p_user
    ), '[]'::jsonb),
    'requestsReceived', coalesce((
      select jsonb_agg(to_jsonb(r) order by r.created_at)
      from public.requests r where r.to_profile = p_user
    ), '[]'::jsonb),
    'offersSent', coalesce((
      select jsonb_agg(to_jsonb(o) order by o.created_at)
      from public.offers o where o.from_profile = p_user
    ), '[]'::jsonb),
    'offersReceived', coalesce((
      select jsonb_agg(to_jsonb(o) order by o.created_at)
      from public.offers o where o.to_profile = p_user
    ), '[]'::jsonb),
    'stays', coalesce((
      select jsonb_agg(
        to_jsonb(s) || jsonb_build_object(
          'city', c.name,
          'role', case when s.host_id = p_user then 'host' else 'guest' end
        ) order by s.start_date)
      from public.stays s join public.cities c on c.id = s.city_id
      where s.host_id = p_user or s.guest_id = p_user
    ), '[]'::jsonb),
    -- Published only. An unpublished review about this person is still inside
    -- the double-blind window, and an export must not be a way around it.
    'reviewsWritten', coalesce((
      select jsonb_agg(to_jsonb(r) order by r.submitted_at)
      from public.reviews r where r.author_id = p_user
    ), '[]'::jsonb),
    'reviewsReceived', coalesce((
      select jsonb_agg(to_jsonb(r) order by r.submitted_at)
      from public.reviews r
      where r.subject_id = p_user and r.published_at is not null
    ), '[]'::jsonb),
    'blocksCreated', coalesce((
      select jsonb_agg(jsonb_build_object('blockedId', b.blocked_id, 'createdAt', b.created_at))
      from public.blocks b where b.blocker_id = p_user
    ), '[]'::jsonb),
    -- What was submitted for verification, minus the photos and the CV —
    -- those were never written here to begin with, only emailed.
    'verificationApplication', (
      select to_jsonb(a) - 'id' - 'profile_id'
      from public.verification_applications a
      where a.profile_id = p_user
    ),
    'notifications', coalesce((
      select jsonb_agg(
        jsonb_build_object(
          'type', n.type, 'payload', n.payload,
          'createdAt', n.created_at, 'readAt', n.read_at
        ) order by n.created_at desc)
      from public.notifications n where n.profile_id = p_user
    ), '[]'::jsonb)
  ) into v_data;

  insert into public.data_exports (profile_id) values (p_user);

  return v_data;
end;
$$;

revoke all on function public.export_user_data(uuid) from public, anon, authenticated;

comment on function public.delete_account is
  'Irreversible. Called only by the delete-account Edge Function, which erases '
  'the auth.users row and the avatar object afterwards. Retaining reports is a '
  'legitimate-interest decision that MUST be stated in the privacy policy '
  'before this ships.';

alter table public.verification_applications
  add constraint full_legal_name_length check (char_length(full_legal_name) between 2 and 120),
  add constraint selfie_prompt_length check (char_length(selfie_prompt) between 1 and 200),
  add constraint has_evidence check (cv_attached or jsonb_array_length(links) > 0);

comment on table public.verification_applications is
  'One row per applicant, written by submit-verification (service_role) in '
  'the same request that emails the actual evidence to verify@gigaway.app. '
  'This table never holds the selfie, the ID, or the CV — only what was '
  'claimed and the eventual decision.';
comment on column public.verification_applications.full_legal_name is
  'As given by the applicant, for the moderator to cross-check against the '
  'name on the ID in the selfie and against any named document or profile.';
comment on column public.verification_applications.selfie_prompt is
  'The pose instruction shown to the applicant for this submission (e.g. '
  '"ID in your right hand, two fingers up on your left"). Changes every '
  'submission so an old photo cannot be reused; the moderator checks the '
  'emailed photo against this text.';
comment on column public.verification_applications.cv_attached is
  'Whether a CV file was attached to the email. The file itself is never '
  'written here.';

-- Deletion on decision no longer has documents to purge — just promote or
-- reject the profile and stamp reviewed_at.
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

-- Applicants may read their own status; only service_role writes.
grant select on public.verification_applications to authenticated;
