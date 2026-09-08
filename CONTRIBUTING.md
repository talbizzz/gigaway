# Contributing to GigAway

How we work. Read the four rules — they exist because this repo can break
things that a normal web app cannot.

---

## Branches

```
feature/*  →  PR  →  develop      CI must be green
develop    →  PR  →  main         this PR is the release
main       →  tag  mobile-v0.1.0  marks what went to the stores
```

- **`develop`** is the default branch. Integration. Nothing deploys from it.
- **`main`** is production. A merge here deploys the backend and the website.
- **`feature/*`** branches are short-lived and cover one concern.

`main` is protected: no direct pushes, PR required, CI required.

Squash-merge into `develop` to keep the history readable. Use a real merge
commit for `develop` → `main`, so the release is visible in the history.

---

## The four rules

### 1. Migrations must stay compatible with the oldest app in the wild

The backend deploys in seconds. Mobile takes days — store review, then users
choosing whether to update. **You cannot force an update.**

So a migration that drops a column, renames one, or tightens an RLS policy
breaks apps already on people's phones, and there is no rollback.

**Additive only.** Add the new column, ship an app that uses it, and remove the
old one a release later, once nobody is running the old build. Check the
`mobile-v*` tags to see what is still out there.

### 2. An RLS change needs a pgTAP test in the same PR

The README says the gate is in the database, not the interface. That makes
`supabase/migrations/` the security boundary: a wrong policy is a data breach,
not a bug.

There are 322 assertions today. **That number never goes down.**

### 3. `packages/shared/src/schemas/` is a public API

28 mobile files and 7 Edge Functions import it. Those schemas are the contract
between an app already installed on a phone and a function you are about to
deploy. Changing one is a breaking change to a running system — treat it like
a published package, not internal code.

### 4. Nobody runs `db push` from a laptop

Deploys happen in CI, from `main`. `supabase db push` is instant, hits
production, and **there are no backups** — the project is on the free tier.

For the same reason, any destructive SQL gets a dry-run `SELECT` first and runs
inside `BEGIN … COMMIT` so it can be rolled back after inspection.

---

## No staging environment

There is one Supabase project, and the org is at the free-tier project limit.
There is no local stack either. **A migration is unverified until it reaches
production.**

Which makes the pgTAP job in CI the only pre-production check on a migration.
It runs against a fresh local Supabase in the workflow, so the database is
empty by construction — that is also why the suite can use unscoped `count(*)`
in CI without the false failures it produces against the live project.

If the team grows enough to justify $25/month, a second Supabase project as
staging is the single biggest upgrade available to this setup.

---

## Getting set up

```bash
pnpm install
cp apps/mobile/.env.example apps/mobile/.env   # then fill it in
```

You will need, from whoever runs the project:

| What | Where it lives |
|---|---|
| The 7 `EXPO_PUBLIC_*` values | `apps/mobile/.env` — see `.env.example` |
| Supabase project access | An invite to the `gigaway` project |
| EAS access | An invite to the `@talbiz/gigaway` Expo project |

Two Vault secrets (`edge_function_base_url`, `edge_function_service_key`) are
set once per project and are not part of local setup. If the scheduled jobs go
quiet, check those first — `call_edge_function` only warns when a secret is
missing, so a wrong value fails silently.

---

## Commands

| | |
|---|---|
| `pnpm typecheck` | Types across the workspace |
| `pnpm lint` | ESLint |
| `pnpm test` | Unit tests (vitest) |
| `pnpm db:test` | pgTAP against the linked project |
| `pnpm db:types` | Regenerate `database.types.ts` from the live schema |
| `pnpm sync:shared` | Copy shared code into `supabase/functions/_shared/gen/` |
| `pnpm build:legal` | Render `legal/*.md` into `site/` |
| `./scripts/build-icons.sh` | Regenerate the icon set and feature graphic |

After any migration, run `pnpm db:types` and commit the result — the generated
types are consumed by both the app and the Edge Functions.

---

## Pull requests

Keep them small and single-purpose. The template asks a few questions; the ones
about migrations and RLS are the ones that matter.

A PR that touches `supabase/migrations/` should say in the description **which
app versions remain compatible**. If the answer is "none", it is not ready.

---

## Releasing

**Backend and website** deploy automatically when `develop` merges to `main`,
path-filtered so each pipeline fires only for its own files.

**Mobile** is manual, because it costs build minutes and store review:

```bash
cd apps/mobile
npx eas-cli build --platform android --profile production
npx eas-cli build --platform ios --profile production
```

Then tag what you shipped, so rule 1 has something to check against:

```bash
git tag mobile-v0.1.0 && git push origin mobile-v0.1.0
```
