# TODO — GigAway

Progress checklist. Detail lives in the `Milestone-N-*.md` files.

## Milestone 0: Launch Prerequisites

- [ ] Buy domain
- [ ] Decide public trader address (home vs business)
- [ ] Enrol in Apple Developer Program ($99/yr)
- [ ] Register Google Play developer account ($25)
- [ ] Start Google Play closed test track early
- [ ] Create Supabase project in EU (Frankfurt)
- [ ] Create Sentry, PostHog (EU), Resend accounts
- [ ] Draft privacy policy
- [ ] Draft terms of service / EULA
- [ ] Draft community guidelines
- [ ] Sign Supabase DPA, list subprocessors

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

- [ ] Trips schema + CRUD
- [ ] Availability schema + CRUD
- [ ] City picker component
- [ ] Date range picker
- [ ] search_matches SQL function
- [ ] Nearby-city fallback (haversine)
- [ ] Match screen: hosts + travellers
- [ ] Empty states that read as encouraging
- [ ] Unit tests for date overlap logic

## Milestone 3: Core Loop

- [ ] Requests schema + send request
- [ ] Offers with partial date ranges
- [ ] Proactive offers against open trips
- [ ] accept-offer Edge Function
- [ ] Co-accommodation request + accept
- [ ] contact_grants + contact reveal UI
- [ ] Push token registration
- [ ] Notifications outbox + triggers
- [ ] dispatch-notifications Edge Function
- [ ] Retry sweep + Expo receipt handling
- [ ] Email fallback on offer_accepted
- [ ] In-app Activity list

## Milestone 4: Reputation & Safety

- [ ] Stays table created on acceptance
- [ ] Review submission + would-again binary
- [ ] Double-blind release trigger
- [ ] 14-day release cron
- [ ] Review prompts after stay end
- [ ] Reviews on profile view
- [ ] Block / unblock, bidirectional invisibility
- [ ] submit-report Edge Function
- [ ] Moderator SQL views
- [ ] Suspension takes effect immediately
- [ ] export-data Edge Function
- [ ] delete-account with anonymisation

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
- [ ] TestFlight build to beta testers
- [ ] Play closed test track live
- [ ] End-to-end smoke test on real devices
