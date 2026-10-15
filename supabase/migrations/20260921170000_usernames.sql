-- Usernames: one unique handle per member.
--
-- A username identifies a member exactly, where a name ("Aziz T.") cannot: it is
-- what other members search for and what a friend request is sent to.
--
-- Format: 3-20 characters, lower case letters, digits, dots and underscores,
-- starting and ending with a letter or digit, no two dots or underscores in a
-- row. Stored lower case, so "Aziz_T" and "aziz_t" are the same name. A short
-- list of names is reserved. packages/shared/src/domain/username.ts repeats
-- these rules so the app can explain a problem; change one, change both.
--
-- Changing it: once every 30 days, so a username cannot be swapped to dodge a
-- reputation. A name assigned automatically (below) does not count: the member
-- may replace it once straight away.
--
-- EXISTING MEMBERS get one made from their first name plus four digits, such as
-- aziz_4821. A deleted member's username is released.
--
-- Written to be re-runnable.

alter table public.profiles
  add column if not exists username text,
  add column if not exists username_changed_at timestamptz;

comment on column public.profiles.username is
  'Unique, lower case, 3-20 characters. Null only on a deleted member''s tombstone.';

-- Lower case, trimmed, any leading @ dropped. Null for blank.
create or replace function public.normalise_username(p_value text)
returns text
language sql
immutable
set search_path = public
as $$
  select nullif(lower(regexp_replace(btrim(coalesce(p_value, '')), '^@', '')), '')
$$;

create or replace function public.is_valid_username(p_value text)
returns boolean
language sql
immutable
set search_path = public
as $$
  select p_value is not null
     and p_value ~ '^[a-z0-9][a-z0-9._]{1,18}[a-z0-9]$'
     and p_value !~ '[._]{2}'
     and p_value not in (
       'admin', 'administrator', 'moderator', 'mod', 'support', 'help', 'gigaway',
       'official', 'staff', 'team', 'security', 'system', 'root', 'null',
       'undefined', 'anonymous', 'deleted', 'deleted_member'
     )
$$;

alter table public.profiles drop constraint if exists username_format;

-- Existing members first, so the constraint and the index below cannot fail.
create or replace function public.generate_username(p_first text)
returns text
language plpgsql
volatile
set search_path = public
as $$
declare
  v_base      text;
  v_candidate text;
  v_try       integer := 0;
begin
  -- Letters only, accents folded, so "Céline" gives "celine".
  v_base := regexp_replace(
    translate(lower(coalesce(p_first, '')),
      'àáâãäåçèéêëìíîïñòóôõöùúûüýÿšž',
      'aaaaaaceeeeiiiinooooouuuuyysz'),
    '[^a-z0-9]', '', 'g');
  if length(v_base) < 3 then v_base := 'user'; end if;
  v_base := left(v_base, 14);

  loop
    v_candidate := v_base || '_' || lpad((floor(random() * 10000))::integer::text, 4, '0');
    exit when public.is_valid_username(v_candidate)
          and not exists (select 1 from public.profiles p where p.username = v_candidate);
    v_try := v_try + 1;
    if v_try >= 30 then
      v_candidate := 'user_' || substr(replace(gen_random_uuid()::text, '-', ''), 1, 12);
      exit;
    end if;
  end loop;

  return v_candidate;
end;
$$;

update public.profiles
   set username = public.generate_username(first_name)
 where username is null and status <> 'deleted';

alter table public.profiles
  add constraint username_format check (username is null or public.is_valid_username(username));

create unique index if not exists profiles_username_key on public.profiles (username);

-- Stored lower case whatever was sent, and the time of a change recorded.
create or replace function public.profiles_username_rules()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  new.username := public.normalise_username(new.username);

  if tg_op = 'UPDATE'
     and new.username is distinct from old.username
     and old.username is not null
     and new.username is not null then
    new.username_changed_at := now();
  end if;

  return new;
end;
$$;

drop trigger if exists profiles_username_rules on public.profiles;
create trigger profiles_username_rules
  before insert or update of username on public.profiles
  for each row execute function public.profiles_username_rules();

-- ── asking whether a username can be used ─────────────────────────────────
-- Callable before sign-in, because sign-up asks it as the member types. It
-- answers only ok / invalid / taken, never who has it.
create or replace function public.check_username(p_username text)
returns text
language sql
stable
security definer
set search_path = public
as $$
  select case
    when not public.is_valid_username(public.normalise_username(p_username)) then 'invalid'
    when exists (select 1 from public.profiles p
                  where p.username = public.normalise_username(p_username)) then 'taken'
    else 'ok'
  end
$$;

revoke all on function public.check_username(text) from public;
grant execute on function public.check_username(text) to anon, authenticated;

-- ── the column guard, the tombstone and sign-up learn about usernames ─────
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

  if new.username_changed_at is distinct from old.username_changed_at then
    raise exception 'profiles.username_changed_at is not client-updatable'
      using errcode = '42501';
  end if;

  -- One change per 30 days, so a username cannot be swapped to dodge a
  -- reputation. The first change after an automatically assigned name (when
  -- username_changed_at is still null) is free.
  if new.username is distinct from old.username
     and old.username is not null
     and old.username_changed_at is not null
     and old.username_changed_at > now() - interval '30 days' then
    raise exception 'A username can be changed once every 30 days.'
      using errcode = '42501', hint = 'username_change_too_soon';
  end if;

  return new;
end;
$$;

create or replace function public.profiles_derive_display_name()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  if new.status = 'deleted' then
    new.first_name := null;
    new.last_name  := null;
    -- Frees the username for someone else.
    new.username := null;
    new.username_changed_at := null;
  elsif new.first_name is not null then
    new.display_name := public.format_public_name(new.first_name, new.last_name);
  end if;
  return new;
end;
$$;

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
  meta_username   text := public.normalise_username(new.raw_user_meta_data ->> 'username');
  v_username      text;
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

  -- The username the member chose, if it is valid and still free; otherwise one
  -- is made up from their first name, so sign-up can never fail on it (an older
  -- build sends none, and two people can pick the same one at the same moment).
  if meta_username is not null
     and public.is_valid_username(meta_username)
     and not exists (select 1 from public.profiles p where p.username = meta_username) then
    v_username := meta_username;
  else
    v_username := public.generate_username(v_first);
  end if;

  insert into public.profiles (id, display_name, first_name, last_name, discipline, username)
  values (
    new.id,
    public.format_public_name(v_first, v_last),
    v_first,
    v_last,
    public.normalize_discipline(meta_discipline),
    v_username
  );

  insert into public.contact_details (profile_id, email)
  values (new.id, new.email);

  return new;
end;
$$;
