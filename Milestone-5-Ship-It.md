# Milestone 5: Ship It

## Goal

An invite link sent over WhatsApp opens the app on a real phone, the app is installable by
beta testers on both platforms, the legal documents are live, and CI protects the privacy
policies from regression.

## Goal in one sentence for the beta

A colleague taps a link → installs → signs up verified → posts a trip → matches → accepts
an offer → stays → reviews, on a real device, with no developer intervention.

## Context

**Milestones 1–4 are complete.** The application works end to end against a local or
hosted Supabase instance. Invite codes have so far been entered by pasting them, because
there was no web page to link to and no deep-link association.

**Milestone 0 must be complete before this milestone can finish.** Apple Developer
Program active with the Free Apps agreement showing *Active*, Google Play account
approved, domain purchased, and the legal documents drafted in Markdown.

This milestone contains the least code and the most waiting. Sequence it so that anything
requiring external review is submitted first and polished while it queues.

## Scope

### In Scope

- Next.js landing page with static export, deployed to Vercel
- `/i/[code]` invite page with platform detection and store links
- `/privacy`, `/terms`, `/guidelines` rendered from the Markdown written in Milestone 0
- Universal Links (iOS) and App Links (Android) so invites open the app directly
- Expo Router deep-link handling for `/i/[code]` in both cold and warm start
- App icon, splash screen, adaptive icon
- EAS build profiles (`development`, `preview`, `production`) and OTA channels
- GitHub Actions CI: typecheck, lint, Vitest, pgTAP, `sync:shared` freshness check
- Store listings, screenshots, age rating, data-safety and privacy-nutrition declarations
- **Demo account and a live invite code for App Review**
- Supabase upgraded to Pro
- Production environment configuration and analytics flag enabled
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
- **Stack:** Next.js App Router with `output: 'export'`, deployed to Vercel free tier.
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

#### 2. `/i/[code]` behaviour

1. If the app is installed, the universal/app link opens it directly — the web page is
   never seen.
2. Otherwise the page renders: a short explanation, the store badge for the detected
   platform, and the code displayed prominently so it can be copied manually.
3. Store the code in `localStorage` and append it to the store link where supported. **Do
   not rely on deferred deep linking** — it is unreliable across platforms and store
   redirects. The fallback is always "here is your code, paste it in the app."
4. Show both store badges when the platform cannot be detected.

#### 3. Deep-link association

- **iOS:** serve `/.well-known/apple-app-site-association` with no file extension and
  `Content-Type: application/json`, containing the team ID and bundle ID with path
  `/i/*`. Set `associatedDomains: ["applinks:<domain>"]` in `app.config.ts`.
- **Android:** serve `/.well-known/assetlinks.json` with the package name and the SHA-256
  fingerprint **of the certificate EAS actually signs with** — take it from
  `eas credentials`, not from a local debug keystore.
- Vercel needs explicit headers configuration so both files are served with the correct
  content type and no redirect.
- **Both files must be live before submitting builds for review**, since reviewers test
  the link.

#### 4. Expo Router deep-link handling

- Route `/i/[code]` in the app extracts the code and:
  - if signed out → sign-up flow with the code pre-filled
  - if signed in and `pending` → straight to redemption
  - if signed in and `approved` → a friendly "you're already a member" screen
- **Handle cold start explicitly.** A warm-start deep link arrives through a listener; a
  cold start requires reading the initial URL. Both paths must be tested — cold start is
  the one that breaks, and it is the common case for a first-time user.

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
| All Edge Function secrets | Production Supabase | `DISPATCH_SECRET`, `RESEND_API_KEY`, `RESEND_FROM`, `MODERATOR_EMAIL`, `SUPABASE_SERVICE_ROLE_KEY` |

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
9. **CI workflow.** Later than ideal, but it protects the maintenance phase.
10. **Create the demo account and a long-lived invite code for review.**
11. **Submit to TestFlight**, then to Play closed testing.
12. **Full end-to-end smoke test on real devices**, ideally two people on two platforms.

## Done Criteria

- [ ] `https://<domain>/` is live and describes the product
- [ ] `/privacy`, `/terms` and `/guidelines` are live and reachable without JavaScript
- [ ] `/.well-known/apple-app-site-association` serves as `application/json`, no redirect
- [ ] `/.well-known/assetlinks.json` carries the SHA-256 of the **EAS signing certificate**
- [ ] Tapping an invite link with the app installed opens the app directly on both platforms
- [ ] The same link **cold-starts** the app to the invite screen with the code pre-filled
- [ ] Without the app installed, the link shows the store badge and a copyable code
- [ ] An OTA update published to `preview` appears on a device without reinstalling
- [ ] CI runs typecheck, lint, Vitest, pgTAP and the `sync:shared` freshness check on PRs
- [ ] CI fails when a deliberately broken RLS policy is pushed *(verify this once)*
- [ ] Supabase is on Pro and will not pause
- [ ] All Edge Functions are deployed to production with secrets set
- [ ] `pg_cron` jobs are scheduled and running in the production project
- [ ] Analytics is enabled and `/privacy` names PostHog, Sentry, Expo, Resend and Vercel
- [ ] TestFlight build installs on a device that is not the developer's
- [ ] Play closed test track is live with 12+ testers opted in
- [ ] Demo account plus a live invite code are in App Review notes
- [ ] **Full loop completed by two real people on two real devices:** invite link →
      verified account → trip → match → request → offer → accept → contact revealed →
      push received → review submitted → reviews published
- [ ] A test report reaches the moderator email from a production build
- [ ] Account deletion works from a production build

## Known Risks & Watch-Outs

- **`assetlinks.json` fingerprint mismatch** is the most common Android deep-link failure.
  Take the SHA-256 from `eas credentials` for the exact profile you are shipping — a local
  debug keystore fingerprint will not match.
- **Vercel may serve `apple-app-site-association` with the wrong content type or a
  redirect.** Apple follows no redirects and requires `application/json`. Configure headers
  explicitly and test with `curl -I`.
- **iOS caches the association file.** Changes may take a device reinstall or several hours
  to take effect. Test on a freshly installed build.
- **App Review will reject an invite-only app they cannot enter** (Guideline 2.1). The
  demo account and invite code are not optional, and the code must still be valid when
  they get to it — a 30-day expiry can lapse mid-cycle. Consider a dedicated
  high-`max_uses`, long-expiry review code.
- **The Play data safety form must match the privacy policy.** Discrepancies are a common
  rejection cause and cost a full review cycle.
- **Google's 14-day closed test cannot be compressed.** If it has not been started, it is
  a hard two-week wall between here and public launch.
- **Turning analytics on before the policy is live** is the exact compliance gap the flag
  exists to prevent. Order matters: publish, then flip.
- **Do not skip the OTA verification.** A misconfigured channel means your ability to hot-
  fix during the beta silently does not exist — and you will discover it during an
  incident.
- **Store review timing is not under your control.** Submit early, polish while queued,
  and expect at least one rejection cycle.
