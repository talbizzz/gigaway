# Milestone 4: Reputation & Safety

## Goal

Stays produce attributed, double-blind reviews; users can block each other and report
privately to the moderator; the moderator can suspend and remove; and every user can export
or genuinely delete their own data.

## Context

**Milestones 1–3 are complete.** Members are verified, post trips and availability, match,
request, offer, accept, and exchange contact details. The `stays` table is populated on
acceptance and is the reviewable unit. The `notifications` outbox and
`dispatch-notifications` exist and are proven on a real device.

**`is_blocked(uuid)` currently returns `false`.** Every policy written in Milestones 1–3
already calls it. This milestone gives it a real implementation, which retroactively
enforces blocking across the entire application without touching those policies. Verify
that assumption early — if any policy omitted the call, blocking will silently fail there.

This milestone is not polish. Apple rejects social apps lacking block and report
(Guideline 1.2), and GDPR requires working export and deletion. These are launch gates.

## Scope

### In Scope

- `reviews` with an attributed author and a would-host/stay-again binary
- Double-blind publication: both submitted, or the 14-day window expires
- Review prompts after a stay's end date
- Reviews displayed on profile views
- Block / unblock with bidirectional invisibility
- `submit-report` Edge Function and the private `reports` table
- Moderator SQL views for the Supabase dashboard
- Immediate suspension effect
- `export-data` Edge Function (GDPR Art. 20)
- `delete-account` Edge Function with real deletion or irreversible anonymisation
- Community guidelines screen in-app

### Out of Scope

- A custom admin UI — moderation runs on the Supabase dashboard
- Review editing after publication, and review replies
- Reviews for co-accommodation — nobody hosted anybody
- Appeals against suspension or rejection — handled by email
- Automated abuse detection or content scanning
- Ratings of institutions, schools or teachers — **explicitly excluded from v1; carries
  substantially higher legal exposure and requires notice-and-takedown, identity
  retention, moderation capacity and legal advice before it can ever ship**

---

## Technical Specification

### Components to Build

#### 1. Reviews

- **Responsibility:** persistent, portable reputation across trips.
- **Key notes:**
  - Reviews attach to a `stays` row. One review per author per stay, enforced by unique
    constraint. Both directions are possible: host reviews guest, guest reviews host.
  - **Attributed, never anonymous.** The brief rejects anonymity explicitly: in a community
    this small it is illusory (a host with two guests knows who wrote what) while still
    removing accountability.
  - Fields: `would_again boolean not null`, `body text` (optional, max 1000 chars).
  - **Publication rule:** `published_at` is set when *both* reviews for the stay exist, or
    when 14 days have passed since the stay's `end_date` — whichever comes first. A review
    with no counterpart still publishes at the deadline; otherwise a party could suppress
    criticism by never writing one.
  - **Unpublished reviews are invisible to their subject.** The RLS policy must not leak
    existence, content, or the fact that a review was written.
  - Both-submitted publication happens in an `after insert` trigger, so it is instant.
    The 14-day case is handled by cron.

#### 2. Review prompts

- A daily `pg_cron` job enqueues `review_prompt` notifications for both parties of any stay
  whose `end_date` was yesterday, once only (tracked by `stays.prompted_at`).
- A second prompt at day 7 for anyone who has not yet submitted — one reminder, not a
  campaign.
- The app surfaces a persistent "Review your stay with X" card until submitted or the
  window closes.

#### 3. Blocks

- **Responsibility:** total mutual invisibility.
- **Interface:** direct `insert` / `delete` on `blocks`.
- **Key notes:**
  - `is_blocked(other)` returns true if a row exists in **either** direction. Blocking is
    one-sided to create but symmetric in effect.
  - Consequences: neither appears in the other's `search_matches`, profile views 404,
    existing requests and offers become invisible, and no notifications flow between them.
  - **Blocking does not delete history.** Existing `stays` and published reviews remain —
    otherwise blocking becomes a tool for erasing a bad review.
  - Blocking someone with a pending request or offer sets that record to `withdrawn`.
  - Unblocking is possible; it does not restore anything that was withdrawn.

#### 4. Reports

- **Responsibility:** the private channel to the moderator for safety concerns.
- **Interface:** `submit-report` Edge Function only. **There is no client select policy on
  `reports` at all** — not even for the reporter. The reporter receives a confirmation
  notification instead.
- **Key notes:**
  - Reports are **never public and never shown to the reported user**, per the brief.
  - Categories: `safety`, `harassment`, `no_show`, `misrepresentation`, `spam`, `other`.
  - Optional link to a related stay, request or offer.
  - Submitting a report offers, but does not force, blocking the reported user.
  - A report enqueues an immediate email to `MODERATOR_EMAIL` — this is the one thing that
    must never sit in a queue.

#### 5. Moderator views

Saved SQL views for the Supabase dashboard, since there is no admin UI:

| View | Contents |
|---|---|
| `v_pending_verifications` | Application, applicant profile, note, links, days waiting, signed doc URLs |
| `v_open_reports` | Report, reporter, subject, category, body, related context, subject's prior report count |
| `v_recent_signups` | New profiles, path (invite vs document), inviter, days since |
| `v_user_summary` | Everything about one profile: trips, stays, reviews given and received, reports filed and received, blocks |
| `v_stuck_notifications` | Unsent rows with attempts ≥ 3, for operational triage |

Document the moderator runbook in the repository: how to approve, reject, suspend and
delete from the dashboard, and what each action does downstream.

#### 6. Suspension

- Setting `profiles.status = 'suspended'` makes `is_approved()` false, which revokes all
  member content on the next query. No additional policy work is needed — **verify this
  end to end rather than assuming it.**
- Suspension hides the user's trips, availability and profile from others, but their
  published reviews of other people remain visible.

#### 7. `export-data` Edge Function

- **Responsibility:** GDPR Art. 20 portability, required by NFR 2.
- Returns a single JSON document: profile, contact details, trips, availability, requests
  and offers (both directions), stays, reviews written and received (published only),
  blocks created, invites created, redemption record, and notification history.
- **Excludes:** reports the user filed or that concern them — disclosing report content
  would expose reporters and defeat the private channel. State this in the privacy policy.
- Rate-limited to once per 24 hours per user.

#### 8. `delete-account` Edge Function

- **Responsibility:** real deletion, per Requirement 18 and NFR 2.
- **Strategy — hard delete where possible, irreversible anonymisation only where
  referential integrity requires it:**

| Data | Action |
|---|---|
| `auth.users` row | Hard delete — the user can never sign in again |
| `profiles` | Anonymise: `display_name = 'Deleted member'`, `status = 'deleted'`, null out bio, links, district, home city, `specialisation`; delete the avatar object |
| `contact_details` | Hard delete |
| `trips`, `availability` | Hard delete |
| `requests`, `offers` | Hard delete where pending; retain accepted ones linked to a stay |
| `stays` | Retain — the counterparty's review history depends on it |
| Reviews **written by** the user | Retain if published, with the author shown as "Deleted member". Delete if unpublished. |
| Reviews **about** the user | Delete — reputation data about a departed person serves no purpose |
| `blocks` | Retain rows where the deleted user is the *blocked* party, so the other person's block survives; delete rows they created |
| `reports` **filed by** the user | Retain, reporter pseudonymised. Safety records must survive a departing bad actor. |
| `reports` **about** the user | Retain, pseudonymised |
| `invites`, `invite_redemptions` | Retain the chain with creator anonymised — invite traceability is a trust property |
| `push_tokens` | Hard delete |
| `notifications` | Hard delete |
| `verification_applications` | Hard delete, including any remaining storage objects |

- Requires re-authentication (password confirmation) before proceeding.
- Irreversible, and the confirmation screen must say so plainly.
- **Retaining reports and the invite chain after deletion is a legitimate-interest
  decision that must be stated in the privacy policy.** Do not ship the function without
  the corresponding policy text.

---

### Data Model

```sql
-- ─── reviews ──────────────────────────────────────────────────────────────
create table reviews (
  id           uuid primary key default gen_random_uuid(),
  stay_id      uuid not null references stays(id) on delete cascade,
  author_id    uuid not null references profiles(id) on delete set null,
  subject_id   uuid not null references profiles(id) on delete cascade,
  would_again  boolean not null,
  body         text check (char_length(body) <= 1000),
  submitted_at timestamptz not null default now(),
  published_at timestamptz,
  unique (stay_id, author_id),
  constraint no_self_review check (author_id <> subject_id)
);
create index reviews_subject on reviews (subject_id) where published_at is not null;
create index reviews_unpublished on reviews (stay_id) where published_at is null;

alter table stays add column prompted_at   timestamptz;
alter table stays add column reminded_at   timestamptz;
alter table stays add column review_closes_at date;   -- end_date + 14 days

-- ─── blocks ───────────────────────────────────────────────────────────────
create table blocks (
  blocker_id uuid not null references profiles(id) on delete cascade,
  blocked_id uuid not null references profiles(id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key (blocker_id, blocked_id),
  constraint no_self_block check (blocker_id <> blocked_id)
);
create index blocks_blocked on blocks (blocked_id);

-- ─── reports ──────────────────────────────────────────────────────────────
create type report_status as enum ('open','reviewing','actioned','dismissed');

create table reports (
  id             uuid primary key default gen_random_uuid(),
  reporter_id    uuid references profiles(id) on delete set null,
  subject_id     uuid references profiles(id) on delete set null,
  category       text not null,
  body           text not null check (char_length(body) <= 2000),
  related_type   text,                 -- 'stay' | 'request' | 'offer' | null
  related_id     uuid,
  status         report_status not null default 'open',
  moderator_note text,
  created_at     timestamptz not null default now(),
  resolved_at    timestamptz
);
create index reports_open on reports (created_at) where status = 'open';
create index reports_subject on reports (subject_id);
```

**Update `is_blocked(uuid)`** — replace the Milestone 1 stub:

```sql
create or replace function is_blocked(other uuid) returns boolean
language sql stable security definer set search_path = public as $$
  select exists (
    select 1 from blocks
    where (blocker_id = auth.uid() and blocked_id = other)
       or (blocker_id = other      and blocked_id = auth.uid())
  );
$$;
```

### RLS Policies

| Table | Operation | Rule |
|---|---|---|
| `reviews` | select | `author_id = auth.uid()` (own, any state); or `published_at is not null` **and** `is_approved()` **and** `not is_blocked(author_id)` **and** `not is_blocked(subject_id)` |
| `reviews` | insert | `author_id = auth.uid()`, `is_approved()`, caller is host or guest of the stay, `current_date > stays.end_date`, and `current_date <= review_closes_at` |
| `reviews` | update | `author_id = auth.uid()` **and** `published_at is null` — no edits after publication |
| `reviews` | delete | none |
| `blocks` | select | `blocker_id = auth.uid()` |
| `blocks` | insert | `blocker_id = auth.uid()` |
| `blocks` | delete | `blocker_id = auth.uid()` |
| `reports` | **all** | **no client policy whatsoever.** `service_role` only, via `submit-report` |

**The critical review policy detail:** the select policy must not expose an unpublished
review to its subject in any form — not the row, not a count, not existence. Test this
explicitly with pgTAP, including aggregate queries.

### Scheduled Jobs

| Job | Cadence | Behaviour |
|---|---|---|
| `prompt_reviews` | daily 10:00 UTC | For stays with `end_date = current_date - 1` and `prompted_at is null`: enqueue `review_prompt` to both parties, set `prompted_at` |
| `remind_reviews` | daily 10:15 UTC | For stays 7 days past `end_date` where a party has not submitted and `reminded_at is null`: one reminder, set `reminded_at` |
| `release_reviews` | daily 02:00 UTC | Publish any review where `current_date > review_closes_at` and `published_at is null` |

Both-submitted publication is handled by an `after insert` trigger on `reviews`: if a
counterpart review exists for the stay, set `published_at = now()` on both and enqueue
`review_published` to both parties.

### API Contracts

#### `POST /functions/v1/submit-report`

```jsonc
// request
{
  "subjectId": "uuid",
  "category": "safety",
  "body": "…",
  "relatedType": "stay",       // optional
  "relatedId": "uuid",         // optional
  "alsoBlock": true            // optional
}

// 200
{ "ok": true, "reportId": "uuid" }
```

Behaviour: insert the report as `service_role`, optionally insert a block, send an
immediate Resend email to `MODERATOR_EMAIL`, and enqueue a `report_received` confirmation
to the reporter. **The response never echoes report content, and no read path exists.**

| HTTP | `error` | When |
|---|---|---|
| 404 | `subject_not_found` | No such profile |
| 400 | `invalid_category` | Category not in the allowed set |
| 429 | `rate_limited` | More than 5 reports in 24 hours from this user |

#### `POST /functions/v1/export-data`

Returns `{ "ok": true, "generatedAt": "…", "data": { … } }`. 429 `rate_limited` if used
twice within 24 hours.

#### `POST /functions/v1/delete-account`

```jsonc
{ "confirm": "DELETE", "password": "…" }   // → { "ok": true }
```

401 `reauth_failed` on a wrong password; 400 `confirm_mismatch` if `confirm` is not exactly
`DELETE`.

### Environment & Configuration

No new secrets. `MODERATOR_EMAIL`, `RESEND_API_KEY` and `RESEND_FROM` already exist.

New PostHog events: `review_submitted`, `review_published`, `user_blocked`,
`report_submitted`, `account_deleted`, `data_exported`. IDs only — **never report content,
review text, or category**.

---

## Implementation Order

1. **Migration: `blocks` + the real `is_blocked()`.** Do this first, then run the full
   existing pgTAP suite. Every policy from Milestones 1–3 gains blocking behaviour at
   once, and this is the cheapest moment to discover a policy that forgot to call it.
2. **Block / unblock UI** plus withdrawal of pending requests and offers on block.
3. **pgTAP for blocking:** blocked pairs see no profile, no trip, no availability, no
   request, no offer, no review, and appear in no `search_matches` result.
4. **Migration: `reviews` + `stays` columns + policies.**
5. **pgTAP for double-blind:** a subject cannot see an unpublished review by any means,
   including counts and aggregates.
6. **Review submission UI** and the both-submitted publication trigger.
7. **Cron: prompt, remind, release.** Test by back-dating a stay's `end_date`.
8. **Reviews on the profile view** — would-again ratio, then bodies newest first.
9. **Migration: `reports` with no client policy.** `submit-report` and the report UI.
10. **Moderator views and the runbook.**
11. **Suspension verification** — suspend a test account and confirm total loss of access.
12. **`export-data`.**
13. **`delete-account`**, tested against an account with stays, reviews, blocks and reports
    in every direction.
14. **Community guidelines screen**, linked from the report flow and settings.

## Done Criteria

- [ ] Blocking makes two users mutually invisible everywhere, proven by pgTAP across
      profiles, trips, availability, requests, offers, reviews and `search_matches`
- [ ] Blocking withdraws pending requests and offers between the pair
- [ ] Blocking does not remove published reviews or stay history
- [ ] A review can only be submitted after the stay's `end_date`
- [ ] Neither review is visible until both are submitted
- [ ] **pgTAP: the subject of an unpublished review cannot detect its existence** — no row,
      no count, no aggregate
- [ ] With only one review submitted, it publishes automatically 14 days after `end_date`
- [ ] Both parties receive a review prompt the day after a stay ends, exactly once
- [ ] Published reviews appear on the subject's profile with the would-again ratio
- [ ] A review cannot be edited after publication
- [ ] No review is ever prompted or permitted for a co-accommodation match
- [ ] A report reaches `MODERATOR_EMAIL` within a minute
- [ ] **No client query can read the `reports` table — including the reporter's own**
- [ ] Reported users receive no signal that they were reported
- [ ] `v_open_reports` and `v_pending_verifications` are usable in the dashboard
- [ ] Suspending a profile revokes all member content access on the next query
- [ ] `export-data` returns a complete JSON document excluding report content
- [ ] `delete-account` removes the auth user, anonymises the profile, and leaves the
      counterparty's stay and review history intact
- [ ] After deletion, the deleted user's name appears nowhere in another user's app
- [ ] Deletion is irreversible and the confirmation screen says so

## Corrections made after implementation

Recorded so the next agent reads a plan that matches the code. These came from
walking the app rather than from building the milestone, and all of them touch
surfaces this milestone introduced.

1. **Nothing let two members size each other up before committing.** RLS already
   allowed any approved member to read any other, and `member/[id].tsx` was
   built here — but the screens where a request or an offer is actually decided
   never linked to it. The host cards, traveller cards, the travellers list and
   the offer form now all open a profile, and the ask / offer action is carried
   onto the profile so it is not a dead end.
2. **The match cards were re-implementing `PersonRow`.** `HostCard` and
   `TravellerCard` each hand-rolled an avatar and name block, which is why they
   had no tap target. Both use the component now; a local `personFrom()` bridges
   `search_matches`'s camelCase profile shape to the snake_case row shape the
   component takes.
3. **A member had no way to supply a phone number.** `contact_details` has
   carried `whatsapp` since Milestone 1 and the reveal screen has always rendered
   a WhatsApp channel, but only `email` was ever populated — copied from auth at
   sign-up — so that row could never appear. A WhatsApp number is now required of
   every member and revealed alongside the email.
   - Required by the profile-completeness gate, **not** by `not null`: the row is
     created by `handle_new_user()` at sign-up, which knows the email and nothing
     else, so a NOT NULL column would make account creation impossible.
   - Stored E.164 and constrained to it. wa.me takes digits only and has no idea
     what country the reader is in, so a national number produces a link that
     dials somebody else entirely.
   - "Complete" now spans two tables, so `useAuthGate` reads `contact_details`
     as well as `profiles`.
4. **Profile links now show on `member/[id].tsx`.** The own-profile read view
   lists them, so without this a member saw links on themselves that nobody else
   could — and for a working artist a website is one of the stronger "is this
   person real" signals when deciding whether to host them.
5. **The empty avatar was invisible, not blank.** It filled with `bgRaised`,
   which is white in the light theme, so a photo-less member had no visible
   avatar on any screen sitting on `bg`. `Avatar` now draws initials on
   `accentSubtle`, which is distinct from every surface in both themes.

## Known Risks & Watch-Outs

- **The double-blind leak is the subtle bug here.** A count, an aggregate, or a
  `select exists` can reveal that a review was written even when the row is hidden. Write
  the pgTAP tests for aggregates specifically, not just row selects.
- **A missing `is_blocked()` call in an earlier policy fails silently.** Grep every policy
  for it after implementing the real function, and let the pgTAP suite be the proof.
- **`author_id` is `on delete set null`** so that deleting a user does not cascade away
  reviews they wrote about others. Handle the null author in the UI as "Deleted member".
- **Deletion versus review integrity is a genuine tension.** If deleting an account erased
  the reviews someone wrote, a bad actor could delete and rejoin to launder reputation.
  Retaining anonymised authorship is the deliberate compromise — say so in the privacy
  policy.
- **Retaining reports after deletion needs a stated legitimate-interest basis.** The
  privacy policy must cover it before this ships.
- **Report emails must not be queued behind the notification sweep.** Send directly from
  `submit-report`; safety cannot wait a minute for a cron tick.
- **The 14-day release job must be idempotent.** A double run must not republish or
  duplicate notifications.
- **Test deletion against a fully entangled account.** An account with no relationships
  proves nothing; the failure modes are all in the foreign keys.
