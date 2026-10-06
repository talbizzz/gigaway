-- Splits a member's name into first and family name.
--
-- WHAT OTHER MEMBERS SEE. Only "Aziz T." — first name plus the initial of the
-- family name. profiles.display_name keeps exactly that meaning and shape, so
-- every feed, match, request, offer and review that already carries
-- display_name shows the short form without a single query changing.
--
-- first_name and last_name are plain columns on profiles. That means another
-- approved member can read the family name by querying the API directly, which
-- was weighed and accepted: the rule here is about what the app displays, not
-- a secret to defend.
--
-- display_name is DERIVED from the two by a trigger, so they cannot drift
-- apart; writing display_name directly is simply overwritten.
--
-- Written to be re-runnable: if exists / if not exists / or replace throughout.

alter table public.profiles
  add column if not exists first_name text,
  add column if not exists last_name  text;

alter table public.profiles
  drop constraint if exists first_name_length,
  drop constraint if exists last_name_length;
alter table public.profiles
  add constraint first_name_length check (first_name is null or char_length(first_name) between 1 and 40),
  add constraint last_name_length  check (last_name  is null or char_length(last_name)  between 1 and 40);

comment on column public.profiles.first_name is
  'Null only on a deleted member''s tombstone. display_name is derived from this and last_name.';
comment on column public.profiles.last_name is
  'Null for a member from before the split who signed up with a single-word name, and on tombstones.';

create or replace function public.format_public_name(p_first text, p_last text)
returns text
language sql
immutable
set search_path = public
as $$
  select case
    when nullif(trim(p_last), '') is null then trim(p_first)
    else trim(p_first) || ' ' || upper(left(trim(p_last), 1)) || '.'
  end
$$;

-- Derives display_name on every insert and update. A deleted member's names
-- are erased here too, on the status change, rather than in delete_account(),
-- so it keeps working however that function is later rewritten; their
-- display_name ('Deleted member') is left as delete_account set it.
create or replace function public.profiles_derive_display_name()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  if new.status = 'deleted' then
    new.first_name := null;
    new.last_name  := null;
  elsif new.first_name is not null then
    new.display_name := public.format_public_name(new.first_name, new.last_name);
  end if;
  return new;
end;
$$;

drop trigger if exists profiles_derive_display_name on public.profiles;
create trigger profiles_derive_display_name
  before insert or update on public.profiles
  for each row execute function public.profiles_derive_display_name();

-- The previous draft of this change guarded display_name against client
-- writes; deriving it makes that unnecessary, so the guard is back to what it
-- was.
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

-- ── sign-up ───────────────────────────────────────────────────────────────
-- New clients send first_name and last_name. An older build still in
-- someone's pocket sends only display_name; that is split on its first space
-- so sign-up keeps working until they update.
create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  meta_first      text := nullif(trim(new.raw_user_meta_data ->> 'first_name'), '');
  meta_last       text := nullif(trim(new.raw_user_meta_data ->> 'last_name'), '');
  meta_legacy     text := nullif(trim(new.raw_user_meta_data ->> 'display_name'), '');
  meta_discipline text := nullif(trim(new.raw_user_meta_data ->> 'discipline'), '');
  v_first         text;
  v_last          text;
begin
  if meta_first is not null then
    v_first := meta_first;
    v_last  := meta_last;
  elsif meta_legacy is not null then
    v_first := split_part(meta_legacy, ' ', 1);
    v_last  := nullif(trim(substr(meta_legacy, length(v_first) + 1)), '');
  else
    -- So the NOT NULL constraint can never block account creation.
    v_first := split_part(new.email, '@', 1);
    v_last  := null;
  end if;

  insert into public.profiles (id, display_name, first_name, last_name, discipline)
  values (
    new.id,
    public.format_public_name(v_first, v_last),
    v_first,
    v_last,
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

-- ── existing members ──────────────────────────────────────────────────────
-- Split what they typed into the single field. The trigger above rewrites
-- display_name to the short form as each row is updated, so the full original
-- text now lives only in first_name / last_name — nothing is lost. Tombstones
-- are skipped.
update public.profiles
  set first_name = split_part(trim(display_name), ' ', 1),
      last_name  = nullif(trim(substr(trim(display_name),
                         length(split_part(trim(display_name), ' ', 1)) + 1)), '')
  where status <> 'deleted'
    and first_name is null;
