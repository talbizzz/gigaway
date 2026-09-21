# admin-scripts

Operator scripts for the GigAway Supabase projects. Run by hand, from a
terminal on your own machine — never deployed, never in CI.

They use the **service-role key**, which bypasses every RLS policy and can
create and delete auth users. That is why these live apart from `apps/` and
why every script makes you name the project it is allowed to touch.

## Setup

```bash
pnpm install                      # from the repo root
cp admin-scripts/.env.example admin-scripts/.env.dev     # and/or .env.prod
```

Fill in `SUPABASE_URL` and `SUPABASE_SERVICE_ROLE_KEY` from the project's
dashboard (Settings → API). `.env.*` is gitignored; only `.env.example` is
tracked. Every script checks that the URL really belongs to the project its
`--env` flag names, so a prod key pasted into `.env.dev` is refused, as is a
shell that still has prod's URL exported.

## Scripts

Run from the repo root (`pnpm <script>`) or from this folder.

### `create-admin`

```bash
pnpm create-admin
```

Asks for the project (`dev` / `prod` — Enter means `dev`), the email, a display
name (Enter accepts the default) and the password (hidden, typed twice,
re-asked if too short or mismatched), shows a summary, and asks you to
confirm. Ctrl-C at any point cancels without creating anything.

Every question can be answered up front instead, which skips it —
`--env`, `--email`, `--name`, `--password` (best avoided: it lands in shell
history; `ADMIN_PASSWORD` works instead), and `--yes` to skip the final
confirmation on dev. With no terminal, nothing can be asked, so `--env`,
`--email` and a password source are all required — no project is assumed. `pnpm create-admin --help`
has the details.

- **The admin gets no member profile.** Creating any auth user fires
  `handle_new_user()`, which creates a `profiles` + `contact_details` row;
  for an admin those are deleted straight away, so `admin_users` and
  `profiles` stay separate.
- **New accounts only.** If the email is already registered it stops and
  changes nothing — an existing account may be an artist's, and converting it
  means deleting its profile, which cascades into their trips and reviews.
- **All or nothing.** The Auth API and the database can't share a
  transaction, so a failure after the user is created rolls everything back
  and says if any step of the rollback itself failed.
- **Prod needs you to type `prod`.** A bare Enter, `--yes`, or having no
  terminal all refuse.

## Adding a script

- One file in `scripts/`, plain ESM (`.mjs`), matching `../scripts/`.
- Start from `loadTarget(values.env)` in `lib/target.mjs`. Never read
  `SUPABASE_URL` yourself, and never fall back to a project silently: an
  interactive prompt may default to dev, a non-interactive run must be told.
- Put the logic in `lib/` and keep the CLI thin, so the failure paths can be
  tested by handing the function a client that fails on purpose — that is how
  `create-admin`'s rollback was verified against dev.
- If it deletes or overwrites anything, refuse on ambiguity rather than
  guess, and use `confirmByTyping` for prod. There are no database backups.
