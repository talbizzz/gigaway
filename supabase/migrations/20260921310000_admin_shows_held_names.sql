-- The admin platform shows a deleted member's name for as long as it is held.
--
-- Deleting an account erases the profile's names (a trigger nulls first_name and
-- last_name when the status becomes 'deleted'), so every admin screen fell back to
-- the tombstone's "Deleted member". But deletion_holds keeps the names for the
-- hold period precisely so a moderator can tell who it was. The admin screens that
-- identify a person now read the name from the hold while it is live.
--
-- When the hold ends the name is gone for good, and the member drops out of the
-- lists: the user search and the recent sign-ups no longer return a deleted member
-- once nothing is being held for them. Their row, and what other people's records
-- point at, stay as the tombstone; a direct link to it still opens.
--
-- Nothing here is readable by members: the views are revoked from anon and
-- authenticated, the search function checks is_admin(), and the helper below is
-- granted to nobody, so only the views and functions that call it can.
--
-- Written to be re-runnable.

create or replace function public.admin_member_name(
  p_id      uuid,
  p_first   text,
  p_last    text,
  p_display text
)
returns text
language sql
stable
set search_path = public
as $$
  select coalesce(
    nullif(trim(concat_ws(' ', p_first, p_last)), ''),
    (select nullif(trim(concat_ws(' ', h.first_name, h.last_name)), '')
       from public.deletion_holds h
      where h.profile_id = p_id and h.held_until > now()),
    p_display
  )
$$;

revoke all on function public.admin_member_name(uuid, text, text, text)
  from public, anon, authenticated;

-- Whether somebody should still be listed: anyone who is not deleted, and a
-- deleted member only while their identity is held.
create or replace function public.admin_member_listed(p_id uuid, p_status public.profile_status)
returns boolean
language sql
stable
set search_path = public
as $$
  select p_status <> 'deleted'
      or exists (select 1 from public.deletion_holds h
                  where h.profile_id = p_id and h.held_until > now())
$$;

revoke all on function public.admin_member_listed(uuid, public.profile_status)
  from public, anon, authenticated;

-- ── recent sign-ups ───────────────────────────────────────────────────────
create or replace view public.v_recent_signups as
select
  p.id,
  public.admin_member_name(p.id, p.first_name, p.last_name, p.display_name) as display_name,
  p.discipline,
  p.status,
  c.name                                              as home_city,
  p.created_at
from public.profiles p
left join public.cities c on c.id = p.home_city_id
where public.admin_member_listed(p.id, p.status)
order by p.created_at desc;

-- ── one person, in one row ────────────────────────────────────────────────
-- Not filtered by the hold: a link to a member whose hold has ended still opens,
-- as the tombstone.
create or replace view public.v_user_summary as
select
  p.id                                              as profile_id,
  public.admin_member_name(p.id, p.first_name, p.last_name, p.display_name) as display_name,
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

-- ── the report queue names both people ────────────────────────────────────
create or replace view public.v_open_reports as
select
  r.id                                              as report_id,
  r.created_at,
  r.category,
  r.status,
  r.body,
  public.admin_member_name(reporter.id, reporter.first_name, reporter.last_name,
                           reporter.display_name)   as reporter_name,
  r.reporter_id,
  public.admin_member_name(subject.id, subject.first_name, subject.last_name,
                           subject.display_name)    as subject_name,
  subject.status                                    as subject_status,
  r.subject_id,
  r.related_type,
  r.related_id,
  (select count(*) from public.reports prior
    where prior.subject_id = r.subject_id and prior.id <> r.id) as subject_prior_reports,
  (select count(distinct prior.reporter_id) from public.reports prior
    where prior.subject_id = r.subject_id and prior.id <> r.id) as subject_prior_reporters,
  extract(day from now() - r.created_at)::integer   as days_open
from public.reports r
left join public.profiles reporter on reporter.id = r.reporter_id
left join public.profiles subject  on subject.id  = r.subject_id
where r.status in ('open', 'reviewing')
order by
  case r.category
    when 'safety' then 0
    when 'harassment' then 1
    else 2
  end,
  r.created_at asc;

-- ── the user search ───────────────────────────────────────────────────────
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
    p.id,
    n.name,
    p.status, p.discipline, c.name, cd.email, cd.phone, p.created_at
  from public.profiles p
  left join public.cities c on c.id = p.home_city_id
  left join public.contact_details cd on cd.profile_id = p.id
  cross join lateral (
    select public.admin_member_name(p.id, p.first_name, p.last_name, p.display_name) as name
  ) n
  where public.is_admin()
    and public.admin_member_listed(p.id, p.status)
    and (
      p_query is null or btrim(p_query) = ''
      or p.display_name ilike '%' || p_query || '%'
      or n.name ilike '%' || p_query || '%'
      or cd.email ilike '%' || p_query || '%'
      or cd.phone ilike '%' || p_query || '%'
      or c.name ilike '%' || p_query || '%'
    )
  order by p.created_at desc
  limit 50;
$$;
