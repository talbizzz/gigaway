# GigAway — Project Plan

> Derived from `Project-Raw.md`. Plan agreed 13 August 2026.
> Implementation milestones are in `Milestone-N-*.md`. Progress checklist is in `TODO.md`.

---

## Technical Decisions

### Tech Stack

| Layer | Choice | Rationale |
|---|---|---|
| Mobile app | **Expo (managed) + React Native + TypeScript**, SDK 54+ | Decided in the brief. One codebase for iOS + Android; developer already fluent. |
| Build & OTA | **EAS Build + EAS Update** | EAS Update satisfies the over-the-air requirement (NFR 6); EAS Build removes local Xcode/Gradle toolchain maintenance for a solo developer. |
| Navigation | **Expo Router** (file-based) | Deep linking is close to free, and the invite flow (`https://<domain>/i/<code>` → app) is fundamentally a deep-link problem. |
| Server state | **TanStack Query** + `@supabase/supabase-js` | Caching, retries and refetch-on-focus without hand-rolling loading state on every screen. |
| Client state | **Zustand**, thin — session and local UI only | Nearly all state here is server state; a large global store would be over-engineering. |
| Forms & validation | **React Hook Form + Zod** | Zod schemas are shared with Edge Functions, giving one source of truth for payload shapes. |
| UI | Hand-built components over a design-token file; `expo-image`, `react-native-reanimated` | NFR 4 requires a native, polished feel. ~15 screens does not justify a component kit, and kits fight you on polish. |
| Dates | **date-fns** + `react-native-calendars` | Date-range overlap is the core domain primitive; keep it boring and unit-tested. |
| Backend | **Supabase** — Postgres, Auth, Storage, RLS | Decided in the brief. RLS is load-bearing: privacy rules are enforced in the database, not the client. |
| Region | **EU (Frankfurt, `eu-central-1`)** | Users are in the EU. Chosen at project creation; changing it later requires a migration. |
| Privileged logic | **Supabase Edge Functions (Deno)** — 7 total | Only for operations RLS structurally cannot express. Everything else goes direct via RLS. |
| Scheduled jobs | **`pg_cron` + `pg_net`** inside Postgres | No external worker, no extra hosting. Fallback: GitHub Actions cron hitting an Edge Function. |
| Push | **Expo Notifications + Expo Push Service**, driven by a `notifications` outbox table | Zero-infrastructure path to APNs/FCM. Outbox + retry sweep, because NFR 7 makes a missed acceptance notification a serious failure. |
| Email fallback | **Resend** free tier, `offer_accepted` only | Second channel on the one notification whose loss costs the user real money. |
| Cities | **Fixed city table seeded from GeoNames** (`cities5000`, Europe) | Matching is `city_id = city_id`. Free-text or geocoded cities silently fail to match ("München" vs "Munich"), which is fatal in a density-constrained app. Lat/lon powers the nearby-city fallback. |
| Web | **Next.js static export on Vercel** free tier | Needs `/i/[code]`, `.well-known` deep-link association files, privacy policy and terms. Static export keeps it free. |
| Error monitoring | **Sentry** (`@sentry/react-native`), EU region | Solo developer with no QA; crashes otherwise go unreported. |
| Analytics | **PostHog** EU cloud, event-only, behind a config flag | Success criteria require funnel measurement. Flag stays off until the privacy policy names PostHog. |
| Testing | **Vitest** for pure domain logic + **pgTAP** for RLS policies | RLS *is* the privacy guarantee; untested policies are the most likely way to leak a home address. No E2E in v1. |
| CI | **GitHub Actions** — typecheck, lint, Vitest, pgTAP on PR | The pgTAP gate is what stops a privacy regression shipping. |
| Package manager | **pnpm** workspaces, no Turborepo | Two apps and one shared package do not justify the extra config. |

### Deliberate non-choices

Carried over from the brief and re-confirmed: **no payments**, **no in-app chat**, **no custom admin UI** (moderation runs on the Supabase dashboard, assisted by saved SQL views), **no real-time subscriptions**.

---

## Repository Structure

**Single monorepo, pnpm workspaces.** The invite flow spans app, web and Edge Function; date-overlap logic and Zod schemas are shared between app and functions; generated database types feed both apps from one `supabase gen types` run. In a polyrepo those contracts drift silently.

```
GigAway/
├─ Project-Raw.md · Project-Plan.md · TODO.md · Milestone-*.md
│
├─ apps/
│  ├─ mobile/                     Expo app
│  │  ├─ src/
│  │  │  ├─ app/                  Expo Router routes (create-expo-app default)
│  │  │  ├─ components/           shared UI primitives
│  │  │  ├─ features/             trip/ availability/ match/ request/ review/ …
│  │  │  ├─ lib/                  supabase client, query client, analytics, push
│  │  │  └─ theme/                design tokens
│  │  ├─ app.config.ts
│  │  └─ metro.config.js          monorepo watchFolders + nodeModulesPaths
│  └─ web/                        Next.js static export
│     └─ app/  page.tsx · i/[code]/ · privacy/ · terms/ · guidelines/
│
├─ packages/
│  └─ shared/                     dependency-free TS (Zod only)
│     ├─ schemas/                 Zod request/response schemas per Edge Function
│     ├─ domain/                  dates.ts (overlap, intersect, nightCount), matching.ts
│     └─ database.types.ts        generated — do not edit by hand
│
├─ supabase/
│  ├─ migrations/                 ordered SQL; source of truth for schema + RLS
│  ├─ functions/
│  │  ├─ _shared/                 hand-written Deno helpers
│  │  ├─ _shared/gen/             COPIED from packages/shared — gitignored
│  │  ├─ redeem-invite/ · accept-offer/ · accept-co-request/
│  │  ├─ submit-report/ · delete-account/ · export-data/
│  │  ├─ dispatch-notifications/
│  │  └─ deno.json                import map
│  ├─ seed/                       local-only dev fixtures (NOT reference data —
│  │                              seeds never run in production)
│  └─ tests/                      pgTAP
│
└─ .github/workflows/ci.yml
```

### Two known frictions (decided, not open)

**Expo + monorepo.** Hoisted `node_modules` confuse Metro's resolver. Modern `expo/metro-config` handles most of it; budget ~30 minutes of `watchFolders` / `nodeModulesPaths` configuration on day one.

**Deno vs Node module resolution.** Edge Functions run on Deno, which has no `node_modules` convention and requires explicit file extensions on relative imports. Resolved by three rules:

1. `supabase/functions/deno.json` provides an import map (`"zod": "npm:zod@^3.23"`), so bare specifiers work in both runtimes.
2. All relative imports inside `packages/shared` use explicit `.ts` extensions.
3. **`pnpm sync:shared` copies `packages/shared/{schemas,domain}` into `supabase/functions/_shared/gen/` before every function deploy**, and CI verifies the copy is current. Chosen over cross-directory imports because the failure mode of the latter is a bundler error at deploy time; a `cp` has no failure modes.

---

## Architecture Overview

```
   ┌──────────────────┐              ┌─────────────────────┐
   │  Expo app        │              │  Next.js static     │
   │  iOS / Android   │              │  landing + /i/[code]│
   └────────┬─────────┘              └──────────┬──────────┘
            │                                   │ universal / app link
            │        ┌──────────────────────────┘
            │        ▼  opens app (or store, then app)
            │
    ┌───────┴────────────────────────────────────────────┐
    ▼ direct, RLS-enforced                               ▼ privileged
 ┌────────────────────────┐              ┌───────────────────────────────┐
 │ supabase-js            │              │ Edge Functions (Deno)         │
 │ select/insert/update   │              │ redeem-invite · accept-offer  │
 │ rpc('search_matches')  │              │ accept-co-request             │
 │ storage (avatars/docs) │              │ submit-report · delete-account│
 └───────────┬────────────┘              │ export-data                   │
             │                           │ dispatch-notifications (sys)  │
             │                           └───────────────┬───────────────┘
             └────────────────┬──────────────────────────┘
                              ▼
              ┌───────────────────────────────────┐
              │  Postgres — RLS on every table    │
              │  + pg_cron  + pg_net              │
              └───────┬───────────────────────────┘
                      │ trigger writes outbox row
                      ▼
         ┌────────────────────────┐   ┌──────────────┐   ┌────────┐
         │ notifications (outbox) ├──►│ Expo Push API│   │ Resend │
         └────────────────────────┘   └──────────────┘   └────────┘
                                       (email fallback: offer_accepted only)
```

### Two write paths

**Direct, RLS-enforced** — profiles, trips, availability, requests, offers, reviews, blocks, push tokens. No hand-written API layer.

**Edge Functions** — only where RLS cannot express the requirement:

| Function | Why it cannot be a plain insert |
|---|---|
| `redeem-invite` | Atomically decrements the inviter's quota, marks the code used, sets the new profile approved. A client-side race yields free invites. |
| `accept-offer` | Declines sibling offers, creates the contact grant and the `stays` row, enqueues notifications — one transaction. |
| `accept-co-request` | Same, for traveller-to-traveller co-accommodation. |
| `submit-report` | Writes to a table the reporter must never be able to read back. |
| `delete-account` | Anonymises across ~10 tables under `service_role`. |
| `export-data` | Assembles a cross-table JSON export (GDPR Art. 20). |
| `dispatch-notifications` | System-only; called by `pg_net` and `pg_cron`, talks to Expo Push and Resend. |

### RLS is the privacy boundary

- **Contact details** live in `contact_details`, separate from `profiles`. The `select` policy grants access only when the viewer owns the row or a `contact_grants` row links the two profiles. There is no code path that can "forget" to hide a phone number.
- **Member content** (trips, availability, other profiles) requires `profiles.status = 'approved'`. Pending applicants see nothing.
- **Blocks are bidirectional** and filtered in every policy; a blocked pair is mutually invisible.
- **Suspension** flips `status` and takes effect on the next query.
- **Exact home address is never stored.** Profiles carry a free-text `home_district` label only; the precise address is exchanged directly between parties off-platform after acceptance.

### Matching

`search_matches(trip_id)` is an **invoker-rights** SQL function, so RLS still applies inside it. One round trip returns three sections:

1. Hosts in the destination city with overlapping availability, ranked by overlap nights
2. Other travellers in that city in an overlapping window
3. Nearby-city hosts (haversine ≤ 100 km) when section 1 is thin

Section 3 is the designed answer to the cold-start problem — an empty result is a shorter list, not a dead end.

### Notifications

A trigger on request / offer / acceptance writes a `notifications` row. Two dispatchers read it: `pg_net` fires immediately on insert for low latency, and a `pg_cron` sweep every minute retries unsent or failed rows with backoff. Expo push receipts are checked on the following sweep; hard failures invalidate the token. For `offer_accepted` only, an unconfirmed push after ~15 minutes triggers a Resend email.

---

## Milestones

| # | Name | Goal | Depends on |
|---|---|---|---|
| 0 | Launch Prerequisites | Store accounts, legal documents, domain, service accounts — the external critical path | — (starts day 1, runs in parallel) |
| 1 | Foundations & Access | Invite link → verified account → profile, with the full RLS policy set under test | — |
| 2 | Trips & Matching | Post a trip or availability and see who is in that city on those dates | 1 |
| 3 | Core Loop | Request → offer → accept → contact revealed → both parties notified | 2 |
| 4 | Reputation & Safety | Double-blind reviews, blocks, reports, suspension, data export, account deletion | 3 |
| 5 | Ship It | Landing page, working invite deep links, published policies, CI, TestFlight + Play closed test | 1, 4 |

**Schedule note.** Milestones 1–4 are plausible in roughly one week of agent-assisted build. Milestone 5 is mostly waiting on external review. Milestone 0 determines the beta date and is therefore numbered zero — its clock starts before any code.

**The schedule risk is Milestone 1.** Auth, verification and the complete RLS policy set are the least visible and most load-bearing work in the project. If it slips, everything slips. Cut cosmetics there first, never policies.

---

## What's Out of Scope for v1

Confirmed from `Project-Raw.md`:

- Any payments, fees or money transfer
- In-app chat or real-time messaging
- A custom admin dashboard
- The services marketplace (tax help, website building, lessons, sheet music)
- The social feed / "social media for artists" layer
- Anonymous reviews of institutions, schools or teachers — **carries substantially higher legal exposure and must not ship casually; requires notice-and-takedown, identity retention, moderation capacity and legal advice**
- Public profile browsing outside a trip or availability context
- Any geography beyond the initial launch cluster
- Groups, events, or organisational accounts

Added during planning:

- Real-time subscriptions — push plus refetch-on-focus is the right fidelity for an app opened a handful of times per year
- Translated copy — strings are externalised per NFR 5, but v1 ships English-only
- E2E tests (Detox / Maestro) — not worth the setup cost in a one-week build; pgTAP covers what matters
- Proactive photo moderation — reactive via reports
- Multi-city trips and recurring availability — one city, one date range
- A verification appeals process — email the founder
- Reviews after co-accommodation — nobody hosted anybody, and "would host again" does not map onto splitting a flat

Pulled **into** v1 during planning:

- **Data export** (GDPR Art. 20) — required by NFR 2, delivered as an Edge Function returning JSON
- **In-app Activity list** — one list view over the `notifications` table; turns a missed push into a visible item
- **Co-accommodation requests** — a dedicated request → accept → contact-reveal flow between travellers, with no offer step

---

## Open Technical Risks

**Apple will require a demo account.** An invite-only app that reviewers cannot enter is rejected under Guideline 2.1. App Review notes must carry working credentials *and* a live, unexpired invite code. Commonly missed; costs a review cycle.

**Apple UGC rules (Guideline 1.2).** Social apps require block, report, a EULA, and a stated response commitment for reported content. Mechanics land in Milestone 4; the commitment text belongs in the terms.

**Google Play closed-testing requirement.** Personal developer accounts created after November 2023 must run a closed test with a minimum number of opted-in testers for 14 continuous days before production access is granted. This is a hard calendar dependency — register and start the closed track as early as possible.

**Supabase free tier pauses after ~7 days of inactivity.** For an app opened a few times a year this is a live failure mode: a user taps an invite link and the backend is asleep. Upgrade to Pro (~$25/mo) when the beta begins.

**`pg_cron` / `pg_net` availability.** The scheduled-job design assumes both extensions. Verify on day one of Milestone 1. Fallback is a GitHub Actions cron calling `dispatch-notifications` — cheap, but better discovered early.

**RLS complexity.** Every table needs policies for select / insert / update / delete across pending, approved, suspended and blocked viewers. This is where a privacy bug will come from. Mitigated by pgTAP tests written alongside the policies, not after.

**Expo push delivery is not guaranteed.** Tokens expire, devices deregister, receipts arrive asynchronously. Mitigated by the outbox, the retry sweep, the in-app Activity list, and the email fallback on acceptance.

**Density and cold start.** Not solvable in code. Mitigations designed in: request-first flow, partial-date offers, non-accommodation value, nearby-city fallback, deliberately narrow launch geography.

**Unvalidated self-funding assumption.** The highest-priority risk in the brief. Ask 5–10 working artists what fraction of their trips they pay for themselves — **before** the beta, not during. It is the cheapest possible test of the core premise.

**Apple EU trader status is public.** Enrolling as an individual publishes the trader's name, address and phone number on the store listing. For a solo founder that means a home address on a public page. Consider a business address or an entity — decided in Milestone 0.

**Solo moderation capacity.** Manual verification works at a few hundred users and breaks well before a few thousand. Not a v1 problem, but the trigger to watch.

**Review positivity skew.** Acknowledged in the brief and structural to a small professional community. The double-blind mechanism and private report channel mitigate but do not eliminate it. Do not read high ratings as strong signal.
