-- Milestone 3 — draining the outbox.
--
-- Two dispatchers, deliberately:
--
--   pg_net fires the moment a row is inserted, so a push arrives in about a
--   second. It is FIRE AND FORGET — net.http_post does not report failure back
--   to the transaction, so it can never be the guarantee.
--
--   pg_cron runs every minute over everything still unsent, with exponential
--   backoff. THIS is the guarantee. Do not remove it because immediate
--   dispatch appears to work.
--
-- Both call the same Edge Function, and both are safe to overlap, because rows
-- are claimed with `for update skip locked`.

-- ───────────────────────────────────────────────────────────────────────────
-- Claiming
--
-- The claim increments attempts and pushes next_attempt_at forward BEFORE the
-- push is tried. That is what makes a killed dispatcher recoverable: the row
-- stays unsent, nothing else picks it up for the length of the backoff, and
-- the next sweep retries it. The alternative — mark after sending — loses rows
-- to a crash between the send and the write.
--
-- Backoff is 30s, 1m, 2m, 4m … reaching about an hour by the eighth attempt,
-- after which the row stops being pushed and lives on in the Activity list.
-- ───────────────────────────────────────────────────────────────────────────
create or replace function public.claim_notifications(p_limit integer default 100)
returns setof public.notifications
language plpgsql
security definer
set search_path = public
as $$
begin
  return query
  with due as (
    select n.id
    from public.notifications n
    where n.sent_at is null
      and n.attempts < 8
      and n.next_attempt_at <= now()
    order by n.next_attempt_at
    limit greatest(1, least(p_limit, 100))
    for update skip locked
  )
  update public.notifications n
    set attempts        = n.attempts + 1,
        next_attempt_at = now() + (interval '30 seconds' * power(2, n.attempts))
    from due
    where n.id = due.id
    returning n.*;
end;
$$;

revoke all on function public.claim_notifications(integer) from public, anon, authenticated;

-- ───────────────────────────────────────────────────────────────────────────
-- Recording the result of a send
--
-- One round trip for the whole batch. `attempts` was already incremented at
-- claim time, so a failure needs only its message recorded.
--
--   [{ "id": "…", "receiptId": "…" }]   → sent
--   [{ "id": "…", "error": "…" }]       → failed, will be retried
-- ───────────────────────────────────────────────────────────────────────────
create or replace function public.record_notification_results(p_results jsonb)
returns integer
language plpgsql
security definer
set search_path = public
as $$
declare
  affected integer;
begin
  with results as (
    select
      (value ->> 'id')::uuid as id,
      value ->> 'receiptId'  as receipt_id,
      value ->> 'error'      as error
    from jsonb_array_elements(coalesce(p_results, '[]'::jsonb))
  ),
  updated as (
    update public.notifications n
      set sent_at         = case when r.error is null then now() else null end,
          expo_receipt_id = coalesce(r.receipt_id, n.expo_receipt_id),
          last_error      = r.error
      from results r
      where n.id = r.id
      returning n.id
  )
  select count(*)::integer into affected from updated;

  return affected;
end;
$$;

revoke all on function public.record_notification_results(jsonb) from public, anon, authenticated;

-- ───────────────────────────────────────────────────────────────────────────
-- Receipts
--
-- Expo accepts a push and returns a ticket; whether the device actually got it
-- is only knowable from the receipt, which appears a little later. A
-- DeviceNotRegistered receipt is the signal that a token is dead — the user
-- deleted the app or restored to a new phone — and it must invalidate THAT
-- token without touching the profile's other devices.
--
-- Claimed by stamping receipt_checked_at, so overlapping sweeps cannot check
-- the same receipt twice. A receipt Expo does not yet know about has its stamp
-- cleared again by the dispatcher, and is retried on the next sweep.
-- ───────────────────────────────────────────────────────────────────────────
create or replace function public.claim_notification_receipts(p_limit integer default 100)
returns setof public.notifications
language plpgsql
security definer
set search_path = public
as $$
begin
  return query
  with due as (
    select n.id
    from public.notifications n
    where n.expo_receipt_id is not null
      and n.receipt_checked_at is null
      and n.sent_at < now() - interval '30 seconds'
    order by n.sent_at
    limit greatest(1, least(p_limit, 100))
    for update skip locked
  )
  update public.notifications n
    set receipt_checked_at = now()
    from due
    where n.id = due.id
    returning n.*;
end;
$$;

revoke all on function public.claim_notification_receipts(integer) from public, anon, authenticated;

--   [{ "id": "…", "ok": true }]
--   [{ "id": "…", "ok": false, "error": "DeviceNotRegistered", "token": "…" }]
--   [{ "id": "…", "pending": true }]   → stamp cleared, checked again later
create or replace function public.record_notification_receipts(p_results jsonb)
returns integer
language plpgsql
security definer
set search_path = public
as $$
declare
  affected integer;
begin
  with results as (
    select
      (value ->> 'id')::uuid            as id,
      (value ->> 'ok')::boolean         as ok,
      coalesce((value ->> 'pending')::boolean, false) as pending,
      value ->> 'error'                 as error,
      value ->> 'token'                 as token
    from jsonb_array_elements(coalesce(p_results, '[]'::jsonb))
  ),
  -- A dead device, not a dead notification. Invalidating the token stops every
  -- future push to it; the profile's other devices are untouched.
  invalidated as (
    update public.push_tokens t
      set invalidated_at = now()
      from results r
      where t.token = r.token
        and r.error = 'DeviceNotRegistered'
        and t.invalidated_at is null
      returning t.id
  ),
  updated as (
    update public.notifications n
      set receipt_ok         = case when r.pending then null else r.ok end,
          receipt_checked_at = case when r.pending then null else n.receipt_checked_at end,
          last_error         = coalesce(r.error, n.last_error)
      from results r
      where n.id = r.id
      returning n.id
  )
  select count(*)::integer into affected from updated;

  return affected;
end;
$$;

revoke all on function public.record_notification_receipts(jsonb) from public, anon, authenticated;

-- ───────────────────────────────────────────────────────────────────────────
-- Email fallback
--
-- ONE type escalates to email: offer_accepted. It is the only notification
-- whose loss costs the user real money — a host who never learns their couch
-- was taken, or a traveller who books a hotel they did not need.
--
-- "No confirmed receipt" means exactly that: handed to Expo is not the same as
-- delivered, so a row with receipt_ok still null after fifteen minutes counts
-- as unconfirmed and gets the email.
-- ───────────────────────────────────────────────────────────────────────────
create or replace function public.claim_notification_emails(p_limit integer default 20)
returns table (
  id         uuid,
  profile_id uuid,
  email      text,
  payload    jsonb
)
language plpgsql
security definer
set search_path = public
as $$
begin
  return query
  with due as (
    select n.id
    from public.notifications n
    where n.type = 'offer_accepted'
      and n.email_fallback_sent_at is null
      and n.created_at < now() - interval '15 minutes'
      and coalesce(n.receipt_ok, false) = false
    order by n.created_at
    limit greatest(1, least(p_limit, 50))
    for update skip locked
  ),
  claimed as (
    update public.notifications n
      set email_fallback_sent_at = now()
      from due
      where n.id = due.id
      returning n.id, n.profile_id, n.payload
  )
  select c.id, c.profile_id, u.email::text, c.payload
  from claimed c
  join auth.users u on u.id = c.profile_id;
end;
$$;

revoke all on function public.claim_notification_emails(integer) from public, anon, authenticated;

comment on function public.claim_notification_emails is
  'Stamps email_fallback_sent_at at claim time, so a Resend outage costs the '
  'user one missed email rather than the same email every minute forever.';

-- ───────────────────────────────────────────────────────────────────────────
-- Immediate dispatch
--
-- Latency only. If this call is lost — and pg_net will not tell us if it is —
-- the cron sweep below picks the row up within the minute.
--
-- AFTER INSERT and not deferred: the row is already committed-visible to the
-- dispatcher's own connection by the time it runs, and claiming is idempotent.
-- ───────────────────────────────────────────────────────────────────────────
create or replace function public.dispatch_notification_now()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  perform public.call_edge_function('dispatch-notifications', jsonb_build_object('limit', 20));
  return null;
end;
$$;

-- Statement-level, not row-level: accept_offer inserts several notifications in
-- one statement and one dispatcher run drains them all.
create trigger notifications_dispatch_now
  after insert on public.notifications
  for each statement execute function public.dispatch_notification_now();

-- ───────────────────────────────────────────────────────────────────────────
-- The sweep — the actual delivery guarantee
-- ───────────────────────────────────────────────────────────────────────────
select cron.schedule(
  'dispatch-notifications',
  '* * * * *',
  $$ select public.call_edge_function('dispatch-notifications'); $$
);

-- ───────────────────────────────────────────────────────────────────────────
-- Moderator view
--
-- The operational question this answers is "is anything stuck?". Rows with
-- attempts climbing and sent_at still null mean the dispatcher is failing.
-- ───────────────────────────────────────────────────────────────────────────
create or replace view public.v_notification_health as
select
  n.type,
  count(*)                                                    as total,
  count(*) filter (where n.sent_at is not null)               as sent,
  count(*) filter (where n.sent_at is null and n.attempts > 0) as failing,
  count(*) filter (where n.attempts >= 8)                     as exhausted,
  count(*) filter (where n.receipt_ok is true)                as confirmed,
  count(*) filter (where n.email_fallback_sent_at is not null) as emailed,
  max(n.created_at)                                           as latest
from public.notifications n
group by n.type
order by n.type;

revoke all on public.v_notification_health from anon, authenticated;
