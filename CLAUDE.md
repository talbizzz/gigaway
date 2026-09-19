# Claude operating notes for this repo

Read this before touching Supabase. It exists because these have each cost
real time to (re)discover across different sessions working this repo.

## The only database that exists is the one in the cloud

There is no local Supabase stack, and there never will be one to try — this
environment has no Docker. Do **not** run `supabase start`,
`supabase test db --local`, `supabase db reset` (without `--linked`), or
anything else that assumes a local stack — these hang or fail waiting on
Docker, not fail fast. Direct access to the **cloud** database (psql via
`.gigaway-dev-credentials`, or the Supabase CLI against dev) is explicitly
welcome for fast debugging — the line is "local," not "direct."

What to do instead:
- Run pgTAP with `supabase test db --linked`, against whichever project is
  currently linked. This is the only way to actually execute the test suite
  in this environment — there is no "fresh database" run available
  interactively.
- CI (`.github/workflows/ci.yml`) *does* have Docker and runs a real
  `supabase db reset` + the full pgTAP suite from scratch on every PR. That
  clean-database run only happens there. Locally/interactively you are
  always testing against real data on a real project (see below), which is
  also why ~22 pgTAP assertions across a few files are known to fail against
  `--linked` (they assume an empty table) — that's noise, not a regression;
  see `MEMORY.md`-tracked context if unsure which ones.
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
