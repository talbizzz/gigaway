-- Milestone 4 — double-blind reviews.
--
-- Attributed, never anonymous. The brief rejects anonymity explicitly: in a
-- community this small it is illusory — a host with two guests knows perfectly
-- well who wrote what — while still removing accountability.
--
-- DOUBLE-BLIND IS THE WHOLE DESIGN. Neither review is visible until both are
-- in, or until the window closes. Without the deadline, either party could
-- suppress criticism simply by never writing their own; without the blinding,
-- the first to write sets the tone for the second.
--
-- The subtle failure mode is not "the subject reads the review" — it is "the
-- subject learns a review exists". A count, an aggregate or a `select exists`
-- leaks that just as effectively as the body does, so the select policy hides
-- the ROW and the pgTAP tests assert against aggregates specifically.

-- ───────────────────────────────────────────────────────────────────────────
-- Notification types
--
-- Milestone 3 constrained `type` to a fixed list and left a note that this
-- milestone must extend it. Four new types, dropped and re-added because a
-- CHECK constraint cannot be altered in place.
-- ───────────────────────────────────────────────────────────────────────────
alter table public.notifications drop constraint notification_type_known;
alter table public.notifications add constraint notification_type_known check (type in (
  'request_received',
  'co_request_received',
  'offer_received',
  'offer_accepted',
  'offer_confirmed',
  'offer_declined',
  'co_request_accepted',
  'co_request_declined',
  'request_withdrawn',
  -- Milestone 4
  'review_prompt',
  'review_reminder',
  'review_published',
  'report_received'
));

-- ───────────────────────────────────────────────────────────────────────────
-- stays gains its review window
--
-- review_closes_at is set once, on insert, from app_config. A trigger rather
-- than a generated column because a generated column cannot call config_int,
-- and hard-coding 14 here would make app_config.review_window_days a second
-- authority that silently disagrees with it.
--
-- Set at insert and never recomputed, which is also the right behaviour:
-- changing the window later must not retroactively move a deadline somebody
-- is already counting on.
-- ───────────────────────────────────────────────────────────────────────────
alter table public.stays add column prompted_at      timestamptz;
alter table public.stays add column reminded_at      timestamptz;
alter table public.stays add column review_closes_at date;

comment on column public.stays.review_closes_at is
  'Last day a review may be submitted, and the day the release job publishes '
  'whatever has been written. end_date + app_config.review_window_days, fixed '
  'at insert.';

create or replace function public.set_review_window()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  new.review_closes_at :=
    new.end_date + public.config_int('review_window_days');
  return new;
end;
$$;

create trigger stays_set_review_window
  before insert on public.stays
  for each row execute function public.set_review_window();

-- Backfill anything already created by Milestone 3.
update public.stays
  set review_closes_at = end_date + public.config_int('review_window_days')
  where review_closes_at is null;

-- ───────────────────────────────────────────────────────────────────────────
-- reviews
--
-- author_id is NULLABLE, deliberately, and differs from the milestone's draft
-- DDL which had `not null references profiles(id) on delete set null` — a
-- combination that cannot work, because the delete would violate the NOT NULL.
-- Nullable is also what the milestone's own risk note requires: deleting an
-- account must not cascade away the reviews that person wrote about OTHER
-- people, or deleting and rejoining becomes a way to launder reputation. The
-- UI renders a null author as "Deleted member".
-- ───────────────────────────────────────────────────────────────────────────
create table public.reviews (
  id           uuid primary key default gen_random_uuid(),
  stay_id      uuid not null references public.stays(id) on delete cascade,
  author_id    uuid references public.profiles(id) on delete set null,
  subject_id   uuid not null references public.profiles(id) on delete cascade,
  would_again  boolean not null,
  body         text,
  submitted_at timestamptz not null default now(),
  published_at timestamptz,

  constraint review_body_length check (body is null or char_length(body) <= 1000),
  constraint no_self_review check (author_id is null or author_id <> subject_id),
  unique (stay_id, author_id)
);

create index reviews_subject on public.reviews (subject_id) where published_at is not null;
create index reviews_unpublished on public.reviews (stay_id) where published_at is null;
create index reviews_author on public.reviews (author_id);

comment on column public.reviews.would_again is
  'The binary that carries the actual signal. Free text skews positive in a '
  'small professional community; "would you do it again" is harder to fudge.';
comment on column public.reviews.published_at is
  'Null until both reviews for the stay exist, or the window closes. An '
  'unpublished review is invisible to its subject in every form — row, count '
  'and aggregate alike.';

-- ───────────────────────────────────────────────────────────────────────────
-- Publication when both are in
--
-- Instant, so that two people who both write promptly see each other's words
-- straight away rather than waiting out a fortnight for no reason.
--
-- IDEMPOTENT: only rows with published_at still null are touched, and the
-- notifications are enqueued only for the rows this statement actually
-- published. A double fire cannot republish or double-notify.
-- ───────────────────────────────────────────────────────────────────────────
create or replace function public.publish_reviews_for_stay(p_stay_id uuid)
returns integer
language plpgsql
security definer
set search_path = public
as $$
declare
  v_published integer := 0;
  v_row       record;
begin
  for v_row in
    update public.reviews
      set published_at = now()
      where stay_id = p_stay_id
        and published_at is null
      returning id, author_id, subject_id, would_again
  loop
    v_published := v_published + 1;

    -- To the person the review is about. The author already knows what they
    -- wrote; what they want to know is that it is now visible, which the
    -- counterpart's own notification covers.
    perform public.enqueue_notification(
      v_row.subject_id,
      'review_published',
      jsonb_build_object(
        'reviewId', v_row.id,
        'stayId', p_stay_id,
        'withProfileId', v_row.author_id,
        'withName', public.display_name_of(v_row.author_id)
      )
    );
  end loop;

  return v_published;
end;
$$;

revoke all on function public.publish_reviews_for_stay(uuid) from public, anon, authenticated;

create or replace function public.publish_when_both_submitted()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  -- A stay has at most two reviews — one per party, enforced by the unique
  -- constraint and the insert policy — so a second row means both are in.
  if exists (
    select 1 from public.reviews r
    where r.stay_id = new.stay_id and r.id <> new.id
  ) then
    perform public.publish_reviews_for_stay(new.stay_id);
  end if;

  return null;
end;
$$;

create trigger reviews_publish_when_both_submitted
  after insert on public.reviews
  for each row execute function public.publish_when_both_submitted();

-- ───────────────────────────────────────────────────────────────────────────
-- Column guard
--
-- Same shape and same reason as the guards in Milestone 3: the update policy
-- decides which row may be touched, not which columns. Without this, an author
-- editing their unpublished review could also publish it early, or repoint it
-- at somebody else.
-- ───────────────────────────────────────────────────────────────────────────
create or replace function public.guard_review_columns()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  if current_user in ('service_role', 'postgres', 'supabase_admin') then
    return new;
  end if;

  if new.id           is distinct from old.id
     or new.stay_id      is distinct from old.stay_id
     or new.author_id    is distinct from old.author_id
     or new.subject_id   is distinct from old.subject_id
     or new.submitted_at is distinct from old.submitted_at
     or new.published_at is distinct from old.published_at then
    raise exception 'only reviews.would_again and reviews.body are client-updatable'
      using errcode = '42501';
  end if;

  return new;
end;
$$;

create trigger reviews_guard_columns
  before update on public.reviews
  for each row execute function public.guard_review_columns();

-- ───────────────────────────────────────────────────────────────────────────
-- RLS
--
-- THE SELECT POLICY IS THE DOUBLE-BLIND. Everything else in this file is
-- bookkeeping around it.
-- ───────────────────────────────────────────────────────────────────────────
alter table public.reviews enable row level security;

-- Authors always see their own, in any state — they need to be able to re-read
-- and edit what they wrote before it goes live.
create policy reviews_select_own
  on public.reviews for select
  to authenticated
  using (author_id = (select auth.uid()));

-- Everyone else, including the subject, sees a review only once published.
-- There is deliberately no clause here granting the subject early access to
-- their own reviews: that would be the leak.
create policy reviews_select_published
  on public.reviews for select
  to authenticated
  using (
    published_at is not null
    and public.is_approved()
    and not public.is_blocked(author_id)
    and not public.is_blocked(subject_id)
  );

-- Only after the stay has ended, only within the window, only about the
-- counterparty, and only by one of the two people who were there.
create policy reviews_insert_own
  on public.reviews for insert
  to authenticated
  with check (
    author_id = (select auth.uid())
    and public.is_approved()
    and published_at is null
    and exists (
      select 1 from public.stays s
      where s.id = stay_id
        and current_date > s.end_date
        and current_date <= s.review_closes_at
        and (
          (s.host_id = (select auth.uid()) and s.guest_id = subject_id)
          or (s.guest_id = (select auth.uid()) and s.host_id = subject_id)
        )
    )
  );

-- Editable until it publishes, never afterwards.
create policy reviews_update_own
  on public.reviews for update
  to authenticated
  using (author_id = (select auth.uid()) and published_at is null)
  with check (author_id = (select auth.uid()) and published_at is null);

-- No delete policy: a published review is not retractable, and an unpublished
-- one is superseded by editing it.

grant select, insert, update on public.reviews to authenticated;

-- ───────────────────────────────────────────────────────────────────────────
-- Reputation summary
--
-- would-again ratio plus a count, computed in SQL so the client never
-- disagrees. Runs with invoker rights so it sees exactly the published reviews
-- the caller is allowed to see — a blocked pair's reviews drop out of the
-- ratio automatically.
-- ───────────────────────────────────────────────────────────────────────────
create or replace function public.review_summary(p_profile_id uuid)
returns table (total integer, would_again integer)
language sql
stable
set search_path = public
as $$
  select
    count(*)::integer,
    count(*) filter (where r.would_again)::integer
  from public.reviews r
  where r.subject_id = p_profile_id
    and r.published_at is not null;
$$;

grant execute on function public.review_summary(uuid) to authenticated;
