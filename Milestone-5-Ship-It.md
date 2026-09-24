# Milestone 5: Ship It

## Goal

The app is installable by beta testers on both platforms via TestFlight and Play's closed
track, a tapped email-confirmation or password-reset link opens the app directly on a real
phone (or completes on the web if no matching app is installed), the legal documents are
live, and CI protects the privacy policies from regression.

## Goal in one sentence for the beta

A colleague taps a link → installs → signs up verified → posts a trip → matches → accepts
an offer → stays → reviews, on a real device, with no developer intervention.

## Context

**Milestones 1–4 are complete.** The application works end to end against a local or
hosted Supabase instance. The invite system this section originally referred to is gone
entirely (Milestone 1). Email confirmation and password reset — the two flows that now
need the deep-link infrastructure below — have so far had no web page to land on and no
deep-link association; see Correction 5.

**Milestone 0 must be complete before this milestone can finish.** Apple Developer
Program active with the Free Apps agreement showing *Active*, Google Play account
approved, domain purchased, and the legal documents drafted in Markdown.

This milestone contains the least code and the most waiting. Sequence it so that anything
requiring external review is submitted first and polished while it queues.

## Scope

### In Scope

- Next.js landing page with static export, deployed to Cloudflare Pages
- ~~`/i/[code]` invite page with platform detection and store links~~ — the invite
  system this served is gone entirely; see Correction 5
- `/privacy`, `/terms`, `/guidelines` rendered from the Markdown written in Milestone 0
- Universal Links (iOS) and App Links (Android), now carrying Supabase Auth
  confirmation/recovery callbacks rather than invite codes — see Correction 5
- Expo Router deep-link handling for auth callbacks (confirmation + password recovery),
  in both cold and warm start — see Correction 5
- App icon, splash screen, adaptive icon
- EAS build profiles (`development`, `preview`, `production`) and OTA channels
- GitHub Actions CI: typecheck, lint, Vitest, pgTAP, `sync:shared` freshness check
- Store listings, screenshots, age rating, data-safety and privacy-nutrition declarations
- **Demo account and a live invite code for App Review**
- Supabase upgraded to Pro
- Production environment configuration and analytics flag enabled
- Resend account and sending-domain verification (SPF, DKIM, DMARC)
- Supabase Auth on custom SMTP, off the 2-emails-per-hour shared sender
- Auth email templates, `site_url` and redirect URLs set to production values
- TestFlight build distributed; Google Play closed test track live

### Out of Scope

- Public App Store and Play Store release — this milestone ends at closed beta
- Marketing site beyond a single page
- Web version of the app
- Localisation
- Onboarding tutorials or product tours

---

## Technical Specification

### Components to Build

#### 1. Landing page — `apps/web`

- **Responsibility:** marketing surface, invite target, legal home.
- **Stack:** Next.js App Router with `output: 'export'`, deployed to Cloudflare Pages free tier.
- **Routes:**

| Route | Purpose |
|---|---|
| `/` | What GigAway is, who it is for, store badges. One screen, no signup form. |
| `/i/[code]` | Invite landing — see below |
| `/privacy` | Privacy policy, rendered from Markdown |
| `/terms` | Terms of service / EULA |
| `/guidelines` | Community guidelines |

- **Key notes:**
  - Static export means `/i/[code]` cannot be pre-rendered per code. Use a single
    client-rendered catch-all that reads the code from the URL — it does not need to
    validate the code, only carry it.
  - **The page must not reveal who sent the invite or whether the code is valid.** That is
    an unauthenticated endpoint; validation happens in `redeem-invite` behind a JWT.
  - Copy on the legal pages comes from Milestone 0 as Markdown files committed to the repo.

#### 2. Auth callback web fallback (was: `/i/[code]` invite behaviour — superseded, see
   Correction 5)

1. If a matching app variant is installed, the universal/app link opens it directly — the
   web page is never seen. This is how Universal Links behave by design; the page does not
   need to detect or engineer this itself.
2. Otherwise (desktop, or a phone with neither app variant installed) the page renders a
   **real password-reset form**, not a store badge — it runs Supabase's JS client directly
   in the browser (CDN import, no build step) against whichever project's link was
   clicked, and completes `updateUser({ password })` using the token in the URL.
3. For a confirmation link specifically (`type=signup` rather than `type=recovery`), the
   fallback page has nothing left to complete — it just confirms and offers the store
   link.

#### 3. Deep-link association

- **iOS:** serve `/.well-known/apple-app-site-association` with no file extension and
  `Content-Type: application/json`, listing **two** app IDs on the same domain — prod's
  scoped to path `/auth/callback/*`, and the dev variant's scoped to
  `/auth/dev-callback/*`. Set `associatedDomains: ["applinks:gigaway.app"]` in
  `app.config.ts` for both variants. See Correction 5 for why both need to coexist on one
  domain rather than one file per environment.
- **Android:** serve `/.well-known/assetlinks.json` the same way — two `package_name` /
  `sha256_cert_fingerprints` entries, one per variant, each scoped to its own path. Take
  each fingerprint **from `eas credentials` for that exact profile** — a local debug
  keystore fingerprint will not match.
- Cloudflare Pages needs explicit headers configuration (a `_headers` file) so both files
  are served with the correct content type and no redirect.
- **Both files must be live before submitting a production build for review**, since
  reviewers test the link.

#### 4. Expo Router deep-link handling

- A route under the app's own auth-callback path (`/auth/callback` for prod,
  `/auth/dev-callback` for the dev variant) catches the incoming URL via Expo's
  `Linking`, extracts the session/token, and:
  - a confirmation link (`type=signup`) → establish the session, land in the app (the
    "check your email" branch already exists in `sign-up.tsx`)
  - a recovery link (`type=recovery`) → establish the recovery session, route to the new
    set-new-password screen (Correction 5)
- **Handle cold start explicitly.** A warm-start deep link arrives through a listener; a
  cold start requires reading the initial URL. Both paths must be tested — cold start is
  the one that breaks, and it is the common case here, since tapping a confirmation email
  almost always cold-starts the app.

#### 5. App identity assets

| Asset | Requirement |
|---|---|
| App icon | 1024×1024, no transparency, no rounded corners (both stores round it) |
| Adaptive icon (Android) | Foreground and background layers, safe zone respected |
| Splash screen | Simple mark on a solid background; must work in light and dark |
| Screenshots | 6.7" iPhone and 6.5" required by Apple; phone screenshots for Play |

Screenshots must show **realistic, non-identifying seeded data**. Do not use a real
artist's name, photo or travel dates in a store listing.

#### 6. EAS configuration

```jsonc
// eas.json — profiles
{
  "development": { "developmentClient": true, "distribution": "internal", "channel": "development" },
  "preview":     { "distribution": "internal", "channel": "preview" },
  "production":  { "channel": "production", "autoIncrement": true }
}
```

- OTA channels map to profiles so a `preview` update never reaches a production build.
- Verify an OTA update actually lands: publish a visible copy change to `preview`, confirm
  it appears on a test device without reinstalling. **NFR 6 is only satisfied once this is
  demonstrated, not once it is configured.**
- Record the runtime version policy — an OTA update cannot cross a native-module change.

#### 7. CI — `.github/workflows/ci.yml`

On every pull request:

1. `pnpm install --frozen-lockfile`
2. `pnpm typecheck`
3. `pnpm lint`
4. `pnpm test` (Vitest — domain logic)
5. Start Supabase locally, `supabase db reset`, run **pgTAP**
6. **`sync:shared` freshness check** — run it and fail if it produces a diff, so
   `_shared/gen/` can never be stale at deploy time

The pgTAP step is the gate that matters: it is what prevents a privacy regression from
merging.

#### 8. Store submissions

**Apple — App Store Connect:**

- Bundle ID, app record, and the **privacy nutrition labels**: contact info, user content,
  identifiers, diagnostics; declare data used for app functionality, not for tracking.
- Age rating — the honest answer for a hospitality app with UGC is **17+**.
- **App Review notes must contain:**
  - a working demo account (email and password) already `approved`
  - **a live, unexpired invite code with remaining uses** — regenerate it if the review
    cycle runs long
  - a short walkthrough: sign up → post a trip → view matches → request → accept
  - an explicit statement: *no payments occur in the app; hosting is free between members*
- Guideline 1.2 (UGC) expects: a EULA, block, report, and a stated moderation response
  commitment — all delivered in Milestone 4, referenced here.

**Google — Play Console:**

- **Data safety form** must match the privacy policy exactly. Mismatches cause rejection.
- Content rating questionnaire, target audience (adults), and the **closed testing track**
  with at least 12 opted-in testers running continuously for 14 days before production
  access is available. Start this track as early as possible.

#### 9. Production configuration

- Point the production build at the hosted Supabase project (EU Frankfurt).
- **Upgrade Supabase to Pro before distributing any build** — the free tier pauses after
  ~7 days of inactivity, and a paused backend during a beta reads as a broken app.
- Set `EXPO_PUBLIC_ANALYTICS_ENABLED=true` **only once `/privacy` is live and names
  PostHog and Sentry**.
- Deploy all Edge Functions with `pnpm sync:shared` run first; set every secret in the
  production project.
- Verify `pg_cron` jobs exist and are scheduled in production, not only locally.

---

#### 10. Email and deliverability

Until this is done the project sends auth mail through Supabase's built-in sender, which
is capped at **2 emails per hour project-wide**. Supabase's own production checklist
states that cap is only changeable by configuring custom SMTP. Twelve Play testers
signing up against it will stall on the first afternoon, so this belongs before testers
arrive, not after.

**Resend and the domain.** Create the account, add the domain, publish the DNS records.
DKIM and SPF must both verify before anything sent from that domain will land. Add a
DMARC record even though Resend does not require one — without it, Gmail and Outlook are
markedly more willing to treat a new sending domain as spam. Resend's own Cloudflare
auto-configure does all three records in one step, since the domain already lives there.

**There is no single sender identity — see "Corrections" below.** The code originally
planned one shared `RESEND_FROM`, but the Edge Functions send two genuinely different
kinds of mail (moderator-ops alerts vs. a member-facing notification fallback), so it
split into `MODERATOR_FROM` and `NOTIFICATION_FROM`.

**Custom SMTP.** Authentication → SMTP Settings, pointed at Resend's SMTP credentials.
The sender address must be on the verified domain and should match `NOTIFICATION_FROM`
— Supabase Auth's own mail (confirmations, password resets) is member-facing, the same
category as `dispatch-notifications`, not the moderator-ops one.

**Send mail as `support@` / `moderation@` / `privacy@gigaway.app`, not just receive it.**
Cloudflare Email Routing (set up in Milestone 0) only forwards inbound mail to the
dedicated Gmail account — replying from Gmail as those addresses does not work, because
Google restricts "Send through Gmail" to Workspace domains, and the SMTP-relay option in
Gmail's own UI pre-fills Cloudflare's inbound MX host, which cannot send. Once the
domain's Resend account exists for component 10 anyway, add its SMTP credentials
(`smtp.resend.com:587`, username `resend`, password = a Resend API key) as a **second**
SMTP entry under that Gmail account's "Send mail as" settings — same domain, same
verified DKIM/SPF, no new service to pay for. Deferred from Milestone 0 since inbound-only
was enough to unblock that milestone; needed before a human replies to a member as the
moderator address rather than from a personal inbox.

**Auth configuration that was never pushed.** `supabase/config.toml` describes the local
stack, not the hosted project — `supabase config push` has never been run against it, so
the cloud project is still on Supabase defaults. `site_url` in that file is
`http://127.0.0.1:3000`; pushing it verbatim would point every production confirmation
link at localhost. Set the hosted values explicitly rather than pushing wholesale. Raise
`[auth.rate_limit] email_sent` off its shared-sender default of 2 at the same time.

**Email confirmation is currently off.** It was disabled on the hosted project during
development, because the built-in sender never delivered the confirmation link and no
account could be created at all. `supabase/config.toml` records the same setting. Turning
it back on — dashboard toggle and config file together — is part of this component, and
must happen before the first outside tester signs up, not after.

**Two things that are easy to miss.** Member zero was created through the admin API with
`email_confirm: true`, so no confirmation mail was ever sent — the second real user is
the first to depend on any of this. And `moderation-digest` treats absent credentials as
success: it logs and returns `{ ok: true, emailed: false }`, so a misconfiguration here
looks exactly like a quiet week while applications pile up unreviewed. Confirm
`emailed: true` at least once rather than trusting `ok: true`.

---

### Data Model Changes

None. This milestone adds no tables.

### Environment & Configuration

| Variable | Where | Notes |
|---|---|---|
| `EXPO_PUBLIC_ANALYTICS_ENABLED` | Mobile, production | `true` only after `/privacy` is live |
| `EXPO_PUBLIC_WEB_BASE_URL` | Mobile | Production domain |
| `EXPO_PUBLIC_SUPABASE_URL` / `_ANON_KEY` | Mobile, production | Hosted project |
| `NEXT_PUBLIC_APP_STORE_URL` / `_PLAY_STORE_URL` | Web | Store links on `/i/[code]` |
| `EXPO_TOKEN` | GitHub Actions secret | For EAS builds from CI |
| All Edge Function secrets | Production Supabase | `DISPATCH_SECRET`, `RESEND_API_KEY`, `MODERATOR_FROM`, `NOTIFICATION_FROM`, `MODERATOR_EMAIL`, `VERIFICATION_EMAIL`, `SUPABASE_SERVICE_ROLE_KEY` |
| `MODERATOR_FROM` | Edge Function secret | `moderation-digest`, `submit-report`, `submit-verification` — moderator-ops mail. Must be on the Resend-verified domain |
| `NOTIFICATION_FROM` | Edge Function secret | `dispatch-notifications`'s offer-accepted fallback — the one member-facing case. Must be on the Resend-verified domain, and should match the SMTP sender below |
| SMTP host / port / user / pass | Supabase Auth settings | From Resend; these are not function secrets |
| `site_url` | Supabase Auth settings | Real domain — **not** the `127.0.0.1:3000` in `config.toml` |
| `additional_redirect_urls` | Supabase Auth settings | `https://gigaway.app/auth/callback` (prod) and `https://gigaway.app/auth/dev-callback` (dev) — Universal Links, not a bare app scheme, see Correction 5 |

---

## Implementation Order

**Front-load everything with an external clock.**

1. **Google Play closed test track** — upload any working build immediately and add
   testers. The 14-day counter starts now and runs while you do everything else.
2. **Landing page and legal pages, deployed.** Both stores need the privacy URL, and both
   `.well-known` files must be reachable before review.
3. **Deep-link association files**, verified with Apple's and Google's validators.
4. **Deep-link handling in the app**, cold start and warm start on both platforms.
5. **App icon, splash, screenshots.**
6. **EAS profiles and channels**; produce a production build.
7. **Prove OTA works** — publish a visible change and see it land on a device.
8. **Production Supabase setup:** Pro upgrade, secrets, function deploy, cron verification.
9. **Resend account and domain verification.** Publish the DNS records early — propagation
   is hours, not minutes, and every other email task waits on it.
10. **Custom SMTP and auth email configuration.** Point Supabase Auth at Resend, raise the
    rate limits off the 2/hour cap, set `site_url` and redirect URLs to production. **Do
    this before any tester exists**, or onboarding stalls on the first afternoon.
11. **CI workflow.** Later than ideal, but it protects the maintenance phase.
12. **Create the demo account and a long-lived invite code for review.**
13. **Submit to TestFlight**, then to Play closed testing.
14. **Full end-to-end smoke test on real devices**, ideally two people on two platforms.

## Done Criteria

- [ ] `https://<domain>/` is live and describes the product
- [ ] `/privacy`, `/terms` and `/guidelines` are live and reachable without JavaScript
- [ ] `/.well-known/apple-app-site-association` serves as `application/json`, no redirect
- [ ] `/.well-known/assetlinks.json` carries the SHA-256 of the **EAS signing certificate**
- [ ] Tapping a confirmation or recovery link with the matching app variant installed
      opens the app directly on both platforms
- [ ] The same link **cold-starts** the app to the right screen (straight into the app for
      confirmation, the set-new-password screen for recovery)
- [ ] Without a matching app variant installed (including from a desktop), the link opens
      a working web page that completes the password reset for real
- [ ] An OTA update published to `preview` appears on a device without reinstalling
- [ ] CI runs typecheck, lint, Vitest, pgTAP and the `sync:shared` freshness check on PRs
- [ ] CI fails when a deliberately broken RLS policy is pushed *(verify this once)*
- [ ] Supabase is on Pro and will not pause
- [ ] All Edge Functions are deployed to production with secrets set
- [ ] `pg_cron` jobs are scheduled and running in the production project
- [ ] Analytics is enabled and `/privacy` names PostHog, Sentry, Expo, Resend and Cloudflare Pages
- [ ] TestFlight build installs on a device that is not the developer's
- [ ] Play closed test track is live with 12+ testers opted in
- [ ] Demo account plus a live invite code are in App Review notes
- [ ] **Full loop completed by two real people on two real devices:** invite link →
      verified account → trip → match → request → offer → accept → contact revealed →
      push received → review submitted → reviews published
- [ ] Sending domain shows DKIM and SPF verified in Resend; a DMARC record exists
- [ ] A test send from the domain lands in a Gmail inbox, not its spam folder
- [ ] Supabase Auth uses custom SMTP; the 2-emails-per-hour cap no longer applies
- [ ] `RESEND_API_KEY`, `MODERATOR_FROM`, `NOTIFICATION_FROM`, `MODERATOR_EMAIL` and
      `VERIFICATION_EMAIL` are set on the project
- [ ] `moderation-digest` returns `emailed: true` and the mail actually arrives
- [ ] Email confirmation is switched back on (Authentication → Sign In / Providers, and
      `enable_confirmations` in `supabase/config.toml`)
- [ ] A new account created through the app receives its confirmation email
- [ ] The confirmation link resolves to the production domain, never `127.0.0.1`
- [ ] Password reset completes end to end from a production build
- [ ] A test report reaches the moderator email from a production build
- [ ] Account deletion works from a production build

## Corrections made during implementation

Recorded so the next agent reads a plan that matches the code. This milestone is still in
progress — most components below (invite landing page, deep links, store submissions) are
not built yet — but some infrastructure work landed earlier than planned, and one hosting
choice changed.

1. **Legal pages are live, but as a plain static site, not the Next.js app in component 1.**
   `legal/*.md` (privacy policy, terms, community guidelines, impressum, account deletion)
   renders through `scripts/build-legal.mjs` (no framework, on purpose — "four HTML files
   that any static host serves") into `site/`, deployed by `.github/workflows/deploy-web.yml`
   on every push to `main` that touches `legal/**`. This satisfies the store-submission
   requirement for a live privacy policy URL well ahead of schedule, but it is **not** the
   full landing page: there is no `/`, no `/i/[code]` invite handling, no deep-link
   association files, and no store badges yet. Components 2–4 remain to be built, and when
   they are, the Next.js app should deploy to the same host as the legal pages rather than
   introducing Vercel as a second provider — see the next point.
2. **Hosting is Cloudflare Pages, not Vercel.** Every "Vercel" reference in this document has
   been updated to Cloudflare Pages. This followed naturally from the domain already being
   on Cloudflare (Milestone 0) and from standardising the deploy tooling around
   `wrangler-action` rather than adding a second hosting account for one static site.
3. **CI landed much earlier than "Implementation Order" step 11 suggests**, as part of
   setting up branch and PR conventions rather than as Milestone 5 work specifically:
   `.github/workflows/ci.yml` runs typecheck, lint, `pnpm test`, a local Supabase reset with
   pgTAP, and the `sync:shared` freshness check, matching component 7 almost exactly as
   planned. Two workflows beyond the original scope came with it: `deploy-backend.yml`
   (path-filtered to `supabase/migrations/**`, `supabase/functions/**` and
   `packages/shared/src/**`, gated behind a required-reviewer `production` environment
   before `db push --linked` runs for real) and `deploy-web.yml` (the legal-pages deploy
   above). `CODEOWNERS`, `PULL_REQUEST_TEMPLATE.md` and `CONTRIBUTING.md` were added
   alongside these to document the conventions the workflows enforce.
4. **`RESEND_FROM` split into `MODERATOR_FROM` and `NOTIFICATION_FROM`.** The single shared
   sender planned throughout this document turned out not to fit once all four
   Resend-sending functions were considered together: `moderation-digest`, `submit-report`
   and `submit-verification` are all moderator-ops alerts, but `dispatch-notifications`'
   offer-accepted fallback is member-facing — a "your offer was accepted" email from
   `moderation@gigaway.app` reads wrong. `MODERATOR_FROM` (default
   `GigAway <moderation@gigaway.app>`) covers the first three; `NOTIFICATION_FROM`
   (default `GigAway <notifications@gigaway.app>`) covers the fourth, and is what
   Supabase Auth's SMTP sender should match too, since auth mail is member-facing as
   well. Both are set on dev as of 2026-09-18; prod is tracked in `PRODUCTION-TODO.md`.
5. **The deep-link mechanism (components 2–4) now carries Supabase Auth callbacks, not
   invite codes — the invite system it was originally scoped around is gone entirely**
   (Milestone 1's "Corrections and follow-on work"). The Universal Links / App Links
   mechanics in component 3 are still needed and still correct as written
   (AASA/assetlinks, Cloudflare headers, the iOS-caches-the-association-file gotcha in
   Known Risks) — only the purpose and the payload changed. Scoped 2026-09-24, not yet
   built.

   - **Sender chosen for Auth's own SMTP: `noreply@gigaway.app`**, not
     `notifications@gigaway.app` as originally suggested above — a deliberate choice, not
     an inconsistency with it. Doesn't need a Cloudflare Email Routing rule, since nothing
     should ever reply to it.
   - **Two new mobile screens**, since password reset had no UI at all before this: a
     "forgot password?" request screen calling `resetPasswordForEmail`, and a set-new-
     password screen calling `updateUser`. Confirmation already has its landing behaviour
     — `sign-up.tsx` already branches on whether `signUp()` returns a session — it only
     needs the deep-link listener below to actually catch the incoming link; today it
     opens the app to nothing in particular.
   - **A deep-link listener (Expo's `Linking`)**, since none exists yet anywhere in the
     app. Catches the incoming `https://gigaway.app/auth/...` URL, extracts the
     session/token, and routes: confirmation lands straight in the app, recovery routes to
     the new set-new-password screen.
   - **Path-scoped associated domains, not one file per environment.** Both app variants
     (prod and `.dev`) stay installed side by side on the same physical test device
     (Milestone 0's "Infrastructure & tooling"), so a bare `gigaway.app` domain claimed by
     both would leave the OS no reliable way to decide which app should open a given link.
     The association files instead list two app IDs on the same domain, each scoped to its
     own path — prod on `/auth/callback/*`, dev on `/auth/dev-callback/*` — and each
     Supabase project's `redirectTo` points at its own path accordingly.
   - **The web fallback does a real password reset, not a store-badge page.** Component
     2's original job — show a store badge when the app isn't installed — doesn't fit an
     auth callback: someone resetting their password from a desktop email client needs to
     actually finish the reset, not be told to go install a phone app. The fallback page
     runs Supabase's JS client directly in the browser (CDN import, no build step) against
     whichever project's link was clicked; this is new infrastructure, not part of the
     `legal/*.md` → static-site pipeline, since that path is Markdown-only.
   - **Sequenced dev-first**, consistent with everywhere else in this project. Build and
     prove the whole round trip — confirmation email → tap → lands in app; request reset →
     tap → set new password; the same link opened on a desktop → web form completes it —
     against the dev Supabase project and a fresh dev-client build (the native
     associated-domains entitlement can't be tested without one) before extending the
     association files to the prod app ID and flipping `enable_confirmations` on for prod.

## Known Risks & Watch-Outs

- **`assetlinks.json` fingerprint mismatch** is the most common Android deep-link failure.
  Take the SHA-256 from `eas credentials` for the exact profile you are shipping — a local
  debug keystore fingerprint will not match.
- **Cloudflare Pages may serve `apple-app-site-association` with the wrong content type or
  a redirect.** Apple follows no redirects and requires `application/json`. Configure
  headers explicitly and test with `curl -I`.
- **iOS caches the association file.** Changes may take a device reinstall or several hours
  to take effect. Test on a freshly installed build.
- **App Review will reject an app they cannot get into** (Guideline 2.1). There is no
  invite code any more — the demo account has to be pre-approved (`status = 'approved'`
  set by hand, same as the dev bootstrap in `scripts/dev-approve-account.sql`) so
  reviewers land straight in the app, not on the verify screen. Confirm it is still
  approved and not suspended before every submission — nothing expires it automatically,
  but it is also the one account that must never be allowed to fall out of that state.
- **The Play data safety form must match the privacy policy.** Discrepancies are a common
  rejection cause and cost a full review cycle.
- **Google's 14-day closed test cannot be compressed.** If it has not been started, it is
  a hard two-week wall between here and public launch.
- **Turning analytics on before the policy is live** is the exact compliance gap the flag
  exists to prevent. Order matters: publish, then flip.
- **Do not skip the OTA verification.** A misconfigured channel means your ability to hot-
  fix during the beta silently does not exist — and you will discover it during an
  incident.
- **A brand-new sending domain has no reputation.** The first few hundred messages are the
  ones most likely to be filtered. Send the test traffic before the testers arrive, not
  alongside them.
- **Pushing `config.toml` wholesale** points production auth links at `127.0.0.1:3000` and
  silently breaks every confirmation email. Set the hosted values explicitly.
- **The digest's silent-success behaviour** means a mail misconfiguration is invisible —
  `ok: true` with `emailed: false` looks like a quiet week, not a fault.
- **Store review timing is not under your control.** Submit early, polish while queued,
  and expect at least one rejection cycle.
