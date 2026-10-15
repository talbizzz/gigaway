-- Shows admins and moderators a member's full name.
--
-- Members see "Aziz T." (profiles.display_name, derived from first_name and
-- last_name). The admin and moderator views are the one place that should
-- show the whole name, so the three that identify a person — the recent
-- sign-ups card, the user summary behind the user detail page, and the user
-- search — now fill their existing display_name column with it. The column
-- names and types are unchanged, so the admin app and the other functions
-- reading these views keep working as they are.
--
-- None of these is readable by members: the views are revoked from anon and
-- authenticated, and the search function checks is_admin() itself.
--
-- Search also matches the combined first and family name, since display_name
-- alone now only holds the initial. That match is not covered by the trigram
-- index on display_name; the table is small enough that it does not matter,
-- and the index still serves the display_name branch.

create or replace function public.member_full_name(p_first text, p_last text, p_fallback text)
returns text
language sql
immutable
set search_path = public
as $$
  select coalesce(nullif(trim(concat_ws(' ', p_first, p_last)), ''), p_fallback)
$$;

create or replace view public.v_recent_signups as
select
  p.id,
  public.member_full_name(p.first_name, p.last_name, p.display_name) as display_name,
  p.discipline,
  p.status,
  c.name                                              as home_city,
  p.created_at
from public.profiles p
left join public.cities c on c.id = p.home_city_id
order by p.created_at desc;

create or replace view public.v_user_summary as
select
  p.id                                              as profile_id,
  public.member_full_name(p.first_name, p.last_name, p.display_name) as display_name,
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

create or replace function public.admin_search_profiles(p_query text default null)
returns table (
  profile_id   uuid,
  display_name text,
  status       public.profile_status,
  discipline   text,
  home_city    text,
  email        text,
  phone        text,
  joined_at    timestamptz
)
language sql
stable
security definer
set search_path = public
as $$
  select
    p.id, public.member_full_name(p.first_name, p.last_name, p.display_name), p.status, p.discipline, c.name, cd.email, cd.phone, p.created_at
  from public.profiles p
  left join public.cities c on c.id = p.home_city_id
  left join public.contact_details cd on cd.profile_id = p.id
  where public.is_admin()
    and (
      p_query is null or btrim(p_query) = ''
      or p.display_name ilike '%' || p_query || '%'
      or concat_ws(' ', p.first_name, p.last_name) ilike '%' || p_query || '%'
      or cd.email ilike '%' || p_query || '%'
      or cd.phone ilike '%' || p_query || '%'
      or c.name ilike '%' || p_query || '%'
    )
  order by p.created_at desc
  limit 50;
$$;
