-- Milestone 4 — moderator views.
--
-- There is no admin UI in v1 and that is a deliberate choice, so these views
-- are the moderation tool. They are shaped so the daily workflow is "open,
-- read, act" rather than "reconstruct a five-table join at eleven at night",
-- because a moderator who has to think before acting acts less often.
--
-- Every one of these exposes other members' data and must never be readable by
-- the app. They are revoked from anon and authenticated at the foot of the
-- file, and Milestone 1's blanket service_role grant is what makes them
-- readable from the dashboard.

-- ───────────────────────────────────────────────────────────────────────────
-- v_open_reports — the queue
--
-- Ordered safety-first rather than oldest-first: a harassment report filed an
-- hour ago outranks a no-show from last week.
-- ───────────────────────────────────────────────────────────────────────────
create or replace view public.v_open_reports as
select
  r.id                                              as report_id,
  r.created_at,
  r.category,
  r.status,
  r.body,
  reporter.display_name                             as reporter_name,
  r.reporter_id,
  subject.display_name                              as subject_name,
  subject.status                                    as subject_status,
  r.subject_id,
  r.related_type,
  r.related_id,
  -- The number that turns a judgement call into an easy one. One report is a
  -- disagreement; four from four different people is a pattern.
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

comment on view public.v_open_reports is
  'Moderator queue, safety first. To act: update reports set status = '
  '''actioned''|''dismissed'', moderator_note = ''…'', resolved_at = now() '
  'where id = …. To suspend the subject: update profiles set status = '
  '''suspended'' where id = …, which takes effect on their next query.';

-- ───────────────────────────────────────────────────────────────────────────
-- v_user_summary — everything about one person, in one row
--
-- A view rather than a function because the dashboard is a SQL editor: the
-- moderator adds `where profile_id = '…'` and gets the whole picture without
-- having to remember a function signature.
-- ───────────────────────────────────────────────────────────────────────────
create or replace view public.v_user_summary as
select
  p.id                                              as profile_id,
  p.display_name,
  p.status,
  p.discipline,
  c.name                                            as home_city,
  inviter.display_name                              as invited_by,
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
  (select count(*) from public.blocks b where b.blocked_id = p.id)             as blocks_received,
  (select count(*) from public.invites i where i.created_by = p.id)            as invites_created
from public.profiles p
left join public.cities c on c.id = p.home_city_id
left join public.profiles inviter on inviter.id = p.invited_by;

comment on view public.v_user_summary is
  'One row per member. Add `where profile_id = ''…''` before acting on a '
  'report. blocks_received and distinct_reporters are the two columns worth '
  'reading first — both count independent people, which a single angry '
  'counterparty cannot inflate.';

-- ───────────────────────────────────────────────────────────────────────────
-- v_stuck_notifications — operational triage
--
-- Rows here mean the dispatcher is failing. An empty result is the healthy
-- state, and the one to expect.
-- ───────────────────────────────────────────────────────────────────────────
create or replace view public.v_stuck_notifications as
select
  n.id,
  n.type,
  n.profile_id,
  p.display_name,
  n.attempts,
  n.last_error,
  n.created_at,
  n.next_attempt_at,
  n.email_fallback_sent_at,
  extract(epoch from now() - n.created_at)::integer as seconds_waiting
from public.notifications n
left join public.profiles p on p.id = n.profile_id
where n.sent_at is null
  and n.attempts >= 3
order by n.created_at asc;

comment on view public.v_stuck_notifications is
  'Unsent after three attempts. Anything lingering here means '
  'dispatch-notifications is failing — check the function logs and whether the '
  'Vault secrets still point at the right host.';

revoke all on public.v_open_reports from anon, authenticated;
revoke all on public.v_user_summary from anon, authenticated;
revoke all on public.v_stuck_notifications from anon, authenticated;
