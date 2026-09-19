-- Reverses the "never stored, only emailed" design from
-- 20260917090000_verification_only_signup.sql. The selfie and CV are now
-- uploaded directly from the app to Supabase Storage (same pattern avatars
-- already use — RLS scoped to the caller's own folder) and retained until
-- the applicant deletes their account, rather than emailed as attachments
-- and never written anywhere.
--
-- WHY
--
-- The admin dashboard planned in Milestone 6 needs something to read; an
-- inbox is not a queryable data store. submit-verification now sends a
-- short, attachment-free notification instead — the evidence itself is
-- reached through Storage (today, the Supabase dashboard's Storage browser;
-- once Milestone 6 ships, the admin app).
--
-- selfie_path and cv_path are deliberately NOT NOT NULL at the column level,
-- the same way the original pre-email design left doc_paths and
-- selfie_with_id_path nullable: the real requirement (a selfie is always
-- required; a CV or a link is required) is enforced by submit-verification
-- and, for the has_evidence half, the constraint below — not by a column
-- constraint that would have nothing to backfill for rows from the
-- email-only era in between.
--
-- ORDERING NOTE, same lesson as 20260917090000: v_pending_verifications
-- still selects cv_attached, so that view has to be dropped BEFORE
-- cv_attached is, not after — dropping a column a live view depends on
-- fails, regardless of whether the replacement view will stop referencing
-- it. The new view is only created at the end, once every column it needs
-- actually exists.

alter table public.verification_applications
  add column selfie_path text,
  add column cv_path     text;

drop view if exists public.v_pending_verifications;

-- Backfill so existing rows (from the brief email-only window) still satisfy
-- the new has_evidence constraint below. cv_attached === true meant "a CV was
-- attached to that row's email", which is now a fact with no file behind it
-- — recorded as a marker path rather than invented as a fake link, so a
-- moderator glancing at links does not see something no applicant wrote.
update public.verification_applications
  set cv_path = 'legacy/not-stored-email-only-era'
  where cv_attached = true and cv_path is null;

alter table public.verification_applications
  drop constraint has_evidence,
  drop column cv_attached,
  drop column resend_email_id; -- the notification is fire-and-forget now; see submit-verification

alter table public.verification_applications
  add constraint has_evidence check (cv_path is not null or jsonb_array_length(links) > 0);

comment on column public.verification_applications.selfie_path is
  'Storage path in the verification-docs bucket. Not stamped for rows from '
  'the brief email-only window (see the migration this reversed); always '
  'populated for anything submitted since.';
comment on column public.verification_applications.cv_path is
  'Storage path in the verification-docs bucket, or null if no CV was '
  'attached — evidence.links may still be non-empty in that case.';

-- ═══════════════════════════════════════════════════════════════════════════
-- Storage: re-enable writes to the bucket 20260917090000 made inert
-- ═══════════════════════════════════════════════════════════════════════════

update storage.buckets
set file_size_limit = 10485760, -- 10 MB: generous for a phone-camera selfie
    allowed_mime_types = array['image/jpeg', 'image/png', 'application/pdf']
where id = 'verification-docs';

-- Insert-only, no update or delete: each submission writes a fresh,
-- timestamped path rather than overwriting a previous one, so a rejected
-- and re-submitted application does not need permission to touch its own
-- history. There is still deliberately no select policy — not even for the
-- owner — matching the original reasoning: a moderator reads these through
-- the dashboard as a privileged role, and nothing else can read them at all.
create policy verification_docs_write_own
  on storage.objects for insert
  to authenticated
  with check (
    bucket_id = 'verification-docs'
    and (storage.foldername(name))[1] = (select auth.uid())::text
  );

-- ═══════════════════════════════════════════════════════════════════════════
-- delete_account: the one thing that now removes this evidence
-- ═══════════════════════════════════════════════════════════════════════════

create or replace function public.delete_account(p_user uuid)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_photo_path  text;
  v_selfie_path text;
  v_cv_path     text;
begin
  select photo_path into v_photo_path from public.profiles where id = p_user;
  select selfie_path, cv_path into v_selfie_path, v_cv_path
    from public.verification_applications where profile_id = p_user;

  -- ── things nobody else needs ────────────────────────────────────────────
  delete from public.contact_details where profile_id = p_user;
  delete from public.push_tokens where profile_id = p_user;
  delete from public.notifications where profile_id = p_user;
  delete from public.verification_applications where profile_id = p_user;
  delete from public.data_exports where profile_id = p_user;

  -- The grant is meaningless once contact_details are gone, and leaving it
  -- would show the counterparty a contact with nothing behind it.
  delete from public.contact_grants
    where profile_a = p_user or profile_b = p_user;

  -- Blocks THEY created go. Blocks created AGAINST them stay, so that somebody
  -- who blocked this person for a reason is not quietly re-exposed to them if
  -- the account is ever recreated.
  delete from public.blocks where blocker_id = p_user;

  -- Reviews about them serve no purpose once they are gone. Reviews they WROTE
  -- about other people stay if published — see the note above — and the author
  -- now points at the tombstone, which renders as "Deleted member".
  delete from public.reviews where subject_id = p_user;
  delete from public.reviews where author_id = p_user and published_at is null;

  -- ── anything not underpinning a stay ────────────────────────────────────
  -- Order matters: requests and offers cascade from trips, and stays cascade
  -- from offers, so a naive "delete their trips" would take somebody else's
  -- stay with it.
  delete from public.requests
    where (from_profile = p_user or to_profile = p_user)
      and status <> 'accepted';

  delete from public.offers o
    where (o.from_profile = p_user or o.to_profile = p_user)
      and not exists (select 1 from public.stays s where s.offer_id = o.id);

  delete from public.availability where profile_id = p_user;

  delete from public.trips t
    where t.profile_id = p_user
      and not exists (
        select 1 from public.offers o
        join public.stays s on s.offer_id = o.id
        where o.trip_id = t.id
      );

  -- A trip that produced a stay survives, stripped of its free text. The dates
  -- and city are the counterparty's record of where they hosted somebody.
  update public.trips set note = null where profile_id = p_user;

  -- ── the tombstone ───────────────────────────────────────────────────────
  update public.profiles
    set display_name   = 'Deleted member',
        specialisation = null,
        bio            = null,
        home_district  = null,
        home_city_id   = null,
        photo_path     = null,
        links          = '[]'::jsonb,
        status         = 'deleted'
    where id = p_user;

  -- stays, published reviews they wrote, and reports in both directions are
  -- all retained deliberately and now point at the tombstone.

  return jsonb_build_object(
    'ok', true,
    'photoPath', v_photo_path,
    'selfiePath', v_selfie_path,
    'cvPath', v_cv_path
  );
end;
$$;

comment on function public.delete_account is
  'Irreversible. Called only by the delete-account Edge Function, which erases '
  'the auth.users row and the avatar and verification-evidence objects '
  'afterwards — none of those are reachable from SQL. Retaining reports is a '
  'legitimate-interest decision that MUST be stated in the privacy policy '
  'before this ships.';

-- export_user_data still excludes the actual files — only the metadata
-- (legal name, links, whether a CV exists) travels in an export, same as
-- before. The storage paths are internal identifiers, not something a
-- member's own export needs to carry.
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
    -- Metadata only — never the storage paths, and never the files.
    'verificationApplication', (
      select to_jsonb(a) - 'id' - 'profile_id' - 'selfie_path' - 'cv_path'
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

-- ═══════════════════════════════════════════════════════════════════════════
-- Moderator view — created here, now that selfie_path/cv_path exist and the
-- old view (dropped above, before cv_attached went with it) is out of the way
-- ═══════════════════════════════════════════════════════════════════════════

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
  a.selfie_path,
  a.cv_path,
  a.note,
  a.links,
  a.submitted_at,
  extract(day from now() - a.submitted_at)::integer   as days_waiting
from public.verification_applications a
join public.profiles p on p.id = a.profile_id
join auth.users u on u.id = a.profile_id
where a.status = 'pending'
order by a.submitted_at asc;

comment on view public.v_pending_verifications is
  'Moderator queue. selfie_path and cv_path are Storage object paths in the '
  'verification-docs bucket — open them from the dashboard''s Storage '
  'browser, not from this view. Check the emailed pose instruction '
  '(selfie_prompt) against the photo before deciding. To decide: update '
  'verification_applications set status = ''approved''|''rejected'', '
  'decision_reason = ''…'' where profile_id = ''…''; the profile is promoted '
  'or rejected automatically.';

revoke all on public.v_pending_verifications from anon, authenticated;
