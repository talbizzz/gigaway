-- Milestone 4 — prompting for reviews, and releasing them.
--
-- Three jobs. Two ask people to write; the third makes sure silence cannot be
-- used as a veto.
--
-- ALL THREE ARE IDEMPOTENT, and not incidentally. prompted_at and reminded_at
-- are claimed in the same statement that selects the row, and publication only
-- ever touches reviews whose published_at is still null — so a double run, a
-- retried run, or a run after an outage cannot double-notify or republish.
--
-- The date comparisons use >= rather than =, so a missed run catches up on the
-- next tick instead of skipping a day's stays forever.

-- Lock-screen-safe context for a stay: who and where, never how to reach them.
create or replace function public.notification_stay_payload(p_stay_id uuid)
returns jsonb
language sql
stable
security definer
set search_path = public
as $$
  select jsonb_build_object(
    'stayId', s.id,
    'cityName', c.name,
    'startDate', s.start_date,
    'endDate', s.end_date,
    'closesAt', s.review_closes_at
  )
  from public.stays s
  join public.cities c on c.id = s.city_id
  where s.id = p_stay_id;
$$;

-- ───────────────────────────────────────────────────────────────────────────
-- The day after
--
-- Both parties, once. Asked the morning after they part, while it is still
-- vivid and before politeness has smoothed everything over.
-- ───────────────────────────────────────────────────────────────────────────
create or replace function public.prompt_reviews()
returns integer
language plpgsql
security definer
set search_path = public
as $$
declare
  v_stay    record;
  v_prompted integer := 0;
begin
  for v_stay in
    update public.stays s
      set prompted_at = now()
      where s.end_date <= current_date - 1
        and s.prompted_at is null
        and current_date <= s.review_closes_at
      returning s.id, s.host_id, s.guest_id
  loop
    v_prompted := v_prompted + 1;

    perform public.enqueue_notification(
      v_stay.host_id, 'review_prompt',
      public.notification_stay_payload(v_stay.id)
        || jsonb_build_object(
             'withProfileId', v_stay.guest_id,
             'withName', public.display_name_of(v_stay.guest_id)
           )
    );

    perform public.enqueue_notification(
      v_stay.guest_id, 'review_prompt',
      public.notification_stay_payload(v_stay.id)
        || jsonb_build_object(
             'withProfileId', v_stay.host_id,
             'withName', public.display_name_of(v_stay.host_id)
           )
    );
  end loop;

  return v_prompted;
end;
$$;

-- ───────────────────────────────────────────────────────────────────────────
-- One reminder, a week later
--
-- Only to whoever has not written yet, and only once. This is a reminder, not
-- a campaign: a second nag would cost more goodwill than the review is worth.
-- ───────────────────────────────────────────────────────────────────────────
create or replace function public.remind_reviews()
returns integer
language plpgsql
security definer
set search_path = public
as $$
declare
  v_stay     record;
  v_reminded integer := 0;
begin
  for v_stay in
    update public.stays s
      set reminded_at = now()
      where s.end_date <= current_date - 7
        and s.reminded_at is null
        and current_date <= s.review_closes_at
      returning s.id, s.host_id, s.guest_id
  loop
    if not exists (
      select 1 from public.reviews r
      where r.stay_id = v_stay.id and r.author_id = v_stay.host_id
    ) then
      v_reminded := v_reminded + 1;
      perform public.enqueue_notification(
        v_stay.host_id, 'review_reminder',
        public.notification_stay_payload(v_stay.id)
          || jsonb_build_object(
               'withProfileId', v_stay.guest_id,
               'withName', public.display_name_of(v_stay.guest_id)
             )
      );
    end if;

    if not exists (
      select 1 from public.reviews r
      where r.stay_id = v_stay.id and r.author_id = v_stay.guest_id
    ) then
      v_reminded := v_reminded + 1;
      perform public.enqueue_notification(
        v_stay.guest_id, 'review_reminder',
        public.notification_stay_payload(v_stay.id)
          || jsonb_build_object(
               'withProfileId', v_stay.host_id,
               'withName', public.display_name_of(v_stay.host_id)
             )
      );
    end if;
  end loop;

  return v_reminded;
end;
$$;

-- ───────────────────────────────────────────────────────────────────────────
-- The deadline
--
-- What stops silence being a veto. A review with no counterpart publishes
-- anyway once the window closes — otherwise anyone could bury criticism simply
-- by never writing their own.
-- ───────────────────────────────────────────────────────────────────────────
create or replace function public.release_reviews()
returns integer
language plpgsql
security definer
set search_path = public
as $$
declare
  v_stay_id   uuid;
  v_published integer := 0;
begin
  for v_stay_id in
    select distinct r.stay_id
    from public.reviews r
    join public.stays s on s.id = r.stay_id
    where r.published_at is null
      and current_date > s.review_closes_at
  loop
    v_published := v_published + public.publish_reviews_for_stay(v_stay_id);
  end loop;

  return v_published;
end;
$$;

revoke all on function public.prompt_reviews()  from public, anon, authenticated;
revoke all on function public.remind_reviews()  from public, anon, authenticated;
revoke all on function public.release_reviews() from public, anon, authenticated;

-- ───────────────────────────────────────────────────────────────────────────
-- Schedule
--
-- Release runs before the prompts so that on the day a window closes, the
-- review is already public by the time anyone is told anything.
-- ───────────────────────────────────────────────────────────────────────────
select cron.schedule('release-reviews', '0 2 * * *',  $$ select public.release_reviews(); $$);
select cron.schedule('prompt-reviews',  '0 10 * * *', $$ select public.prompt_reviews(); $$);
select cron.schedule('remind-reviews',  '15 10 * * *', $$ select public.remind_reviews(); $$);
