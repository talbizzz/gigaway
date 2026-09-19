# Production TODO

What's outstanding specifically on the **production** Supabase project
(`gigaway`, `hrhoqmmxgfpyxwncmpjx`), as opposed to dev. Dev is the sandbox —
things land there first, get smoke-tested, and only then come here.

Checked off here means: confirmed against prod directly (`supabase link
--project-ref hrhoqmmxgfpyxwncmpjx` first, always), not just "should be true."

## Verification-only signup (2026-09-17 change)

Prod is currently **four migrations behind** — `20260909180000` (invite-quota
removal) and two push-token fixes (below) were never pushed either, not just
`20260917090000` (the invite system's full removal). All four apply in one
`db push`.

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

- [ ] **Push the four pending migrations**
  ```
  supabase link --project-ref hrhoqmmxgfpyxwncmpjx
  supabase db push --dry-run   # sanity check first
  supabase db push
  ```
  No `migration repair` needed — prod never had
  `feature/artist-verification-gate`'s migration applied, unlike dev, so
  there's no phantom migration-history entry to fix here.

- [ ] **Deploy the current Edge Functions**
  ```
  pnpm functions:deploy
  ```
  Deploys all 8 current functions, including the new `submit-verification`.

- [ ] **Delete the two orphaned functions**
  Prod is running `redeem-invite` (v3) and `purge-verification-docs` (v2) —
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
  Currently hand-edited against the migration's expected end-state, since
  there was no live database to generate it from at the time. Once prod is
  migrated (or even just dev — schemas are now identical), retire the
  hand-edited version:
  ```
  supabase link --project-ref hrhoqmmxgfpyxwncmpjx
  pnpm db:types
  ```

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

## Carried over from Milestone 5 (already tracked in `TODO.md`, listed here only because prod is where they land)

- [ ] Upgrade Supabase to Pro
- [x] Create Resend account, verify the sending domain (SPF + DKIM + DMARC)
      — see above, done 2026-09-18
- [ ] Raise auth email rate limits off the shared-sender defaults
- [ ] Set `site_url` and redirect URLs to production (never `127.0.0.1`)
- [ ] Confirmation email and password reset round trips from a production build
