# Claude operating notes for this repo

Read this before touching Supabase. It exists because these have each cost
real time to (re)discover across different sessions working this repo.

## The only database that exists is the one in the cloud

There is no local Supabase stack, and none is ever started — the user weighed
bringing one back (2026-09-20) and decided it was too much work. Do **not** run
`supabase start`, `supabase test db --local`, `supabase db reset` (without
`--linked`), or anything else that assumes a local stack. A Docker runtime
(colima) is installed on this Mac only because the CLI needs one to host its
pgTAP runner, even against the linked project; that is not a local database.
Direct access to the **cloud** database (psql via
`.gigaway-dev-credentials`, or the Supabase CLI against dev) is explicitly
welcome for fast debugging — the line is "local," not "direct."

What to do instead:
- Run pgTAP with `pnpm db:test` (`supabase test db --linked`), against whichever
  project is currently linked. Start colima first (`colima start`); with no
  Docker daemon it fails with `LegacyDockerRunError`. Pass file paths to run
  only some: `supabase test db --linked supabase/tests/x.sql`.
- CI (`.github/workflows/ci.yml`) runs the whole suite from scratch on an
  empty database on every PR. Against dev you are testing real data, so
  **6 assertions are known to fail there and always will** (the user decided
  on 2026-09-20 to leave them): `home_feed` tests 2, 7, 11; `reports` test 21;
  `trips_and_availability` tests 11, 12. They count across every visible row
  and assume an empty table — noise, not a regression. Any other failure is
  real; every other file, admin ones included, passes.
- What that run depends on, already done on dev but **not on prod**: pgTAP
  lives in the `extensions` schema, and the CLI's temporary login role has no
  `extensions` in its search_path, so dev has
  `alter database postgres set search_path to "$user", public, extensions`.
  Without it every file fails with `function plan(integer) does not exist`.
- Gotchas: back-to-back runs can trip the pooler's `ECIRCUITBREAKER` ("too
  many authentication failures") — wait a minute instead of retrying in a
  loop. `docker-credential-desktop not found` means a stale `credsStore` key
  in `~/.docker/config.json`; delete that key.
- When writing pgTAP tests: RLS filtering never raises (a blocked UPDATE
  affects 0 rows, a blocked SELECT returns none), so assert on counts, not
  `throws_ok('42501')` — trigger guards do raise. `now()` is frozen inside the
  test transaction, so use an interval when a value must differ. A
  data-modifying `WITH` can't sit inside `is()`; use `results_eq` with SQL
  strings. Scope every query to fixture ids.
- Prefer verifying a migration by writing SQL and testing it directly
  against the **dev** project (`psql`, or a scoped transaction you roll
  back) before trusting a `db push --dry-run` alone — dry-run only shows
  *which* migrations would apply, not whether they'll succeed.

## Two Supabase projects — always confirm which one is linked

- **prod**: `gigaway`, ref `hrhoqmmxgfpyxwncmpjx`
- **dev**: `gigaway-dev`, ref `shhgzekofcetdenwpivm` — the sandbox; everything
  gets tried here first

The CLI's link is global to the checkout, not per-branch or per-session.
Before *any* `supabase db push`, `supabase secrets set`,
`supabase functions deploy`, `pnpm db:test`, or `pnpm db:types`, run
`supabase link --project-ref <ref>` explicitly and confirm the output names
the project you intend — don't assume the existing link is still what you
expect. `pnpm db:test` and `pnpm db:types` look read-only but aren't safe to
run blind: `db:types` overwrites the committed `database.types.ts` in place,
so running it against the wrong project can silently regress that file to a
stale schema (concretely true right now — prod is several migrations behind
dev). Pushing to **prod** is the user's call, not something to do
proactively; dev is fair game for testing but still real, persistent, shared
data — not a scratch pad that resets itself.

## No database backups

Free tier, by choice. There is no restore path if something goes wrong.
Before a destructive migration: run `supabase db push --dry-run` first, and
write the migration itself to be safe against partial application — a
`supabase db push` runs a migration file's statements in sequence, not as
one atomic transaction, so a failure partway through leaves the earlier
statements committed rather than rolling the whole file back. Use
`if exists` / `if not exists` liberally rather than assuming you know the
exact current state; `supabase migration list` shows local-vs-remote drift
before you push.

## The Supabase CLI can hang on macOS Keychain access

`security find-generic-password -s "Supabase CLI"` can block on a
permission dialog that isn't visible to a background or non-interactive
process. If a `supabase` command hangs indefinitely at
"Initialising login role...", this is the most likely cause — ask the user
to check for a Keychain prompt on their screen, and kill the stuck process
(`ps aux | grep supabase`) rather than waiting on it indefinitely or piling
up repeated attempts, which can make it worse.

## Other sessions may be working in this repo at the same time

Migration files and root-level docs (`TODO.md`, `PRODUCTION-TODO.md`,
`Milestone-N-*.md`) can change from other Claude sessions working this same
repo in parallel — for example, a concurrent Milestone 6 (admin platform)
effort has landed its own migrations here without coordination through this
conversation. Before pushing migrations, always dry-run first and actually
read anything unfamiliar it surfaces — `supabase db push` applies *every*
locally-pending migration together; there's no way to push only your own.
Don't assume a file you didn't write is safe to ignore or safe to discard.
