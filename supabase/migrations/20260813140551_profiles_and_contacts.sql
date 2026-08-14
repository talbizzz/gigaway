-- Milestone 1 — profiles, contact details, and contact grants.
--
-- RLS policies for these tables land in the next migration, together with the
-- helper functions they depend on. This migration is structure and triggers only.

-- ───────────────────────────────────────────────────────────────────────────
-- Shared helpers
-- ───────────────────────────────────────────────────────────────────────────
create or replace function public.set_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

-- ───────────────────────────────────────────────────────────────────────────
-- profiles
--
-- One row per auth user, created automatically on sign-up. `status` is the
-- verification state machine and the single gate on all member content:
--
--   pending ──(invite redeemed)──────────► approved
--      │  └──(document review approved)──► approved
--      ├──(document review rejected)─────► rejected
--   approved ──(moderator)──► suspended ──(moderator)──► approved
--   any ──(account deletion)──► deleted
-- ───────────────────────────────────────────────────────────────────────────
create type public.profile_status as enum
  ('pending', 'approved', 'rejected', 'suspended', 'deleted');

create table public.profiles (
  id             uuid primary key references auth.users(id) on delete cascade,
  display_name   text not null,
  discipline     text not null,
  specialisation text,
  home_city_id   uuid references public.cities(id),
  home_district  text,
  bio            text,
  photo_path     text,
  links          jsonb not null default '[]'::jsonb,
  status         public.profile_status not null default 'pending',
  invited_by     uuid references public.profiles(id) on delete set null,
  invite_quota   integer not null default 5,
  verified_at    timestamptz,
  suspended_at   timestamptz,
  created_at     timestamptz not null default now(),
  updated_at     timestamptz not null default now(),

  constraint display_name_length check (char_length(display_name) between 2 and 80),
  constraint bio_length check (bio is null or char_length(bio) <= 600),
  constraint home_district_length check (home_district is null or char_length(home_district) <= 80),
  constraint invite_quota_non_negative check (invite_quota >= 0),
  constraint discipline_known check (discipline in (
    'voice', 'strings', 'keyboard', 'winds', 'brass', 'percussion',
    'dance', 'conducting', 'composition', 'other'
  )),
  constraint links_is_array check (jsonb_typeof(links) = 'array')
);

comment on column public.profiles.home_district is
  'A coarse, free-text area label such as "Neuhausen". Deliberately not '
  'geocoded and never an exact address — the precise address is exchanged '
  'directly between parties off-platform after an offer is accepted.';
comment on column public.profiles.status is
  'Gates all member content. is_approved() returns true only for ''approved''.';

create index profiles_home_city on public.profiles (home_city_id) where status = 'approved';
create index profiles_status on public.profiles (status);
create index profiles_invited_by on public.profiles (invited_by);

create trigger profiles_set_updated_at
  before update on public.profiles
  for each row execute function public.set_updated_at();

-- ───────────────────────────────────────────────────────────────────────────
-- contact_details
--
-- Kept out of `profiles` deliberately. Revealing contact information is then a
-- row-level policy decision rather than a column-selection decision in client
-- code, so there is no code path that can forget to hide a phone number.
-- ───────────────────────────────────────────────────────────────────────────
create table public.contact_details (
  profile_id        uuid primary key references public.profiles(id) on delete cascade,
  email             text,
  phone             text,
  whatsapp          text,
  preferred_channel text,
  updated_at        timestamptz not null default now(),

  constraint preferred_channel_known check (
    preferred_channel is null or preferred_channel in ('whatsapp', 'phone', 'email')
  )
);

create trigger contact_details_set_updated_at
  before update on public.contact_details
  for each row execute function public.set_updated_at();

-- ───────────────────────────────────────────────────────────────────────────
-- contact_grants
--
-- Rows are created in Milestone 3 when an offer or co-accommodation request is
-- accepted. The table exists now because the contact_details policy references
-- it. The pair is stored canonically (a < b) so a grant is symmetric and cannot
-- be duplicated in mirror form.
-- ───────────────────────────────────────────────────────────────────────────
create table public.contact_grants (
  id         uuid primary key default gen_random_uuid(),
  profile_a  uuid not null references public.profiles(id) on delete cascade,
  profile_b  uuid not null references public.profiles(id) on delete cascade,
  source     text not null,
  source_id  uuid,
  created_at timestamptz not null default now(),

  constraint ordered_pair check (profile_a < profile_b),
  constraint source_known check (source in ('offer', 'co_request')),
  unique (profile_a, profile_b, source, source_id)
);

create index contact_grants_a on public.contact_grants (profile_a);
create index contact_grants_b on public.contact_grants (profile_b);

-- ───────────────────────────────────────────────────────────────────────────
-- Profile creation on sign-up
--
-- display_name and discipline are collected on the sign-up form and passed
-- through auth metadata, so the profile row is never in a half-built state.
-- The remaining fields (city, bio, photo, links) are filled in by the profile
-- wizard afterwards.
-- ───────────────────────────────────────────────────────────────────────────
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
  insert into public.profiles (id, display_name, discipline, invite_quota)
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
    end,
    public.config_int('default_invite_quota')
  );

  insert into public.contact_details (profile_id, email)
  values (new.id, new.email);

  return new;
end;
$$;

create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();

-- ───────────────────────────────────────────────────────────────────────────
-- Column guard
--
-- LOAD-BEARING. Without this, the `profiles` update policy — which must allow a
-- user to edit their own row — would also let any user set their own
-- status = 'approved' and walk straight through the verification wall.
--
-- These columns are writable only by service_role (Edge Functions) and by
-- postgres (the moderator acting through the Supabase dashboard).
-- ───────────────────────────────────────────────────────────────────────────
-- NOTE: invoker rights, deliberately. In a SECURITY DEFINER function
-- `current_user` is the function owner (postgres), which would make this check
-- pass for everyone and silently disable the guard.
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

  if new.invite_quota is distinct from old.invite_quota then
    raise exception 'profiles.invite_quota is not client-updatable'
      using errcode = '42501';
  end if;

  if new.invited_by is distinct from old.invited_by then
    raise exception 'profiles.invited_by is not client-updatable'
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

create trigger profiles_guard_privileged_columns
  before update on public.profiles
  for each row execute function public.guard_profile_privileged_columns();

-- Keep suspended_at in step with status changes made by privileged roles.
create or replace function public.sync_profile_status_timestamps()
returns trigger
language plpgsql
as $$
begin
  if new.status = 'suspended' and old.status is distinct from 'suspended' then
    new.suspended_at = now();
  elsif new.status <> 'suspended' and old.status = 'suspended' then
    new.suspended_at = null;
  end if;

  if new.status = 'approved' and new.verified_at is null then
    new.verified_at = now();
  end if;

  return new;
end;
$$;

create trigger profiles_sync_status_timestamps
  before update on public.profiles
  for each row execute function public.sync_profile_status_timestamps();

alter table public.profiles enable row level security;
alter table public.contact_details enable row level security;
alter table public.contact_grants enable row level security;
