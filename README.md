# GigAway

**A couch, a colleague, a city you don't know yet.**

GigAway is an invite-only mobile app for professional performing artists —
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
is the reason anyone trusts a stranger enough to host them. Two ways through:

- **An invite from a colleague.** Every member is traceable to whoever vouched
  for them, and invites are rationed so the network cannot dilute quietly.
- **Document review.** Applicants without an invite submit evidence of
  professional standing — CV, conservatory enrolment, performance links — and a
  human reads every one. The app deliberately does not ask for ID documents.

Until a profile is approved, row-level security in Postgres returns no member
content whatsoever. The gate is in the database, not in the interface.

### The loop

A **traveller** posts a trip: destination city, dates, and what they are looking
for — a couch, local tips, coffee and company, or someone to split a room with.
They immediately see verified members in that city whose availability overlaps
those dates, and other travellers heading there in the same window.

A **host** posts availability in their home city: date ranges, what they are
offering, and any constraints.

From there — once the remaining milestones land — the traveller sends a request,
the host replies with an offer that may cover only part of the dates, and
contact details are revealed to both parties only on acceptance. Conversation
continues on WhatsApp or email; there is no chat in the app.

Afterwards both parties review each other. Reviews are attributed and
double-blind: neither is published until both are in or a fixed window expires.
A separate private channel reports safety concerns to a moderator.

### Deliberately not in v1

No payments. No in-app chat. No custom admin interface — moderation runs on the
Supabase dashboard through saved SQL views. No real-time subscriptions.

---

## Project status

Milestones 1 to 3 are code complete: 17 migrations, 178 pgTAP policy tests, 57
unit tests, typecheck and lint clean.

| Area | State |
| --- | --- |
| Auth, invite chain, document verification, profiles | Built |
| Full RLS policy set, tested per policy | Built |
| Trips and availability, create / edit / cancel | Built |
| City search and date-overlap matching, with a nearby-city fallback | Built |
| Requests, partial-night offers, acceptance, contact reveal | Built |
| Notification outbox, retry sweep, receipts, email fallback | Built |
| Push delivery on a real device | Needs an EAS build — see `TODO.md` |
| Reviews, blocking, reporting, account deletion | Not yet — Milestone 4 |
| Landing page, store builds, CI | Not yet — Milestone 5 |

So today you can sign up, get verified, build a profile, post trips and
availability, see who matches, ask a colleague for a couch, answer with an offer
covering however many nights you can manage, and — on acceptance — exchange
contact details. What you cannot yet do is review anyone or block them. Detail
lives in `TODO.md` and the `Milestone-N-*.md` files.

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
- [ ] **Docker Desktop, running** — the local Supabase stack needs it
- [ ] **Supabase CLI** — `brew install supabase/tap/supabase`
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

## 3. Start your own Supabase

The entire backend runs locally from the migrations in this repository.

- [ ] Start the stack

  ```bash
  pnpm db:start
  ```

  The first run pulls several GB of Docker images. With images cached it takes
  about three and a half minutes. It applies all 17 migrations and finishes by
  printing a block of URLs and keys — **keep that output**, you need `ANON_KEY`
  in the next step.

- [ ] Generate the shared code the Edge Functions import

  ```bash
  pnpm sync:shared
  ```

  `supabase/functions/_shared/gen/` is generated and gitignored, so a fresh
  clone does not have it and the Edge Functions will not boot without it.

What you now have:

| Service | URL |
| --- | --- |
| API | `http://127.0.0.1:54321` |
| Studio — SQL editor and table browser | `http://127.0.0.1:54323` |
| Mailpit — catches every outgoing email | `http://127.0.0.1:54324` |
| Postgres | `postgresql://postgres:postgres@127.0.0.1:54322/postgres` |

Reference data ships with the schema: expect **10,934 cities** in the `cities`
table once the stack is up. If it is empty, the migrations did not run — try
`pnpm db:reset` and watch for errors.

> The local keys are Supabase's shared demo keys. They are identical on every
> machine and are not secret. Never reuse them anywhere real.

## 4. Point the app at your stack

- [ ] Create the environment file

  ```bash
  cp apps/mobile/.env.example apps/mobile/.env
  ```

- [ ] Fill in the two values the app refuses to start without:

  ```ini
  EXPO_PUBLIC_SUPABASE_URL=http://127.0.0.1:54321
  EXPO_PUBLIC_SUPABASE_ANON_KEY=<the ANON_KEY printed by pnpm db:start>
  ```

  Leave the rest blank. Sentry and PostHog are deliberate no-ops without
  configuration, and analytics stay off unless `EXPO_PUBLIC_ANALYTICS_ENABLED`
  is exactly `true`.

Two notes on that URL:

- The **iOS simulator shares your Mac's network stack**, so `127.0.0.1` is
  correct as written.
- The **Android emulator does not**. Use `http://10.0.2.2:54321` — the
  emulator's alias for your host machine.

`src/lib/env.ts` throws on a missing URL or key rather than failing later at the
first query, so a misconfigured `.env` tells you straight away.

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

GigAway is invite-only and the wall is enforced in Postgres, so a brand new
sign-up stops at the verify screen with nothing visible behind it. That is
correct behaviour — nobody self-approves. Here is how to bootstrap past it.

Email confirmation is currently off for local development — see
`enable_confirmations` in `supabase/config.toml` — so sign-up returns a session
immediately and no mail needs to arrive. If that setting is back on by the time
you read this, the confirmation email lands in Mailpit at
`http://127.0.0.1:54324`; open it, follow the link, and carry on. Either way,
nothing leaves your machine.

- [ ] **Create your first account in the app.** *Create an account* → name,
      discipline, email, password of at least 10 characters. Use plus-addressing
      like `you+host@example.com` so you can make several. You will land on the
      verify screen.

- [ ] **Approve it by hand**, once, in Studio's SQL editor at
      `http://127.0.0.1:54323`:

  ```sql
  update public.profiles p
     set status = 'approved',
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

- [ ] **Make a second account through the real invite path.** On the home screen
      tap *Create an invite* and copy the eight-character code. Sign out, sign up
      as `you+traveller@example.com`, and enter that code on the verify screen.
      This exercises the `redeem-invite` Edge Function, which your local stack
      serves for you.

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
pnpm typecheck            # every workspace package
pnpm lint
pnpm test                 # vitest, in packages/shared
supabase test db --local  # pgTAP: 178 policy and function tests
```

The root `pnpm db:test` script targets a *linked* cloud project and is for
maintainers. Contributors want `--local`, as above.

If you change anything under `packages/shared/src`, run `pnpm sync:shared`
before touching the Edge Functions, and commit the result.

---

## Repository layout

```
apps/mobile/          Expo app
  src/app/            Expo Router routes — (auth), (onboarding), (app)
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
| Local database in a strange state | Accumulated test data | `pnpm db:reset` — reapplies migrations and reseeds |

Stop the backend with `pnpm db:stop` when you are done; your data is kept for
next time.

## Filing issues

Bugs and questions are welcome. What makes an issue easy to act on:

- Which step you were on, and what you expected instead
- Platform, Node version, and Xcode or Android Studio version
- The relevant Metro or `xcodebuild` output, not a screenshot of it
- Whether you are on local Supabase — you almost certainly are

Please do not open issues about the hosted environment. It is not part of this
repository, and nothing here depends on it.
