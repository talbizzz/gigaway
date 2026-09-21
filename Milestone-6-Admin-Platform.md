# Milestone 6: Admin Platform

## Goal

A standalone, human-friendly web app for the people running GigAway — find a
user or profile, inspect a trip, suspend or delete an account, decide a
verification application, action a report — without hand-writing SQL against
the dashboard. Two independent deployments, one per Supabase project, so admin
actions against dev can never touch real users.

## Context

**This reverses a documented decision.** `MODERATION.md`, `README.md` and
`Project-Plan.md` all currently say "no custom admin UI, deliberately" —
moderation has run entirely on the Supabase dashboard's SQL editor since
Milestone 4, against a set of saved views (`v_pending_verifications`,
`v_open_reports`, `v_user_summary`, `v_stuck_notifications`,
`v_recent_signups`). Those views, and the manual
runbook in `MODERATION.md`, are this milestone's spec — the admin app is the
same workflow with a UI, not a redesign of it. Updating those three docs to
describe the new tool instead of its absence is the last step of this
milestone, not a side effect to forget.

**Hard constraint carried over from Milestone 4:** the moderator views are
`revoke`d from `anon` and `authenticated`, and the pgTAP suite asserts that.
This milestone must not weaken that grant. Admin access to the same data goes
through new `security definer` functions that check admin membership
internally — the views themselves stay exactly as locked down as they are
today.

**Two Supabase projects already exist** (dev + prod — see
`.gigaway-dev-credentials` for dev; prod is `gigaway`,
`hrhoqmmxgfpyxwncmpjx`, per Milestone 0). [[supabase-two-projects]] Dev
migrations are pushed by hand, never from CI. [[supabase-is-cloud-only]] This
milestone's CI only ever runs `supabase db push` against prod, gated the same
way `deploy-backend.yml` already gates it — behind the `production`
environment's required reviewer — because the free tier has no backups.
[[no-database-backups]]

**No local Supabase stack**, so every migration and RPC in this milestone is
unverified until pushed to the dev project by hand. Write them defensively —
dry-run first, wrap destructive statements in a transaction — same as any
other change to this schema.

**Reuse, don't rebuild:** `packages/shared` already has the generated
database types, the Zod schemas, and the date/phone domain logic used by the
mobile app — the admin app imports the same package rather than duplicating
any of it. The visual language comes from `apps/mobile/src/theme/tokens.ts`
(ink/brass palette, Lora + Ubuntu type) ported to CSS, not from a new design.
`@supabase/supabase-js`, `@tanstack/react-query`, `react-hook-form` and `zod`
are already dependencies elsewhere in the monorepo — the admin app uses the
same libraries rather than introducing alternatives.

## Scope

### In Scope

- New workspace app `apps/admin` — Vite + React 19 + TypeScript SPA, deployed
  as static files (same hosting model as `site/`)
- Admin authentication: Supabase Auth (email + password), gated by a new
  `admin_users` table — no self-service signup, rows inserted by hand
- User search, profile detail, suspend/unsuspend, delete (consolidates the
  three manual steps in `MODERATION.md`'s "Deleting someone" section into one
  confirmed action)
- Trip search, trip detail, delete
- Verification queue — approve/reject with a reason, replacing the daily SQL
  in `MODERATION.md`
- Report queue — action/dismiss with a note, with prior-report context
  surfaced the way `v_open_reports` already separates it
- Operational dashboard — stuck notifications, recent signups, scheduled-job
  status (today's `select * from cron.job`)
- An audit log of every admin action: who, what, on whom, when
- Two independent deployments (dev/prod), each pointed at its own Supabase
  project, visually distinguished so an admin always knows which one they're
  in
- CI pipeline for both deployments, prod gated behind manual approval
- Updating `MODERATION.md`, `README.md` and `Project-Plan.md` to describe the
  new tool

### Out of Scope

- Any admin action the current `MODERATION.md` runbook doesn't already
  describe (e.g. editing a profile's free-text fields, bulk actions) — if it's
  not a documented moderator action today, it doesn't get a button now
- Self-service admin account creation, SSO, or 2FA — a founder-managed
  allowlist is proportionate for a one-to-two-person team; revisit if that
  changes
- Real-time subscriptions — consistent with the rest of the app, refetch on
  focus/action is enough for a tool a couple of people use
- A mobile-friendly admin layout — desktop only, used at a desk
- Editing the moderator SQL views themselves — this milestone adds a parallel,
  gated API surface in front of the existing data model, it doesn't touch
  `MODERATION.md`'s underlying views or their grants
- Cloudflare Access / Zero Trust in front of the deployed domain — strongly
  recommended as a follow-up (see Known Risks) but it's dashboard
  configuration outside this repo, not code

---

## Technical Specification

### Components to Build

#### 1. `admin_users` and `is_admin()`

- **Responsibility:** the single source of truth for "is this person an
  admin," used by every function below.
- `admin_users (id uuid primary key references auth.users(id) on delete
  cascade, display_name text not null, created_at timestamptz not null
  default now())`. No RLS policy grants it to `authenticated` — it is only
  ever read through `is_admin()`.
- `is_admin(p_uid uuid default auth.uid()) returns boolean language sql
  stable security definer set search_path = public` — `exists (select 1 from
  admin_users where id = p_uid)`.
- Seeding an admin is a manual `insert into admin_users` run by the founder
  after creating the Supabase Auth user — deliberately not a UI, the same way
  member zero was created through the Auth API by hand in Milestone 5.
- **Correction found while testing this locally:** creating that Supabase
  Auth user also fires `handle_new_user()`, same as any signup, which
  creates a `profiles` + `contact_details` row for it — an admin account
  would otherwise also be an artist account, invisibly. Rather than special-
  case `handle_new_user()` (shared, load-bearing code the whole consumer
  app depends on, not something to fork behavior into for one rare,
  by-hand operation), provisioning now deletes those two rows before the
  `insert into admin_users` — safe on a freshly-created account, since
  nothing has used it as a member yet to hang data off it. The full
  three-step recipe is now the `admin_users` table comment itself
  (`20260919170000_admin_users_provisioning_note.sql`), not just this doc,
  so it's visible from `\d+ admin_users` too. **`admin-scripts/` now does
  all three steps** (`pnpm create-admin`, which prompts for the project,
  email, name and password): it refuses an
  email that's already registered rather than converting an existing
  (possibly artist) account, rolls everything back if a step fails, and
  never assumes a project silently (Enter at the prompt means dev; prod needs a typed
  confirmation); the manual recipe stays as the fallback.

#### 2. `audit_log`

- **Responsibility:** an admin action is a decision made about a real person;
  the log is what makes it reviewable later.
- `audit_log (id bigint generated always as identity primary key, admin_id
  uuid not null references admin_users(id), action text not null,
  target_table text not null, target_id text, detail jsonb not null default
  '{}'::jsonb, created_at timestamptz not null default now())`.
- `log_admin_action(p_action text, p_target_table text, p_target_id text,
  p_detail jsonb default '{}'::jsonb) returns void security definer` — a small
  helper every mutating function below calls once, so the insert is written
  in exactly one place.
- Readable only via `admin_audit_log(p_limit int default 200, p_before
  timestamptz default null)`, admin-gated like everything else — not a raw
  grant on the table. **Revised in phase 7** to also join `admin_users` and
  return `admin_display_name` — a bare `admin_id` uuid wasn't something a
  human could actually read in a table meant to answer "who did this."
- Every mutating function in this milestone calls `log_admin_action` as its
  last statement, inside the same transaction as the change it's logging —
  never logged, no change; changed, always logged.

#### 3. Gated read functions (search & lookup)

All `security definer`, `set search_path = public`. Unlike the write
functions below, these use `where public.is_admin() and ...` inside the
query itself rather than a plpgsql `raise` — a non-admin gets zero rows, not
an error, matching `admin_audit_log`'s precedent and friendlier for a
frontend calling these opportunistically. They wrap the existing `v_*`
moderator views and tables rather than replacing them — the views keep
their current grants exactly as-is. **Shipped in
`20260918190000_admin_gated_reads.sql`.**

- `admin_search_profiles(p_query text) returns table (...)` — `ilike` across
  display name, email and phone; empty query returns the 50 most recent
  profiles rather than nothing.
- `admin_get_user_detail(p_profile_id uuid) returns table (...)` — one
  profile's `v_user_summary` row plus contact details and verification
  outcome, for the profile detail page.
- `admin_search_trips(p_query text) returns table (...)` — by city name or
  member name.
- `admin_get_trip_detail(p_trip_id uuid) returns table (...)` — the trip plus
  its request/offer/stay counts.
- `admin_pending_verifications()`, `admin_open_reports()`,
  `admin_stuck_notifications()`, `admin_recent_signups()` — thin
  `security definer` wrappers that `select *` from the matching `v_*` view.
  Same data `MODERATION.md` already documents, reachable from
  `authenticated` only through the gate.
- `admin_cron_status() returns table (jobname text, schedule text, active
  boolean, last_run timestamptz, last_status text)` — wraps `cron.job` joined
  to the latest `cron.job_run_details` per job, since the `cron` schema isn't
  exposed to the API today.

**Correction found while building this phase: no `admin_docs_awaiting_purge`.**
`v_docs_awaiting_purge` doesn't exist any more —
`20260917090000_verification_only_signup.sql` dropped it along with
`docs_deletion_requested_at`/`docs_deleted_at` when verification evidence
briefly moved to email-only ("nothing left to purge"), and
`20260918180000_persist_verification_evidence.sql` (which put evidence back
into Storage, specifically for this milestone to read) never recreated it —
evidence now persists until account deletion rather than being purged on
decision. There is nothing left to wrap; the operational dashboard phase
drops this item.

**Correction found while building this phase: one storage policy is needed
after all.** The verification-docs bucket has never had a `select` policy —
not even for the owner, by explicit original design. Reading the selfie/CV
a moderator needs to decide an application therefore needs a new,
admin-scoped policy (`bucket_id = 'verification-docs' and is_admin()`),
shipped in the same migration. See "RLS Policies" below — the "no changes to
any existing policy" line from the original plan was wrong; this is an
addition, not a change to what already existed, and it's as narrow as the
gap it fills.

**Performance note, resolved:** `profiles_display_name_trgm` and
`contact_details_email_trgm` (`extensions.gin_trgm_ops`, matching how
`cities_name_trgm` already does it) ship in this phase's migration rather
than being deferred — cheap insurance at current user counts, and `pg_trgm`
was already installed by Milestone 1.

#### 4. Privileged write functions

**`admin_set_user_status` and `admin_delete_trip` shipped in
`20260918200000_admin_privileged_writes.sql`.** `admin_decide_verification`
and `admin_decide_report` land with phase 6 (the verification/report
queues), not here. Same gate as everywhere else, but `raise exception`
rather than the phase-2 read functions' quiet empty result — a write that
silently no-ops for a non-admin would be worse than one that errors loudly.
Both capture what they're about to change into `log_admin_action`'s
`detail` **before** changing it — for `admin_delete_trip` this is
load-bearing, not just nice-to-have, since the row is gone afterward and
there's no second chance to describe what it was.

- `admin_set_user_status(p_profile_id uuid, p_status text) returns void` —
  only `'approved'` or `'suspended'`; anything else raises. This is the
  suspend/unsuspend action from `MODERATION.md`, unchanged in effect. The
  existing `guard_profile_privileged_columns` trigger already permits this:
  it checks `current_user in ('service_role', 'postgres', 'supabase_admin')`,
  and a `security definer` function runs as its owner (`postgres`), not its
  caller.
- `admin_delete_trip(p_trip_id uuid) returns void` — deletes the trip
  (requests/offers cascade). **Correction found while building this
  phase:** the original plan ("deletes the trip row, existing cascades
  apply") would have cascaded straight through to a stay and its reviews on
  both sides — exactly the case `delete_account` already goes out of its
  way to protect ("a trip that produced a stay survives"), just never
  extended to this new code path. It now refuses with a clear error if the
  trip has a stay; the UI shows why instead of a raw SQL error, and there is
  no admin action for that case — same principle as the out-of-scope line
  above: MODERATION.md's runbook never had one either.
- `admin_decide_verification`/`admin_decide_report` — still planned for
  phase 6, spec unchanged from below.

**Phase 6 shipped, in `20260919150000_admin_moderation_decisions.sql`:**

- `admin_decide_verification(p_application_id uuid, p_decision text,
  p_reason text) returns void` — `p_decision` is `'approved'` or `'rejected'`;
  updates `verification_applications` exactly as the manual SQL in
  `MODERATION.md` does, so the existing `handle_verification_decision`
  trigger (profile promotion) fires unchanged. Doc-purge queueing is gone
  from the spec — see the phase 2 correction above.
- `admin_decide_report(p_report_id uuid, p_decision text, p_note text)
  returns void` — `'actioned'`, `'dismissed'` or `'reviewing'`, same as
  today, including MODERATION.md's own quirk of stamping `resolved_at` for
  all three (even `'reviewing'`) — reproduced deliberately, not "fixed."

**Correction found by using it on dev:** the "existing trigger fires
unchanged" premise above was only true for a member's *first* application.
`handle_verification_decision` promotes a profile only while it is `pending`,
and `submit-verification` lets a rejected member reapply without moving the
profile off `rejected` — so approving a reapplication updated the
application, left the profile `rejected`, and `admin_decide_verification`
reported success. Fixed in `20260920120000_verification_reopen_and_approval_check.sql`:
reopening now puts the profile back to `pending`, and an approval that
can't take effect (a suspended or deleted member) now raises and rolls back
rather than half-applying.

#### 5. `admin-delete-user` Edge Function

**Shipped.** One correction from the original spec: step 4 below also
removes verification evidence (selfie/CV), which didn't exist in the
original plan — `20260918180000_persist_verification_evidence.sql` put it
into Storage after this milestone's plan was first written, and
`delete_account` (Milestone 4's function) already grew the matching cleanup
for the member's own self-service deletion, so this mirrors that.

- **Responsibility:** the one admin action that structurally cannot be a SQL
  function, because deleting the `auth.users` row requires the Auth Admin
  API, not a database grant.
- Consolidates the three manual steps `MODERATION.md`'s "Deleting someone"
  section currently lists as separate, easy-to-forget actions:
  1. `requireAdmin()` — verifies the caller's JWT, then calls `is_admin()`
     on a client scoped to that JWT so `auth.uid()` resolves correctly; also
     returns that same client so the function can later call
     `admin_get_user_detail` (used for the confirmation check below) as
     this admin, not as service_role.
  2. Cross-check the request's `confirm` field against the target's actual
     current display name or email (case-insensitive) — server-side, not
     just enabled-by-typing in the UI, so a stale `profileId` can't be
     deleted just because the confirmation field on screen happened to show
     the right name.
  3. `select delete_account(p_profile_id)` via the service client — the
     existing SQL function, unchanged.
  4. Remove the avatar **and any verification evidence** (selfie/CV) from
     Storage — neither reachable from SQL.
  5. `supabase.auth.admin.deleteUser(auth_user_id)` via the service-role
     client, last — mirrors `delete-account`'s own ordering, so a failure
     here still leaves the account functionally dead (tombstoned, `status
     = 'deleted'`) rather than half-processed.
  6. Insert the `audit_log` row directly via the service client, not
     through `log_admin_action` — that RPC is deliberately unreachable from
     any client role, even an admin's, because it's meant to be the sole
     gate for SQL-callable `admin_*` functions. Here, step 1 already
     performed that gate in this same request; a second RPC hop through a
     wrapper would add nothing but indirection.
- If step 4 or 5 fails after step 3 has committed, respond with which steps
  succeeded rather than a bare error — `MODERATION.md`'s runbook becomes the
  manual fallback for whichever step didn't complete, so the response has to
  say which one that was.

#### 6. Admin app shell (`apps/admin`)

**Shipped in phase 3** — scaffold, theme, auth and routing exist; the routes
below (except `/login` and `/`) are placeholders until phases 4–7 fill them
in.

- Vite + React 19 + TypeScript, `react-router-dom` for the routes below,
  `@tanstack/react-query` for data fetching/caching (wired in `main.tsx`,
  not yet consumed by a page), `react-hook-form` + `zod` for the login form
  (same libraries `packages/shared`/the mobile app already use).
- `src/lib/supabase.ts` — one client, built from `import.meta.env.VITE_*`
  via `src/lib/env.ts`, mirroring `apps/mobile/src/lib`'s shape (including
  the same `required()`-throws-a-helpful-error pattern) rather than
  inventing a second one.
- `src/theme/` — the palette, spacing, radius and type scale from
  `apps/mobile/src/theme/tokens.ts`, ported to CSS custom properties in
  `global.css`; Lora and Ubuntu self-hosted via `@fontsource` (latin +
  latin-ext subsets only — the default import pulls in cyrillic, greek,
  vietnamese, math and symbols too, nearly 3x the payload for scripts this
  app never shows), not a Google Fonts `<link>` — this app renders PII on
  every screen, and self-hosting avoids a third-party request on every page
  load.
- Routes: `/login`, `/` (operational dashboard), `/users` + `/users/:id`,
  `/trips` + `/trips/:id`, `/verifications`, `/reports`, `/audit-log`.
- `AuthProvider` (`features/auth/auth-context.tsx`) calls `is_admin()`
  exactly once per session change and holds four states — loading,
  signed-out, not-admin, admin. A session that fails the check is signed
  back out inside the same effect that discovers it, so `status` never
  passes through `'admin'` for it; `RequireAdmin` then only has to check
  `status === 'admin'`, not re-derive the gate itself.
- A persistent environment banner (`VITE_ENV_LABEL`, unset in prod) in
  `app/layout.tsx` — see Known Risks for why this isn't optional.
- Every delete action (user, trip) will require typing the record's name or
  email into a confirmation field before the button enables — there is no
  undo and no backup [[no-database-backups]] — but that lands with the
  actual delete actions in phase 5, not the phase 3 skeleton.

**Correction found while building this phase: no `.env.dev` file.** The
plan borrowed Expo's `.env`/`.env.dev` convention from the mobile app, but
Vite doesn't read a file by that name in any mode — it always loads plain
`.env`. The actual split is `.env.example` (tracked) and `.env` (gitignored,
local-only, whichever project you're testing against — almost always dev).
Neither deployed site reads a file at all: `deploy-admin.yml` exports
`VITE_SUPABASE_URL`/`VITE_SUPABASE_ANON_KEY` as real environment variables
before `vite build`, which Vite picks up directly, same as it would from a
`.env` file.

### Data Model

New migration, additive only:

```sql
create extension if not exists pg_trgm;

create table admin_users (
  id uuid primary key references auth.users(id) on delete cascade,
  display_name text not null,
  created_at timestamptz not null default now()
);

create table audit_log (
  id bigint generated always as identity primary key,
  admin_id uuid not null references admin_users(id),
  action text not null,
  target_table text not null,
  target_id text,
  detail jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

create index profiles_display_name_trgm on profiles
  using gin (display_name extensions.gin_trgm_ops);
create index contact_details_email_trgm on contact_details
  using gin (email extensions.gin_trgm_ops);
```

(`extensions.gin_trgm_ops`, schema-qualified — `pg_trgm` lives in the
`extensions` schema on this project, same as `cities_name_trgm` already does
it. Shipped in phase 2's migration, not phase 1's.)

`admin_users` and `audit_log` carry no RLS policy for `authenticated` at all
— every read and write goes through a `security definer` function, never a
direct table grant. This is deliberate: it means there's exactly one place
(`is_admin()`) that can be wrong, instead of one per table.

### RLS Policies

No changes to any existing policy, and one addition: a `select` policy on
`storage.objects` scoped to `bucket_id = 'verification-docs' and is_admin()`.
That bucket has never had a select policy for anyone, including the file's
own owner — `20260918180000_persist_verification_evidence.sql` put real
selfie/CV evidence back into it specifically for this milestone to read, so
without this policy the verification queue would have nothing to show. It
doesn't loosen anything an ordinary member could already do; `verification.sql`'s
existing test that an owner can't read their own evidence back still holds,
since `is_admin()` is false for them.

Everything else is unchanged. The moderator views' `revoke ... from anon,
authenticated` stays exactly as it is — this milestone adds `security
definer` functions in front of them, not new grants on them. The pgTAP
assertion that those views are unreadable by `anon`/`authenticated` must
still pass unchanged after this migration.

### API Contracts

#### `POST /functions/v1/admin-delete-user`

Request: `{ "profileId": "uuid" }`, caller's JWT in the `Authorization`
header (an admin's session, not the target user's).

Response `200`:

```json
{
  "accountDeleted": true,
  "authUserDeleted": true,
  "avatarRemoved": true
}
```

Any `false` field means that step didn't complete — the caller must fall
back to the corresponding manual step in `MODERATION.md`. `403` if the caller
isn't in `admin_users`.

### Environment & Configuration

- `apps/admin/.env.example` (tracked) and `.env` (gitignored, local-only) —
  `VITE_SUPABASE_URL`, `VITE_SUPABASE_ANON_KEY`, `VITE_ENV_LABEL` (`"dev"` or
  unset). **Not** the mobile app's `.env`/`.env.dev` split — Vite has no
  concept of a `.env.dev` file; see the correction in "Admin app shell"
  above.
- Two Cloudflare Pages projects: `gigaway-admin` (prod) and `gigaway-admin-dev`
  (dev) — new, alongside the existing `gigaway` Pages project for `site/`.
- Two custom domains, `admin.gigaway.app` and `admin-dev.gigaway.app` — DNS
  CNAMEs added in the Cloudflare dashboard. **Manual, one-time, not scriptable
  from here** — flag it and hand it to the user rather than guessing at
  Cloudflare API calls.
- New GitHub Actions workflow `deploy-admin.yml`:
  - `deploy-dev`: on push to `develop` touching `apps/admin/**` or
    `packages/shared/src/**`. Builds with the dev project's `VITE_*` values
    (from repo secrets), `wrangler pages deploy` to `gigaway-admin-dev`. No
    approval gate — it's already the sandbox.
  - `deploy-prod`: on push to `main`, same paths. `environment: production`
    (the same required-reviewer environment `deploy-backend.yml` already
    uses), builds with prod's `VITE_*` values, deploys to `gigaway-admin`.
  - Neither job runs `supabase db push` — this milestone's migration ships
    through the existing `deploy-backend.yml` path, and dev gets it by hand
    like every other dev migration. [[supabase-is-cloud-only]]
- New repo secrets: `ADMIN_DEV_SUPABASE_URL`, `ADMIN_DEV_SUPABASE_ANON_KEY`,
  `ADMIN_PROD_SUPABASE_URL`, `ADMIN_PROD_SUPABASE_ANON_KEY`. The anon key
  isn't secret in the security sense (RLS/the `is_admin()` gate is what
  protects data) but keeping it out of the diff avoids churn if it rotates.

---

## Implementation Order

1. **DB foundations** — `admin_users`, `audit_log`, `is_admin()`,
   `log_admin_action()`, plus pgTAP tests proving a non-admin authenticated
   user gets nothing from any of them. Smallest possible slice; nothing above
   this is safe to build until the gate is proven.
2. **Read functions** — `admin_search_profiles`, `admin_get_user_detail`,
   `admin_search_trips`, `admin_get_trip_detail`, and the five `v_*`
   wrappers, each with a pgTAP test for the same non-admin-gets-nothing
   property.
3. **App skeleton** — `apps/admin` scaffold, theme port, Supabase client,
   `/login` wired to `is_admin()`. **Shipped**, except the "deployed once by
   hand to dev" step — that needs the migrations pushed first, which is
   still pending; do it before phase 8 automates the pipeline.
4. **Users and Trips pages** — search, detail, and the two read-only pages
   working end to end. This alone covers everything explicitly asked for:
   find a user, find a profile, find a trip. **Shipped** —
   `features/users/`, `features/trips/`, debounced search via
   `useDebouncedValue`, `@tanstack/react-query` for fetching. Read-only;
   suspend/delete land with phase 5.
5. **Privileged writes** — `admin_set_user_status`, `admin_delete_trip`,
   `admin-delete-user`, wired to confirmation UI, each verified against
   `audit_log`. **Shipped** — `ConfirmButton` (two-step, for reversible
   suspend/reinstate) and `DeletePanel` (typed-confirmation, for
   irreversible deletes) in `app/`; wired into both detail pages.
6. **Verification and report queues** — `admin_decide_verification`,
   `admin_decide_report`, their pages, prior-report context on the report
   queue. **Shipped** — `/verifications` is the first page to actually use
   the `verification_docs_read_admin` storage policy from phase 2 (signed
   URLs for the selfie/CV); `/reports` surfaces `subject_prior_reports` vs
   `subject_prior_reporters` per MODERATION.md's own guidance.
7. **Dashboard and audit log pages** — `admin_cron_status` and the
   operational-check wrappers; the audit log viewer. **Shipped** — all the
   SQL already existed from phase 2, so this was mostly frontend
   (`ScheduledJobsCard`, `StuckNotificationsCard`, `RecentSignupsCard` on
   `/`; `/audit-log` paginates via `useInfiniteQuery` against
   `admin_audit_log`'s `p_before` cursor). One gap closed:
   `admin_audit_log` now joins `admin_users` for a display name — see the
   correction on that function above.
8. **CI pipeline** — `deploy-admin.yml`, both Cloudflare Pages projects, both
   custom domains (DNS is the user's manual step). **Workflow written and
   validated locally; not yet run on GitHub.** Pages projects are created by
   the workflow on its first run rather than by hand; the custom domains and
   the two anon-key secrets are the manual part — see `TODO.md`. One addition
   beyond the plan: a pre-build guard that refuses a secret key or a
   wrong-project key/URL, because everything in `VITE_*` is compiled into a
   public bundle and a service-role key pasted into the wrong secret would
   publish full database access with no error anywhere.
9. **Docs** — rewrite the "no custom admin UI" lines in `MODERATION.md`,
   `README.md` and `Project-Plan.md` to describe the app that now exists.
   **Done.** They name the two domains, which won't resolve until step 8's
   domains are attached.

## Done Criteria

- [ ] `admin_users`, `audit_log`, `is_admin()` exist; pgTAP proves a
      non-admin authenticated user gets `false`/nothing from every
      `admin_*` function
- [ ] The existing moderator-view pgTAP assertions (revoked from
      `anon`/`authenticated`) still pass unchanged
- [ ] An admin can sign in, search for a user by name/email/phone, and open
      their detail page
- [ ] An admin can search for a trip and open its detail page
- [ ] Suspend, unsuspend, delete-user and delete-trip all work, each behind
      a typed confirmation, each producing an `audit_log` row
- [ ] `admin-delete-user` reports which of its three steps succeeded when one
      fails
- [ ] Verification and report queues match `MODERATION.md`'s current
      behaviour (same downstream effects), operated from the UI instead of
      raw SQL
- [ ] Dashboard shows cron status, stuck notifications, recent signups
- [ ] `admin-dev.gigaway.app` talks to the dev Supabase project,
      `admin.gigaway.app` talks to prod; the environment banner makes the
      difference visually obvious
- [ ] Prod deploy requires the same manual approval as a backend deploy
- [ ] `MODERATION.md`, `README.md`, `Project-Plan.md` describe the app that
      exists, not the one that used to not exist

## Known Risks & Watch-Outs

- **No database backups.** [[no-database-backups]] Every delete in this app
  is permanent. The typed-confirmation requirement isn't decoration — it's
  the only thing standing between a misclick and an unrecoverable loss.
- **Two Supabase projects, one browser tab away from each other.**
  [[supabase-two-projects]] An admin who forgets which environment they're in
  can suspend or delete a real person while thinking they're testing. The
  environment banner is load-bearing, not cosmetic — don't cut it under time
  pressure.
- **`security definer` is a privilege-escalation surface.** Every function
  added here runs with elevated rights; the `is_admin()` check has to be the
  literal first statement in every one of them, no exceptions, and pgTAP has
  to prove it for every one of them — a missed check is a data breach, not a
  bug.
- **`revoke … from public` is not a lockdown on this project.** Default
  privileges grant `EXECUTE` on every new function to `anon` and
  `authenticated` *directly*, so revoking from `PUBLIC` alone changes
  nothing (confirmed against `information_schema.routine_privileges`; this
  bit every `admin_*` function until
  `20260919190000_admin_grants_and_casts.sql`). Any new function meant to be
  restricted must name the roles: `revoke all on function … from public,
  anon` (keep `authenticated` only if it's meant to be client-callable and
  gates itself with `is_admin()`), or `… from public, anon, authenticated`
  for anything internal like `log_admin_action`. And after adding one, check
  the grants table rather than trusting the migration — this was invisible
  to every dry-run and only surfaced when pgTAP ran against a real database.
- **Read state back as `postgres` in tests, not as the acting role.** RLS
  makes rows *disappear* rather than error (suspended members, other
  members' applications), and `reports` has no client grant at all, so a
  read as the admin's `authenticated` role returns `NULL` or aborts the file
  — either of which looks exactly like the function under test failing.
  Search-term assertions should also filter to the fixture's own id: this
  is run against a populated dev database, not an empty one.
- **`main` may be stale relative to `develop`.** At the time of writing,
  `main` is behind `develop` by several milestones' worth of commits. The
  prod deploy job is wired to `main` for consistency with
  `deploy-backend.yml` and `deploy-web.yml`'s existing convention — if that
  convention is actually broken (i.e. prod deploys aren't happening the way
  the workflows imply), that's a pre-existing issue this milestone inherits
  rather than causes, and is worth resolving separately before relying on
  the prod leg of `deploy-admin.yml`.
- **Cloudflare Access is recommended, not required, for this milestone.**
  Supabase Auth + `is_admin()` is the real access control; an unauthenticated
  visitor to `admin.gigaway.app` only ever reaches a login form. Adding
  Cloudflare Access in front of the domain is a cheap second layer worth
  doing by hand afterward, but it's dashboard configuration, not code this
  milestone can ship.
- **`ilike` search has no index until the migration adds one.** Fine at
  today's user count; revisit if search feels slow before assuming something
  else is wrong.
