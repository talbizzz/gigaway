# GigAway

**A couch, a colleague, a city you don't know yet.**

GigAway is a verified-network mobile app for professional performing artists —
classical singers, instrumentalists and dancers — who travel constantly for
auditions, competitions and guest contracts. Log a trip, and the app shows you
verified colleagues in that city offering a free couch, local knowledge, or
company, plus other artists heading there the same week who might split
accommodation.

The point is money saved, not socialising. Freelance performers are routinely
underpaid and self-funding their trips, and lodging is usually the single
largest cost of a four-day competition. No money changes hands in the app.

---

## The problem

A Berlin-based mezzo-soprano has a competition in Munich and needs to be there
four days. She has never been to the city, knows nobody there, and pays full
price for a hotel on a trip that may be a net loss even if she places well.
Meanwhile, three artists in Munich have a spare couch they would happily lend a
colleague. The two sides never find each other.

Today that gap gets filled with Facebook and WhatsApp groups, which fail in
specific ways:

- **No structured search.** Finding "Munich, 3–10 March" means scrolling
  hundreds of posts.
- **No verification.** Groups contain non-artists, and there is no basis for
  trusting a stranger enough to sleep in their home or hand them your keys.
- **No reputation** that persists across trips.
- **No privacy.** Broadcasting to thousands of strangers that your flat is empty
  for four days is a real deterrent to taking part at all.

GigAway is the closed, verified, professionally accountable version of that
group, with search by city and overlapping date range.

## Who it's for

Professional and pre-professional performing artists in Europe, concentrated
initially in the German-speaking classical music world. Conservatory students
through early-to-mid-career freelancers, travelling five to twenty times a year,
in a small world where reputation carries real weight.

Both sides of the marketplace are the same people. You are a traveller on some
trips and a host in your home city on others.

---

## How it works

### Getting in

Membership is restricted to verified artists, and that wall is the product. It
is the reason anyone trusts a stranger enough to host them. There is no invite
system — every signup is reviewed by a human: a selfie holding photo ID
(against a pose specified at submission time, so an old photo can't be
reused), the legal name on that ID, and evidence of professional standing —
CV, conservatory enrolment, performance links. Uploaded straight to Storage,
retained until the applicant deletes their account, and reviewed by a
human — a short, attachment-free notice is all that goes by email.

Until a profile is approved, row-level security in Postgres returns no member
content whatsoever. The gate is in the database, not in the interface.

### The loop

A **traveller** posts a trip: destination city, dates, and what they are looking
for — a couch, local tips, coffee and company, or someone to split a room with.
They immediately see verified members in that city whose availability overlaps
those dates, and other travellers heading there in the same window.

A **host** posts availability in their home city: date ranges, what they are
offering, and any constraints.

From there the traveller sends a request, the host replies with an offer that
may cover only part of the dates, and contact details — a WhatsApp number and an
email — are revealed to both parties only on acceptance. Either side can read
the other's profile and reviews before committing, but never their contact
details. Conversation continues on WhatsApp or email; there is no chat in the
app.

Afterwards both parties review each other. Reviews are attributed and
double-blind: neither is published until both are in or a fixed window expires.
A separate private channel reports safety concerns to a moderator.

### Deliberately not in v1

No payments. No in-app chat. No real-time subscriptions.

Moderation started out on the Supabase dashboard's SQL editor and now has its
own web app, `apps/admin` (see [`MODERATION.md`](MODERATION.md)) — a separate
deployment per Supabase project, with admin accounts created by
[`admin-scripts`](admin-scripts/README.md).

---

## Project status

Milestones 1 to 4 are code complete: 26 migrations, 317 pgTAP assertions across
16 test files, 66 unit tests, typecheck and lint clean. The schema is deployed
to the hosted project — every migration applied, and the generated types match
what the app was built against.

| Area | State |
| --- | --- |
| Auth, email-based verification, profiles | Built |
| Full RLS policy set, tested per policy | Built |
| Trips and availability, create / edit / cancel | Built |
| City search and date-overlap matching, with a nearby-city fallback | Built |
| Requests, partial-night offers, acceptance, contact reveal | Built |
| Notification outbox, retry sweep, receipts, email fallback | Built |
| Push delivery on a real device | Needs an EAS build — see `TODO.md` |
| Reviews, double-blind release, blocking, reporting | Built |
| Data export and account deletion with anonymisation | Built |
| Tab navigation, profile read / edit split, contact collection | Built |
| Landing page, store builds, CI | Not yet — Milestone 5 |

So today you can sign up, get verified, build a profile, post trips and
availability, see who matches, read a colleague's profile and reviews before you
ask them for anything, ask for a couch, answer with an offer covering however
many nights you can manage, revise that offer while it is unanswered, and — on
acceptance — exchange contact details. Afterwards you can review each other, and
block or report anyone. What is left is the landing page, the store builds and
CI. Detail lives in `TODO.md` and the `Milestone-N-*.md` files.

### The loop, in the database

The parts worth knowing before reading the code:

- **Acceptance is one transaction.** `accept_offer` is a plpgsql function, not
  Edge Function code, because it has to set the offer accepted, decline every
  competing offer, close the originating request, write the contact grant and
  create the stay together or not at all. The Edge Function around it only
  authenticates and maps errors. It is idempotent — a double tap returns the
  existing stay rather than a second one.
- **Contact reveal is a row-level rule, not a screen.** The contact card asks for
  the row and shows whatever comes back; `contact_details` returns nothing until a
  `contact_grants` row links the two profiles. No client code decides whether to
  reveal a phone number.
- **Notifications are an outbox, not a push call.** Triggers write rows inside the
  transaction that caused them; `pg_net` dispatches immediately for latency and a
  `pg_cron` sweep every minute is the actual guarantee. Rows are claimed with
  `for update skip locked` and their attempt counted *before* the send, so a
  dispatcher killed mid-run loses nothing. Payloads carry IDs, names, cities and
  dates — never a phone number, an email address or a location.

## Built with

Expo SDK 57 and React Native 0.86 with TypeScript, Expo Router for file-based
navigation and deep links, TanStack Query for server state, React Hook Form with
Zod for forms. Supabase provides Postgres, Auth, Storage and Deno Edge
Functions, hosted in the EU. Scheduled work runs inside Postgres on `pg_cron`.
UI is hand-built over a design-token file rather than a component kit.

Security is enforced in the database. RLS policies decide what a member can
read, and every policy has pgTAP tests — untested policies are the most likely
way to leak someone's home address.

---

# Running it locally

Everything below runs against your own machine and your own database. You do not
need access to any GigAway infrastructure.

Work through it top to bottom. Every command here was run on a clean checkout;
where a step has a known failure mode, it says so. **Budget about 30 minutes**,
most of it waiting on the first iOS build.

## 1. Prerequisites

- [ ] **macOS with Xcode** — needed for the iOS simulator. Android works too and
      needs Android Studio instead, but iOS is the better trodden path today.
- [ ] **Node 20 or newer** — `node -v`
- [ ] **pnpm 11** — `corepack enable && corepack prepare pnpm@11.21.0 --activate`
- [ ] **Supabase CLI** — `brew install supabase/tap/supabase`. Used against the
      hosted dev project only — there is no local Supabase stack, and none is
      ever started. Docker is not needed for anything in this workflow.
- [ ] **CocoaPods** — `brew install cocoapods`

Verified working on Node 24.9.0, pnpm 11.21.0, Xcode 26.3, CocoaPods 1.16.2 and
Supabase CLI 2.109.1. Watchman is *not* required.

> CocoaPods prints a UTF-8 warning on every run unless you add
> `export LANG=en_US.UTF-8` to your shell profile. Harmless, but noisy.

## 2. Install

- [ ] Clone and install **from the repository root**

  ```bash
  git clone git@github.com:talbizzz/gigaway.git
  cd gigaway
  pnpm install
  ```

Installing from inside `apps/mobile` appears to work and then fails at the iOS
build. Two things live at the root that the app depends on:

- `nodeLinker: hoisted` in `pnpm-workspace.yaml`, which produces a flat
  `node_modules` for Metro to walk. pnpm's default symlink layout leaves
  transitive dependencies unreachable from the app.
- `patches/expo-modules-jsi@57.0.4.patch`, a one-line Swift fix
  (`abs` → `Swift.abs`) without which the iOS build does not compile.

Only a root install applies both.

## 3. Point at the development project

There is no local Supabase stack, and there is deliberately no path that
starts one — the backend is always the hosted `gigaway-dev` project (EU
Frankfurt), shared by everyone working on this repo, humans and agents alike.
There is nothing to start, stop or reset; migrations are pushed there with
`supabase db push` (`supabase link --project-ref <dev ref>` first, always —
there is a second, production project, and the CLI's link is global to the
checkout, not per-branch).

- [ ] Get the dev project's ref, URL and anon key. Ask the project owner if
      you do not already have them — they are not published in this repo.

- [ ] Generate the shared code the Edge Functions import

  ```bash
  pnpm sync:shared
  ```

  `supabase/functions/_shared/gen/` is generated and gitignored, so a fresh
  clone does not have it and the Edge Functions will not boot without it.

Reference data ships with the schema: expect **10,934+ cities** in the
`cities` table. If a query against the dev project comes back empty, something
is genuinely wrong — there is no "did the stack start" step to blame it on.

> The anon key is designed to be public and is safe only because RLS is
> enforced on every table — see the comment in `apps/mobile/.env.example`.
> The `service_role` / `sb_secret_` key is not: it must never leave the
> Supabase dashboard or a gitignored credentials file.

## 4. Point the app at the dev project

- [ ] Create the environment file — `apps/mobile/.env.dev`, not `.env`. The
      `:dev` npm scripts (below) load it via `scripts/with-env.sh`; `.env`
      is reserved for the separate production app variant.

  ```bash
  cp apps/mobile/.env.example apps/mobile/.env.dev
  ```

- [ ] Fill in the two values the app refuses to start without, using the dev
      project's real URL and anon key from step 3:

  ```ini
  EXPO_PUBLIC_SUPABASE_URL=https://<dev-project-ref>.supabase.co
  EXPO_PUBLIC_SUPABASE_ANON_KEY=<the dev project's anon key>
  ```

  Leave the rest blank. Sentry and PostHog are deliberate no-ops without
  configuration, and analytics stay off unless `EXPO_PUBLIC_ANALYTICS_ENABLED`
  is exactly `true`.

`src/lib/env.ts` throws on a missing URL or key rather than failing later at the
first query, so a misconfigured `.env.dev` tells you straight away.

## 5. Build and run

- [ ] Build the native app and install it on the simulator

  ```bash
  cd apps/mobile
  pnpm ios
  ```

  This compiles the Xcode project, installs the app, starts Metro and launches —
  one command. The first build takes several minutes. Choose a device with
  `pnpm ios --device "iPhone 17 Pro"`; list what you have with
  `xcrun simctl list devices available`.

  > **If the build hangs on `SplashScreen.storyboard`** with no output, that is
  > an `ibtool` deadlock rather than a code problem. Cancel, run
  > `killall -9 ibtoold`, and build again.

- [ ] Confirm you reach the sign-in screen.

### Afterwards, the daily loop is two commands

```bash
cd apps/mobile && pnpm start                      # terminal 1, leave running
xcrun simctl launch booted app.gigaway.mobile     # terminal 2
```

**Start Metro first.** This project does not use `expo-dev-client`, so the build
is a plain React Native debug app that looks for Metro on `localhost:8081` the
instant it launches. Launch it with no bundler running and you get a red screen
reading `No script URL provided`. Nothing recovers that screen — start Metro,
run `xcrun simctl terminate booted app.gigaway.mobile`, and launch again.

Save a file and Fast Refresh applies it in place. `⌘R` in the simulator forces a
reload, `⌘D` opens the developer menu. A cold bundle takes about 19 seconds;
reloads land in under two. You only need `pnpm ios` again after changing
`app.config.ts`, a native dependency, or the icon or splash screen.

## 6. Get an account that can see something

Every signup is verified by hand, and the wall is enforced in Postgres, so a
brand new sign-up stops at the verify screen with nothing visible behind it.
That is correct behaviour — nobody self-approves, and there is no invite code
that skips it. Here is how to bootstrap past it.

Email confirmation is currently off on the dev project — sign-up returns a
session immediately and no mail needs to arrive. If that has been turned back
on by the time you read this, the confirmation email goes to the address you
signed up with for real, since this is the same shared dev project everyone
uses — there is no local mail catcher standing in for it.

- [ ] **Create your first account in the app.** *Create an account* → name,
      discipline, email, password of at least 10 characters. Use plus-addressing
      like `you+host@example.com` so you can make several. You will land on the
      verify screen.

- [ ] **Approve it by hand**, once, in the dev project's SQL editor
      (`supabase.com/dashboard/project/<dev ref>/sql`) — see
      `scripts/dev-approve-account.sql` for the full version, kept up to
      date as the schema changes:

  ```sql
  update public.profiles p
     set status      = 'approved',
         verified_at = now()
    from auth.users u
   where u.id = p.id
     and u.email = 'you+host@example.com';
  ```

- [ ] **Reload the app** with `⌘R`. The auth gate re-reads `status` and moves
      you on.

- [ ] **Complete the profile.** The gate holds you until display name,
      discipline and home city are all set. City search matches on prefix and
      needs at least two characters — type `Ber`, not `erlin`.

- [ ] **Make a second account the same way.** Sign out, sign up as
      `you+traveller@example.com`, and approve it with the same SQL, swapping
      the email. There is no shortcut for a second account — every one goes
      through the same wall as the first.

Two accounts is the practical minimum. Matching only has something to show when
one member is travelling to a city where another is offering a couch.

## 7. Check your setup actually works

With both accounts in place:

- [ ] As the traveller, add a trip — destination city and dates
- [ ] As the host, offer a couch in that city, overlapping those dates
- [ ] Open the trip and confirm the host appears as a match
- [ ] Force-quit and reopen the app — you stay signed in, which proves the
      chunked SecureStore adapter is reading and writing the keychain correctly
- [ ] Switch the simulator to dark mode under *Settings → Developer → Dark
      Appearance*; the app follows the system scheme and every screen is
      designed for both

If all five hold, your environment is sound.

## 8. Before you open a pull request

```bash
pnpm typecheck   # every workspace package
pnpm lint
pnpm test        # vitest, in packages/shared
pnpm db:test     # pgTAP: 341 assertions across 16 files, against the dev project
```

`pnpm db:test` is `supabase test db --linked` — there is no local stack to run
it against instead, so this always runs against the real, shared dev project's
current data, not a clean slate.

> **The suite assumes an empty database**, because that's what CI's own run
> gets (CI has Docker and resets a throwaway database from scratch before
> testing; this workflow never does). Around 22 assertions across a handful
> of files use unscoped `count(*)` or `limit 1`, so they fail here even
> though CI is green — known noise against dev's accumulated data, not a
> regression. New test files should scope every query to their own fixture
> ids so they don't join that list.

If you change anything under `packages/shared/src`, run `pnpm sync:shared`
before touching the Edge Functions, and commit the result.

---

## Repository layout

```
apps/mobile/          Expo app
  src/app/            Expo Router routes — (auth), (onboarding), (app)/(tabs)
  src/features/       Data hooks and forms, grouped by domain
  src/components/     Hand-built UI primitives, no component kit
  src/lib/            Supabase client, query client, env, secure storage
  src/theme/          Design tokens; components never use raw hex
packages/shared/      Types, Zod schemas and domain logic shared with the backend
supabase/
  migrations/         The schema. The database is the source of truth
  functions/          Deno Edge Functions
  tests/              pgTAP tests, one file per policy area
scripts/              Shared-code sync, GeoNames city seed builder
```

Two conventions worth knowing before writing code:

- **Security lives in the database.** RLS decides what a member can read, and
  every policy has tests. Client-side checks are a courtesy, never the
  enforcement.
- **No raw colour values in components.** Everything visual references
  `src/theme/tokens.ts`.

## When it breaks

| Symptom | Cause | Fix |
| --- | --- | --- |
| Red screen: `No script URL provided` | App launched with no Metro on port 8081 | Start `pnpm start`, terminate the app, launch again |
| Build hangs on `SplashScreen.storyboard` | `ibtool` deadlock | `killall -9 ibtoold`, rebuild |
| Swift error on `abs` in expo-modules-jsi | Patch not applied — you installed inside `apps/mobile` | `pnpm install` at the root |
| `Unable to resolve module …` | Flat `node_modules` assumption broken, or stale cache | `pnpm install` at the root, then `pnpm start --clear` |
| Edit to `.env` changes nothing | Values are inlined when Metro starts | Restart Metro, then reload the app |
| `Port 8081 already in use` | An earlier Metro is still alive | `lsof -nP -iTCP:8081 -sTCP:LISTEN`, then `kill` the PID |
| Edge Function returns a boot error | `_shared/gen` missing | `pnpm sync:shared` |
| City search returns nothing | Under two characters, not a prefix, or not approved yet | Type more of the name from the start; check `status` on your profile |
| Everything empty after sign-in | RLS working as designed — profile not approved | Run the approval SQL in step 6 |
| Simulator wedged or stale | Corrupted install | `xcrun simctl uninstall booted app.gigaway.mobile`, then `pnpm ios` |
| Dev project data looks wrong | It's shared — someone else's test data, or your own from a previous session | Don't reset it; query what's actually there first, and see `scripts/reset-content.sql` for a scoped cleanup if you truly need one |

## Filing issues

Bugs and questions are welcome. What makes an issue easy to act on:

- Which step you were on, and what you expected instead
- Platform, Node version, and Xcode or Android Studio version
- The relevant Metro or `xcodebuild` output, not a screenshot of it
- Whether you are on local Supabase — you almost certainly are

Please do not open issues about the hosted environment. It is not part of this
repository, and nothing here depends on it.
