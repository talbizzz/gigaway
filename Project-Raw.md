# GigAway

## Summary

GigAway is an invite-only mobile app for professional performing artists — primarily
classical musicians, singers, and dancers — who travel frequently for gigs, auditions,
and competitions. When an artist logs an upcoming trip (city + date range), the app
connects them with verified fellow artists in that city who are offering a free couch,
local knowledge, or company, and with other artists travelling there at the same time
who might split accommodation. The core value is **money saved on accommodation**, not
socialising: freelance performers are frequently underpaid and self-funding trips, and
lodging is usually the largest single cost of a four-day trip. The differentiator versus
generic hospitality platforms and existing Facebook/WhatsApp artist groups is a closed,
verified, professionally accountable community combined with structured search by city
and date. No money changes hands in v1.

## Problem Statement

Freelance performing artists travel constantly and unpredictably to cities where they
know no one. A typical trip: a mezzo-soprano based in Berlin has a competition in Munich
and needs to be there four days. She has never been to the city, has no contacts there,
and pays full price for a hotel or Airbnb on a trip that may already be a net financial
loss even if she places well.

Two distinct pains:

1. **Cost.** Accommodation is the dominant expense of a short professional trip.
   Meanwhile, other artists in the destination city often have a spare couch they would
   happily lend a colleague for free — but the two never find each other.
2. **Missed opportunity.** She has no way to know which colleagues are in that city, who
   else from her world is travelling there the same week (potential accommodation-sharing
   or cost-splitting), or who can give practical local guidance (which accompanist, which
   practice rooms, how to get to the venue).

Today artists solve this by posting in large Facebook or WhatsApp groups, or by asking
the few colleagues they personally know. That approach fails in specific ways:

- No structured search — finding "Munich, 3–10 March" means scrolling hundreds of posts.
- No verification — groups contain non-artists; there is no basis for trusting a stranger
  enough to sleep in their home or to give them your keys.
- No persistent reputation across trips.
- Privacy — broadcasting to thousands of strangers that your flat is empty for four days,
  or that you personally will be away, is a real deterrent to participating.

## Target Users

Professional and pre-professional performing artists in Europe, initially concentrated in
the German-speaking classical music world.

Primary profile:

- Freelance classical singers (opera, concert), instrumentalists, and dancers.
- Age roughly 22–40. Conservatory students, recent graduates, and early-to-mid-career
  freelancers.
- Travel 5–20+ times per year for auditions, competitions, guest contracts, masterclasses.
- Income is irregular and often low; cost sensitivity is high and genuine.
- Frequently self-funding trips, particularly auditions and competitions (this
  assumption is NOT yet validated — see Risks).
- Highly networked within a small professional world where reputation carries real
  weight — people repeatedly encounter each other across cities and years.

Both sides of the marketplace are the same population. A user is a traveller on some
trips and a host in their home city on others. This is important: it means supply and
demand are not separate acquisition problems, and it means reciprocity norms
("someone hosted me, I host back") can be leaned on.

Scale: individual users. No team or organisational accounts in v1.

Seed cluster: the personal network of a close contact active in the European opera
world, with access to conservatories, conferences, competitions, and artist groups. This
person is a durable, repeatable promotion channel, not a one-shot opportunity.

## Proposed Solution

A native mobile app (iOS + Android) with a small companion web landing page.

### Access and verification

Membership is restricted to verified artists. This wall is the core of the product — it
is the reason a user trusts a stranger enough to host them or stay with them.

Two entry paths:

1. **Invite chain (primary).** Existing members invite colleagues via an invite link.
   Every member is traceable to a voucher. Invites are limited per user to prevent
   uncontrolled dilution.
2. **Document verification (fallback).** An applicant without an invite submits evidence
   of professional status — CV, conservatory enrolment or diploma, performance links,
   agency page, programme booklets. A human (the founder) reviews and approves or rejects.
   Applicant waits in a pending state until reviewed.

### Core loop — traveller

1. Traveller creates a **Trip**: destination city, date range, and what they are looking
   for (couch / local tips / coffee & company / co-accommodation with another traveller).
2. On creating the trip, they immediately see a list of verified users in that city whose
   posted availability overlaps their dates, plus other travellers heading to the same
   city in the same window.
3. They send a **Request** to one or more hosts with a single tap.
4. A host can respond with an **Offer**, including a *partial* date range (e.g. offering
   2 nights of a requested 7). Partial offers are first-class, not a degraded case —
   partial coverage still saves real money.
5. Traveller accepts an offer. On acceptance, and only then, contact details and
   approximate location are revealed to both parties. They continue the conversation on
   their existing channels (WhatsApp, email, phone).

### Core loop — host

1. Host posts **Availability** in their home city: date ranges, what they offer (couch /
   spare room / tips only / happy to meet for coffee), and any constraints (no pets,
   women only, max nights, etc.).
2. Host sees incoming requests and open trip requests to their city, and can proactively
   offer.

### Reputation

After a completed stay or meeting, both parties are prompted to review each other.
Reviews are **attributed** (not anonymous) and **double-blind**: neither review is
published until both are submitted or a fixed window (e.g. 14 days) expires. Each review
includes a binary "would host again / would stay again" plus free text.

Anonymity is explicitly rejected for peer reviews: in a community this small anonymity is
illusory (a host with two guests knows who wrote what) while still removing accountability.

Separately, a **private report channel** to the moderator exists for safety concerns,
harassment, or misconduct. Reports are never public and never shown to the reported user.

### Why not a Facebook group

- Artists only, enforced by invite chain and manual verification.
- Structured search by city and overlapping date range, rather than scrolling a feed.
- Persistent, portable reputation across trips.
- Privacy: travel plans and home availability are visible only to verified members and
  precise details only after a match, rather than broadcast to thousands.

## Technical Approach

Decided:

- **Mobile app: Expo + React Native + TypeScript.** iOS and Android from one codebase.
  Chosen because the developer is already fluent in React / React Native / TypeScript and
  because the target UX quality is native-feeling. Expo's over-the-air update mechanism
  allows shipping most JS-only fixes without a new store review, which removes the main
  argument against native for a fast-iterating v1.
- **Backend: Supabase.** Postgres, auth, file storage, row-level security. Chosen for
  solo-developer velocity and TypeScript ergonomics. Row-level security is load-bearing
  here — visibility rules (who can see whose address, whose trips, whose reviews) must be
  enforced in the database, not only in the client.
- **Web: a thin static landing / invite-acceptance page.** Not a second product. Its jobs
  are: marketing surface, invite link target for people who don't have the app yet, store
  download links, privacy policy and terms. Any lightweight stack is fine (Next.js or
  plain static hosting).
- **No payments anywhere in v1.** Hosting is free. This is a deliberate legal and scope
  decision, see Constraints.
- **No in-app chat in v1.** Contact details are revealed on acceptance and conversation
  moves off-platform. This is a deliberate scope cut.
- **No custom admin UI in v1.** Verification review and moderation are performed directly
  through the Supabase dashboard.

Undecided / planner's discretion: push notification implementation details, analytics,
error monitoring, CI, testing strategy, exact landing page stack.

### Data protection (GDPR — mandatory, not optional)

Users are in the EU and the app handles personal data including home location, travel
plans, and identity documents.

- Verification documents are sensitive. Review, record the **outcome only**, then
  **delete the uploaded file**. Do not accumulate a store of passports, diplomas, or CVs.
- Home address is never public. Show approximate area (district / neighbourhood) before
  a match; exact address only after an offer is accepted, and ideally exchanged directly
  between the parties rather than stored.
- Account deletion must actually delete or irreversibly anonymise user data.
- Privacy policy and terms of service are required before either app store will accept a
  submission. They are a launch blocker, not a nice-to-have.

## Competitive Landscape

| Alternative | What it does | Why GigAway differs |
|---|---|---|
| Facebook / WhatsApp artist groups | Free-form posts asking for couches, advice, contacts | No structured city+date search, no verification, no persistent reputation, no privacy |
| Couchsurfing | Free hospitality between travellers | Open to anyone; trust collapsed over time; no professional accountability; no shared professional context |
| Airbnb / hotels | Paid accommodation | Costs money — which is precisely the pain being solved |
| Competition / festival host family programmes | Free housing arranged by the organiser | Free, trusted, and already established — but only exists for *some* events. GigAway serves the trips nobody arranges housing for: auditions, self-funded competitions, guest gigs |
| Professional artist networks (casting/CV platforms) | Job listings, profiles, casting | Career infrastructure, not travel or accommodation |

**Real differentiator:** a closed guild with professional accountability. The classical
world is small and reputationally sticky — participants repeatedly re-encounter each other
at auditions, in agencies, on juries. Bad behaviour has consequences that persist outside
the app, which is a trust mechanism open platforms structurally cannot replicate.

**Honest weaknesses:**

- The same smallness suppresses honest negative feedback — nobody wants to publicly
  criticise someone who may sit on a jury. The double-blind mechanism and the private
  report channel mitigate but do not eliminate this. Expect ratings to skew positive.
- Host family programmes already cover part of the need, at zero cost, with more trust.
- Low usage frequency: a user may open the app only a handful of times per year. Retention
  metrics will look bad by consumer-app standards and this is normal for this category —
  do not over-react to it.
- No monetisation. There is no revenue model in v1 and none is planned yet.

## Risks & Open Questions

**Unvalidated market assumption (highest priority).** It is not known what share of an
artist's trips are self-funded versus covered by the engaging house, festival, or
competition. If most accommodation is already paid for or arranged, the addressable
need is much thinner than assumed — limited to auditions, unfunded competitions, and
self-produced work. **Action: ask 5–10 real artists directly what fraction of their
trips they pay for themselves. Do this during the closed beta, ideally before.**

**Density / cold start.** The app is useless unless a specific city has a host with free
dates matching a specific traveller's dates. A thin national launch produces empty
searches and immediate churn. Mitigations already designed in: request-first flow (the
traveller broadcasts a need rather than browsing an empty list), acceptance of partial
date offers, and non-accommodation value (local tips, coffee, co-travellers) so a trip
with no couch match is still not empty. Additional mitigation: launch deliberately narrow —
one network or a small set of high-traffic city pairs — rather than open geographically.

**Safety.** Strangers sleeping in each other's homes, in a population that includes many
young women travelling alone. This is a permanent operational responsibility, not a
feature that gets completed. Required in v1: block, private report, moderator ability to
suspend and remove, clear community guidelines, host-side constraints (e.g. "women only"),
and no exposure of exact address before acceptance. A single serious incident is an
existential risk to the platform's reputation in a small, tightly connected community.

**Verification integrity.** The "artists only" wall is the entire trust proposition. If it
becomes trivially bypassable, the product loses its reason to exist. Invite limits per
user and genuine human review of document applications are the defences. Verification
must not be silently degraded for growth.

**German rental law.** Not a blocker at v1 *because hosting is free*. Berlin and Munich
both restrict misuse of residential space (*Zweckentfremdungsverbot*), and most German
tenancy agreements forbid subletting without written landlord permission. These constraints
bite when money changes hands. **Any future move to paid stays requires legal review
first.** This is the single most important reason not to casually add payments.

**Defamation risk in the roadmap.** The planned feature for anonymous ratings of
institutions, schools, and teachers carries substantially higher legal risk than peer
reviews, particularly for *named individuals*, who have strong personality rights under
German law. Institutions carry meaningfully less risk than individual teachers, but not
zero. This feature must not be shipped casually alongside other roadmap items: it requires
a notice-and-takedown process, identity retention for accountability, moderation capacity,
and legal advice. Explicitly out of v1.

**Launch sequencing.** The developer is concerned that a poor first impression on the
community would be hard to recover from. The promotion channel is durable and repeatable,
but community attention is not. Mitigation: a closed beta of ~30–50 people who know the
product is early and will tolerate rough edges, followed by a wider public push only once
the core loop demonstrably works.

**Solo capacity.** One developer building, verifying users, moderating, and supporting.
Manual verification is fine at a few hundred users and breaks well before a few thousand.

**External launch dependencies (critical path).** Apple Developer Program enrolment,
Google Play developer account, EU trader-status verification, TestFlight beta review, and
a published privacy policy are all required before real users can install anything, and
none are under the developer's control. **These must be started immediately, in parallel
with development.**

## Scope & Constraints

**Team:** Solo. Developer is comfortable with React, React Native, and TypeScript.
Implementation will be heavily agent-assisted.

**Timeline:** Target is a working, testable v1 within approximately one week of build
time. This is aggressive but plausible for the *code* given the scope cuts below. It is
not plausible for *public store availability* in the same week, due to the external
dependencies listed above. Plan for: build in ~1 week → closed beta via TestFlight /
internal distribution → public store launch afterwards.

**Budget:** Minimal. Free tiers wherever possible. Unavoidable costs are the Apple
Developer Program annual fee and the one-off Google Play registration fee.

**Money:** No payments, no fees, no transactions of any kind in v1. Hosting is free
between colleagues.

### v1 INCLUDES

- Invite-chain signup with per-user invite limits
- Document-submission verification path with a pending state, reviewed manually via the
  Supabase dashboard
- User profile: name, discipline / voice type / instrument, home city, photo, short bio,
  professional links, contact details (revealed only on match)
- Create a Trip: destination city, date range, what is needed (couch / tips / company /
  co-accommodation)
- Post Availability as a host: home city, date ranges, what is offered, constraints
- Matching view: on trip creation, show verified hosts in that city with overlapping
  dates, and other travellers in that city in the same window
- Request → Offer → Accept flow, with support for partial date offers
- Contact reveal on acceptance
- Double-blind attributed reviews with a "would host/stay again" binary
- Block, and a private report channel to the moderator
- Push notifications for the events that matter: new request, new offer, offer accepted
- Landing / invite-acceptance web page with privacy policy and terms

### v1 EXPLICITLY EXCLUDES

- Any payments or money transfer
- In-app chat / real-time messaging
- A custom admin dashboard
- The services marketplace (tax help, website building, lessons, sheet music)
- The social feed / "social media for artists" layer
- Anonymous reviews of institutions, schools, or teachers
- Public profile browsing outside of a trip or availability context
- Anything beyond the initial launch geography
- Groups, events, or organisational accounts

## Success Criteria

v1 is successful if, within roughly two months of the closed beta starting:

1. **50+ verified users** onboarded, the majority via invite chain.
2. **At least 10 completed stays** — a request accepted and the guest actually stayed.
   This is the single most important metric; it proves the core loop works end to end.
3. **At least one user reports a concrete amount of money saved**, and can say roughly
   how much.
4. **Verification holds**: no non-artists get through, and no user reports feeling the
   community has been diluted.
5. **Zero serious safety incidents**, with a working report path that has been tested at
   least once (even on a trivial case).
6. **At least 3 users return** to post a second trip or a second availability window —
   evidence of repeat value rather than novelty.

v1 is "done" when a user can go from invite link → verified account → posted trip →
matched host → accepted offer → completed stay → mutual review, on a real device, without
developer intervention.

If after two months there are fewer than a handful of completed stays despite active
users, the density assumption has failed and the concept needs rethinking before more is
built.

## Requirements

### Functional

1. Sign up via invite link; every account is traceable to an inviter.
2. Sign up via document submission; account remains in a pending state, with no access to
   member content, until manually approved.
3. Limit invites per user to a configurable number.
4. Create, edit, and delete a profile including discipline, home city, bio, photo,
   professional links, and private contact details.
5. Create, edit, and cancel a Trip (destination city, start date, end date, needs).
6. Create, edit, and cancel host Availability (city, date ranges, what is offered,
   constraints).
7. Match trips to availability by city and overlapping date range, including partial
   overlaps.
8. Surface other travellers going to the same city in an overlapping window.
9. Send a request from traveller to host; send an offer from host to traveller, including
   proactive offers against open trips.
10. Offers may cover a subset of the requested dates.
11. Accept or decline offers; acceptance reveals contact details to both parties.
12. Prompt both parties for a review after the stay end date; withhold publication until
    both submit or the review window expires.
13. Reviews carry an attributed author, a would-host/stay-again binary, and free text.
14. Block another user, preventing all visibility and contact in both directions.
15. Submit a private report to the moderator about a user or an interaction.
16. Moderator can approve/reject verification, suspend, and delete accounts.
17. Push notifications for new request, new offer, and accepted offer.
18. Delete own account, with real data deletion or irreversible anonymisation.

### Non-functional

1. **Privacy by default.** Exact home address is never visible before an accepted offer.
   Trips and availability are visible only to verified members. Contact details are
   revealed only on acceptance. These rules are enforced at the database level via row-level
   security, not only in client code.
2. **GDPR compliance.** Lawful basis for processing, published privacy policy, working
   data export and deletion, and deletion of verification documents immediately after
   review.
3. **Trust and safety.** Reports reach the moderator promptly; blocked users are fully
   invisible to each other; suspension takes effect immediately.
4. **Usability.** The app must feel native and polished. A first-time user must be able to
   post a trip in under two minutes. Empty states must be handled gracefully and
   encouragingly — early users will frequently find no matches, and that moment must not
   read as a broken product.
5. **Internationalisation-ready.** The initial audience is German-speaking but operates in
   English. Ship in English, but do not hard-code strings in a way that makes translation
   painful later.
6. **Over-the-air updatable.** JS-only fixes must be shippable without a store submission.
7. **Reliability.** Missing a push notification for an accepted offer is a serious failure —
   the user may be about to book a hotel.
8. **Scale expectations.** Hundreds of users, not hundreds of thousands. Do not
   over-engineer for scale; do over-engineer for privacy and trust.

## Expected Final Result

A colleague sends you an invite link. You tap it, land on the GigAway page, install the
app, and sign up — you're verified instantly because someone vouched for you. (Without an
invite, you upload your CV and a couple of performance links, and wait a day or two for
approval.)

You fill in a short profile: mezzo-soprano, based in Berlin, a photo, a line about
yourself, a link to your website.

You have a competition in Munich from the 3rd to the 10th of March. You tap "Add trip,"
enter Munich and the dates, and tick what you're after: a place to stay, local tips, happy
to meet people. Immediately you see who's there — four verified artists in Munich with
couches free during part of your window, and two other singers travelling in for the same
competition who might split a flat.

You tap request on three of them. A cellist in Neuhausen offers you his couch for the 3rd
to the 5th — not the whole week, but three nights you now don't have to pay for. You
accept, his contact details appear, and you carry on over WhatsApp like normal people.

You stay, it goes well, and after the trip you both get a nudge to leave a review. Neither
review shows up until you've both written one. Next time someone looks him up, they see
that you stayed and that you'd stay again.

And when someone lands in Berlin next spring, you have a couch.
