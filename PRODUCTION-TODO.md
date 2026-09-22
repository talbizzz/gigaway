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

- [ ] **Look at what the destructive migrations will drop, on prod**
  Run in prod's SQL editor first. If any of these counts is not what you
  expect — real invites, real applications — stop and think before applying:
  ```sql
  select 'invites' as what, count(*) from public.invites
  union all select 'invite_redemptions', count(*) from public.invite_redemptions
  union all select 'profiles with invited_by set', count(*) from public.profiles where invited_by is not null
  union all select 'verification_applications', count(*) from public.verification_applications;
  ```

- [ ] **Push the thirteen pending migrations**
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

- [ ] **Deploy the current Edge Functions**
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

- [ ] **Delete the two orphaned functions**
  Prod is running `redeem-invite` (v3) and `purge-verification-docs` (v2)
  (re-confirmed 2026-09-21) —
  both error on every call once the migration above lands, since the SQL
  they depend on (`redeem_invite()`, the doc-purge columns) is gone.
  ```
  supabase functions delete redeem-invite
  supabase functions delete purge-verification-docs
  ```

- [x] **Resend account created, `gigaway.app` verified** (2026-09-18, via
  Resend's Cloudflare auto-configure — SPF/DKIM/DMARC all landed in one
  step). This part is account-level, not per-project, so it's already true
  for prod too — nothing to redo here.

- [ ] **Set the mail secrets on prod**
  Prod has no mail-related secrets set at all yet. `RESEND_FROM` — the
  single shared sender originally planned — turned out wrong once
  `dispatch-notifications`'s member-facing offer-accepted email was
  considered alongside the three moderator-ops senders, so it split in two;
  see Milestone 5's "Corrections" (item 4) for the reasoning. Get a
  **separate** Resend API key for prod (Dashboard → API keys → Create,
  named `gigaway-prod` or similar) rather than reusing dev's, so either can
  be revoked independently.

  Until `RESEND_API_KEY` and `VERIFICATION_EMAIL` both exist,
  `submit-verification` correctly fails closed with a clear 503 rather than
  silently losing an application, so this doesn't block the migration/deploy
  above — it blocks the feature actually working for a real applicant.
  ```
  supabase secrets set \
    RESEND_API_KEY=<prod key> \
    MODERATOR_FROM="GigAway <moderation@gigaway.app>" \
    NOTIFICATION_FROM="GigAway <notifications@gigaway.app>" \
    MODERATOR_EMAIL=moderation@gigaway.app \
    VERIFICATION_EMAIL=verify@gigaway.app
  ```

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

- [ ] **Regenerate `database.types.ts` for real**
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

- [ ] **GitHub repository secrets.** As of 2026-09-21 the repo has
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
  Both `deploy-backend.yml` and the prod half of `deploy-admin.yml` use it. Not
  checked — needs the repo settings.

- [ ] **Backend first.** Do the migration and function items above *before*
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

- [ ] **Create the first prod admin.** Put prod's URL and **service-role** key in
  `admin-scripts/.env.prod` (gitignored — see `.env.example`; never commit or
  paste it anywhere), then `pnpm create-admin`, answer `prod`, and type `prod` at
  the confirmation. The admin gets no member profile. It only works once the
  migrations above have landed (`admin_users` has to exist).

- [ ] **Deploy the prod admin site.** Push to `main` also starts the prod half
  of `deploy-admin.yml`; approve it after the backend deploy has finished. It
  creates the `gigaway-admin` Pages project on its first run. Reachable at its
  `*.pages.dev` address straight away.

- [ ] **Attach `admin.gigaway.app`.** Cloudflare → Workers & Pages →
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

## Carried over from Milestone 5 (already tracked in `TODO.md`, listed here only because prod is where they land)

- [ ] Upgrade Supabase to Pro
- [x] Create Resend account, verify the sending domain (SPF + DKIM + DMARC)
      — see above, done 2026-09-18
- [ ] Raise auth email rate limits off the shared-sender defaults
- [ ] Set `site_url` and redirect URLs to production (never `127.0.0.1`)
- [ ] Confirmation email and password reset round trips from a production build
