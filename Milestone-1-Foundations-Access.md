# Milestone 1: Foundations & Access

> **Plan updated during implementation (13 Aug 2026).** Corrections, all
> verified against a running local stack:
>
> 1. **`pg_cron` / `pg_net` are available.** Smoke-tested by scheduling and
>    unscheduling a job. The scheduled-job design holds; no GitHub Actions
>    fallback is needed. This risk is closed.
> 2. **City data ships as a migration, not `supabase/seed/cities.sql`.** Seed
>    files run only on local `db reset` and never in production, which would
>    have left the production database with no cities. `supabase/seed/` is now
>    reserved for local-only development fixtures.
> 3. **The GeoNames `cities5000` dump alone is not usable.** Its
>    `alternatenames` column has no language tags; ranking it heuristically gave
>    Munich a set of airport codes and Filipino exonyms with no "München". The
>    generator now also reads `alternateNamesV2` (193 MB, cached locally) to pick
>    genuine local-language names. 10,934 cities, 468 with a distinct local name.
> 4. **Explicit `GRANT` statements are required** alongside every RLS policy.
>    RLS filters rows but does not grant table access, and Supabase's default
>    privileges did not cover tables created by these migrations.
> 5. **The column-guard trigger must be invoker-rights, not `SECURITY
>    DEFINER`.** Inside a definer function `current_user` is the function owner,
>    which would make the guard pass for everyone and silently disable the
>    verification wall.
> 6. **`display_name` and `discipline` are collected on the sign-up form** and
>    passed through auth metadata, so the profile row is never half-built and
>    both columns can stay `NOT NULL`.
> 7. **Expo routes live in `apps/mobile/src/app/`**, not `apps/mobile/app/` —
>    the current `create-expo-app` default, adopted to avoid pointless churn.
> 8. **pnpm 11 reads `nodeLinker` from `pnpm-workspace.yaml`, not `.npmrc`.**
>    The `.npmrc` setting was silently ignored, leaving transitive dependencies
>    unresolvable by Metro. `.npmrc` has been removed.
> 9. **Local Supabase runs with `[analytics] enabled = false`.** The Logflare and
>    Vector containers fail health checks on constrained Docker memory and take
>    the whole stack down with them. Nothing in this project reads local
>    analytics.
> 10. **Documents CANNOT be deleted by a database trigger.** Supabase installs
>    `storage.protect_delete` on `storage.objects`, which raises *"Direct
>    deletion from storage tables is not allowed. Use the Storage API instead."*
>    It can be bypassed, but doing so orphans the file while removing the row —
>    we would believe a document was deleted when it was not, which is worse
>    than useless for a GDPR commitment. Deletion is now two-stage: the decision
>    trigger stamps `docs_deletion_requested_at` and retains `doc_paths`; the
>    `purge-verification-docs` Edge Function, scheduled every minute, deletes
>    through the Storage API and stamps `docs_deleted_at`. Verified end to end —
>    the object is gone from the bucket and returns HTTP 400 even to
>    `service_role`.
> 11. **`service_role` needs explicit table grants.** It bypasses RLS but still
>    needs ordinary privileges, and Supabase's default privileges do not cover
>    tables created by project migrations. Without them every Edge Function
>    fails with `permission denied` despite holding the service key. Handled
>    once in `20260813152411_service_role_grants.sql`, including
>    `alter default privileges` so later milestones are covered.
> 12. **Cron jobs invoke Edge Functions via `pg_net`**, with the base URL and
>    service key held in Vault so local and production differ only in the stored
>    values. From the database container the gateway is `http://kong:8000`.
> 13. **A city picker was built here**, earlier than planned, because profiles
>    carry a home city. Milestone 2 should extend `search_cities` and
>    `CityPicker` rather than build them.
> 14. **`@sentry/cli` and `unrs-resolver` postinstalls are blocked** in
>    `pnpm-workspace.yaml`; both stall indefinitely fetching prebuilt binaries.
>    Neither is needed locally — EAS fetches sentry-cli itself at build time.

## Goal

A person with an invite link can create an account, is verified instantly, and completes a
profile — and a person without one can apply with documents and wait in a pending state
that grants access to nothing. The full row-level-security policy set exists and is tested.

## Context

**This is the first milestone. Nothing exists yet** beyond the planning documents at the
repository root and the external accounts from Milestone 0.

This milestone establishes the conventions every later milestone depends on: the monorepo
layout, the migration workflow, the shared-code copy step, and — most importantly — the
RLS model. **Row-level security is the product's privacy guarantee**, not a hardening pass
to be added later. Every table introduced here and in later milestones must ship with
policies and pgTAP tests in the same migration.

Read `Project-Plan.md` for the agreed stack and repository structure before starting.

## Scope

### In Scope

- pnpm monorepo scaffold: `apps/mobile`, `apps/web` (placeholder only), `packages/shared`, `supabase/`
- Expo app with Expo Router, TanStack Query, Zustand, design tokens
- Supabase local development workflow and migration ordering
- `cities` table seeded from GeoNames (Europe)
- Email + password authentication
- `profiles` table with the verification state machine
- `contact_details` in a separate table with strict RLS
- Invite generation with a per-user quota, and the `redeem-invite` Edge Function
- Document-verification application flow, private storage bucket, delete-on-decision
- 90-day document backstop purge, 3-day moderator nudge, `docs_expired` + re-upload
- The complete RLS policy set for every table introduced here
- pgTAP tests covering every policy
- Profile create / view / edit screens
- Sentry initialised; PostHog initialised behind a config flag (default **off**)
- `pnpm sync:shared` script and Deno import map

### Out of Scope

- Trips, availability, matching (Milestone 2)
- Requests, offers, push notifications (Milestone 3)
- Reviews, blocks, reports, deletion (Milestone 4)
- The real landing page and universal links (Milestone 5) — invite codes are entered by
  paste in this milestone
- Social login, phone auth, password reset UI polish

---

## Technical Specification

### Day-one verification task

**Before writing the notification and cron design into migrations, confirm `pg_cron` and
`pg_net` are available on the Supabase project:**

```sql
select * from pg_available_extensions where name in ('pg_cron','pg_net');
create extension if not exists pg_cron;
create extension if not exists pg_net;
```

If either is unavailable, record it in `Project-Plan.md` under Open Technical Risks and
plan for the fallback: a GitHub Actions cron calling an Edge Function on a schedule. Do not
silently redesign — flag it.

### Components to Build

#### 1. Monorepo scaffold

- **Responsibility:** workspace layout, TypeScript config, lint, shared-package wiring.
- **Key notes:**
  - `pnpm-workspace.yaml` listing `apps/*` and `packages/*`.
  - Root `package.json` scripts: `sync:shared`, `db:reset`, `db:test`, `typecheck`, `lint`, `test`.
  - `sync:shared` copies `packages/shared/{schemas,domain}` into
    `supabase/functions/_shared/gen/`. Add `supabase/functions/_shared/gen/` to
    `.gitignore`. Run it before every `supabase functions deploy`.
  - `supabase/functions/deno.json` provides the import map:
    `{ "imports": { "zod": "npm:zod@^3.23", "@supabase/supabase-js": "npm:@supabase/supabase-js@^2" } }`
  - All relative imports inside `packages/shared` **must use explicit `.ts` extensions**.
  - Expo Metro config needs `watchFolders` pointing at the workspace root and
    `nodeModulesPaths` including the root `node_modules`. Budget time for this.

#### 2. `cities` seed

- **Responsibility:** a fixed, stable set of European cities for exact matching.
- **Source:** GeoNames `cities5000`, filtered to European country codes, CC-BY licensed
  (attribute in the app's about screen or privacy page).
- **Key notes:**
  - Write a Node script that downloads and transforms the dataset into
    `supabase/seed/cities.sql`. Commit the generated SQL so seeding is reproducible offline.
  - Populate `aliases` with the ASCII-folded and local-language forms (`Muenchen`,
    `München`, `Munchen` for Munich) so search matches what users type.
  - Add a `pg_trgm` GIN index over `name` for fuzzy search.
  - Expect roughly 2,000–3,000 rows. Do not include districts or neighbourhoods.

#### 3. Auth

- **Responsibility:** account creation and session management.
- **Interface:** `supabase.auth.signUp`, `signInWithPassword`, `onAuthStateChange`.
- **Key notes:**
  - Email confirmation **on**. The confirmation deep link is handled in Milestone 5; for
    now, confirm via the emailed link opening the web placeholder.
  - Session persisted with `expo-secure-store`, not AsyncStorage.
  - A database trigger on `auth.users` insert creates the matching `profiles` row with
    `status = 'pending'`.

#### 4. Profile

- **Responsibility:** identity, discipline, home city, and the verification state.
- **Interface:** direct `select` / `update` on `profiles`; `contact_details` is a separate
  table with its own policies.
- **Key notes:**
  - `home_district` is **free text typed by the user** (e.g. "Neuhausen"). It is never
    geocoded and is deliberately coarse. The exact address is never stored anywhere.
  - Avatar uploads go to a public `avatars` bucket; verification documents go to a
    **private** `verification-docs` bucket.

#### 5. Invites

- **Responsibility:** the primary path into the community; every member traceable to a voucher.
- **Interface:** client `insert` into `invites` (policy-limited); redemption via the
  `redeem-invite` Edge Function.
- **Key notes:**
  - Codes are 8 characters, uppercase, from an unambiguous alphabet
    (`ABCDEFGHJKLMNPQRSTUVWXYZ23456789` — no `I`, `O`, `0`, `1`).
  - Default quota is 5, read from `app_config` so it is tunable without a deploy.
  - Codes expire after 30 days by default.
  - An insert policy enforces that a user cannot create more live invites than their
    remaining quota. The quota is decremented on **redemption**, not creation.

#### 6. Verification applications

- **Responsibility:** the fallback path for applicants without an invite.
- **Interface:** direct insert into `verification_applications` plus storage upload;
  review happens in the Supabase dashboard.
- **Key notes:**
  - The upload screen must state clearly: **"CV, enrolment confirmation, diploma,
    programme, or agency page. Please do not upload passports or ID cards."** Reject
    obvious ID uploads on review and delete immediately.
  - Maximum 3 files, 5 MB each, `pdf` / `jpg` / `png` only.
  - **Deletion on decision is a database trigger**, not a manual step: when `status`
    changes from `pending` to `approved` or `rejected`, delete the storage objects listed
    in `doc_paths`, clear the array, and set `docs_deleted_at`. This means reviewing from
    the dashboard automatically deletes the files, with no discipline required from the
    moderator.

#### 7. Scheduled jobs (this milestone's share)

| Job | Cadence | Behaviour |
|---|---|---|
| `notify_pending_verifications` | daily 09:00 UTC | If any application has been `pending` > 3 days, send one summary email to `MODERATOR_EMAIL` via Resend. Repeats every 3 days while the backlog persists. |
| `purge_verification_docs` | daily 03:00 UTC | For applications still `pending` after **90 days**: delete storage objects, clear `doc_paths`, set `status = 'docs_expired'`, enqueue a notification to the applicant. **Never rejects the application** — the row and queue position survive. |

The applicant-facing consequence of `docs_expired` is a banner with a one-tap re-upload
that returns the application to `pending`.

#### 8. Edge Function: `redeem-invite`

- **Responsibility:** atomically consume an invite and approve the new member.
- **Auth:** requires a valid user JWT.
- **Key notes:** all work inside one transaction using `service_role`; take a row lock on
  the invite (`select ... for update`) so two simultaneous redemptions cannot both succeed.

---

### Data Model

All tables are in `public`, all have RLS **enabled**, and none have a permissive default.

```sql
-- ─── cities ───────────────────────────────────────────────────────────────
create table cities (
  id           uuid primary key default gen_random_uuid(),
  name         text not null,                    -- 'Munich'
  name_local   text,                             -- 'München'
  country_code char(2) not null,
  lat          double precision not null,
  lon          double precision not null,
  aliases      text[] not null default '{}',
  is_active    boolean not null default true
);
create index cities_name_trgm on cities using gin (name gin_trgm_ops);
create index cities_country on cities (country_code);

-- ─── app_config ───────────────────────────────────────────────────────────
create table app_config (
  key   text primary key,
  value jsonb not null
);
-- seed: ('default_invite_quota', '5'), ('invite_ttl_days', '30'),
--       ('doc_purge_days', '90'), ('review_window_days', '14')

-- ─── profiles ─────────────────────────────────────────────────────────────
create type profile_status as enum
  ('pending','approved','rejected','suspended','deleted');

create table profiles (
  id             uuid primary key references auth.users(id) on delete cascade,
  display_name   text not null,
  discipline     text not null,      -- 'voice','strings','keyboard','winds','brass',
                                     -- 'percussion','dance','conducting','composition','other'
  specialisation text,               -- 'mezzo-soprano', 'violin', 'contemporary'
  home_city_id   uuid references cities(id),
  home_district  text,               -- free text, coarse. NEVER an exact address.
  bio            text check (char_length(bio) <= 600),
  photo_path     text,
  links          jsonb not null default '[]',    -- [{"label":"Website","url":"..."}]
  status         profile_status not null default 'pending',
  invited_by     uuid references profiles(id) on delete set null,
  invite_quota   int not null default 5,
  verified_at    timestamptz,
  suspended_at   timestamptz,
  created_at     timestamptz not null default now(),
  updated_at     timestamptz not null default now()
);
create index profiles_home_city on profiles (home_city_id) where status = 'approved';

-- ─── contact_details ──────────────────────────────────────────────────────
-- Separate table so that revealing contact info is a policy decision, not a
-- column-selection decision in client code.
create table contact_details (
  profile_id        uuid primary key references profiles(id) on delete cascade,
  email             text,
  phone             text,
  whatsapp          text,
  preferred_channel text,            -- 'whatsapp','phone','email'
  updated_at        timestamptz not null default now()
);

-- ─── contact_grants ───────────────────────────────────────────────────────
-- Created in Milestone 3 on acceptance. Table defined here because the
-- contact_details policy references it.
create table contact_grants (
  id         uuid primary key default gen_random_uuid(),
  profile_a  uuid not null references profiles(id) on delete cascade,
  profile_b  uuid not null references profiles(id) on delete cascade,
  source     text not null,          -- 'offer','co_request'
  source_id  uuid,
  created_at timestamptz not null default now(),
  constraint ordered_pair check (profile_a < profile_b),
  unique (profile_a, profile_b, source, source_id)
);
-- Always insert with (least(a,b), greatest(a,b)) so the pair is canonical.

-- ─── invites ──────────────────────────────────────────────────────────────
create table invites (
  id         uuid primary key default gen_random_uuid(),
  code       text not null unique,
  created_by uuid not null references profiles(id) on delete cascade,
  uses       int not null default 0,
  max_uses   int not null default 1,
  expires_at timestamptz not null,
  revoked_at timestamptz,
  created_at timestamptz not null default now()
);
create index invites_creator on invites (created_by);

create table invite_redemptions (
  id          uuid primary key default gen_random_uuid(),
  invite_id   uuid not null references invites(id) on delete cascade,
  redeemed_by uuid not null references profiles(id) on delete cascade,
  redeemed_at timestamptz not null default now(),
  unique (redeemed_by)               -- a profile can only ever redeem once
);

-- ─── verification_applications ────────────────────────────────────────────
create type verification_status as enum
  ('pending','approved','rejected','docs_expired');

create table verification_applications (
  id              uuid primary key default gen_random_uuid(),
  profile_id      uuid not null unique references profiles(id) on delete cascade,
  status          verification_status not null default 'pending',
  note            text,                   -- applicant's own statement
  links           jsonb not null default '[]',
  doc_paths       text[] not null default '{}',
  submitted_at    timestamptz not null default now(),
  reviewed_at     timestamptz,
  reviewed_by     uuid references profiles(id),
  decision_reason text,
  docs_deleted_at timestamptz
);
create index verification_pending on verification_applications (submitted_at)
  where status = 'pending';
```

**Storage buckets**

| Bucket | Public | Contents | Policy |
|---|---|---|---|
| `avatars` | yes | Profile photos | Owner may write to `{profile_id}/…`; anyone may read |
| `verification-docs` | **no** | Application evidence | Owner may write to `{profile_id}/…`; **no client read policy at all** — the moderator reads via dashboard/signed URL, `service_role` deletes |

### RLS Policies

Define these helper functions first (all `stable`, `security definer`, `search_path = public`):

```sql
create function current_status() returns profile_status ...
  -- select status from profiles where id = auth.uid()

create function is_approved() returns boolean ...
  -- current_status() = 'approved'

create function is_blocked(other uuid) returns boolean ...
  -- Milestone 4 adds the blocks table; return false until then, then check
  -- both directions. Defined here so later policies do not need rewriting.

create function has_contact_grant(other uuid) returns boolean ...
  -- exists in contact_grants where the canonical pair matches auth.uid() and other
```

Policy set for this milestone:

| Table | Operation | Rule |
|---|---|---|
| `cities` | select | any authenticated user |
| `app_config` | select | any authenticated user |
| `profiles` | select | own row always; other rows only if `is_approved()` **and** target `status = 'approved'` **and** `not is_blocked(id)` |
| `profiles` | update | own row only; **`status`, `invite_quota`, `invited_by`, `verified_at` are not client-updatable** — enforce with a trigger that rejects changes to those columns unless the role is `service_role` |
| `profiles` | insert / delete | none for clients (trigger and Edge Function only) |
| `contact_details` | select | `profile_id = auth.uid()` **or** (`is_approved()` and `has_contact_grant(profile_id)` and `not is_blocked(profile_id)`) |
| `contact_details` | insert / update | own row only |
| `contact_grants` | select | rows where the user is `profile_a` or `profile_b` |
| `contact_grants` | insert / update / delete | none for clients |
| `invites` | select | `created_by = auth.uid()` |
| `invites` | insert | `created_by = auth.uid()` **and** `is_approved()` **and** the count of the user's live, unexpired, unrevoked, unused invites is below their `invite_quota` |
| `invites` | update | own rows, and only to set `revoked_at` |
| `invite_redemptions` | select | `redeemed_by = auth.uid()` or the user created the invite |
| `invite_redemptions` | insert | none for clients |
| `verification_applications` | select | `profile_id = auth.uid()` |
| `verification_applications` | insert | `profile_id = auth.uid()` and no existing application |
| `verification_applications` | update | own row, and only while `status in ('pending','docs_expired')`, and only the `note`, `links`, `doc_paths` columns |

**Suspension:** `is_approved()` returns false for `suspended`, so a suspended user loses
access to all member content on their next query with no extra policy work.

### API Contracts

#### `POST /functions/v1/redeem-invite`

Auth: user JWT required.

```jsonc
// request
{ "code": "K7M2XQ4P" }

// 200
{ "ok": true, "invitedBy": { "id": "uuid", "displayName": "Anna Weber" } }
```

Behaviour, in one transaction as `service_role`:

1. `select ... for update` the invite by upper-cased code.
2. Reject if not found, revoked, expired, or `uses >= max_uses`.
3. Reject if the caller already has an `invite_redemptions` row.
4. Reject if the caller's profile status is not `pending`.
5. Increment `invites.uses`; insert `invite_redemptions`.
6. Decrement the inviter's `invite_quota` (floor at 0).
7. Set caller's profile: `status = 'approved'`, `verified_at = now()`, `invited_by = <inviter>`.
8. If a `verification_applications` row exists and is `pending`, mark it `approved` — which
   fires the document-deletion trigger.

Error responses — all `{ "ok": false, "error": "<code>", "message": "<human text>" }`:

| HTTP | `error` | When |
|---|---|---|
| 404 | `invite_not_found` | No such code |
| 410 | `invite_expired` | Past `expires_at` |
| 410 | `invite_revoked` | `revoked_at` set |
| 409 | `invite_exhausted` | `uses >= max_uses` |
| 409 | `already_redeemed` | Caller already redeemed an invite |
| 409 | `already_approved` | Caller's status is not `pending` |
| 401 | `unauthenticated` | Missing or invalid JWT |

The Zod schema for the request body lives in `packages/shared/schemas/redeem-invite.ts`
and is imported by both the app and the function.

### Environment & Configuration

`apps/mobile/.env` (all `EXPO_PUBLIC_` values are embedded in the bundle — never put a
secret here):

| Variable | Purpose |
|---|---|
| `EXPO_PUBLIC_SUPABASE_URL` | Supabase project URL |
| `EXPO_PUBLIC_SUPABASE_ANON_KEY` | Anon key |
| `EXPO_PUBLIC_SENTRY_DSN` | Sentry DSN (EU region) |
| `EXPO_PUBLIC_POSTHOG_KEY` | PostHog project key |
| `EXPO_PUBLIC_POSTHOG_HOST` | `https://eu.i.posthog.com` |
| `EXPO_PUBLIC_ANALYTICS_ENABLED` | `false` until the privacy policy names PostHog |
| `EXPO_PUBLIC_WEB_BASE_URL` | e.g. `https://gigaway.app` |

Edge Function secrets (`supabase secrets set`):

| Variable | Purpose |
|---|---|
| `SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY` | Privileged database access |
| `RESEND_API_KEY` | Moderator nudge emails |
| `MODERATOR_EMAIL` | Recipient for nudges |

**Analytics rules:** `autocapture: false`, no PII in event properties (profile UUIDs only,
never names, emails or free text). Events for this milestone: `signup_started`,
`invite_redeemed`, `verification_submitted`, `profile_completed`. The whole client is a
no-op when `EXPO_PUBLIC_ANALYTICS_ENABLED` is not `true`.

---

## Implementation Order

1. **Verify `pg_cron` / `pg_net`.** Five minutes, and it can invalidate part of the design.
2. **Monorepo scaffold** — workspaces, TypeScript, lint, `sync:shared`, Metro config. Get
   a blank Expo app running on a device before anything else.
3. **Supabase local dev** — `supabase init`, `supabase start`, confirm `db reset` works.
4. **Migration 1: cities + app_config + seed.** Verifies the whole migration workflow on
   something with no policy complexity.
5. **Migration 2: profiles, contact_details, contact_grants** with the `auth.users` trigger
   and the column-guard trigger.
6. **Migration 3: RLS helper functions and all policies so far.**
7. **pgTAP tests for those policies — before building UI on top of them.** Cover: pending
   user sees no other profiles; approved user sees approved profiles only; contact details
   invisible without a grant, visible with one; suspension revokes access immediately.
8. **Auth screens** — sign up, sign in, email confirmation waiting state.
9. **Profile screens** — create (post-signup wizard), view, edit, avatar upload.
10. **Migration 4: invites + invite_redemptions + policies**, then `redeem-invite`, then
    its pgTAP and function tests. Test the concurrent-redemption case explicitly.
11. **Invite UI** — generate and share a code; paste-a-code screen at sign-up.
12. **Migration 5: verification_applications + storage buckets + deletion trigger.**
13. **Verification UI** — upload screen with the no-ID copy, pending state, `docs_expired`
    banner with one-tap re-upload.
14. **Migration 6: cron jobs** — nudge and purge.
15. **Sentry and PostHog wiring**, flag off.
16. **Moderator SQL views** — `v_pending_verifications` (profile, note, links, signed doc
    URLs, days waiting) saved in the Supabase dashboard.

## Done Criteria

- [ ] `pnpm install && pnpm typecheck && pnpm lint && pnpm test` passes at the root
- [ ] `supabase db reset` rebuilds the schema and seeds ~2,000+ cities from scratch
- [ ] `pnpm db:test` runs pgTAP and all policy tests pass
- [ ] A new user can sign up, paste a valid invite code, and land as `approved`
- [ ] The same code cannot be redeemed twice; concurrent redemption is proven safe by test
- [ ] An inviter's remaining quota visibly decreases after their code is redeemed
- [ ] A user cannot create more live invites than their quota (blocked by policy, not UI)
- [ ] A user without an invite can submit an application and lands as `pending`
- [ ] **A `pending` user querying `profiles`, `cities` aside, receives zero rows**
- [ ] Approving an application in the Supabase dashboard deletes the storage objects
      automatically and sets `docs_deleted_at`
- [ ] `contact_details` for another profile returns zero rows without a `contact_grants` row
- [ ] Setting `status = 'suspended'` revokes member content access on the next query
- [ ] A user cannot change their own `status` or `invite_quota` via the client
- [ ] Profile create and edit work on a real device, including avatar upload
- [ ] Sentry receives a deliberately thrown test error
- [ ] With `EXPO_PUBLIC_ANALYTICS_ENABLED=false`, no network request reaches PostHog
- [ ] The `v_pending_verifications` view returns a reviewable row for a test application

## Known Risks & Watch-Outs

- **Metro + monorepo resolution.** The most likely day-one time sink. Use
  `expo/metro-config` defaults first and only add `watchFolders` / `nodeModulesPaths` if
  resolution actually fails.
- **The `sync:shared` step is easy to forget.** Wire it into a `predeploy` script rather
  than relying on memory.
- **`security definer` helper functions need `search_path = public` pinned**, otherwise
  they are a privilege-escalation vector.
- **Policy recursion.** A `profiles` policy that calls a helper which itself selects from
  `profiles` will recurse. Mark helpers `security definer` so they bypass RLS internally,
  and test with `db reset` rather than trusting the editor.
- **The column-guard trigger is load-bearing.** Without it, an `update` policy on
  `profiles` lets any user set `status = 'approved'` and defeat the entire verification
  wall. Test this explicitly.
- **Storage policies are separate from table policies.** A private bucket still needs an
  explicit absence of read policy; verify a signed-out and a signed-in non-owner both
  receive 403 on a `verification-docs` object.
- **GeoNames attribution is required by CC-BY.** Add a line to the about screen.
- **Do not let this milestone sprawl.** If it runs long, cut profile polish and the invite
  sharing UI — never the policies or their tests.
