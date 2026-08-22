-- Milestone 3 — push tokens and the notification outbox.
--
-- NFR 7 makes a missed acceptance notification a serious failure, so delivery
-- is not a fire-and-forget push. Every notable event writes a row here inside
-- the transaction that caused it, and two independent dispatchers drain the
-- table: pg_net fires immediately for latency, and a pg_cron sweep retries
-- with backoff. The row is also what the in-app Activity list reads, so a push
-- that never arrives is still recoverable in the app.
--
-- NOTHING IS EVER PUSHED FROM THE CLIENT. The client cannot insert here at all.

-- ───────────────────────────────────────────────────────────────────────────
-- push_tokens
--
-- Keyed by token rather than by device: Expo reissues tokens on reinstall, and
-- one profile legitimately has several (phone, tablet, an old handset). Every
-- live token receives the push.
-- ───────────────────────────────────────────────────────────────────────────
create table public.push_tokens (
  id             uuid primary key default gen_random_uuid(),
  profile_id     uuid not null references public.profiles(id) on delete cascade,
  token          text not null unique,
  platform       text not null,
  created_at     timestamptz not null default now(),
  last_seen_at   timestamptz not null default now(),
  invalidated_at timestamptz,

  constraint push_token_platform_known check (platform in ('ios', 'android')),
  constraint push_token_shape check (char_length(token) between 8 and 255)
);

create index push_tokens_profile on public.push_tokens (profile_id)
  where invalidated_at is null;

comment on column public.push_tokens.invalidated_at is
  'Set on sign-out, and by the receipt sweep when Expo reports '
  'DeviceNotRegistered. An invalidated token is never sent to again.';

-- ───────────────────────────────────────────────────────────────────────────
-- notifications (outbox)
--
-- payload CARRIES ONLY IDS AND SHORT DISPLAY STRINGS. Push payloads travel
-- through Apple's and Google's infrastructure and are rendered on lock screens
-- that anyone holding the phone can read, so a phone number, an email address
-- or an exact location must never appear in one.
-- ───────────────────────────────────────────────────────────────────────────
create table public.notifications (
  id                     uuid primary key default gen_random_uuid(),
  profile_id             uuid not null references public.profiles(id) on delete cascade,
  type                   text not null,
  payload                jsonb not null default '{}'::jsonb,
  created_at             timestamptz not null default now(),
  next_attempt_at        timestamptz not null default now(),
  attempts               int not null default 0,
  sent_at                timestamptz,
  last_error             text,
  expo_receipt_id        text,
  receipt_checked_at     timestamptz,
  receipt_ok             boolean,
  email_fallback_sent_at timestamptz,
  read_at                timestamptz,

  constraint notification_type_known check (type in (
    'request_received',
    'co_request_received',
    'offer_received',
    'offer_accepted',
    'offer_confirmed',
    'offer_declined',
    'co_request_accepted',
    'co_request_declined',
    'request_withdrawn'
  )),
  constraint notification_payload_is_object check (jsonb_typeof(payload) = 'object')
);

-- The dispatcher's claim query. Partial, because the table is append-only and
-- the due set stays small while the history grows without bound.
create index notifications_due on public.notifications (next_attempt_at)
  where sent_at is null and attempts < 8;
-- The receipt sweep's query: sent, with a receipt, not yet checked.
create index notifications_receipts on public.notifications (sent_at)
  where expo_receipt_id is not null and receipt_checked_at is null;
-- The Activity list.
create index notifications_feed on public.notifications (profile_id, created_at desc);

comment on column public.notifications.receipt_ok is
  'NULL until Expo''s receipt has been read, then true for a delivered push '
  'and false for a rejected one. The email fallback keys off this: a push that '
  'was handed to Expo is not a push that arrived.';
comment on column public.notifications.attempts is
  'Capped at 8 by the due index. A row that exhausts its attempts stops being '
  'pushed but remains visible in the Activity list, which is the real backstop.';

-- ───────────────────────────────────────────────────────────────────────────
-- Enqueue helper
--
-- SECURITY DEFINER so the triggers below can write on behalf of a caller who
-- has no insert privilege on the table — which is every client.
-- ───────────────────────────────────────────────────────────────────────────
create or replace function public.enqueue_notification(
  p_profile_id uuid,
  p_type       text,
  p_payload    jsonb default '{}'::jsonb
)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_id uuid;
begin
  -- Never notify a profile that cannot act on it. A suspended or deleted
  -- account receiving a push about a couch it can no longer take is both
  -- useless and a small privacy leak.
  if not exists (
    select 1 from public.profiles p
    where p.id = p_profile_id and p.status = 'approved'
  ) then
    return null;
  end if;

  insert into public.notifications (profile_id, type, payload)
  values (p_profile_id, p_type, coalesce(p_payload, '{}'::jsonb))
  returning id into v_id;

  return v_id;
end;
$$;

revoke all on function public.enqueue_notification(uuid, text, jsonb)
  from public, anon, authenticated;

-- Short, lock-screen-safe context for a trip: who and where, never how to
-- reach them.
create or replace function public.notification_trip_payload(p_trip_id uuid)
returns jsonb
language sql
stable
security definer
set search_path = public
as $$
  select jsonb_build_object(
    'tripId',   t.id,
    'cityName', c.name,
    'startDate', t.start_date,
    'endDate',   t.end_date
  )
  from public.trips t
  join public.cities c on c.id = t.city_id
  where t.id = p_trip_id;
$$;

create or replace function public.display_name_of(p_profile_id uuid)
returns text
language sql
stable
security definer
set search_path = public
as $$
  select display_name from public.profiles where id = p_profile_id;
$$;

-- ───────────────────────────────────────────────────────────────────────────
-- Triggers
--
-- Every notification in the product is produced here or in accept_offer /
-- accept_co_request, never in client code. Putting them on the tables means a
-- row written by a future screen, a backfill or the dashboard notifies just
-- the same.
-- ───────────────────────────────────────────────────────────────────────────
create or replace function public.notify_on_request()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  perform public.enqueue_notification(
    new.to_profile,
    case new.kind
      when 'co_accommodation' then 'co_request_received'
      else 'request_received'
    end,
    public.notification_trip_payload(new.trip_id)
      || jsonb_build_object(
           'requestId', new.id,
           'fromProfileId', new.from_profile,
           'fromName', public.display_name_of(new.from_profile)
         )
  );
  return null;
end;
$$;

create trigger requests_notify_on_insert
  after insert on public.requests
  for each row execute function public.notify_on_request();

create or replace function public.notify_on_request_response()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if new.status = old.status then
    return null;
  end if;

  if new.status = 'withdrawn' then
    perform public.enqueue_notification(
      new.to_profile,
      'request_withdrawn',
      public.notification_trip_payload(new.trip_id)
        || jsonb_build_object(
             'requestId', new.id,
             'fromProfileId', new.from_profile,
             'fromName', public.display_name_of(new.from_profile)
           )
    );
  elsif new.status = 'declined' and new.kind = 'co_accommodation' then
    perform public.enqueue_notification(
      new.from_profile,
      'co_request_declined',
      public.notification_trip_payload(new.trip_id)
        || jsonb_build_object(
             'requestId', new.id,
             'toProfileId', new.to_profile,
             'toName', public.display_name_of(new.to_profile)
           )
    );
  end if;

  return null;
end;
$$;

create trigger requests_notify_on_response
  after update of status on public.requests
  for each row execute function public.notify_on_request_response();

create or replace function public.notify_on_offer()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  perform public.enqueue_notification(
    new.to_profile,
    'offer_received',
    public.notification_trip_payload(new.trip_id)
      || jsonb_build_object(
           'offerId', new.id,
           'fromProfileId', new.from_profile,
           'fromName', public.display_name_of(new.from_profile),
           'offerStart', new.start_date,
           'offerEnd', new.end_date,
           'nights', (new.end_date - new.start_date + 1)
         )
  );
  return null;
end;
$$;

create trigger offers_notify_on_insert
  after insert on public.offers
  for each row execute function public.notify_on_offer();

-- Acceptance and decline both land here, including the sibling offers that
-- accept_offer declines automatically. auto_declined rides along in the
-- payload because the copy differs: "she chose another couch" is a different
-- message from "she said no thanks".
create or replace function public.notify_on_offer_response()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_context jsonb;
begin
  if new.status = old.status then
    return null;
  end if;

  v_context := public.notification_trip_payload(new.trip_id)
    || jsonb_build_object(
         'offerId', new.id,
         'offerStart', new.start_date,
         'offerEnd', new.end_date,
         'nights', (new.end_date - new.start_date + 1)
       );

  if new.status = 'accepted' then
    -- To the host: the one notification in the product whose loss costs real
    -- money, and the only type that escalates to email.
    perform public.enqueue_notification(
      new.from_profile,
      'offer_accepted',
      v_context || jsonb_build_object(
        'withProfileId', new.to_profile,
        'withName', public.display_name_of(new.to_profile)
      )
    );
    -- To the traveller: their own confirmation, so the reveal is reachable
    -- from the Activity list too.
    perform public.enqueue_notification(
      new.to_profile,
      'offer_confirmed',
      v_context || jsonb_build_object(
        'withProfileId', new.from_profile,
        'withName', public.display_name_of(new.from_profile)
      )
    );
  elsif new.status = 'declined' then
    perform public.enqueue_notification(
      new.from_profile,
      'offer_declined',
      v_context || jsonb_build_object(
        'autoDeclined', new.auto_declined,
        'withProfileId', new.to_profile,
        'withName', public.display_name_of(new.to_profile)
      )
    );
  end if;

  return null;
end;
$$;

create trigger offers_notify_on_response
  after update of status on public.offers
  for each row execute function public.notify_on_offer_response();

-- ───────────────────────────────────────────────────────────────────────────
-- Read receipts
--
-- The only column a client may touch. Same guard shape as the requests and
-- offers guards, and load-bearing for the same reason: the update policy picks
-- the row, not the columns, so without this a member could mark their own
-- notification sent and silence it.
-- ───────────────────────────────────────────────────────────────────────────
create or replace function public.guard_notification_columns()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  if current_user in ('service_role', 'postgres', 'supabase_admin') then
    return new;
  end if;

  if new.id                     is distinct from old.id
     or new.profile_id             is distinct from old.profile_id
     or new.type                   is distinct from old.type
     or new.payload                is distinct from old.payload
     or new.created_at             is distinct from old.created_at
     or new.next_attempt_at        is distinct from old.next_attempt_at
     or new.attempts               is distinct from old.attempts
     or new.sent_at                is distinct from old.sent_at
     or new.last_error             is distinct from old.last_error
     or new.expo_receipt_id        is distinct from old.expo_receipt_id
     or new.receipt_checked_at     is distinct from old.receipt_checked_at
     or new.receipt_ok             is distinct from old.receipt_ok
     or new.email_fallback_sent_at is distinct from old.email_fallback_sent_at then
    raise exception 'only notifications.read_at is client-updatable'
      using errcode = '42501';
  end if;

  return new;
end;
$$;

create trigger notifications_guard_columns
  before update on public.notifications
  for each row execute function public.guard_notification_columns();

-- ───────────────────────────────────────────────────────────────────────────
-- RLS
-- ───────────────────────────────────────────────────────────────────────────
alter table public.push_tokens   enable row level security;
alter table public.notifications enable row level security;

create policy push_tokens_select_own
  on public.push_tokens for select
  to authenticated
  using (profile_id = (select auth.uid()));

create policy push_tokens_insert_own
  on public.push_tokens for insert
  to authenticated
  with check (profile_id = (select auth.uid()));

create policy push_tokens_update_own
  on public.push_tokens for update
  to authenticated
  using (profile_id = (select auth.uid()))
  with check (profile_id = (select auth.uid()));

create policy push_tokens_delete_own
  on public.push_tokens for delete
  to authenticated
  using (profile_id = (select auth.uid()));

create policy notifications_select_own
  on public.notifications for select
  to authenticated
  using (profile_id = (select auth.uid()));

create policy notifications_update_own
  on public.notifications for update
  to authenticated
  using (profile_id = (select auth.uid()))
  with check (profile_id = (select auth.uid()));

-- No insert or delete policy for clients on notifications, deliberately: the
-- outbox is written by triggers and drained by the dispatcher.

grant select, insert, update, delete on public.push_tokens to authenticated;
grant select, update on public.notifications to authenticated;
