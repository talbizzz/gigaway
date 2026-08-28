# TODO — GigAway

Progress checklist. Detail lives in the `Milestone-N-*.md` files.

## Milestone 0: Launch Prerequisites

- [ ] Buy domain
- [ ] Decide public trader address (home vs business)
- [ ] Enrol in Apple Developer Program ($99/yr)
- [ ] Register Google Play developer account ($25)
- [ ] Start Google Play closed test track early
- [x] Create Supabase project in EU (Frankfurt) — `gigaway`, ref `hrhoqmmxgfpyxwncmpjx`, eu-central-1
- [x] Deploy the schema to it — all 26 migrations applied 2026-08-28, generated types match
- [ ] Create Sentry, PostHog (EU) accounts *(Resend moved to Milestone 5)*
- [ ] Draft privacy policy
- [ ] Draft terms of service / EULA
- [ ] Draft community guidelines
- [ ] List subprocessors in the privacy policy *(the DPA is incorporated into Supabase's ToS — nothing separate to sign)*

## Milestone 1: Foundations & Access

> ✅ Code complete. 10 migrations, 58 pgTAP tests, 11 unit tests, typecheck and
> lint clean. Invite link → verified account → profile works end to end against
> the real API. `pg_cron`/`pg_net` confirmed, so the scheduled-job design holds.
>
> ⚠️ Two Done Criteria remain unverified because they need hardware or an
> account this machine does not have — see "Outstanding" below.
> Plan corrections made during implementation are recorded in the milestone file.

- [x] Scaffold pnpm monorepo + Expo app
- [x] Verify pg_cron / pg_net availability
- [x] Seed cities table from GeoNames
- [x] Auth: email sign-up and sign-in
- [x] Profiles schema + verification state machine
- [x] Invite generation with per-user quota
- [x] redeem-invite Edge Function
- [x] Document verification submission flow
- [x] Delete docs on decision + 90-day backstop
- [x] Moderator nudge job at 3 days
- [x] Full RLS policy set
- [x] pgTAP tests for every policy
- [x] Profile create / edit screens + avatar upload
- [x] Sentry + PostHog behind flag
- [x] Moderator SQL views

**Outstanding before Milestone 1 can be called done:**

- [ ] Run the app on a real device / simulator and walk the whole flow
      (needs an EAS dev build — Expo Go cannot load secure-store or the pickers)
- [ ] Confirm Sentry receives a thrown test error (needs a DSN from Milestone 0)

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

**Outstanding (same blocker as Milestone 1):**

- [ ] Walk the flow on a real device / simulator (needs an EAS dev build)

## Milestone 3: Core Loop

> ✅ Code complete. 6 new migrations, 194 pgTAP tests, 57 unit tests, 54 end-to-end
> checks against a live stack. Typecheck, lint and iOS bundle clean.
> Request → offer → accept → contact revealed works end to end, including the
> partial-range offer, the sibling auto-decline and the idempotent double-accept.
>
> ⚠️ Three Done Criteria remain unverified because they need hardware or an
> account this machine does not have — see "Outstanding" below.
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
- [x] Host-side discovery of open trips *(added — the proactive offer path had
      no way to find a trip; see the milestone file)*
- [x] Expiry sweep, and a date guard in the acceptance path *(added — the
      acceptance path had no date check, so a stale offer could be accepted
      into a backdated stay; see the milestone file)*

**Outstanding before Milestone 3 can be called done:**

- [ ] Push arriving on a real device for request, offer and acceptance
      (needs an EAS dev build with APNs and FCM credentials — remote push does
      not work in Expo Go, and this is the same blocker as Milestones 1 and 2)
- [ ] Confirm the offer_accepted fallback email actually sends
      (the claim-and-stamp logic is under pgTAP, but the Resend call needs
      RESEND_API_KEY, which arrives in Milestone 5)
- [ ] Walk the request → offer → accept → contact flow on a device or simulator

## Milestone 4: Reputation & Safety

> ✅ Code complete. 6 new migrations, 322 pgTAP assertions across 14 test files,
> typecheck and lint clean. Blocking, reviews, reporting, moderator views, data
> export and account deletion are all built and covered.
> Auditing the earlier policies before switching `is_blocked()` on found three
> that never called it — see the milestone file.
>
> ⚠️ Outstanding items below need hardware, an account or a live stack this
> machine does not have.

- [x] Stays table created on acceptance *(built in Milestone 3)*
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

- [ ] Walk review, block, report, export and delete on a device or simulator
      (same EAS dev build blocker as Milestones 1–3)
- [ ] Confirm a report reaches `MODERATOR_EMAIL` within a minute
      (needs RESEND_API_KEY and MODERATOR_EMAIL, which arrive in Milestone 5)
- [ ] Add a pgTAP test asserting a co-accommodation match is never reviewable
      *(holds by construction today — `accept_co_request` creates a contact grant
      and never a stay, and reviews hang off stays — but nothing asserts it, so a
      future change to that path could silently break the guarantee)*

## After Milestone 4: corrections from walking the app

> Not a planned milestone. These came out of using the product end to end and
> finding places where the interface allowed something the brief did not, or
> asked for something it had no way to collect. Two carry migrations, both
> applied. Corrections that change an earlier milestone's plan are recorded in
> that milestone's file.

- [x] Tab bar for home, profile and settings, replacing the ghost buttons at the
      foot of the home screen *(supersedes Milestone 3's note that there is no
      tab navigator)*
- [x] Sign out moved into Settings, beside account deletion
- [x] Profile split into a read view and an edit form — it opened straight into
      an editable form with no way to see yourself as others do
- [x] Save disabled until something actually changes
- [x] Home city could never be changed — one `null` meant both "untouched" and
      "cleared", so the picker always fell back to the stored city
- [x] WhatsApp number collected and required, stored E.164, revealed with the
      email on acceptance *(there was no screen to enter one, so the reveal
      screen's WhatsApp row could never show anything)*
- [x] Profiles readable from every match card before asking or offering, with
      the ask / offer action carried onto the profile
- [x] Initials placeholder where a member has no photo *(the empty circle was
      `bgRaised`, which is white in the light theme — invisible, not blank)*
- [x] One live offer per host per trip, enforced by a partial unique index
      *(a host could answer the same request twice and leave two overlapping
      offers; the traveller could accept either)*
- [x] Revising an unanswered offer, which replaces answering twice
- [x] Traveller notified when an offer's nights change

**Outstanding:**

- [ ] Walk all of the above on a device or simulator — none of it has run
      anywhere but a bundler *(same EAS dev build blocker as Milestones 1–4)*
- [ ] Re-run `offer_revision.sql` to confirm the two assertions corrected after
      the first live run *(the migration behaviour was right; the test's
      expectations were not)*
- [ ] Decide what to do about the pgTAP suite assuming an empty database — ~22
      assertions across 6 files use unscoped `count(*)` and `limit 1`, so they
      fail against the cloud project's dev data. Known noise, not regressions.
      Either scope them to their fixtures or run them on a preview branch.

## Milestone 5: Ship It

- [ ] Next.js landing page
- [ ] /i/[code] invite page
- [ ] Universal links + Android app links
- [ ] Publish privacy, terms, guidelines
- [ ] Deploy web to Vercel
- [ ] EAS build profiles + OTA channels
- [ ] GitHub Actions CI
- [ ] App icon, splash, store screenshots
- [ ] Store listings + demo account for review
- [ ] Upgrade Supabase to Pro
- [ ] Create Resend account
- [ ] Verify sending domain (SPF + DKIM, plus a DMARC record)
- [ ] Set RESEND_API_KEY, RESEND_FROM, MODERATOR_EMAIL function secrets
- [ ] Confirm moderation-digest returns emailed: true and the mail arrives
- [ ] Point Supabase Auth at Resend via custom SMTP
- [ ] Raise auth email rate limits off the shared-sender defaults
- [ ] Set site_url and redirect URLs to production (never 127.0.0.1)
- [ ] Confirmation email round trip from a production build
- [ ] Password reset round trip from a production build
- [ ] TestFlight build to beta testers
- [ ] Play closed test track live
- [ ] End-to-end smoke test on real devices
