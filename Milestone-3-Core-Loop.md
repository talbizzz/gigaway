# Milestone 3: Core Loop

> **Plan updated during implementation (session 2026-08-20).** Ten corrections,
> each recorded inline in the section it affects and summarised under
> "Corrections made during implementation" at the foot of this file. The
> largest are: the acceptance transaction lives in SQL rather than in the Edge
> Function, offer containment reaches nearby cities so Milestone 2's cold-start
> fallback is not a dead end, and a host-side discovery screen was added
> because the proactive-offer path had no way to find a trip.

## Goal

A traveller can request a stay, a host can offer part or all of those nights, and on
acceptance both sides receive each other's contact details and a reliable notification —
the end-to-end path that proves the product works.

## Context

**Milestones 1 and 2 are complete.** Members can be verified, hold profiles, post trips and
availability, and see matches via `search_matches`. `contact_grants` and `contact_details`
already exist with grant-gated RLS from Milestone 1 — **this milestone is what finally
creates grant rows.**

Conventions to respect:

- New tables ship with policies and pgTAP tests in the same migration.
- `is_blocked()` is called in every policy even though it still returns `false` until
  Milestone 4.
- Shared Zod schemas live in `packages/shared/schemas`; run `pnpm sync:shared` before
  deploying functions.
- Nothing is visible to a profile whose status is not `approved`.

**This is the milestone that proves the product.** Everything before it is setup and
everything after is protection. If time is short elsewhere, protect this.

## Scope

### In Scope

- `requests` — traveller → host, and traveller → traveller (co-accommodation)
- `offers` — host → traveller, supporting **partial date ranges**
- Proactive offers made against an open trip with no prior request
- `accept-offer` and `accept-co-request` Edge Functions
- `contact_grants` creation and the contact-reveal UI
- `stays` table, created on acceptance (the reviewable unit in Milestone 4)
- Push token registration and permission flow
- `notifications` outbox, database triggers, and `dispatch-notifications`
- Immediate dispatch via `pg_net` plus a `pg_cron` retry sweep with backoff
- Expo push receipt handling and token invalidation
- Resend email fallback for `offer_accepted` only
- In-app Activity list

### Out of Scope

- In-app chat — conversation moves to WhatsApp/email after the reveal
- Reviews (Milestone 4)
- Blocks and reports (Milestone 4)
- Notification preferences or per-type muting
- Read receipts, typing indicators, any real-time feature

---

## Technical Specification

### Components to Build

#### 1. Requests

- **Responsibility:** a traveller signalling interest, in one tap from the match screen.
- **Interface:** direct `insert` into `requests` (policy-constrained); response via Edge
  Function for `co_accommodation`, or by the host creating an `offer` for `host_stay`.
- **Key notes:**
  - `kind = 'host_stay'` — sent to a host whose availability overlaps. The host responds
    by creating an **offer**, which may cover fewer nights.
  - `kind = 'co_accommodation'` — sent to another traveller. **There is no offer step.**
    The recipient accepts or declines, and acceptance reveals contact. Nothing is being
    negotiated on-platform: neither party has a couch, and they will co-book off-platform.
  - Unique constraint on `(trip_id, to_profile, kind)` prevents repeat-tapping the same
    person for the same trip.
  - A request carries an optional short message (max 500 chars).
  - Rate limit: maximum 10 requests per trip, enforced by policy.

#### 2. Offers

- **Responsibility:** a host committing to specific nights.
- **Key notes:**
  - **Partial date offers are first-class.** The offer form defaults to the full overlap
    but lets the host shorten it. Copy must present a shorter offer as a good outcome —
    "You're offering 3 of the 7 nights she needs" — never as a limitation.
  - The offered range must fall entirely within the intersection of the trip and the
    host's availability. Enforce with a trigger, not only in the client.
  - **CORRECTED — nearby cities count.** Milestone 2's match screen surfaces hosts
    within 100 km when the destination is thin, and a traveller can request them.
    A containment rule demanding availability in the trip's city *exactly* would
    have made those hosts unable to answer, dead-ending the one path built to
    solve cold start. Availability in any city within `nearby_radius_km` (seeded
    to 100, matching `search_matches`) therefore satisfies containment.
  - **ADDED — `offers.city_id`,** stamped by the containment trigger from the
    availability row that covers the offered nights. For a nearby-city host that
    is not the trip's destination, and it is where the guest actually sleeps — so
    it is what `stays.city_id` records.
  - **ADDED — `offerable_windows(trip_id)`,** an invoker-rights SQL function
    returning the nights this host could legally offer. The offer form bounds its
    date picker with it rather than restating the containment rule in TypeScript,
    so the form and the trigger cannot drift apart.
  - `request_id` is nullable: a host may offer proactively against an open trip they found
    themselves, with no prior request.
  - A trip may have several pending offers. **Accepting one automatically declines the
    others** — handled inside `accept-offer`, atomically.

#### 2b. Expiry (ADDED)

- **Why it was added:** both status enums declared `expired` and nothing ever
  set it. The cosmetic cost was a request for a trip that happened in March
  sitting in the host's "waiting on you" list forever. The real cost was worse:
  `accept_offer` guarded on offer status, trip status and profile status but
  **never on dates**, and nothing sets `trips.completed` either — so a
  months-old offer was still `pending` against a still-`active` trip, and
  accepting it wrote a `stays` row wholly in the past. Milestone 4 decides when
  to prompt for a review by comparing `stays.end_date` against `current_date`,
  so that backdated stay would have read as already finished and immediately
  asked both people to review a stay that never happened.
- **Fixed in two places, deliberately:**
  - `expire_stale_requests_and_offers()` on a daily `pg_cron` job at 04:00 UTC
    — housekeeping. A request expires with its **trip**; an offer expires with
    its **own** last night, which may fall earlier.
  - A date guard inside `accept_offer` and `accept_co_request` — the actual
    correctness fix. The sweep can always be a run behind, so it can never be
    the guarantee. New error codes `offer_expired` and `request_expired`, both
    409.
- **Boundary is exclusive** (`end_date < current_date`): a couch for tonight is
  still acceptable. Compared in Postgres, never against a client clock.
- **Idempotency outranks the guard.** An already-accepted offer keeps returning
  its stay after the nights pass, so a traveller reopening the app after the
  trip still reaches the contact card rather than an error.
- Expiry enqueues no notification — there is no expiry type in the design, and
  telling somebody their months-old request has been tidied away is noise.

#### 3. Edge Function: `accept-offer`

- **Responsibility:** the single most important transaction in the product.
- **Auth:** user JWT; caller must be the offer's `to_profile` (the traveller).
- **CORRECTED:** the transaction is a plpgsql function, `accept_offer(p_offer_id,
  p_user)`, and the Edge Function is a thin wrapper that authenticates,
  validates and maps errors. A supabase-js handler cannot open a transaction
  across four tables, so "one transaction as service_role" was not achievable in
  Deno — and this milestone's own Known Risks insist atomicity is non-negotiable.
  This follows the convention `redeem_invite` set in Milestone 1. Same for
  `accept_co_request`.
- **Steps, one transaction:**
  1. `select ... for update` the offer; reject unless `status = 'pending'`.
  2. Reject if the trip is cancelled or either profile is not `approved`.
  3. Set the offer `accepted`, `responded_at = now()`.
  4. Decline all other `pending` offers on the same trip (`status = 'declined'`,
     `auto_declined = true`).
  5. Mark the originating request `accepted`, if there is one.
  6. Insert `contact_grants` with the canonical ordered pair, `source = 'offer'`.
  7. Insert a `stays` row — host, guest, city, the **offered** date range.
  8. Enqueue notifications: `offer_accepted` to the host, `offer_confirmed` to the traveller.
     Enqueue `offer_declined` for each auto-declined host.
- **Idempotency:** accepting an already-accepted offer returns 200 with the existing state
  rather than erroring. The user may double-tap on a bad connection.

#### 4. Edge Function: `accept-co-request`

- Same shape, shorter: verify the caller is `to_profile` and the request is a pending
  `co_accommodation`, mark it accepted, insert `contact_grants` with
  `source = 'co_request'`, enqueue `co_request_accepted` to both sides.
- **No `stays` row.** Nobody hosted anybody, and no review is prompted for co-accommodation.

#### 5. Contact reveal UI

- **Responsibility:** the payoff moment.
- **Key notes:**
  - After acceptance, both parties see a contact card: preferred channel first, with tap
    actions — open WhatsApp, dial, compose email.
  - The card queries `contact_details` directly. **The client performs no visibility
    check** — RLS returns rows or it does not. Never gate reveal in client code.
  - Copy makes the handoff explicit: "Carry on over WhatsApp — GigAway doesn't have chat."
  - Show the agreed nights and city alongside the contact, so the user does not have to
    remember what was accepted.
  - **The exact address is never shown and never stored.** The parties exchange it
    themselves off-platform.

#### 6. Push registration

- **Responsibility:** obtain and maintain an Expo push token per device.
- **Key notes:**
  - Request permission **after the first meaningful action** (first trip or availability
    posted), never on first launch. A cold permission prompt gets denied and cannot be
    re-asked.
  - Store tokens in `push_tokens`, keyed by token, with `profile_id`, platform and
    `last_seen_at`. Refresh `last_seen_at` on every app foreground.
  - A profile may have several tokens (phone, tablet, reinstall). Send to all live ones.
  - On sign-out, mark the current device's token `invalidated_at`.

#### 7. Notifications outbox

- **Responsibility:** guarantee that important events reach the user, per NFR 7.
- **Design:**
  - Database triggers on `requests`, `offers` and the accept functions insert rows into
    `notifications`. **Nothing is ever pushed directly from the client.**
  - **CLARIFIED:** every type except `co_request_accepted` is produced by a
    trigger, including `offer_accepted`, `offer_confirmed` and the
    `offer_declined` rows for auto-declined siblings — `accept_offer` sets
    statuses and the triggers do the rest. Keeping generation on the tables
    means a row written by a future screen, a backfill or the dashboard notifies
    identically. `co_request_accepted` is enqueued directly by
    `accept_co_request`, because no status trigger covers acceptance.
  - An `after insert` trigger calls `pg_net.http_post` to `dispatch-notifications` for low
    latency.
  - `pg_cron` runs the same function every minute for rows where `sent_at is null` and
    `attempts < 8`, with exponential backoff (`next_attempt_at`).
  - The following sweep reads Expo **push receipts** by `expo_receipt_id`. A
    `DeviceNotRegistered` receipt sets `invalidated_at` on that token.
  - **Email fallback:** on each sweep, any `offer_accepted` row older than 15 minutes with
    no confirmed receipt and no `email_fallback_sent_at` triggers a Resend email, and the
    column is stamped. Only this one type escalates to email.
  - **ADDED — `notifications.receipt_ok boolean`.** "No confirmed receipt" needed
    something to key off: handed to Expo is not the same as delivered, and
    `sent_at` only records the former. Null until the receipt is read, then true
    or false. `email_fallback_sent_at` is stamped at *claim* time, so a Resend
    outage costs one missed email rather than the same email every minute.

#### 8. `dispatch-notifications` Edge Function

- **Auth:** system only. **CORRECTED:** reuses `requireServiceRole` and
  `call_edge_function`, the Milestone 1 convention already guarding
  `purge-verification-docs` and `moderation-digest`, instead of a second
  `X-Dispatch-Secret`. The service role key is already a secret held in Vault, so
  a separate one added a value to keep in sync in two places and bought nothing.
  The requirement is met exactly: the guard compares the bearer token to the
  service role key, which no user JWT can ever satisfy.
- **Behaviour:** claim a batch of up to 100 due rows (`for update skip locked`), group by
  profile, resolve live tokens, POST to `https://exp.host/--/api/v2/push/send` in chunks of
  100, record `expo_receipt_id`, stamp `sent_at` or increment `attempts` with `last_error`.

#### 8b. Host-side discovery — `search_open_trips` (ADDED)

- **Why it was added:** the Done Criteria require a proactive offer against an
  open trip, and the schema supported one, but nothing in the app let a host
  *find* a trip. `search_matches` only answers "who is in the city I am
  travelling to". Without its mirror, a host could only ever wait to be asked,
  and the proactive path was reachable only by deep link.
- **Shape:** invoker-rights SQL, like `search_matches`, so RLS still applies.
  Returns active trips overlapping any of this member's active availability, in
  the same city or within `nearby_radius_km` — the same reach the containment
  trigger allows, so every trip listed can actually be offered on.
- Carries `already_offered` and `already_asked` so the list can show state
  rather than letting a host tap into a duplicate.
- Surfaced as `(app)/travellers.tsx`, reached from "Your couch" on the home
  screen, and only once the member has posted availability to match against.

#### 9. In-app Activity list

- **Responsibility:** make a missed push recoverable.
- A single reverse-chronological list over the user's `notifications`, with `read_at`
  driving an unread badge. **CORRECTED — the badge is on a home-screen entry row,
  not a tab.** Milestones 1 and 2 built the app on a plain `Stack`; there is no
  tab bar, and introducing one mid-milestone would restructure navigation that
  Milestone 5's deep links also touch. Opening the screen marks everything read,
  rather than making the user tap each row to clear a badge. Each row deep-links to the relevant trip, offer or
  contact card. This is a plain list over data that already exists — resist adding
  filtering or grouping.

---

### Data Model

```sql
-- ─── requests ─────────────────────────────────────────────────────────────
create type request_kind   as enum ('host_stay','co_accommodation');
create type request_status as enum ('pending','accepted','declined','withdrawn','expired');

create table requests (
  id           uuid primary key default gen_random_uuid(),
  kind         request_kind not null,
  trip_id      uuid not null references trips(id) on delete cascade,
  from_profile uuid not null references profiles(id) on delete cascade,
  to_profile   uuid not null references profiles(id) on delete cascade,
  message      text check (char_length(message) <= 500),
  status       request_status not null default 'pending',
  created_at   timestamptz not null default now(),
  responded_at timestamptz,
  constraint no_self_request check (from_profile <> to_profile),
  unique (trip_id, to_profile, kind)
);
create index requests_to   on requests (to_profile, status);
create index requests_trip on requests (trip_id);

-- ─── offers ───────────────────────────────────────────────────────────────
create type offer_status as enum ('pending','accepted','declined','withdrawn','expired');

create table offers (
  id            uuid primary key default gen_random_uuid(),
  request_id    uuid references requests(id) on delete set null,  -- null = proactive
  trip_id       uuid not null references trips(id) on delete cascade,
  from_profile  uuid not null references profiles(id) on delete cascade, -- host
  to_profile    uuid not null references profiles(id) on delete cascade, -- traveller
  city_id       uuid references cities(id),   -- ADDED: set by the containment
                                              -- trigger from the availability row
                                              -- that covers these nights; for a
                                              -- nearby host this is where the
                                              -- guest actually sleeps
  start_date    date not null,
  end_date      date not null,
  message       text check (char_length(message) <= 500),
  status        offer_status not null default 'pending',
  auto_declined boolean not null default false,
  created_at    timestamptz not null default now(),
  responded_at  timestamptz,
  constraint offer_dates_ordered check (end_date >= start_date),
  constraint no_self_offer check (from_profile <> to_profile)
);
create index offers_to   on offers (to_profile, status);
create index offers_trip on offers (trip_id, status);

-- Trigger: the offered range must be inside the trip range, and inside at least one
-- active availability row belonging to from_profile in the trip's city.

-- ─── stays ────────────────────────────────────────────────────────────────
create table stays (
  id         uuid primary key default gen_random_uuid(),
  offer_id   uuid not null unique references offers(id) on delete cascade,
  host_id    uuid not null references profiles(id) on delete cascade,
  guest_id   uuid not null references profiles(id) on delete cascade,
  city_id    uuid not null references cities(id),
  start_date date not null,
  end_date   date not null,
  created_at timestamptz not null default now()
);
create index stays_end on stays (end_date);

-- ─── push_tokens ──────────────────────────────────────────────────────────
create table push_tokens (
  id             uuid primary key default gen_random_uuid(),
  profile_id     uuid not null references profiles(id) on delete cascade,
  token          text not null unique,
  platform       text not null,          -- 'ios' | 'android'
  created_at     timestamptz not null default now(),
  last_seen_at   timestamptz not null default now(),
  invalidated_at timestamptz
);
create index push_tokens_profile on push_tokens (profile_id)
  where invalidated_at is null;

-- ─── notifications (outbox) ───────────────────────────────────────────────
create table notifications (
  id                     uuid primary key default gen_random_uuid(),
  profile_id             uuid not null references profiles(id) on delete cascade,
  type                   text not null,
  payload                jsonb not null default '{}',
  created_at             timestamptz not null default now(),
  next_attempt_at        timestamptz not null default now(),
  attempts               int not null default 0,
  sent_at                timestamptz,
  last_error             text,
  expo_receipt_id        text,
  receipt_checked_at     timestamptz,
  receipt_ok             boolean,      -- ADDED: null until the receipt is read.
                                       -- Handed to Expo is not delivered, and the
                                       -- email fallback keys off this.
  email_fallback_sent_at timestamptz,
  read_at                timestamptz
);
create index notifications_due on notifications (next_attempt_at)
  where sent_at is null and attempts < 8;
create index notifications_feed on notifications (profile_id, created_at desc);
```

**Notification types:** `request_received`, `co_request_received`, `offer_received`,
`offer_accepted`, `offer_confirmed`, `offer_declined`, `co_request_accepted`,
`co_request_declined`, `request_withdrawn`. Milestone 4 adds review types.

**`payload` carries only IDs and short display strings — never contact details.** Push
payloads travel through Apple's and Google's infrastructure and appear on lock screens.

### RLS Policies

| Table | Operation | Rule |
|---|---|---|
| `requests` | select | `from_profile = auth.uid()` or `to_profile = auth.uid()` |
| `requests` | insert | `from_profile = auth.uid()`, `is_approved()`, caller owns `trip_id`, trip is `active`, `not is_blocked(to_profile)`, target is `approved`, and fewer than 10 requests exist for this trip |
| `requests` | update | `from_profile = auth.uid()` and only to `withdrawn`; **or** `to_profile = auth.uid()` and only to `declined` (ADDED — the recipient of a co-accommodation request has no other way to say no); acceptance goes through the Edge Function |
| `offers` | select | `from_profile = auth.uid()` or `to_profile = auth.uid()` |
| `offers` | insert | `from_profile = auth.uid()`, `is_approved()`, `not is_blocked(to_profile)`, range inside trip ∩ availability (trigger-enforced) |
| `offers` | update | `from_profile = auth.uid()` and only to `withdrawn`, or `to_profile = auth.uid()` and only to `declined` |
| `stays` | select | `host_id = auth.uid()` or `guest_id = auth.uid()` |
| `stays` | insert/update/delete | none for clients |
| `push_tokens` | all | `profile_id = auth.uid()` |
| `notifications` | select | `profile_id = auth.uid()` |
| `notifications` | update | `profile_id = auth.uid()` and **only `read_at`**, enforced by a guard trigger — the policy picks the row, not the columns |
| `notifications` | insert/delete | none for clients |

### API Contracts

#### `POST /functions/v1/accept-offer`

```jsonc
// request
{ "offerId": "uuid" }

// 200
{
  "ok": true,
  "stayId": "uuid",
  "range": { "start": "2027-03-03", "end": "2027-03-05" },
  "nights": 2,
  "autoDeclinedCount": 2
}
```

| HTTP | `error` | When |
|---|---|---|
| 404 | `offer_not_found` | No such offer, or caller is not `to_profile` |
| 409 | `offer_not_pending` | Withdrawn or declined |
| 409 | `offer_expired` | The offered nights are wholly in the past (ADDED) |
| 409 | `trip_cancelled` | Trip is no longer active |
| 403 | `not_approved` | Either party is not `approved` |
| 401 | `unauthenticated` | Missing or invalid JWT |

Accepting an already-accepted offer returns **200** with the existing stay (idempotent).

#### `POST /functions/v1/accept-co-request`

```jsonc
{ "requestId": "uuid" }          // → { "ok": true, "grantedWith": "uuid" }
```

Errors mirror the above with `request_not_found` / `request_not_pending`.

#### `POST /functions/v1/dispatch-notifications`

System only. Header `X-Dispatch-Secret`. Body optional `{ "limit": 100 }`.
Returns `{ "claimed": n, "sent": n, "failed": n, "receiptsChecked": n, "emailsSent": n }`.

### Environment & Configuration

| Variable | Where | Purpose |
|---|---|---|
| `DISPATCH_SECRET` | Edge Function secret + `pg_cron`/`pg_net` call header | Authenticates the system dispatcher |
| `EXPO_ACCESS_TOKEN` | Edge Function secret | Only if Expo "enhanced push security" is enabled |
| `RESEND_API_KEY` | Edge Function secret | Already set in Milestone 1 |
| `RESEND_FROM` | Edge Function secret | e.g. `GigAway <notifications@gigaway.app>` |
| `EXPO_PUBLIC_WEB_BASE_URL` | Mobile | Deep-link targets in fallback emails |

New PostHog events: `request_sent`, `offer_sent`, `offer_accepted`, `contact_revealed`,
`push_permission_granted`, `push_permission_denied`. IDs only, no free text.

---

## Implementation Order

> **Deviation, with reason.** Steps 7 (`push_tokens` + `notifications`) and 9
> (dispatch wiring) were built before steps 2–6's UI. `accept_offer` had to
> become a SQL function to be genuinely atomic, and it enqueues into the outbox
> — so the outbox table and its triggers had to exist first. The database half
> of the loop was therefore completed and tested end to end before any screen
> was written; the order below is otherwise as planned.

1. **Migration: `requests` + `offers` + `stays` + policies + the range-containment
   trigger**, with pgTAP first — including "a third party can read neither the request nor
   the offer".
2. **Request send** from the match screen, and the incoming-requests list for hosts.
3. **Offer creation**, including the partial-range editor and the containment validation.
4. **`accept-offer`** with its shared Zod schema. Test sibling auto-decline and the
   idempotent double-accept explicitly.
5. **Contact reveal UI**, verifying that `contact_details` returns rows only after the
   grant exists. Try it from a third account and confirm zero rows.
6. **Co-accommodation request + `accept-co-request`.** Reuses almost everything above.
7. **Migration: `push_tokens` + `notifications` + triggers.**
8. **`dispatch-notifications`** — send path only, invoked manually at first.
9. **Wire `pg_net` immediate dispatch and the `pg_cron` sweep.**
10. **Receipt checking and token invalidation.**
11. **Email fallback for `offer_accepted`.**
12. **In-app Activity list and unread badge.**
13. **Push permission prompt**, placed after the first trip or availability is posted.

## Done Criteria

Verified against a live local stack on 2026-08-20 — 178 pgTAP tests, 57 unit
tests and 54 end-to-end HTTP checks. How each was proved is named below.

- [x] A traveller can send a request from the match screen in one tap
      — `HostCard` posts directly; no form in the way
- [x] A host sees incoming requests and can offer a **subset** of the requested nights
      — `(app)/requests.tsx` → `(app)/offer/new.tsx`
- [x] The offer form rejects a range outside trip ∩ availability, at the database level
      — `enforce_offer_range` trigger; pgTAP + end-to-end over HTTP
- [x] A host can make a proactive offer against an open trip with no prior request
      — needed a discovery surface that did not exist; see component 8b
- [x] Accepting an offer auto-declines all other pending offers on that trip
- [x] Accepting the same offer twice returns 200 and creates exactly one `stays` row
- [x] Contact details appear for both parties **only** after acceptance
- [x] pgTAP: a third profile selecting the pair's `contact_details` gets zero rows
      — `tests/acceptance.sql`
- [x] pgTAP: a third profile selecting their `requests` or `offers` gets zero rows
      — `tests/requests_and_offers.sql`, including a competing host on the same trip
- [x] Co-accommodation request → accept → contact revealed, with no offer step and no stay
- [ ] **BLOCKED** — Push notifications arrive on a **real device** for request, offer
      and acceptance. Remote push does not work in Expo Go; this needs an EAS
      development build with an APNs key and an FCM key. Same blocker as
      Milestones 1 and 2. Everything up to the Expo API call is tested.
- [x] Killing `dispatch-notifications` mid-run leaves rows unsent and the sweep recovers them
      — `tests/notifications.sql` asserts the attempt is counted *before* the send,
      the row stays unsent, and the next sweep reclaims it once the backoff elapses
- [x] A `DeviceNotRegistered` receipt invalidates that token and does not block others
      — pgTAP asserts the member's second device is untouched
- [ ] **PARTIAL** — With push suppressed, an `offer_accepted` triggers a fallback email
      within ~15 minutes. The claim-and-stamp logic is under pgTAP (only
      `offer_accepted`, only after fifteen minutes, never when the receipt
      confirmed delivery, and never twice). The Resend call itself needs
      `RESEND_API_KEY`, which arrives in Milestone 5.
- [x] Activity list shows every notification with a working unread badge
      — list and badge built; the underlying queries and the read-only-`read_at`
      guard are covered end to end. Visual confirmation needs a device.
- [x] No push payload anywhere contains a phone number, email address or exact location
      — asserted three ways: pgTAP scans every enqueued payload, a unit test feeds
      `notificationCopy` a poisoned payload, and the end-to-end run greps the outbox
- [x] Push permission is requested only after the first trip or availability is posted
      — `usePushPrompt` is called from those two screens only; `usePushLifecycle`
      is explicitly non-prompting. Behavioural confirmation needs a device.

---

## Corrections made during implementation

Recorded so the next agent reads a plan that matches the code.

1. **`accept_offer` / `accept_co_request` are SQL functions**, wrapped by thin Edge
   Functions. supabase-js cannot open a cross-table transaction, and this
   milestone's own risk list makes atomicity non-negotiable. Follows
   `redeem_invite` from Milestone 1.
2. **Offer containment reaches nearby cities.** Milestone 2 surfaces hosts within
   100 km; requiring availability in the destination city exactly would have left
   them unable to answer a request they can receive. *Cross-milestone drift,
   caught before shipping.*
3. **`offers.city_id` added**, stamped by the containment trigger, so
   `stays.city_id` records where the guest actually sleeps rather than the trip's
   destination.
4. **`offerable_windows()` added** so the offer form bounds its picker from the
   database's own rule instead of a TypeScript copy of it.
5. **`search_open_trips()` and `(app)/travellers.tsx` added.** The proactive-offer
   Done Criterion had no discovery surface — the schema allowed it, the app had no
   route to it.
6. **`notifications.receipt_ok` added.** "No confirmed receipt" needed a column;
   `sent_at` only records that Expo accepted the push.
7. **`dispatch-notifications` reuses `requireServiceRole`** rather than adding a
   second `X-Dispatch-Secret`. Same guarantee, one fewer secret to keep in sync.
8. **The unread badge sits on a home-screen entry row, not a tab.** There is no tab
   navigator; Milestones 1 and 2 built on a plain `Stack`.
9. **A `requests` decline policy was added** for the recipient of a co-accommodation
   request, who otherwise had no way to say no.
10. **Expiry was implemented** — see component 2b. Both status enums declared
    `expired` and nothing set it, and more seriously the acceptance path had no
    date check at all, so a stale offer could still be accepted into a backdated
    stay that Milestone 4 would immediately prompt for a review of.

Also worth knowing for Milestone 4:

- `is_blocked()` is called in every new policy, still returning `false`. Replacing
  the function body is all that is needed.
- `stays` is populated and readable by both parties, with `end_date` as a plain
  date — compare it against `current_date` in Postgres, never a client clock.
  Nothing can now create a stay whose nights are already past, so a stay that
  reads as "ended" genuinely ended.
- `notifications.type` has a CHECK constraint listing every valid type. Milestone 4's
  review notifications must extend it in their migration.

## Known Risks & Watch-Outs

- **`accept-offer` must be genuinely atomic.** Partial application — a grant with no
  stay, or a stay with no declines — is the worst failure mode in the product. One
  transaction, row locks, no early returns between writes.
- **Expo push requires a real build.** Remote push does **not** work in Expo Go. Use an
  EAS development build for all push testing, on both platforms.
- **iOS push needs an APNs key** configured in EAS credentials; Android needs an FCM
  server key in the Firebase project. Set both up before testing rather than mid-debug.
- **Never push contact details.** Lock-screen previews are visible to anyone holding the
  phone, and payloads pass through Apple and Google.
- **`pg_net` is fire-and-forget.** It does not report failures back to the transaction.
  The `pg_cron` sweep is the real guarantee; the immediate call is only a latency
  optimisation. Do not skip the sweep because immediate dispatch appears to work.
- **Claim rows with `for update skip locked`.** Without it, overlapping cron and `pg_net`
  invocations will send duplicate pushes.
- **The unique constraint on `(trip_id, to_profile, kind)`** means a withdrawn request
  cannot be re-sent to the same person for the same trip. Accepted for v1 — it is a spam
  guard. If the beta complains, relax it to a partial unique index over pending rows only.
- **Timezone handling on `stays.end_date`** determines when Milestone 4 prompts reviews.
  Keep it a plain date; compare against `current_date` in Postgres, not a client clock.
