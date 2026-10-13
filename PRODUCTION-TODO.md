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

## Members in review can use the app (added 2026-10-06)

A member who has **submitted** a verification now gets into the app while it is
reviewed: they can browse (feed, matches, trips, availability, profiles,
reviews) and post their own trips and availability. They cannot request a stay,
offer one, review, or block; nobody else sees them or their trips until they are
approved. Rejection sends them back to the verification screens to apply again,
and reapplying puts them back in. No new status: it is `profiles.status =
'pending'` plus a `pending` application, and 'rejected' / 'suspended' work as
before. One migration, `20260921120000_members_in_review_can_browse` — policy
and helper-function changes only, nothing dropped, applied to dev and tested
there (`members_in_review.sql`).

### Before merging to `main`

- [ ] **Backend first.** Approve **Deploy backend** before any app build with
      this change reaches users. A new build on an old backend lets an in-review
      member into the app where every read comes back empty. Old builds on the
      new backend are fine: they still send every non-approved member to the
      verify screens.
- [ ] The dry run is policy changes only (six policies replaced, two functions
      added) — nothing destructive — but read it with the other pending
      migrations

### Smoke test on dev, with a build pointed at dev

- [ ] New account: submit verification → profile setup → lands in the app with
      the "in review" banner on Home
- [ ] Can browse the feed, matches, a verified member's profile and reviews;
      can post a trip and availability
- [ ] "Ask about these nights", "Offer nights", "Block" show "Available once
      your verification is approved" instead of a button
- [ ] A second, approved account does **not** see the in-review member or the
      trip they posted
- [ ] Approve them in the admin site: within about 15 seconds the banner goes,
      the buttons appear, matches refill, and the second account now sees their
      trip
- [ ] Reject a different in-review account: it drops back to the verification
      screens with the rejection reason, and their trip disappears for others
- [ ] That rejected account reapplies and is back in the app, in review

### Before telling members

- [ ] The privacy policy and guidelines should say that people awaiting
      verification can look at verified members' profiles (name, photo, bio,
      neighbourhood, reviews). Until now nobody saw any of it before approval.
      Contact details are still only revealed after an accepted stay.

## Identity hold after account deletion (added 2026-10-06)

Deleting an account used to erase everything that said who the member was, so a
report against someone who then deleted and rejoined led nowhere. Now
`delete_account` first copies their identity (email, names, legal name, phone,
links, and the paths of the selfie and CV, which stay in Storage) into
`deletion_holds`: **30 days**, or **12 months** if a report against them is
open, in review or actioned, extended to 12 months by any later report. A daily
job, `purge-deletion-holds`, erases expired holds and their files. Members
removed after an **actioned** report leave one-way fingerprints of email and
legal name in `conduct_bans`, which flag a matching application as "Possible
repeat" for a human moderator; nothing is blocked automatically.

One migration, `20260921130000_deletion_hold`, plus a new Edge Function
(`purge-deletion-holds`) and changes to `delete-account`, `admin-delete-user`
and `submit-verification`. Applied to dev and tested there (`deletion_hold.sql`).
The periods are `deletion_hold_days` and `deletion_hold_reported_days` in
`app_config`.

### Before merging to `main`

- [ ] **A lawyer reads the privacy-policy and `account-deletion.md` changes.**
      Keeping identity data after deletion is a legitimate-interest decision and
      has to be stated accurately before this reaches prod. The wording is a
      draft written from what the code does, not legal advice.
- [ ] Decide the periods are right (30 days / 12 months). They are settings, not
      code, so they can change later without a deploy
- [ ] **Approve the backend deploy** so the migration and the three changed
      functions go together, and `purge-deletion-holds` is deployed for the cron
      job to call. The cron job and Edge Function use the existing vault secrets
      (`edge_function_base_url`, `edge_function_service_key`); check they are
      set on prod, as the notification dispatcher already relies on them
- [ ] Update `legal/play-data-safety.md` answers in the Play Console if the
      deletion or retention answers there should match the repo copy

### Smoke test on dev

- [ ] Delete a test account that has a verification application: its row appears
      under **Identity held after deletion** on the admin page, with the 30-day
      date, and the selfie file is **still** in the `verification-docs` bucket
- [ ] Report a test member, then delete them: the hold is 12 months
- [ ] On a held account, **Keep for 12 months** extends it and writes an audit
      row
- [ ] Set a hold's `held_until` into the past, run the function by hand (or wait
      for 03:30 UTC): the row and the files are gone
- [ ] A new application with the same legal name as a removed, actioned member
      shows **Possible repeat** in Verifications and in the moderator email

### Known limits

- Accounts deleted **before** this ships have nothing held, and never will.
- Members who deleted their account cannot be reported from the app's profile
  screens (the profile no longer loads); a report can still be made against a
  held account through the report flow if the app has the id, and a moderator
  can extend a hold by hand from the admin page.
- A fingerprint of a guessable email can be confirmed by guessing it. It keeps
  the readable details out of the table; it is not a secret.

## Phone number replaces WhatsApp (added 2026-10-06)

The profile gate now asks for one personal phone number instead of a WhatsApp
number, and the reveal screen offers Call and Email. One migration,
`20260921160000_phone_replaces_whatsapp`: it moves each member's WhatsApp number
into `contact_details.phone`, drops `whatsapp`, makes `phone` E.164-only,
removes 'whatsapp' as a preferred channel, and rebuilds the three functions that
read the old column (admin user detail, the identity hold, `delete_account`).
Applied to dev and tested there.

### Before merging to `main`

- [ ] **The migration drops a column.** The dry run's review will flag it. It is
      safe only because the numbers are copied into `phone` first; check on prod
      afterwards that `select count(*) from contact_details where phone is null`
      is no larger than before
- [ ] **Backend first.** An old app build on the new backend reads a column that
      no longer exists: its profile edit and contact reveal would fail until the
      member updates. The auth gate in the old build reads `whatsapp` too, so a
      member who is already complete would be sent back to the profile setup.
      Ship the new build promptly after the backend, and say so in the release
      notes
- [ ] The privacy policy, account-deletion page, community guidelines and Play
      data-safety copy now say "phone number" rather than "WhatsApp number"

### Smoke test on dev

- [ ] A member who had a WhatsApp number is still complete and goes straight into
      the app, with the same number shown under Profile → "Phone"
- [ ] A new member is asked for "Your phone number" (not WhatsApp), with the country
      code chosen in its own box (starting from the device's region) and the number
      typed separately; a leading 0 is dropped, pasting a whole +49 … number sets
      the country, and an existing member's number shows split correctly in Edit
      profile
- [ ] After an accepted offer the reveal shows Phone (Call) and Email

## Usernames, connections and trip visibility (Milestone 7, added 2026-10-06)

Members get a unique username, can connect with each other, and choose per trip who
sees it (public / connections only / private). Tips and coffee join stays as things
a traveller can ask for. Home gains a connections band. Plan and decisions:
`Milestone-7-Friends-and-Visibility.md`. Seven migrations, applied to dev and
tested there: `20260921170000_usernames`, `180000_friendships`,
`190000_trip_visibility`, `200000_request_kinds`, `210000_tips_and_coffee_requests`,
`220000_home_feed_friends`, and `230000_friends_become_connections`, which renames
"friends" to "connections" throughout (table, helpers, the stored visibility
value, notification types, the setting). Prod runs the earlier ones and then this
rename in the same push.

### Before merging to `main`

- [ ] **This changes who can see what, for everyone.** Every existing trip becomes
      public, which is **much narrower than today** (every approved member saw
      every active trip). After this, a trip is visible only to the owner's
      connections, people living in the destination, people there on overlapping
      dates, and people the owner asked. Tell members before it ships
- [ ] **Backend first.** The new app build expects usernames, `friendships`,
      `trips.visibility` and the new request kinds. Old builds on the new backend
      keep working (a sign-up with no username gets a generated one; a trip with
      no visibility is public) but will show a tips or coffee request as if it
      were a stay request, and cannot use connections
- [ ] **Existing members get an automatic username** such as `aziz_4821`. They can
      change it once, immediately, in Edit profile. Say so in the release notes
- [ ] Read the dry run: `20260921200000` adds enum values (it must be its own
      migration, and is), and `20260921190000` replaces the trips viewing policy
- [ ] **Privacy policy / terms.** The privacy policy and account-deletion page now
      describe usernames, connections and trip visibility. Have them read before
      release: connections see a full name, bio and links that other members do not
- [ ] **Known limit:** bio, links and the family name are hidden from non-connections
      in the app only. Any approved member can still read them through the API
      (the family name already could be). Hiding them in the database means moving
      columns out of `profiles`, a later hardening

### Profile numbers (`20260921240000_member_stats`)

- [ ] Every profile shows Connections, Trips and Services offered. A stranger
      pressing a number does nothing; a connection pressing one sees the list
- [ ] Trips: a connection sees only trips that are not private; the count leaves
      private ones out (your own count includes them)
- [ ] Services: a stay counts once its last night has passed, tips and coffee once
      the trip they were for has ended; a pending or declined one never counts
- [ ] A service for someone's private trip shows the person but not the city
- [ ] Privacy policy now has a section on these numbers (3.1b): have it read

### Smoke test on dev, with builds pointed at dev (two accounts, then three)

- [ ] Sign up with a username; a taken one says so as you type; an existing
      account shows its generated `@username` on the Profile tab and can change it
- [ ] Search the other account by username and by name; tap Connect; the other
      sees it on Home and under Connections, and gets a notification
- [ ] Accept: both appear under Connections and the count beside each profile
      picture goes up; the connection's page now shows their full name, bio and
      links; a stranger's page does not
- [ ] Post a trip as Public, Connections only and Private, and check from a third,
      unrelated account that only the right one is visible; send a request about
      the private trip and check the person asked can now see it
- [ ] A host who lists "tips" and "coffee" shows "Ask for local tips" and "Invite
      for a coffee" on a trip's matches; accepting shares contact both ways
- [ ] Home shows a connection's upcoming trip under "Your connections"
- [ ] Block a connection: it disappears for both, silently
- [ ] Delete a test account: its connections and username go

## Services: one per post, and "always available" (added 2026-10-07)

The Couch tab is now **Services**. Each post offers ONE service (couch, spare room,
coffee or local tips), chosen first on its own screen, and can be **always
available**: no dates, open until switched off, so requests keep arriving. Two
migrations, applied to dev and tested there (`always_available.sql`):
`20260921250000_services_always_available`, `20260921260000_group_services_in_matching`.

What they do: availability dates become optional (an unbounded range, which
matching already reads as "free on any dates"); existing posts that bundled several
services are **split into one row per service**; matching lists a host once with
every service they offer; and **only a couch or a spare room can be used to offer
nights**, which was not enforced before (a host with only tips posted could be
matched with, and offer nights to, a traveller).

### Before merging to `main`

- [ ] **Backend first.** Old builds on the new backend still work, with two visible
      differences: a post they make with several services is accepted but listed as
      before (only an always-available post is limited to one), and a host who has
      posted only coffee or tips no longer appears in "Coming your way" or can offer
      nights. Say so in the release notes
- [ ] Look at the dry run: it **splits existing rows** (an insert, then an update).
      Dev had no bundled posts, so the split ran only against a synthetic row in a
      rolled-back transaction. Check the count on prod first:
      `select count(*) from availability where array_length(offers,1) > 1;`
- [ ] Hosting conditions (women only, no pets, ...) and the maximum nights **stay
      with the couch or room** when a post is split, and are dropped from a coffee or
      tips post. That is a judgement call: confirm it is what you want

### Smoke test on dev

- [ ] The Couch tab is now Services; the centre button says "Offer a service" and
      opens a chooser of the four; each leads to its own form
- [ ] Couch and spare room ask for nights, house rules and a maximum stay; coffee
      and tips ask for neither
- [ ] The "Always available" switch removes the dates; the post shows an "Always
      available" badge and can be switched off from the list
- [ ] A traveller whose trip is months away finds the always-available host, with
      "N of your N nights"; a host who offers a couch and a coffee appears **once**
- [ ] A host who offers only a coffee shows no nights and no stay button, only
      "Ask for ... / Invite for a coffee"
- [ ] An existing multi-service post now shows as separate posts in the list

## Offering a service without being asked (added 2026-10-07)

A member can now open somebody's trip (from Home, or from a connection's list of
trips) and offer them one of their own posted services, unprompted. A couch or a
room goes through the existing nights offer; a **coffee or local tips** use a new
table, `service_offers`: the owner accepts (and both get each other's contact
details) or declines. One migration, `20260921270000_service_offers`, applied to dev
and tested there (`service_offers.sql`).

Rules: only a trip the giver can already see (the trip visibility rule, enforced
through RLS, so a private trip can never be offered on); the giver must have posted
that service in the trip's city on overlapping dates or always available; one offer
of each service per person per trip; an accepted one counts toward the giver's
"services offered" once the trip has ended.

### Before merging to `main`

- [ ] **Backend first.** Old builds on the new backend simply do not show these
      offers. A coffee or tips offer made to a member on an old build produces a
      notification they can read but cannot answer in the app until they update.
      Say so in the release notes
- [ ] The migration **changes `delete_account`**: a trip now survives its owner's
      deletion (stripped of its text) if an accepted service offer or an accepted
      tips or coffee request rests on it, as a trip with a stay already did. Read
      that part of the dry run
- [ ] Privacy policy and account-deletion page now say accepted coffee or tips are
      retained after deletion (who, the city and the month): have them read

### Smoke test on dev (two accounts)

- [ ] Account A has posted coffee and local tips in a city; account B has a public
      trip there. From A, open B's trip from Home: both services appear, and
      offering one is a single tap
- [ ] B sees it under "Waiting on you" on Requests, with the header badge raised,
      and accepts: both land on the contact screen, and a notification arrives
- [ ] A's couch or spare room shows "Offer nights" on the same screen and opens the
      nights form
- [ ] B declines another: A is told. A withdraws a third before it is answered
- [ ] A private trip cannot be reached, and a service you have not posted in that
      city is not listed
- [ ] After the trip ends, the accepted coffee adds one to A's "Services offered"

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
