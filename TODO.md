# TODO — GigAway

Progress checklist. Detail lives in the `Milestone-N-*.md` files.

## Milestone 0: Launch Prerequisites

- [x] Buy domain — `gigaway.app`, Cloudflare Registrar
- [x] Decide public trader address — home address (Schlörstr. 6, Munich).
      Apple DSA trader status _deferred_: declared non-trader for now, since
      TestFlight-only distribution does not require it and the verification
      flow demands a business/court document a sole trader has no equivalent of.
      **Must be switched to trader before any public EU App Store release.**
- [x] Enrol in Apple Developer Program — paid and approved
- [x] Confirm the Free Apps agreement shows _Active_ in App Store Connect
- [x] Register Google Play developer account — approved
- [x] Android build via EAS — `.aab`, version code 2, build `7b250628`
- [x] Play app created (`app.gigaway.mobile`) and internal testing rolled out
- [x] App installed and running on a real Android device
- [x] Dev client built and installed on a real iPhone too — via
      `xcrun devicectl device install app` once `expo run:ios`'s device-connect
      step stalled; the real blocker turned out to be `repo.reactnative.dev`
      having an outage, not anything project-specific (see Milestone 1)
- [x] Closed test track — blocked on App content, which is blocked on the privacy policy URL being live
- [x] Collect 12 tester emails and get them opted in
- [x] Create Supabase project in EU (Frankfurt) — `gigaway`, ref `hrhoqmmxgfpyxwncmpjx`, eu-central-1 _(the DPA is incorporated into Supabase's ToS — nothing separate to sign)_
- [x] Deploy the schema to it — all 27 migrations applied 2026-08-31, generated types match
- [x] Deploy the Edge Functions — all 9 live 2026-08-31 _(`submit-report`, `export-data` and
      `delete-account` had never been deployed; `functions:deploy` now passes
      `--import-map`, without which server-side bundling cannot resolve `zod`;
      superseded 2026-09-21 — current CLIs reject that flag, see Milestone 6)_
- [x] Overwrite the two Vault secrets — done 2026-09-06, verified by calling
      `dispatch-notifications` through `call_edge_function` and reading a 200 out
      of `net._http_response`. All five cron jobs are live.
- [ ] Create Sentry, PostHog (EU) accounts _(Resend moved to Milestone 5)_
- [x] Draft privacy policy — `legal/privacy-policy.md`
- [x] Draft terms of service / EULA — `legal/terms-of-service.md`
- [x] Draft community guidelines — `legal/community-guidelines.md`
- [x] List subprocessors in the privacy policy _(all 8 named)_
- [x] Google Play Data safety answer sheet — `legal/play-data-safety.md`
- [x] Host the legal documents — live at gigaway.app/privacy, /terms, /guidelines,
      /impressum and /delete-account, on Cloudflare Pages
- [x] Create the verified demo account both stores require for review
- [x] Moderator/support mail — Cloudflare Email Routing forwards `moderation@`,
      `support@`, `privacy@` and `security@gigaway.app` to a dedicated Gmail
      account (not a personal inbox). Receiving is solved; _sending as_ those
      addresses from Gmail is not — Google restricts "Send through Gmail" to
      Workspace domains, so a non-Workspace custom domain only gets the
      SMTP-relay option, which Gmail pre-fills with Cloudflare's **inbound** MX
      host and can never send. Fixed by adding Resend SMTP credentials
      _(deferred, tracked under Milestone 5)_.

## Milestone 1: Foundations & Access

> ✅ Code complete, though the invite chain this was originally built around is
> gone — see "Corrections and follow-on work" below, item 3. `pg_cron`/`pg_net`
> confirmed, so the scheduled-job design holds. The dev-build blocker below is
> resolved. Plan corrections are recorded in the milestone file.

- [x] Scaffold pnpm monorepo + Expo app
- [x] Verify pg_cron / pg_net availability
- [x] Seed cities table from GeoNames
- [x] Auth: email sign-up and sign-in
- [x] Profiles schema + verification state machine
- [x] ~~Invite generation~~ _(built, then removed entirely — see below)_
- [x] ~~redeem-invite Edge Function~~ _(built, then removed entirely — see below)_
- [x] Verification submission flow _(rebuilt around email — see below)_
- [x] Full RLS policy set
- [x] pgTAP tests for every policy
- [x] Profile create / edit screens + avatar upload
- [x] Sentry + PostHog behind flag
- [x] Moderator SQL views

**Outstanding before Milestone 1 can be called done:**

- [x] Run the app on a real device / simulator — dev client now installs and
      runs on both a physical Android device and a physical iPhone (see
      Milestone 0). Sign-up → profile create/edit has been walked this way,
      and as of 2026-09-18 so has the full email-based verification
      submission flow — selfie captured on-device, CV attached, submitted,
      and the resulting email confirmed arriving at `verify@gigaway.app` in
      the dedicated Gmail. Confirmed on **dev** only; prod still needs the
      same secrets and Cloudflare routing — tracked in `PRODUCTION-TODO.md`.
- [ ] Confirm Sentry receives a thrown test error (needs a DSN from Milestone 0)

**Corrections and follow-on work (not in the original plan):**

- [x] Removed the per-inviter invite quota
      (`20260909180000_remove_invite_quota.sql`) — superseded days later by
      removing invites altogether, below.
- [x] **Superseded, not merged:** the join-gate redesign on
      `feature/artist-verification-gate` (selfie-with-ID kept the invite chain
      alongside it, documents stored in a bucket). Its central idea carried
      into the item below; its mechanism did not. That branch was never merged
      and does not describe current behaviour.
- [x] **The invite chain is gone entirely, and verification runs on email, not
      storage** (`20260917090000_verification_only_signup.sql`). There is no
      fast path into the network any more — every signup lands `pending` and
      stays there until a human decides. To apply: a selfie holding photo ID
      against a pose that changes every attempt (so an old photo can't be
      reused), the full legal name on that ID, and evidence of professional
      standing (a CV upload, and/or links — portfolio, projects, social
      profiles, video). Submitting calls the new `submit-verification` Edge
      Function, which emails all of it to `verify@gigaway.app` via Resend and
      writes only metadata to `verification_applications` (never the photo,
      the ID, or the CV) — and only after the email actually sends. The
      `verification-docs` storage bucket, the per-minute purge cron, the
      90-day expiry cron and `docs_expired` are all gone with it, since there
      is nothing left to purge. `verify@gigaway.app` needs adding to Cloudflare
      Email Routing (alongside the addresses already set up in Milestone 0) and
      `VERIFICATION_EMAIL` needs setting as a secret on both Supabase projects
      before this works for real — tracked in Milestone 5. All four legal
      documents, the README, `MODERATION.md` and the Play listing were updated
      to match. `database.types.ts` was hand-edited against this migration
      rather than regenerated, since there's no live database to generate it
      from until the migration is pushed — re-run `pnpm db:types` for real once
      it is.

## Milestone 2: Trips & Matching

> ✅ Code complete. 88 pgTAP tests, 37 unit tests, typecheck/lint/bundle clean.
> Date semantics were corrected against the brief — see the milestone file.

- [x] Trips schema + CRUD
- [x] Availability schema + CRUD
- [x] City picker component (built in Milestone 1, reused)
- [x] Date range picker
- [x] search_matches SQL function
- [x] Nearby-city fallback (haversine)
- [x] Match screen: hosts + travellers
- [x] Empty states that read as encouraging
- [x] Unit tests for date overlap logic

**Outstanding:**

- [x] Walk the flow on a real device / simulator — unblocked, same dev client
      as Milestone 1

## Milestone 3: Core Loop

> ✅ Code complete. 6 new migrations, 194 pgTAP tests, 57 unit tests, 54 end-to-end
> checks against a live stack. Typecheck, lint and iOS bundle clean.
> Request → offer → accept → contact revealed works end to end, including the
> partial-range offer, the sibling auto-decline and the idempotent double-accept.
>
> Plan corrections made during implementation are recorded in the milestone file.

- [x] Requests schema + send request
- [x] Offers with partial date ranges
- [x] Proactive offers against open trips
- [x] accept-offer Edge Function
- [x] Co-accommodation request + accept
- [x] contact_grants + contact reveal UI
- [x] Push token registration
- [x] Notifications outbox + triggers
- [x] dispatch-notifications Edge Function
- [x] Retry sweep + Expo receipt handling
- [x] Email fallback on offer_accepted
- [x] In-app Activity list
- [x] Host-side discovery of open trips _(added — the proactive offer path had
      no way to find a trip; see the milestone file)_
- [x] Expiry sweep, and a date guard in the acceptance path _(added — the
      acceptance path had no date check, so a stale offer could be accepted
      into a backdated stay; see the milestone file)_

**Outstanding before Milestone 3 can be called done:**

- [x] Push arriving on a real device — dev client blocker resolved
- [ ] Confirm the offer_accepted fallback email actually sends
      (the claim-and-stamp logic is under pgTAP, but the Resend call needs
      RESEND_API_KEY, which arrives in Milestone 5)
- [ ] Walk the request → offer → accept → contact flow end to end on-device

## Milestone 4: Reputation & Safety

> ✅ Code complete. 6 new migrations, 322 pgTAP assertions across 14 test files,
> typecheck and lint clean. Blocking, reviews, reporting, moderator views, data
> export and account deletion are all built and covered.
> Auditing the earlier policies before switching `is_blocked()` on found three
> that never called it — see the milestone file.
>
> Corrections found by walking the app on-device are recorded in the milestone
> file's "Corrections made after implementation" section.

- [x] Stays table created on acceptance _(built in Milestone 3)_
- [x] Review submission + would-again binary
- [x] Double-blind release trigger
- [x] 14-day release cron
- [x] Review prompts after stay end
- [x] Reviews on profile view
- [x] Block / unblock, bidirectional invisibility
- [x] submit-report Edge Function
- [x] Moderator SQL views
- [x] Suspension takes effect immediately
- [x] export-data Edge Function
- [x] delete-account with anonymisation

**Outstanding before Milestone 4 can be called done:**

- [x] Walk review, block, report, export and delete on a device — dev client
      blocker resolved; export/delete copy was corrected against the real
      implementation while doing this (see "corrections" section below)
- [ ] Confirm a report reaches `MODERATOR_EMAIL` within a minute
      (needs RESEND_API_KEY and MODERATOR_EMAIL, which arrive in Milestone 5)
- [ ] Add a pgTAP test asserting a co-accommodation match is never reviewable
      _(holds by construction today — `accept_co_request` creates a contact grant
      and never a stay, and reviews hang off stays — but nothing asserts it, so a
      future change to that path could silently break the guarantee)_

## After Milestone 4: corrections from walking the app

> Not a planned milestone. These came out of using the product end to end and
> finding places where the interface allowed something the brief did not, or
> asked for something it had no way to collect. Corrections that change an
> earlier milestone's plan are recorded in that milestone's file.

- [x] Tab bar for home, profile and settings, replacing the ghost buttons at the
      foot of the home screen _(supersedes Milestone 3's note that there is no
      tab navigator)_
- [x] Sign out moved into Settings, beside account deletion
- [x] Profile split into a read view and an edit form — it opened straight into
      an editable form with no way to see yourself as others do
- [x] Save disabled until something actually changes
- [x] Home city could never be changed — one `null` meant both "untouched" and
      "cleared", so the picker always fell back to the stored city
- [x] WhatsApp number collected and required, stored E.164, revealed with the
      email on acceptance _(there was no screen to enter one, so the reveal
      screen's WhatsApp row could never show anything)_
- [x] Profiles readable from every match card before asking or offering, with
      the ask / offer action carried onto the profile
- [x] Initials placeholder where a member has no photo _(the empty circle was
      `bgRaised`, which is white in the light theme — invisible, not blank)_
- [x] One live offer per host per trip, enforced by a partial unique index
      _(a host could answer the same request twice and leave two overlapping
      offers; the traveller could accept either)_
- [x] Revising an unanswered offer, which replaces answering twice
- [x] Traveller notified when an offer's nights change
- [x] Welcome screen with full-bleed illustrated backgrounds
      (`(auth)/welcome.tsx`, `auth-dancer.webp`, `auth-singers.webp`)
- [x] Switched typography to Lora (serif, titles) + Ubuntu (humanist sans, body)
      via `@expo-google-fonts/*`, replacing system-font `fontWeight` styling
      with named `fontFamily` tokens
- [x] Fixed the keyboard covering the focused input on sign-in/sign-up —
      replaced manual `KeyboardAvoidingView` with
      `react-native-keyboard-controller`'s `KeyboardAwareScrollView` /
      `KeyboardStickyView`
- [x] Fixed Android avatar upload — `fetch(uri).blob()` was failing to resolve
      the MIME type on Android; replaced with `expo-file-system`'s
      `File` class (`new File(uri).arrayBuffer()`) in `use-update-profile.ts`
- [x] Settings restructured from one long scroll into a menu, each row opening
      its own page under `(app)/settings/` (`invitations`, `blocked`,
      `data-export`, `delete-account`) — same pattern the guidelines and
      member/trip/offer detail screens already used
- [x] "Who did I invite" list — `useMyInvitedMembers()` embeds
      `invite_redemptions` through the `invites` foreign key in one round trip,
      resolving each redeemer through the ordinary profile policy so a since
      blocked/suspended member correctly shows as "not visible" rather than
      erroring
- [x] Sign out simplified to a plain centered text link at the bottom of the
      main settings screen, not its own section/page
- [x] Data-export screen copy corrected — it claimed an emailed download link;
      the real `useExportData()` opens the native share sheet immediately

**Outstanding:**

- [x] Walk all of the above on a device — dev client blocker resolved for both
      platforms; the settings restructure, avatar fix and keyboard fix above
      were themselves found and fixed by doing this
- [ ] Re-run `offer_revision.sql` to confirm the two assertions corrected after
      the first live run _(the migration behaviour was right; the test's
      expectations were not)_
- [x] Decide what to do about the pgTAP suite assuming an empty database — ~22
      assertions across 6 files use unscoped `count(*)` and `limit 1`, so they
      fail against the cloud project's dev data. Known noise, not regressions.
      Either scope them to their fixtures or run them on a preview branch.

## Infrastructure & tooling (not tied to a single milestone)

> Grew out of needing a safe way to build, test and ship without touching
> production by accident. None of this was in the original milestone plans.

- [x] `develop` / `main` git branching model, with `main` reserved for
      production deploys — deliberately **not** split per-component, since
      `packages/shared` is imported by both the app and the functions and a
      component split would fragment it
- [x] Path-filtered GitHub Actions: `ci.yml` (typecheck, lint, `pnpm test`,
      `sync:shared:check`, legal-site build, plus a local Supabase reset +
      pgTAP job) on every PR/push to `develop`/`main`; `deploy-backend.yml`
      (migrations + functions, gated behind a required-reviewer `production`
      environment) and `deploy-web.yml` (legal pages → Cloudflare Pages) on
      push to `main`, each filtered to the paths it actually cares about
- [x] `CODEOWNERS`, `PULL_REQUEST_TEMPLATE.md`, `CONTRIBUTING.md` — conventions
      the workflows above enforce (backward-compatible migrations, an RLS
      change needs a pgTAP test in the same PR, nobody runs `db push` from a
      laptop)
- [x] `keepalive.yml` — pings both Supabase projects' PostgREST every 3 days so
      neither free-tier project auto-pauses after ~7 days of no API activity
      (pg_cron does not count; only a real HTTP request does)
- [x] Second ("dev") Supabase project provisioned — `shhgzekofcetdenwpivm` —
      so schema/RLS/function changes can be tried without touching production
- [x] `apps/mobile/scripts/with-env.sh` — chooses `.env` vs `.env.dev` by
      command rather than by which files exist, exports `LANG`/`LC_ALL` for
      CocoaPods, and can pin `RCT_USE_LOCAL_RN_DEP` at a locally-cached
      `ReactNativeDependencies` tarball as a workaround for the
      `repo.reactnative.dev` outage described below
- [x] Dev and prod app variants able to coexist on one device —
      `APP_VARIANT`-driven bundle ID / package name / scheme / icon in
      `app.config.ts` (`app.gigaway.mobile.dev`, scheme `gigaway-dev`, its own
      adaptive-icon and splash assets), needed after a bundle-ID collision with
      the existing TestFlight build caused `ApplicationVerificationFailed`
- [x] Diagnosed and worked around a live upstream outage on
      `repo.reactnative.dev` (404s on the release Hermes tarball and the
      `ReactNativeDependencies` artifact) that was crashing fresh dev-client
      installs with `dyld: Library not loaded` — fixed by re-packaging a
      previously-cached copy of the artifact and pointing
      `RCT_USE_LOCAL_RN_DEP` at it, not by any RN version change _(an RN
      0.86.2→0.86.3 upgrade was attempted first, broke on
      `expo-modules-jsi`'s Swift/Xcode 26 incompatibility, and was fully
      reverted once the real cause was found)_
- [x] `.gigaway-dev-credentials` (gitignored) — dev project ref/URL/keys, used
      for direct `psql` verification when Docker/local Supabase wasn't
      available

## Milestone 5: Ship It

- [ ] Next.js landing page (`/`, store badges) — not started
- [ ] Universal links + Android app links — not started
- [x] Publish privacy, terms, guidelines _(plus Impressum and the account-deletion
      page Google requires; done early — the Play track was blocked on the URL)_
      as a plain static site (`legal/*.md` → `scripts/build-legal.mjs` → `site/`),
      **not** the Next.js app originally scoped for this — see next item
- [x] Deploy web — **Cloudflare Pages**, not Vercel, via `deploy-web.yml` and
      `wrangler-action`. Chosen because the domain is already on Cloudflare;
      when the Next.js app above gets built it should deploy to the same host
      rather than adding Vercel as a second provider
- [x] EAS build profiles — `apps/mobile/eas.json`, three profiles
      (development/preview/production), plus the dev/prod app-variant work
      under "Infrastructure & tooling" above
- [ ] OTA channels — needs `expo-updates`, which is not installed
- [x] GitHub Actions CI — `ci.yml`, built well ahead of schedule as part of the
      branching/CI setup (see "Infrastructure & tooling" above), not as
      Milestone 5 work specifically
- [x] App icon, splash, store screenshots — icon redesigned in brass-on-ink from
      the app's own tokens, full set regenerated by `scripts/build-icons.sh`;
      8 screenshots padded to 9:16 in `store/play/screenshots/`; separate dev
      variant icon/splash added alongside
- [x] Play store listing copy and assets — `store/play/listing.md`
- [x] App Store listing (blocked on Apple Free Apps agreement / trader status)
- [ ] Upgrade Supabase to Pro
- [x] Create Resend account, verify `gigaway.app` (SPF + DKIM + DMARC, via
      Resend's Cloudflare auto-configure)
- [x] Set `RESEND_API_KEY`, `MODERATOR_EMAIL`, `VERIFICATION_EMAIL` function
      secrets on **dev** _(prod tracked in `PRODUCTION-TODO.md`)_. The single
      `RESEND_FROM` originally planned turned out wrong once
      `dispatch-notifications` was checked alongside the other three
      senders — one address can't honestly be both "moderator alert" and
      "member notification". Split into two: `MODERATOR_FROM`
      (`moderation-digest`, `submit-report`, `submit-verification`, all
      genuinely moderator-ops mail) and `NOTIFICATION_FROM`
      (`dispatch-notifications`'s offer-accepted fallback, the one
      member-facing case)
- [ ] Confirm moderation-digest returns emailed: true and the mail arrives
- [ ] Point Supabase Auth at Resend via custom SMTP
- [ ] **Send mail as `support@`/`moderation@`/`privacy@gigaway.app` from the
      dedicated Gmail account** _(deferred from Milestone 0 — see there for
      why Gmail's own SMTP-relay option can't do this)_: once the Resend
      account above exists, add its SMTP credentials (`smtp.resend.com:587`,
      user `resend`, password = API key) as a second "Send mail as" entry on
      that Gmail account — same domain, same DKIM/SPF, no new service
- [ ] Raise auth email rate limits off the shared-sender defaults
- [ ] Set site_url and redirect URLs to production (never 127.0.0.1)
- [ ] Confirmation email round trip from a production build
- [ ] Password reset round trip from a production build
- [ ] TestFlight build to beta testers
- [ ] Play closed test track live
- [ ] End-to-end smoke test on real devices

## Milestone 6: Admin Platform

Detail in `Milestone-6-Admin-Platform.md`. Reverses the "no custom admin UI"
decision from Milestone 4 — full spec, including why, is in that file.

**Status (2026-09-20): phases 1–7 built, all admin migrations applied to the
dev project, and all four admin pgTAP files (72 assertions) pass against it
via `supabase test db --linked`.** Not yet on prod, and phases 8–9 (CI/CD,
docs) are still open. Running against a real database — for the first time,
after every phase had only been dry-run — found two real bugs that nothing
earlier could have caught, both fixed in
`20260919190000_admin_grants_and_casts.sql`:

- **`revoke all on function … from public` locked nothing out.** This
  project's default privileges grant `EXECUTE` on new functions to `anon`
  and `authenticated` _directly_, not via `PUBLIC`, so a revoke from `PUBLIC`
  alone is a silent no-op. Confirmed against `information_schema
.routine_privileges`: `log_admin_action` — meant to be unreachable by any
  client — was callable by `anon`. Existing functions (`delete_account`,
  `export_user_data`) already named every role
  (`from public, anon, authenticated`); every `admin_*` revoke had shortened
  it. All 15 are now corrected and re-verified.
- **Enum casts.** `admin_set_user_status`, `admin_decide_verification` and
  `admin_decide_report` assigned a `text` parameter straight into an enum
  column; Postgres only implicitly coerces bare literals, not typed
  values. Would have failed on first real use.

Also found: several of my own test assertions read state back as the acting
admin's `authenticated` role, where RLS legitimately hides the row (a
suspended member, another member's application, and `reports`, which has no
client grant at all) — they now read as `postgres` — and a few counted
matches for a search term against a real, populated database. Neither is an
application bug, but both would have looked like one.

- [x] `admin_users`, `audit_log`, `is_admin()` + pgTAP proving the gate holds
      — `20260918150000_admin_platform_foundations.sql` +
      `supabase/tests/admin_platform.sql` (15 assertions, after the phase 7
      audit-log-names addition). **Correction:** creating the admin's Auth
      user also triggers a `profiles`/`contact_details` row like any
      signup — an admin account is not an artist account, so provisioning
      now deletes both first; the full recipe is the `admin_users` table
      comment (`20260919170000_admin_users_provisioning_note.sql`). Pushed to
      dev and pgTAP-verified — see the status note above.
- [x] Gated read functions wrapping the existing moderator views (search
      users/profiles/trips, verification queue, report queue, operational
      checks, cron status) — `20260918190000_admin_gated_reads.sql` +
      `supabase/tests/admin_gated_reads.sql` (23 assertions). Existing view
      grants stay untouched. Also adds the one storage policy this milestone
      needs (admin-only `select` on the `verification-docs` bucket, which
      never had one) and two trigram indexes for search. Pushed to dev and
      pgTAP-verified. Dropped `admin_docs_awaiting_purge` from the plan — the view it
      would have wrapped no longer exists (evidence now persists in Storage
      until account deletion rather than being purged on decision).
- [x] `apps/admin` app skeleton — Vite + React 19 + react-router-dom, theme
      ported from `apps/mobile/src/theme/tokens.ts` (CSS custom properties,
      self-hosted Lora/Ubuntu via `@fontsource`, latin/latin-ext subsets
      only), email+password login gated on `is_admin()` (a session that
      fails the check is signed out before any admin route can render), env
      banner scaffolding, placeholder routes for every later phase's page.
      Deploys as a static SPA to Cloudflare Pages, same model as `site/`.
      typecheck/lint/build all pass repo-wide; dev server smoke-tested
      (boots, serves, transforms) — **not visually verified in a real
      browser**, no browser-automation tool was available this session.
      `database.types.ts` hand-edited for every function/table Phases 1–2
      actually shipped (Milestone 1's precedent for an unpushed migration — worth re-running
      `pnpm db:types` now that the migrations are live, see
      `CLAUDE.md` before doing so). Sign-in has not yet been exercised
      against a real `admin_users` row.
- [x] Users and trips: search, detail pages — `/users` and `/trips` debounce
      a search box into `admin_search_profiles`/`admin_search_trips`
      (@tanstack/react-query), row click opens `/users/:profileId` /
      `/trips/:tripId` (`admin_get_user_detail`/`admin_get_trip_detail`);
      trip detail links back to the owner's user page. Read-only — no
      suspend/delete yet, that's phase 5. typecheck/lint/build pass
      repo-wide; dev server smoke-tested (all new routes transform and
      serve). Not yet exercised against real data through the UI.
- [x] Privileged writes — `20260918200000_admin_privileged_writes.sql`
      (`admin_set_user_status`, `admin_delete_trip`) + `supabase/tests/
  admin_privileged_writes.sql` (16 assertions); `admin-delete-user` Edge
      Function consolidates the three manual steps in `MODERATION.md`'s
      "Deleting someone" and cross-checks the confirmation text
      server-side, not just client-enabled. Suspend/reinstate is a two-step
      confirm button (reversible); both deletes require typing the exact
      name/email into `DeletePanel` first (irreversible, no backup).
      **Bug caught before it shipped:** `admin_delete_trip` originally
      cascaded straight through to a trip's stay and reviews — exactly what
      `delete_account` already goes out of its way to protect against, since
      a stay belongs to the counterparty too. It now refuses with a clear
      error if the trip produced a stay; there is no admin action for that
      case. Repo-wide typecheck/lint/test/build all pass; dev server
      smoke-tested. Pushed to dev and pgTAP-verified (16 assertions now).
      **`admin-delete-user` was not deployed until 2026-09-20** — the first
      real delete from the admin app failed with a CORS error, which was
      really a `404` on an undeployed function (the platform answers the
      preflight for a missing function without CORS headers). Deployed to
      dev with `supabase functions deploy admin-delete-user --use-api`
      after adding `supabase/functions/admin-delete-user/deno.json`, then
      every path exercised against dev: logged out → 401, non-admin → 403,
      malformed → 400, unknown id → 404, wrong confirmation → 400 with the
      target untouched, correct confirmation (name or email, any case) →
      200 with the auth user gone, profile tombstoned, application row and
      avatar/selfie/CV files removed, exactly one audit row written and
      shown with the admin's name. **Not deployed to prod.**
- [x] Verification and report queues, decided from the UI —
      `20260919150000_admin_moderation_decisions.sql` (`admin_decide_verification`,
      `admin_decide_report`) + `supabase/tests/admin_moderation_decisions.sql`
      (18 assertions); both are thin wrappers around the exact UPDATE
      MODERATION.md already documents, so the existing triggers (profile
      promotion on verification, nothing-but-a-record on reports) fire
      unchanged. `/verifications` shows the selfie/CV via signed URLs from
      the storage policy added in phase 2 — the first thing that actually
      exercises it. `/reports` surfaces `subject_prior_reports` vs
      `subject_prior_reporters` per MODERATION.md's own guidance (one
      angry counterparty isn't a pattern). Repo-wide typecheck/lint/test/
      build all pass; dev server smoke-tested. Pushed to dev and
      pgTAP-verified. **Found by using it on real data:** the three
      applications on dev (John Doe, Test, Testt) predate evidence storage
      (submitted 2026-09-18 ~14:00 UTC, before the 16:46 migration) — no
      `selfie_path`, a placeholder `cv_path`, an empty bucket; their files
      are email attachments in the `verify@gigaway.app` inbox and nowhere
      else. The page rendered blank because it ignored `createSignedUrl`'s
      `error` (it returns one rather than throwing) and its "no evidence"
      branch missed the placeholder path; it now says what's missing and
      why, and surfaces signing errors per file. The real path (admin signs
      and fetches a stored PNG/PDF; a member and a logged-out visitor are
      refused) was verified against dev with test files, since removed.
      **Still to see with your own eyes:** submit a fresh application from
      the mobile app and open it here.
- [x] **Bug: a member rejected once could never be approved** (found by
      using it, 2026-09-20). `submit-verification` reopens a rejected
      application to `pending` but never touched `profiles.status`, and
      `handle_verification_decision` only promotes a profile that is
      `pending` — so approving the reapplication flipped the application and
      left the profile `rejected`, with the admin app reporting success.
      `20260920120000_verification_reopen_and_approval_check.sql` restores
      the invariant the trigger already assumed (reopening puts the profile
      back to `pending`), repairs rows already stuck that way (one on dev),
      and makes `admin_decide_verification` fail — rolling back — if an
      approval can't actually approve the profile (suspended/deleted member)
      instead of reporting success. **Reverses one assertion in
      `tests/verification.sql`** (it expected the profile to stay `rejected`
      during re-review; what it was guarding — reopening must not silently
      re-approve — still holds). Pushed to dev; all 5 verification/admin
      files pass; the full suite shows only the 6 known empty-DB failures.
      **Not on prod yet.** Not yet re-walked on a device: reject → reapply →
      approve from the mobile app.
- [x] Operational dashboard + audit log viewer — all the SQL for this
      already existed from phase 2 (`admin_cron_status`,
      `admin_stuck_notifications`, `admin_recent_signups`), so this was
      mostly frontend: `/` now shows three cards instead of a "signed in
      as" placeholder. One SQL gap found and closed —
      `20260919160000_admin_audit_log_names.sql` joins `admin_users` into
      `admin_audit_log()` so the trail shows a name instead of a bare
      admin_id uuid (dropped and recreated, since a `setof <table>` return
      can't gain a joined column via `create or replace`; its grants are
      redone in the same migration). `/audit-log` paginates with
      `admin_audit_log`'s existing `p_before` cursor via
      `useInfiniteQuery`. Repo-wide typecheck/lint/test/build all pass; dev
      server smoke-tested. Pushed to dev and pgTAP-verified.
- [x] `admin-scripts/` — new workspace package for operator scripts that use
      the service-role key, first one `create-admin` (run `pnpm create-admin` and answer the prompts;
      creates a login,
      removes the auto-created member profile, registers it in
      `admin_users`; new accounts only, all-or-nothing, Enter at the project
      prompt means dev, typed confirmation for prod). Verified against dev
      end to end: created an admin, signed in as the admin app does,
      `is_admin()` true and admin-only functions returned data; a repeat
      run refused and changed nothing; an injected failure rolled back
      cleanly; the hidden password prompt and prod confirmation were driven
      through a real pty (which found and fixed an echo-ordering bug). All
      test accounts removed from dev. `.env.prod` is not created — add it
      yourself when a prod admin is needed.
- [x] **`functions:deploy` fixed, and the backend deploy now previews before it
      asks for approval** (2026-09-21). Current Supabase CLIs reject
      `--import-map`, so the old script would have failed _after_ prod's
      migrations were already applied. `pnpm functions:deploy` is now `sync:shared` + `scripts/sync-function-configs.mjs` (writes each function's `deno.json`
      from the single shared one; the copies are gitignored) +
      `supabase functions deploy --use-api`. Run for real against dev: all nine
      functions deployed and each one answered from its own code (not just
      bundled). `deploy-backend.yml` is now two jobs: **`preview`** (no
      approval; dry run + a plain-English review on the run's summary page via
      `scripts/summarize-pending-migrations.mjs`, which flags anything that
      drops tables/columns/rows and fails closed if it can't read the CLI's
      output) then **`deploy`** (the `production` reviewer gate, so you approve
      _after_ reading the preview; it re-checks that the pending list hasn't
      changed since, then applies migrations, then functions, with a written
      explanation on the summary page if either step fails). The CLI is pinned
      to 2.109.1 because the review tool parses its text output. Also refuses to
      run unless `SUPABASE_PROJECT_REF` is prod's. Tested by running the
      workflow's own shell steps locally with a stub CLI: secret checks, an
      unreadable dry-run failing instead of reporting "nothing pending", and
      the unchanged-since-preview guard. **Not yet run on GitHub.** Needs the
      three Supabase secrets to be _repository_ secrets (the preview runs before
      the gate, so it can't see environment-only ones) — I couldn't check
      where they live.
- [x] `deploy-admin.yml` written — dev on push to `develop`, prod on push to
      `main` behind the same `production` reviewer environment as
      `deploy-backend.yml`; each job builds, then publishes to its own Pages
      project (creating it on first run) and checks the live deployment
      (index page, a deep link, the security headers). Ahead of any build, a
      guard (`apps/admin/scripts/verify-build-env.mjs`) refuses a build whose
      key is a _secret_ key, or whose key/URL belong to the wrong project —
      each dangerous case exercised locally. `apps/admin/public/_headers`
      (no framing/sniffing/indexing) and `robots.txt` ship with the build.
      Validated locally (YAML, guard, a real build, no key in the bundle);
      **has not yet run on GitHub** — that needs the steps below.
- [ ] **To go live on dev** — (1) add repo secret
      `ADMIN_DEV_SUPABASE_ANON_KEY`; (2) commit and push to `develop`, which
      creates the `gigaway-admin-dev` Pages project and deploys it, reachable
      at its `*.pages.dev` URL immediately; (3) Cloudflare dashboard → Workers
      & Pages → gigaway-admin-dev → Custom domains → `admin-dev.gigaway.app`
      (the zone is already on Cloudflare, so it creates the DNS record).
- [ ] **To go live on prod** — needs decisions that are yours: prod is several
      migrations behind dev, including destructive ones from the
      invite-removal work, and `deploy-backend.yml` applies _all_ of them.
      Order: fix `functions:deploy` (item above) → merge `develop` to `main`
      → approve the backend deploy → add secret
      `ADMIN_PROD_SUPABASE_ANON_KEY` → approve the admin deploy → attach
      `admin.gigaway.app` → `pnpm create-admin --env prod` (needs
      `admin-scripts/.env.prod`).
- [ ] Recommended, not done: Cloudflare Access (Zero Trust) in front of both
      domains, so the login form isn't reachable by the whole internet. Deferred
      on purpose; the exact steps are in Milestone-6-Admin-Platform.md under
      "Follow-on: Cloudflare Access".
- [x] Rewrote `MODERATION.md`, `README.md`, `Project-Plan.md` to describe the
      app instead of its absence (they name `admin.gigaway.app` /
      `admin-dev.gigaway.app`, which don't resolve until the domains above
      are attached).
- [ ] Icon/favicon for the admin website's browser tab — still the default
      Vite icon.

## In progress, on other branches (not detailed here)

- `feature/artist-verification-gate` — superseded, not just parked: its ideas
  carried into the email-based verification rebuild on `develop` (Milestone 1's
  "Corrections and follow-on work" above), its mechanism did not. Isolated,
  unmerged, and safe to delete whenever it's convenient.
- `feature/hosting-credits` — separate, currently in-progress work (a credits
  system gating trip creation, earned by offering availability, plus an
  open-ended "ongoing availability" type). Not detailed here since it's still
  being built; see that branch directly for its current state.

## Ideas to discuss (not yet planned)

> Raised but not yet talked through — no decisions made, no scope defined.
> Listed here so they don't get lost, not because they're committed work.

- [ ] Chatwoot — evaluate for member/moderator support
- [ ] A web version of the mobile app — discuss feasibility and scope
- [ ] Design review
- [ ] Introduce Unit tests for the apps & frontend & backend
