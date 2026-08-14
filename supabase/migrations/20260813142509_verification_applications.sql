-- Milestone 1 — document verification, the fallback path for applicants
-- without an invite.
--
-- DOCUMENT DELETION — how it actually works
--
-- The milestone plan called for a trigger that deletes the uploaded files on
-- review. That is not possible: Supabase installs a BEFORE DELETE trigger on
-- storage.objects (`storage.protect_delete`) that raises
--
--   'Direct deletion from storage tables is not allowed. Use the Storage API
--    instead.'  HINT: 'This prevents accidental data loss from orphaned objects.'
--
-- It can be bypassed by setting `storage.allow_delete_query`, but doing so
-- creates precisely the problem it guards against — the row disappears while
-- the file stays on disk, so we would believe a document was deleted when it
-- was not. For a GDPR commitment that is worse than useless.
--
-- Deletion is therefore two-stage:
--   1. This trigger stamps `docs_deletion_requested_at` on the decision.
--      `doc_paths` is deliberately RETAINED — the purge needs the paths.
--   2. The `purge-verification-docs` Edge Function, scheduled every minute,
--      deletes the objects through the Storage API, then clears `doc_paths`
--      and stamps `docs_deleted_at`. It retries until it succeeds.
--
-- Stage 1 needs no discipline from the moderator; stage 2 follows within a
-- minute. The window in which a decided application still has its documents is
-- bounded and visible in `v_docs_awaiting_purge`.

create type public.verification_status as enum
  ('pending', 'approved', 'rejected', 'docs_expired');

create table public.verification_applications (
  id                          uuid primary key default gen_random_uuid(),
  profile_id                  uuid not null unique references public.profiles(id) on delete cascade,
  status                      public.verification_status not null default 'pending',
  note                        text,
  links                       jsonb not null default '[]'::jsonb,
  doc_paths                   text[] not null default '{}',
  submitted_at                timestamptz not null default now(),
  reviewed_at                 timestamptz,
  reviewed_by                 uuid references public.profiles(id) on delete set null,
  decision_reason             text,
  docs_deletion_requested_at  timestamptz,
  docs_deleted_at             timestamptz,

  constraint note_length check (note is null or char_length(note) <= 1000),
  constraint links_is_array check (jsonb_typeof(links) = 'array'),
  constraint at_most_three_docs check (coalesce(array_length(doc_paths, 1), 0) <= 3)
);

comment on table public.verification_applications is
  'Evidence of professional status, reviewed by hand. The lasting record is the '
  'outcome; the documents themselves are deleted on decision.';

create index verification_pending on public.verification_applications (submitted_at)
  where status = 'pending';
create index verification_docs_to_purge
  on public.verification_applications (docs_deletion_requested_at)
  where docs_deleted_at is null and docs_deletion_requested_at is not null;

-- ───────────────────────────────────────────────────────────────────────────
-- Storage buckets
-- ───────────────────────────────────────────────────────────────────────────
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values
  ('avatars', 'avatars', true, 5242880,
   array['image/jpeg', 'image/png', 'image/webp']),
  ('verification-docs', 'verification-docs', false, 5242880,
   array['image/jpeg', 'image/png', 'application/pdf'])
on conflict (id) do nothing;

-- Avatars: readable by anyone, writable only inside your own folder.
create policy avatars_read_all
  on storage.objects for select
  using (bucket_id = 'avatars');

create policy avatars_write_own
  on storage.objects for insert
  to authenticated
  with check (
    bucket_id = 'avatars'
    and (storage.foldername(name))[1] = (select auth.uid())::text
  );

create policy avatars_update_own
  on storage.objects for update
  to authenticated
  using (
    bucket_id = 'avatars'
    and (storage.foldername(name))[1] = (select auth.uid())::text
  );

create policy avatars_delete_own
  on storage.objects for delete
  to authenticated
  using (
    bucket_id = 'avatars'
    and (storage.foldername(name))[1] = (select auth.uid())::text
  );

-- Verification documents: an applicant may upload into their own folder and
-- may delete their own upload before review. There is DELIBERATELY NO SELECT
-- POLICY — not even for the owner. The moderator reads them through the
-- dashboard as a privileged role, and nothing else can read them at all.
create policy verification_docs_write_own
  on storage.objects for insert
  to authenticated
  with check (
    bucket_id = 'verification-docs'
    and (storage.foldername(name))[1] = (select auth.uid())::text
  );

create policy verification_docs_delete_own
  on storage.objects for delete
  to authenticated
  using (
    bucket_id = 'verification-docs'
    and (storage.foldername(name))[1] = (select auth.uid())::text
  );

-- ───────────────────────────────────────────────────────────────────────────
-- Deletion on decision (stage 1)
-- ───────────────────────────────────────────────────────────────────────────
create or replace function public.handle_verification_decision()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  -- Any exit from 'pending' means the documents have served their purpose.
  if old.status = 'pending' and new.status <> 'pending' then
    -- An expiry is not a review: only a real decision stamps reviewed_at,
    -- otherwise `docs_expired` would look like it had been assessed.
    if new.status in ('approved', 'rejected') and new.reviewed_at is null then
      new.reviewed_at = now();
    end if;

    if coalesce(array_length(old.doc_paths, 1), 0) > 0 then
      -- Request the purge; the Edge Function does the deleting. doc_paths is
      -- kept until then because it is the only record of what to delete.
      new.docs_deletion_requested_at = coalesce(new.docs_deletion_requested_at, now());
    else
      new.docs_deleted_at = coalesce(new.docs_deleted_at, now());
    end if;
  end if;

  -- Approval through document review promotes the profile, mirroring what
  -- redeem_invite does for the invite path.
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

create trigger verification_on_decision
  before update on public.verification_applications
  for each row execute function public.handle_verification_decision();

-- ───────────────────────────────────────────────────────────────────────────
-- RLS
-- ───────────────────────────────────────────────────────────────────────────
alter table public.verification_applications enable row level security;

create policy verification_select_own
  on public.verification_applications for select
  to authenticated
  using (profile_id = (select auth.uid()));

create policy verification_insert_own
  on public.verification_applications for insert
  to authenticated
  with check (profile_id = (select auth.uid()));

-- An applicant may amend their submission while it is undecided, or re-upload
-- after the 90-day purge. They may not touch the decision.
create policy verification_update_own_while_open
  on public.verification_applications for update
  to authenticated
  using (
    profile_id = (select auth.uid())
    and status in ('pending', 'docs_expired')
  )
  with check (
    profile_id = (select auth.uid())
    and status in ('pending', 'docs_expired')
  );

create or replace function public.guard_verification_columns()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  if current_user in ('service_role', 'postgres', 'supabase_admin') then
    return new;
  end if;

  if new.reviewed_at is distinct from old.reviewed_at
     or new.reviewed_by is distinct from old.reviewed_by
     or new.decision_reason is distinct from old.decision_reason
     or new.profile_id is distinct from old.profile_id
  then
    raise exception 'verification decision fields are not client-updatable'
      using errcode = '42501';
  end if;

  -- Re-uploading after expiry returns the application to the queue; no other
  -- client-side status transition is allowed.
  if new.status is distinct from old.status
     and not (old.status = 'docs_expired' and new.status = 'pending')
  then
    raise exception 'verification status is not client-updatable'
      using errcode = '42501';
  end if;

  return new;
end;
$$;

create trigger verification_guard_columns
  before update on public.verification_applications
  for each row execute function public.guard_verification_columns();

grant select, insert, update on public.verification_applications to authenticated;
