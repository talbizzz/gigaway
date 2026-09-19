# Google Play — Data safety answer sheet

Working notes for the Play Console **App content → Data safety** form, derived
from the GigAway schema. Not a published document.

> **The rule that matters:** Data safety must describe **the build you actually
> ship**, not the code that exists. Two features are present in the codebase but
> inert in the current build — see "Things that change when you switch them on".

---

## Data collection and security — summary answers

| Question | Answer |
|---|---|
| Does your app collect or share any of the required user data types? | **Yes** |
| Is all of the user data collected by your app encrypted in transit? | **Yes** |
| Do you provide a way for users to request that their data is deleted? | **Yes** — in-app, Settings → Delete account |
| Is your app's data collection required or optional for users? | **Mixed** — see per-item table |
| Has your app undergone an independent security review? | **No** |
| Committed to Play Families Policy? | **No** — app is 18+ |

**Delete account URL:** `https://gigaway.app/delete-account` — a dedicated public
page, reachable without signing in, as Google requires. Source is
`legal/account-deletion.md`.

**Partial data deletion without deleting the account:** **No.** There is no
request mechanism for this, and the "automatically deleted within 90 days" option
is false — only *undecided verification documents* are purged on that schedule.

---

## Per-item declarations

For every item below: **Shared with third parties = No.** GigAway shares nothing
for advertising and sells nothing. Processors that merely host data are not
"sharing" under Google's definition.

### Personal info

| Data type | Collected | Required | Purposes | Notes |
|---|---|---|---|---|
| **Name** | Yes | Required | App functionality, Account management | `profiles.display_name` |
| **Email address** | Yes | Required | App functionality, Account management | Auth, plus `contact_details.email` |
| **Phone number** | Yes | Required | App functionality | WhatsApp number is required at signup |
| **User IDs** | Yes | Required | App functionality, Account management | `profiles.id` |
| **Address** | **No** | — | — | See judgement call below |
| **Race and ethnicity** | No | — | — | Not collected |
| **Political or religious beliefs** | No | — | — | Not collected |
| **Sexual orientation** | No | — | — | Not collected |
| **Other info** | Yes | Optional | App functionality | Bio, discipline, specialisation, professional links, trip and availability notes |

### Messages

| Data type | Collected | Required | Purposes | Notes |
|---|---|---|---|---|
| **Other in-app messages** | Yes | Optional | App functionality | Request, offer and review text |
| Emails / SMS | No | — | — | Not collected |

### Photos and videos

| Data type | Collected | Required | Purposes | Notes |
|---|---|---|---|---|
| **Photos** | Yes | Required | App functionality, Account management | Profile photo (optional, initials shown if none) and a verification selfie holding photo ID (required of every applicant). The selfie is stored and retained until account deletion — see the Files and docs row below |
| Videos | No | — | — | Not collected as a file upload. Applicants may submit a link to hosted video as evidence, which is text, not a video upload |

### Files and docs

| Data type | Collected | Required | Purposes | Notes |
|---|---|---|---|---|
| **Files and docs** | Yes | Optional | App functionality, Account management | An optional CV as part of verification. Stored, and retained — same as the verification selfie — until the account is deleted, not on a decision or a fixed schedule |

### Device or other IDs

| Data type | Collected | Required | Purposes | Notes |
|---|---|---|---|---|
| **Device or other IDs** | Yes | Optional | App functionality | Expo push token, only if notifications are enabled |

### App info and performance

| Data type | Collected | Required | Purposes | Notes |
|---|---|---|---|---|
| Crash logs | **See below** | — | — | Sentry — inert in current build |
| Diagnostics | **See below** | — | — | Sentry — inert in current build |

### App activity

| Data type | Collected | Required | Purposes | Notes |
|---|---|---|---|---|
| App interactions | **See below** | — | — | PostHog — inert in current build |

### Not collected at all

Location (any precision), Financial info, Health and fitness, Audio, Calendar,
Contacts, Web browsing history, Installed apps, Purchase history.

---

## Things that change when you switch them on

Two declarations depend on config, and both are currently **off**:

**Sentry — crash logs and diagnostics.** `EXPO_PUBLIC_SENTRY_DSN` is empty, so
the current build sends nothing. Declare **not collected** for now. The moment
you add a DSN and ship a build with it, come back and declare **Crash logs** and
**Diagnostics** as collected, optional, purpose *App functionality* and
*Analytics*.

**PostHog — app interactions.** `EXPO_PUBLIC_ANALYTICS_ENABLED` is `false`, and
[env.ts](../apps/mobile/src/lib/env.ts) does an exact `=== 'true'` comparison so
it fails closed. Declare **not collected** for now. When you enable it, declare
**App interactions** as collected, **optional**, purpose *Analytics*, and make
sure the in-app consent step exists first — the privacy policy already promises
analytics runs only with consent.

**Shipping a build with either enabled while Data safety says otherwise is a
policy violation.** Set a reminder alongside whichever milestone turns them on.

---

## Triggers — features that require a Data safety edit before shipping

Update the declaration **before** releasing the build that collects the new data,
never after. Editing takes minutes, needs no app review, and is live within hours,
so there is never a reason to pre-declare something the current build does not do.

| If you add… | Tick |
|---|---|
| Video upload (profile clips, performance reels) | Photos and videos → **Videos** |
| Audio upload (recordings, work samples) | Audio files → **Voice or sound recordings**, and/or **Music files** |
| A real chat feature | Messages → already covered by **Other in-app messages** |
| Device location, "find people near me" | Location → **Approximate** or **Precise** |
| Any payment, deposit or fee | Financial info → the relevant rows, and revisit the ToS, which currently states no money changes hands |
| Sentry (a DSN in the build) | App info and performance → **Crash logs**, **Diagnostics** |
| PostHog (analytics enabled) | App activity → **App interactions** — and ship the consent step first |
| A street address field | Personal info → **Address**, and correct the privacy policy, which currently says one is never collected |

Two of these are not just form edits: payments would contradict the Terms of
Service, and a street address would contradict the Privacy Policy. Change the
documents in the same pass, or they disagree with each other.

## Judgement calls, flagged

**"Address" — declared No.** GigAway stores a home *city* chosen from a list and
an optional free-text *district* ("Neukölln", "Maxvorstadt"). It never asks for a
street address. A district is coarser than what Google means by Address, so No is
defensible — and the privacy policy states plainly that no street address is
collected. If you'd rather be conservative, declare it under **Other info**
rather than Address, which is where the district already sits.

**"Location" — declared No.** Cities are picked from a list; nothing is sensed
from the device, and the app requests no location permission. Google's Location
category covers device-derived location, so No is correct.

**Push token under "Device or other IDs".** Google's examples lean toward
advertising and device identifiers, but a push token identifies a device, so
declaring it is the safer reading.

**The verification selfie under "Photos", not a separate category.** Play's Data
Safety taxonomy has no distinct bucket for a photo that happens to show a
government ID — Photos is the closest fit, and it is declared Required (not
Optional) because every applicant must submit one. It is not declared as
biometric or health data: nothing analyses the photo automatically, a human
just looks at it.

---

## Other App content sections

| Section | Answer |
|---|---|
| **App access** | *All functionality is restricted* — supply demo credentials |
| **Ads** | No ads |
| **Target audience** | **18+ only.** Do not tick any under-18 band |
| **News app** | No |
| **COVID-19 apps** | No |
| **Data safety** | As above |
| **Government apps** | No |
| **Financial features** | **None.** No payments anywhere in the app |
| **Health** | No |

### App access — the demo account

Reviewers cannot get past the verification wall — there is no invite code that
would let them skip it — so this is mandatory and a common rejection cause.

1. Create a real account in the Supabase project with a stable email and password
2. Set `profiles.status` to approved and stamp `verified_at`
3. Give it a filled-in profile, plus a trip and some availability so there is
   something to look at
4. Enter the credentials in App access with a note: *"GigAway verifies every
   account by hand before it can see other members. Use these credentials to
   bypass that step. All app functionality is available on this account."*
5. **Never delete it**, and never let it be suspended

Apple will ask for exactly the same thing.

### Content rating

Complete the questionnaire honestly. Members write free text to each other and
publish reviews, so expect questions about user-generated content and user
interaction. A **Teen / PEGI 12** outcome is normal for this shape of app. Note
that the app has blocking, reporting and moderation — the questionnaire asks.

---

## Consistency checklist before submitting

- [ ] Every "Yes" here appears in the privacy policy
- [ ] Nothing in the privacy policy is missing here
- [ ] Privacy policy URL is live and resolves over HTTPS
- [ ] Deletion answer matches the in-app flow
- [ ] Sentry and PostHog declarations match the build you are uploading
- [ ] Demo account works, is verified, and is not suspended
