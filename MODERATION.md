# Moderator runbook

Moderation runs in the **admin app** (`admin.gigaway.app`; `admin-dev.gigaway.app`
against the development database). This document is the manual behind it: what
to look at, what each action does downstream, and what it does not undo.

Every action the app offers is one of the SQL statements below, wrapped in a
function that checks you are an admin and writes an audit-log row. The SQL
stays here because it is the fallback when the app is down and the only way to
do anything the app deliberately doesn't (see the end of this section) — and
because reading it is the clearest description of what a button actually does.
If you use the SQL directly, note **nothing is written to the audit log**.

| To do this | In the admin app | What it runs |
|---|---|---|
| Decide an application | **Verifications** → open it → Approve / Reject | `admin_decide_verification` |
| Decide a report | **Reports** → open it → Action / Dismiss / Mark reviewing | `admin_decide_report` |
| Look someone up | **Users** → search → open | `admin_search_profiles`, `admin_get_user_detail` |
| Suspend / reinstate | **Users** → their page → Suspend / Reinstate | `admin_set_user_status` |
| Delete someone | **Users** → their page → Delete (type their email) | the `admin-delete-user` Edge Function |
| Look up or delete a trip | **Trips** | `admin_search_trips`, `admin_delete_trip` |
| Operational checks | **Dashboard** | `admin_stuck_notifications`, `admin_cron_status`, `admin_recent_signups` |
| See who did what | **Audit log** | `admin_audit_log` |

The app deliberately does **not** do: delete a trip that produced a stay (it
would cascade into the other member's reviews — there is no button for it, only
a refusal saying why), edit a member's profile text, or bulk anything. Those
stay manual.

**Admin accounts** are created with `pnpm create-admin` (see
`admin-scripts/README.md`). An admin has no member profile: `admin_users` and
`profiles` are separate on purpose.

Everything below is run as the dashboard's privileged role. None of these views
is readable by the app's members — they are revoked from `anon` and
`authenticated`, and the pgTAP suite asserts that. The admin app reaches the
same data only through `security definer` functions that check `is_admin()`.

> **Before acting on anything:** decisions here are visible to real people and
> most are hard to reverse. Read `v_user_summary` for the person first. One
> report is a disagreement; four reports from four different people is a
> pattern, and the views separate those two numbers for exactly that reason.

---

## Daily: the verification queue

**The evidence lives in Supabase Storage, not your inbox.** A short email to
`verify@gigaway.app` tells you an application arrived — no attachment — and
`v_pending_verifications` has everything else, including where to find the
photo and CV:

```sql
select * from v_pending_verifications;
```

`selfie_path` and `cv_path` are object paths in the `verification-docs`
bucket — open them from the dashboard's **Storage** browser, not from this
view. Check the stored photo against `selfie_prompt` (the pose instruction
given at submission — it changes per attempt, so an old photo won't match).
`days_waiting` is the column that matters day to day — anything over three
days has already triggered the nudge email.

**To approve or reject** — in the admin app this is **Verifications**, which
also shows the selfie and CV (via short-lived links; only an admin session can
open them). Applications submitted before evidence was stored in the app have
no files there — for those the originals are email attachments in the
`verify@gigaway.app` inbox. By hand:

```sql
update verification_applications
   set status = 'approved',            -- or 'rejected'
       decision_reason = 'Portfolio confirmed professional standing.'
 where profile_id = '…';
```

Downstream, automatically:

- Approving promotes the profile to `approved` and stamps `verified_at`. The
  applicant can see member content on their next query.
- `decision_reason` is shown to the applicant. Write it for them to read.
  Rejecting does not close the door — they can submit a fresh application, and
  it reopens this same row rather than creating a new one.

The selfie and CV stay in Storage after a decision — retained until the
applicant deletes their own account, not purged on a schedule. That is a
deliberate choice (Milestone 1's corrections explain the reasoning); there is
nothing to clean up here.

**Never** edit `profiles.status` directly to approve somebody. The application
row is the record of what evidence the decision was based on.

---

## Daily: the report queue

```sql
select * from v_open_reports;
```

Ordered safety first, then harassment, then everything else by age. Read
`subject_prior_reports` alongside `subject_prior_reporters` — four reports from
one person is one angry counterparty, not a pattern.

**Look the subject up before deciding:**

```sql
select * from v_user_summary where profile_id = '…';
```

**To record a decision:**

```sql
update reports
   set status = 'actioned',            -- or 'dismissed', or 'reviewing'
       moderator_note = 'Suspended pending reply. Second safety report.',
       resolved_at = now()
 where id = '…';
```

This changes nothing else. It is a record of what you decided, not the action
itself.

### What the reporter and the subject see

Nothing. The reporter got a confirmation notification when they filed; there is
no status they can check, and no client can read the `reports` table at all.
**The subject is never told a report exists**, and must not be told informally
either — that is what makes people willing to file one.

---

## Suspending someone

```sql
update profiles set status = 'suspended' where id = '…';
```

Takes effect on their **next query**. No cache to clear, no job to run.

What happens:

- `is_approved()` becomes false, so every member-content policy closes. They see
  their own profile and nothing else.
- They disappear from other members' profile views, trips, availability and
  every `search_matches` result.
- They stop receiving notifications entirely.
- Their published reviews **of other people remain visible**. Suspension is not
  a reason to remove somebody else's reputation data.
- Their stays and the reviews about them remain.

**To lift it:**

```sql
update profiles set status = 'approved' where id = '…';
```

`suspended_at` clears automatically.

---

## Deleting someone

Prefer suspension. Deletion is irreversible and is normally the user's own
action from Settings, not yours.

If you must delete on someone's behalf — a support request from an account they
have lost access to, say — verify identity out of band first, then use
**Delete** on their page in the admin app. It asks you to type their email or
name, checks that server-side against the record it is about to erase, and then
does all of the following in one go, telling you which steps succeeded if one
fails:

1. `delete_account` — the SQL tombstone below,
2. removes their avatar and any verification selfie/CV from Storage,
3. deletes the auth user, last,
4. writes an audit-log row.

By hand, the same job is three separate things and it is easy to forget one:

```sql
select delete_account('…');
```

then delete the auth user in **Authentication → Users**, and remove their avatar
and their verification files (`verification-docs/<their id>/`) from Storage. The
SQL function can do none of the last two.

What survives, and why:

| Kept | Reason |
|---|---|
| Stays | The counterparty's history, not only theirs |
| Published reviews they **wrote** | Otherwise deleting and rejoining launders a bad reputation |
| Reports, both directions | A departing bad actor must not erase the safety record |
| Blocks placed **on** them | Somebody blocked them for a reason |

The profile row survives as a tombstone named "Deleted member" with every
free-text field cleared. Their name appears nowhere in anybody else's app.

> **Not shippable until the privacy policy covers this.** Retaining reports
> after deletion is a legitimate-interest decision and has to be stated. See
> Milestone 0.

---

## Operational checks

```sql
select * from v_stuck_notifications;
```

Unsent after three attempts. **Empty is the healthy state.** Rows here mean
`dispatch-notifications` is failing — check the function logs, and check that
the Vault secrets still point at the right host:

```sql
select name from vault.decrypted_secrets
 where name in ('edge_function_base_url', 'edge_function_service_key');
```

```sql
select * from v_recent_signups;
```

Who joined recently, and their current status. Worth a glance weekly — a burst
of signups is worth understanding before it becomes a review backlog, since
every one of them needs a human decision before they see anything.

---

## Scheduled jobs

```sql
select jobname, schedule, active from cron.job order by jobname;
```

| Job | When | What |
|---|---|---|
| `dispatch-notifications` | every minute | Drains the notification outbox; the real delivery guarantee |
| `expire-stale-requests-and-offers` | 04:00 | Closes requests and offers whose dates have passed |
| `notify-pending-verifications` | 09:00 | Emails you about applications waiting over three days |
| `release-reviews` | 02:00 | Publishes reviews whose two-week window has closed |
| `prompt-reviews` | 10:00 | Asks both parties for a review the day after a stay |
| `remind-reviews` | 10:15 | One reminder at seven days to whoever has not written |

Failures land in `cron.job_run_details`.
