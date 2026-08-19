# Milestone 0: Launch Prerequisites

> **This file is for the human, not for a coding agent.** Every step below is a manual
> account, payment, form or document. None of it can be automated, and all of it blocks
> real users from installing anything. Start it on day one, in parallel with Milestone 1.

## Goal

Every external account, legal document and store registration required to put the app on
a real person's phone is complete, so that Milestone 5 is a deployment rather than a wait.

## Why this is Milestone 0

Nothing here is under your control, and the slowest item sets your beta date. Apple
enrolment can take days. Google Play's closed-testing requirement is measured in weeks.
Store listings cannot be submitted without a published privacy policy URL. If you start
this the day you finish coding, you add two to four weeks to the calendar for no reason.

**Budget:** roughly €130 up front (Apple $99/yr, Google $25 once, domain ~€10/yr), plus
~$25/month for Supabase Pro once the beta starts.

---

## Step 1 — Domain

**Do this first. Several later steps need the URL.**

1. Choose and buy a domain. Suggested: `gigaway.app` (the `.app` TLD forces HTTPS, which
   Apple and Google both require for deep-link association files).
   Registrars: Namecheap, Porkbun, Cloudflare Registrar (cheapest, at cost).
2. Point nameservers at Cloudflare (free) or leave with the registrar — Vercel will need
   a DNS record later in Milestone 5.
3. Record the domain in your notes; it becomes:
   - the invite link base — `https://<domain>/i/<code>`
   - the privacy policy URL both stores require
   - the support URL on both store listings

**Time:** 15 minutes. **Cost:** ~€10/year.

---

## Step 2 — Decide your public trader identity

**Do this before enrolling with Apple. It is awkward to change afterwards.**

Under the EU Digital Services Act, anyone distributing apps in the EU must verify
**trader status**, and the verified name, address, email and phone number are **displayed
publicly on your App Store listing**. Google Play has an equivalent requirement.

If you enrol as an individual using your home address, **your home address is published on
a public web page** — for an app whose entire premise is not exposing where people live.

Options:

| Option | Cost | Consequence |
|---|---|---|
| **Individual, home address** | Free | Home address public. Fastest path. |
| **Individual, alternative address** | ~€10–30/mo | A coworking space, a *c/o* address, or a mail-forwarding service. Must be an address where you can actually receive post. |
| **Register a company (UG / GmbH / e.V.)** | €25+ and weeks | Company address is public instead. Also requires a D-U-N-S number for Apple, which adds 1–2 weeks. |

**Recommendation for v1:** individual enrolment with an alternative correspondence address
if you can get one cheaply; otherwise accept the home address and revisit before public
launch. Do **not** register a company just for this — it delays the beta significantly.

**Decide now and write the answer down**, because Steps 3 and 4 both ask for it.

---

## Step 3 — Apple Developer Program

**Start this early; it is the most likely item to surprise you.**

1. Ensure you have an Apple ID with **two-factor authentication enabled**. Use an address
   you will keep — it becomes the account of record.
2. Install Xcode from the Mac App Store if you have not (large download; start it now and
   leave it running).
3. Go to <https://developer.apple.com/programs/enroll/>.
4. Choose **Individual / Sole Proprietor** (unless Step 2 led you to a company).
5. Provide legal name and address exactly as they appear on your government ID —
   mismatches are the most common rejection cause.
6. Pay the **$99 / €99 annual fee**.
7. Wait for approval. Usually 24–48 hours; occasionally longer if identity verification is
   triggered.
8. Once approved, sign in to App Store Connect and complete:
   - **Agreements, Tax and Banking** — the Free Apps agreement must show *Active*, or you
     cannot distribute anything, including TestFlight builds.
   - **Trader status verification** (DSA) — submit the details from Step 2. This can take
     several days and involves a verification document or code.

**Time:** 1–5 days, mostly waiting. **Cost:** $99/year.

**Watch out:** TestFlight requires an active paid membership. There is no free path to
another person's iPhone.

---

## Step 4 — Google Play Developer Account

**Register this as early as Apple, even though you will use it later.** The closed-testing
requirement below is a calendar dependency, not a task.

1. Go to <https://play.google.com/console/signup>.
2. Choose **Personal** (or Organisation, if Step 2 led you there — organisations need a
   D-U-N-S number).
3. Pay the **$25 one-time** registration fee.
4. Complete identity verification — government ID plus, for personal accounts, a selfie
   check. Approval typically takes 1–3 days.
5. Complete the **Developer Profile**, including the public contact details from Step 2.

**The requirement that catches people out:** personal developer accounts created after
November 2023 must run a **closed test with at least 12 testers opted in, continuously,
for 14 days** before applying for production access. The clock does not start until the
closed track has a build and testers.

**Consequence for your plan:** create the closed track and add your beta testers' Google
accounts **as soon as you have any installable build** — even a rough one from Milestone 3.
Do not wait for a polished app. This runs in parallel with development and is otherwise a
two-week wall at the end.

**Time:** 1–3 days to register; 14+ days for the closed-test clock. **Cost:** $25 once.

---

## Step 5 — Supabase project

1. Create an account at <https://supabase.com>.
2. Create a new project.
3. **Set the region to EU Central (Frankfurt).** This cannot be changed later without a
   full migration, and your users are in the EU.
4. Save the project URL, `anon` key and `service_role` key into a password manager. The
   `service_role` key must never appear in the mobile app or in the web repo.
5. **The DPA needs no separate signature.** Supabase's Data Processing Addendum states
   that acceptance of their Terms of Service has the same effect as signing the SCCs, so
   accepting the terms at sign-up already covers it — there is no Settings → Legal page to
   hunt for on a standard plan. You are still the controller and Supabase the processor,
   and the obligation that *does* need action is naming Supabase as a subprocessor in the
   privacy policy.
6. Note the free tier pauses a project after ~7 days of inactivity. Plan to upgrade to
   **Pro (~$25/month)** when the closed beta begins — a paused backend during a beta is a
   silent, confusing failure.

7. Wire the repo to it: `supabase link --project-ref <ref>`, then `supabase db push` and
   `pnpm functions:deploy`. Three things are **not** carried by migrations and must be done
   once per project:
   - **Vault secrets.** `scheduled_jobs.sql` seeds local defaults. Overwrite both, or all
     three cron jobs fail silently: `edge_function_base_url` becomes
     `https://<ref>.supabase.co/functions/v1`, and `edge_function_service_key` must be the
     **`sb_secret_…` key** (`supabase projects api-keys --reveal`) — on projects using the new
     API key system that is what the runtime injects as `SUPABASE_SERVICE_ROLE_KEY`, and
     `requireServiceRole` compares the bearer token against it byte for byte. The legacy
     `service_role` JWT is silently rejected with a 401.
   - **pgTAP.** `create extension pgtap with schema extensions;` — no migration creates it.
     `supabase test db --linked` connects as `cli_login_postgres`, a NOINHERIT role the CLI
     recreates on every run, so each test file claims privileges with `set local role postgres`
     before calling `plan()`. That line is already in every file under `supabase/tests/`.

**Time:** 20 minutes. **Cost:** free now, ~$25/month from beta.

---

## Step 6 — Service accounts

Create all three now so the keys exist when Milestone 1 needs them.

| Service | Steps | Notes |
|---|---|---|
| **Sentry** | Create org and a React Native project. Choose the **EU region** at org creation. | Save the DSN. Free tier is sufficient. |
| **PostHog** | Sign up on **EU Cloud** (`eu.posthog.com`, not US). Create a project. | Save the project API key and host. |
| ~~**Resend**~~ | **Moved to Milestone 5.** It is blocked on owning the domain, and the default sender is adequate until a second person needs an account. | See `Milestone-5-Ship-It.md`, component 10. |

**Also decide:** the moderator email address that receives verification nudges and report
alerts. A dedicated address (`moderation@<domain>`) is better than a personal one.

**Time:** 45 minutes. **Cost:** free.

---

## Step 7 — Legal documents

**These are launch blockers.** Neither store will accept a submission without a live
privacy policy URL, and Apple requires a EULA for apps with user-generated content.

You need three documents. Drafting them yourself from a good template is acceptable for a
closed beta; have them reviewed before public launch.

### 7a. Privacy policy

Must cover, at minimum:

- **Identity of the controller** — your name/entity and contact address
- **What is collected:** name, email, phone, discipline, home city and district, photo,
  bio, professional links, travel dates and destinations, verification documents,
  device push tokens, analytics events, crash reports
- **Lawful basis for each purpose** — contract performance for the core service,
  legitimate interest for safety and moderation, consent for analytics
- **Verification documents specifically:** collected only to confirm professional status,
  reviewed by a human, **deleted immediately on decision**, with a 90-day backstop
  deletion for applications never decided. ID documents are not accepted.
- **Who else processes data (subprocessors):** Supabase (hosting, EU), Expo (push
  delivery), Sentry (crash reports, EU), PostHog (analytics, EU), Resend (transactional
  email), Vercel (website hosting), Apple and Google (app distribution)
- **International transfers** — note any US-based processor and the safeguard relied upon
- **Retention periods** for each category
- **User rights:** access, rectification, erasure, portability, objection, and how to
  exercise them (both in-app and by email)
- **Right to complain** to a supervisory authority

### 7b. Terms of service / EULA

Must cover:

- Eligibility: verified performing artists only; invite chain or document review
- **No money changes hands.** GigAway is not a party to any stay, does not provide
  accommodation, and takes no fee — state this explicitly and prominently
- No liability for what happens during a stay; users are responsible for their own safety
- Users are responsible for their own tenancy and residency obligations — hosting a guest
  may require landlord permission in some jurisdictions
- Prohibited conduct and grounds for suspension or removal
- **Response commitment for reported content** — Apple Guideline 1.2 expects a stated
  timeframe; 24 hours is the conventional promise
- Review policy: reviews are attributed, published double-blind, and may be removed if
  they breach the guidelines
- Account termination and deletion
- Governing law (German law, if you are Berlin-based)

### 7c. Community guidelines

Short and human. Expected host and guest behaviour, what gets you removed, how to report
someone, and a clear statement that reports are private and never shown to the reported
person.

**Time:** 3–6 hours of drafting. **Cost:** free, or a few hundred euro for review.

**Where they live:** Milestone 5 publishes them at `/privacy`, `/terms` and `/guidelines`
on your domain. Write them as Markdown now; the web app renders them later.

---

## Step 8 — Validate the core assumption

Not a technical prerequisite, but the highest-priority risk in `Project-Raw.md`, and it
costs an afternoon.

**Ask 5–10 working artists: what fraction of your trips do you pay for accommodation
yourself?**

Also worth asking: what did you spend on your last self-funded trip, and what did you do
about accommodation?

If the answer is "most trips are covered by the house or festival," the addressable need
is much thinner than assumed and the concept needs reshaping before more is built. Better
to learn this now than after the beta.

**Do this before the beta launches, not during it.**

---

## Done Criteria

- [ ] Domain purchased and DNS under your control
- [ ] Public trader address decided and written down
- [ ] Apple Developer Program active; Free Apps agreement shows *Active*
- [ ] Apple trader status verification submitted (approval may still be pending)
- [ ] Google Play developer account approved
- [ ] Google Play closed test track created and beta testers' emails collected
- [x] Supabase project created **in EU Frankfurt**, keys in a password manager *(DPA needs no separate signature — it is incorporated into the Supabase ToS accepted at sign-up)*
- [ ] Sentry (EU) and PostHog (EU) accounts created *(Resend deferred to Milestone 5)*
- [ ] Moderator email address chosen and receiving mail
- [ ] Privacy policy, terms/EULA and community guidelines drafted in Markdown
- [ ] 5–10 artists asked about self-funding; answers written down

## Known Risks & Watch-Outs

- **Apple identity mismatch.** The name and address on enrolment must match your ID
  exactly. This is the most common enrolment rejection.
- **Free Apps agreement not active.** Enrolment alone is not enough; the agreement in App
  Store Connect must show *Active* or TestFlight builds cannot be distributed.
- **Google's 14-day closed test.** Not a task you can compress. Start the track the moment
  you have any installable build.
- **Supabase region is permanent.** Choosing a US region and noticing in Milestone 4 means
  recreating the project.
- **Resend domain verification needs DNS propagation.** Deferred to Milestone 5, but the
  point still stands there: add the records early, because the wait is hours, not minutes.
- **The privacy policy must name every processor you actually use.** Adding PostHog later
  without updating it is exactly the kind of gap that makes a complaint stick.
