# Production TODO

What's outstanding specifically on the **production** Supabase project
(`gigaway`, `hrhoqmmxgfpyxwncmpjx`), as opposed to dev. Dev is the sandbox —
things land there first, get smoke-tested, and only then come here.

Checked off here means: confirmed against prod directly (`supabase link
--project-ref hrhoqmmxgfpyxwncmpjx` first, always), not just "should be true."

## Verification-only signup (2026-09-17 change)

Prod is currently **thirteen migrations behind** (confirmed 2026-09-21 with a
read-only `supabase db push --dry-run` against prod, which changes nothing).
They are, in order: `20260909180000` (invite-quota removal),
`20260917090000` (the invite system's full removal), two push-token fixes
(below), `20260918180000` (verification evidence is now kept in Storage
instead of emailed), and **eight from the admin-platform work** (one of them a fix to the
verification flow found while building it) — see "Admin
platform (Milestone 6)" further down. All thirteen apply in one `db push`.

**Two of them destroy data**, per `scripts/summarize-pending-migrations.mjs`
run over that dry-run: `20260917090000` drops the `invites` and
`invite_redemptions` tables, the `profiles.invited_by` / `invite_quota`
columns, the document-purge columns on `verification_applications`, and
deletes two `app_config` keys; `20260918180000` drops
`verification_applications.cv_attached` and `resend_email_id`. There are no
backups. Look at what is in those tables on prod before applying (below).

**The push-token fixes are unrelated to the invite removal** — found and
fixed 2026-09-18 while testing the new verify flow with multiple accounts on
one phone, where push registration was failing with a 42501 every time a
device that already registered under one account signed in as a different
one.

- `20260918120000_fix_push_token_reassignment.sql` was the first attempt —
  loosening `push_tokens_update_own`'s USING clause to `true` — and it was
  **not sufficient on its own**, confirmed by testing directly against the
  live database rather than by re-reading the SQL: Postgres requires the
  pre-existing row to also pass a SELECT-type policy before an UPDATE
  policy's own USING is even considered, and `push_tokens_select_own` still
  restricted that to the row's current owner.
- `20260918140000_register_push_token_rpc.sql` is the actual fix: creation
  and reassignment both move into a new `register_push_token()` SECURITY
  DEFINER function (matching how every other cross-cutting write in this
  schema already works — `redeem_invite`, `accept_offer`, `submit_report`),
  which bypasses RLS internally rather than needing a policy to permit
  something a plain policy can't express without also making every member's
  token broadly readable. It also reverts the first migration's USING(true)
  change, and moves direct client `INSERT` on `push_tokens` to going through
  the function too. `registerForPush()` in `apps/mobile/src/lib/push.ts`
  calls the RPC now. Confirmed working directly against dev's live database
  before pushing, and via updated pgTAP coverage in `supabase/tests/notifications.sql`.

- [x] **Look at what the destructive migrations will drop, on prod** — done 2026-09-23:
  6 invites, 6 redemptions, 6 profiles with `invited_by` set, 0 applications. The
  invite lineage was lost with the migration, which was accepted.
  Run in prod's SQL editor first. If any of these counts is not what you
  expect — real invites, real applications — stop and think before applying:
  ```sql
  select 'invites' as what, count(*) from public.invites
  union all select 'invite_redemptions', count(*) from public.invite_redemptions
  union all select 'profiles with invited_by set', count(*) from public.profiles where invited_by is not null
  union all select 'verification_applications', count(*) from public.verification_applications;
  ```

- [x] **Push the thirteen pending migrations** — done 2026-09-23. Verified with
  `supabase migration list --linked`: every local migration matches its remote
  entry. The destructive ones included.
  Preferred: through CI, so the review is on record. Merge `develop` into
  `main`; `deploy-backend.yml`'s **preview** job then runs on its own and
  writes "Production deploy — what will change" to the run's summary page
  (which migrations, and anything that drops or deletes). Read it, *then*
  approve the **deploy** job — the approval prompt comes after the preview.
  It re-checks the list hasn't changed, applies the migrations, then deploys
  the functions. Needs the secrets in the admin section below.

  By hand instead (what this section used to say):
  ```
  supabase link --project-ref hrhoqmmxgfpyxwncmpjx
  supabase db push --dry-run   # sanity check first
  supabase db push
  supabase link --project-ref shhgzekofcetdenwpivm   # back to dev — never leave the link on prod
  ```
  No `migration repair` needed — prod never had
  `feature/artist-verification-gate`'s migration applied, unlike dev, so
  there's no phantom migration-history entry to fix here.

- [x] **Deploy the current Edge Functions** — done. Re-verified 2026-10-04: all nine
  current functions are ACTIVE on prod, including `admin-delete-user` and
  `submit-verification`, which were missing before. `redeem-invite` and
  `purge-verification-docs` are gone.
  Confirmed on prod 2026-09-21: it runs nine functions, but not the same nine
  — `accept-co-request`, `accept-offer`, `delete-account`,
  `dispatch-notifications`, `export-data`, `moderation-digest`,
  `submit-report`, plus the two orphans below. It has **no
  `submit-verification`** and **no `admin-delete-user`**. The repo has nine
  current functions including both. `deploy-backend.yml` deploys them right
  after the migrations. By hand:
  ```
  pnpm functions:deploy      # with the CLI linked to prod
  ```
  `functions:deploy` was rewritten 2026-09-21: the old `--import-map` flag is
  rejected by current Supabase CLIs, so the previous version of this command
  would have failed. It now writes each function's `deno.json` from the shared
  one and deploys with `--use-api` (verified against dev: all nine boot).
  It does **not** prune functions that were removed from the repo, so the two
  orphans stay until deleted below.

- [x] **Delete the two orphaned functions** — done 2026-09-23. Both were
  erroring on every call since the SQL they depended on
  (`redeem_invite()`, the doc-purge columns) was already gone.

- [x] **Resend account created, `gigaway.app` verified** (2026-09-18, via
  Resend's Cloudflare auto-configure — SPF/DKIM/DMARC all landed in one
  step). This part is account-level, not per-project, so it's already true
  for prod too — nothing to redo here.

- [x] **Set the mail secrets on prod** — done 2026-09-24: `RESEND_API_KEY`,
  `MODERATOR_FROM`, `NOTIFICATION_FROM`, `MODERATOR_EMAIL`,
  `VERIFICATION_EMAIL` all confirmed present (`supabase secrets list`
  shows names + timestamps, never values — Supabase doesn't expose a
  secret's value again once set, on either project). `RESEND_API_KEY` is a
  **separate prod key**, per the original plan below — not shared with
  dev, so either can be revoked independently. The other four values are
  identical to dev on purpose (`moderation@`/`notifications@`/`verify@`
  are domain-level addresses, not per-environment secrets).

- [x] **Add `verify@gigaway.app` and `notifications@gigaway.app` to
  Cloudflare Email Routing** — done 2026-09-18, both forwarding to the
  dedicated Gmail alongside `moderation@`/`support@`/`privacy@`/`security@`.
  Account-level (Cloudflare, not Supabase), so this is already true for prod
  too — nothing to redo here. One real gotcha hit during setup, worth
  knowing about: a Resend send to a freshly-created routing address can hard
  bounce ("Recipient not found") if it lands in the brief window before
  Cloudflare's mail-accepting side has caught up with a routing rule the
  dashboard already shows as Active — and Resend auto-suppresses a bounced
  address afterward, which can block a retry even once the address is
  genuinely live. If a prod send to one of these ever bounces the same way,
  check Resend's suppression list before assuming the routing is broken.

- [x] **Regenerate `database.types.ts` for real** — done 2026-10-04 from prod, after
  checking the generated file covers every admin function and table. Typecheck, lint
  and the 55 shared unit tests all pass. The old hand-edited stubs and their comments
  are gone. Original notes below.
  Currently hand-edited against the migrations' expected end-state — the
  verification changes, and now the whole admin platform
  (`admin_users`, `audit_log`, fourteen `admin_*` functions). **Do not run this
  against prod until prod is migrated**: `db:types` overwrites the file in
  place, and generated from a prod that is thirteen migrations behind it would
  silently delete all of that. Dev has every migration, so it is the safe
  source right now:
  ```
  supabase link --project-ref shhgzekofcetdenwpivm
  pnpm db:types
  ```
  Then check `git diff` is small — it should mostly reformat what was written
  by hand.

- [ ] **Smoke-test** *(this exact flow is confirmed working on dev as of
  2026-09-18 — selfie captured, CV attached, submitted, email confirmed
  arriving at `verify@gigaway.app`. This is the same test repeated against
  prod once the above is done.)*
  - `select * from v_pending_verifications;` and
    `select * from v_recent_signups;` return without error
  - Sign up a fresh test account on prod, confirm it lands on the new
    `verify` screen with no invite-code field anywhere
  - Once the secret above is set: submit a real application and confirm the
    email actually arrives at `verify@gigaway.app`

## Admin platform (Milestone 6, added 2026-09-21)

`apps/admin` — a static site on Cloudflare Pages, one deployment per Supabase
project. State today: built and verified end to end against **dev** (all four
admin pgTAP files pass there; every Edge Function path exercised); the dev site
is **not yet published** (waiting on the secrets below and a first push); **prod
has none of it** — its database doesn't have the tables and functions the app
calls, so a prod admin site would load and then refuse every login.

- [x] **GitHub repository secrets.** Added by 2026-10-02; the prod admin and website
  deploys have since run with them. The list below is the record of what's needed.
  As of 2026-09-21 the repo had
  `ADMIN_DEV_SUPABASE_ANON_KEY`, and `SUPABASE_URL` / `SUPABASE_ANON_KEY` (those
  two belong to the keep-alive workflow). Still missing:
  - `CLOUDFLARE_API_TOKEN` (permission **Account → Cloudflare Pages → Edit**)
    and `CLOUDFLARE_ACCOUNT_ID` — used by `deploy-admin.yml` **and**
    `deploy-web.yml`. Their absence means the public gigaway.app site can't
    deploy from CI either.
  - `SUPABASE_ACCESS_TOKEN`, `SUPABASE_PROJECT_REF` (`hrhoqmmxgfpyxwncmpjx`),
    `SUPABASE_DB_PASSWORD` — `deploy-backend.yml`. The DB password can't be
    recovered from Supabase, only reset. The workflow refuses to run if the ref
    isn't prod's.
  - `ADMIN_PROD_SUPABASE_ANON_KEY` — prod's **anon** key. The build refuses a
    service-role key, a `sb_secret_` key, or a key for the wrong project.

  These must be **repository** secrets, not `production`-environment secrets:
  the backend preview job runs before the approval gate and cannot see
  environment-only ones (it fails with a message saying so).

- [ ] **The `production` GitHub environment exists with a required reviewer.**
  Both `deploy-backend.yml` and the prod half of `deploy-admin.yml` use it. The
  environment was created on 2026-10-02, but the reviewer rule hasn't been tested
  yet: the first backend deploy that gets past the secrets check will be the real
  test of it.

- [x] **Backend first.** Done 2026-10-01: the grants check below passes on prod. Do the migration and function items above *before*
  approving the prod admin deploy. Then verify on prod directly that the admin
  functions are locked down (this project's default privileges hand `EXECUTE` to
  `anon` and `authenticated`, and an ordinary `revoke … from public` silently
  does nothing — it bit dev, see `20260919190000`):
  ```sql
  select routine_name,
         bool_or(grantee = 'anon') as anon,
         bool_or(grantee = 'authenticated') as authenticated
  from information_schema.routine_privileges
  where routine_schema = 'public'
    and (routine_name like 'admin\_%' or routine_name = 'log_admin_action')
  group by 1 order by 1;
  ```
  Expected: `anon` false on every row; `authenticated` true on every `admin_*`
  row; **both false** on `log_admin_action`.

- [x] **Create the first prod admin** — done (`admin_users` has one row on prod,
  checked 2026-10-01). Original instructions below. Put prod's URL and **service-role** key in
  `admin-scripts/.env.prod` (gitignored — see `.env.example`; never commit or
  paste it anywhere), then `pnpm create-admin`, answer `prod`, and type `prod` at
  the confirmation. The admin gets no member profile. It only works once the
  migrations above have landed (`admin_users` has to exist).

- [x] **Deploy the prod admin site** — done: `admin.gigaway.app` and `gigaway-admin.pages.dev`
  both return 200 (checked 2026-10-01). Original instructions below. Push to `main` also starts the prod half
  of `deploy-admin.yml`; approve it after the backend deploy has finished. It
  creates the `gigaway-admin` Pages project on its first run. Reachable at its
  `*.pages.dev` address straight away.

- [x] **Attach `admin.gigaway.app`** — done (resolves and serves 200, checked 2026-10-01). Cloudflare → Workers & Pages →
  gigaway-admin → Custom domains. The zone is already on Cloudflare, so it
  creates the DNS record itself. `MODERATION.md` already names this address.

- [ ] **Recommended — Cloudflare Access in front of both admin domains**, so the
  login form isn't reachable by the whole internet. Not done; not required.
  Steps (and one CI caveat) are in `Milestone-6-Admin-Platform.md` under
  "Follow-on: Cloudflare Access". Prod wants its own application with a
  stricter policy, created after `admin.gigaway.app` is attached.

- [ ] **Smoke-test on prod**, without doing anything destructive to a real
  member:
  - sign in as the prod admin; the Dashboard shows scheduled jobs (the two
    document-purge jobs disappear once `20260917090000` unschedules them) and
    an empty "stuck notifications" card, which is the healthy state
  - Users search finds a real member; opening them shows their counts
  - Verifications lists pending applications. Any submitted **before** evidence
    was stored will say "No selfie is stored" and point at the
    `verify@gigaway.app` inbox — that's expected, not a bug
  - approve or reject one real pending application, then check Audit log shows
    it with your name
  - the reapplication path (fixed in `20260920120000`): reject a *test* account,
    have it reapply, and confirm approving it actually approves the profile
  - do **not** test Delete on a real member — sign up a throwaway account and
    delete that instead

## First and family name (added 2026-10-06)

Members now enter a first and a family name; other members see only
"Aziz T." (`profiles.display_name`, derived by a trigger from the new
`profiles.first_name` / `last_name`). Admins and moderators see the full name.
Two migrations, already applied by hand to **dev** and tested there:
`20260921100000_split_member_names` and `20260921110000_admin_full_names`.
Neither drops anything, but the first one **rewrites `display_name` on every
existing member** — the original text is kept, split on its first space, in
`first_name` / `last_name`, so nothing is lost, but there is no undo and no
backup.

### Before merging to `develop`

- [ ] Everything committed (mobile sign-up and edit profile, shared types,
      both migrations, `member_names.sql`, the four edited pgTAP files, seed
      script, privacy-policy and Play data-safety wording)
- [ ] CI green — `Migrations and pgTAP` runs the whole suite on an empty
      database, which is the one run that is not polluted by dev's real data
- [ ] `supabase migration list` against dev shows both migrations applied
      (they were pushed by hand, so CI has nothing to do for dev)

### Smoke test on dev, with a build pointed at dev

- [ ] Sign up with the new form: both name fields required, the family-name
      hint shows, and the new member appears to others as "First L."
- [ ] Edit profile: both fields saved, the preview under Family name matches
      what another account then sees
- [ ] A member from before the split (no family name) can still save their
      profile without being forced to add one
- [ ] Feed, a trip, a request, an offer and a review all show "First L."
- [ ] Admin (dev site): users list and user detail show the full name, and a
      search by family name finds the member
- [ ] The web password-reset page asks for the password twice (account pages
      redeploy on merge)

### Before merging to `main` (this is what reaches prod)

- [ ] `supabase link --project-ref hrhoqmmxgfpyxwncmpjx`, confirm the output
      names `gigaway`
- [ ] Look at what will be rewritten, and be happy with how each splits:
      `select display_name from public.profiles where status <> 'deleted';`
      — a name like "Mary Jane Smith" becomes first "Mary", family "Jane
      Smith", shown as "Mary J."; a single word keeps no family name
- [ ] The backend preview's dry run lists these two **together with every
      other pending migration** (prod is behind — see above). Read all of it,
      not only these two
- [ ] Approve **Deploy backend** first. The admin site and the new app build
      both assume the columns exist
- [ ] Then let the admin and account-page deploys finish (they run on the same
      merge)
- [ ] Only then ship the new mobile build. Older builds keep working: they
      send one name and the database splits it on the first space
- [ ] Play Console data-safety form: the "Name" row wording changed in
      `legal/play-data-safety.md`; update the console if it should match

### After it is live on prod

- [ ] `select count(*) from public.profiles where status <> 'deleted' and
      first_name is null;` returns 0
- [ ] No non-deleted profile has a `display_name` that still holds a full
      family name: `select display_name from public.profiles where status <>
      'deleted' and display_name !~ '^\S+( \S\.)?$';` returns nothing
      except members who signed up with a single name
- [ ] Sign up a throwaway account, check it shows as "First L.", delete it
- [ ] Run `pnpm db:types` against prod only once prod has caught up with dev;
      until then the committed `database.types.ts` is generated from dev

## Carried over from Milestone 5 (already tracked in `TODO.md`, listed here only because prod is where they land)

- [ ] Upgrade Supabase to Pro
- [x] Create Resend account, verify the sending domain (SPF + DKIM + DMARC)
      — see above, done 2026-09-18
- [ ] Raise auth email rate limits off the shared-sender defaults
- [x] Set `site_url` and redirect URLs to production (never `127.0.0.1`) — prod's
      allowlist includes `account.gigaway.app/callback`, done 2026-10-04
- [ ] Confirmation email and password reset round trips from a production build —
      neither has run on prod yet. Both need the production mobile build first, and
      confirmation also needs `enable_confirmations` turned on for prod.
