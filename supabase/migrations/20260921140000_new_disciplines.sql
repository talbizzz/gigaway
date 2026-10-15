-- Replaces the list of disciplines.
--
-- New: singer, instrumentalist, musical_theatre, dancer, actor, conductor,
-- stage_director, artist, photographer, designer, other.
--
-- EXISTING MEMBERS are mapped, not reset:
--   voice                                         -> singer
--   strings, keyboard, winds, brass, percussion   -> instrumentalist
--   dance                                         -> dancer
--   conducting                                    -> conductor
--   composition, other, anything unknown          -> other
-- There is no composer category in the new list, so composition falls to
-- 'other'; the member can pick again in Edit profile. The finer instrument
-- (cello, oboe, ...) was never stored in this column, so nothing is lost: it
-- lives in profiles.specialisation, which is untouched.
--
-- OLDER APP BUILDS still send the old values at sign-up, so
-- normalize_discipline() translates them rather than letting them fall to
-- 'other' — which is also why handle_new_user() is redefined here.
--
-- Written to be re-runnable: the update is a no-op on rows already mapped.

create or replace function public.normalize_discipline(p_value text)
returns text
language sql
immutable
set search_path = public
as $$
  select case lower(btrim(coalesce(p_value, '')))
    when 'singer'          then 'singer'
    when 'instrumentalist' then 'instrumentalist'
    when 'musical_theatre' then 'musical_theatre'
    when 'dancer'          then 'dancer'
    when 'actor'           then 'actor'
    when 'conductor'       then 'conductor'
    when 'stage_director'  then 'stage_director'
    when 'artist'          then 'artist'
    when 'photographer'    then 'photographer'
    when 'designer'        then 'designer'
    -- the previous list
    when 'voice'           then 'singer'
    when 'strings'         then 'instrumentalist'
    when 'keyboard'        then 'instrumentalist'
    when 'winds'           then 'instrumentalist'
    when 'brass'           then 'instrumentalist'
    when 'percussion'      then 'instrumentalist'
    when 'dance'           then 'dancer'
    when 'conducting'      then 'conductor'
    else 'other'
  end
$$;

alter table public.profiles drop constraint if exists discipline_known;

update public.profiles
   set discipline = public.normalize_discipline(discipline)
 where discipline is distinct from public.normalize_discipline(discipline);

alter table public.profiles add constraint discipline_known check (discipline in (
  'singer', 'instrumentalist', 'musical_theatre', 'dancer', 'actor', 'conductor',
  'stage_director', 'artist', 'photographer', 'designer', 'other'
));

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
    public.normalize_discipline(meta_discipline)
  );

  insert into public.contact_details (profile_id, email)
  values (new.id, new.email);

  return new;
end;
$$;
