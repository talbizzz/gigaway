# Milestone 2: Trips & Matching

## Goal

A verified member can post a trip to a city for a date range, or post availability in their
home city, and immediately see which verified artists are there on overlapping dates — plus
other travellers heading to the same city that week.

## Context

**Milestone 1 is complete.** The monorepo, Supabase project, `cities` table, auth,
`profiles` with the verification state machine, `contact_details` with grant-gated policies,
invites and document verification all exist. The RLS helper functions
`is_approved()`, `is_blocked(uuid)` and `has_contact_grant(uuid)` are defined and tested.

Conventions established in Milestone 1 that must be respected:

- Every new table ships with RLS policies **and** pgTAP tests in the same migration.
- Nothing is visible to a user whose profile status is not `approved`.
- `is_blocked()` currently returns `false` (the `blocks` table arrives in Milestone 4) but
  **must still be called in every policy written here**, so Milestone 4 requires no policy
  rewrites.
- Shared domain logic goes in `packages/shared/domain` with explicit `.ts` import
  extensions, and is unit-tested with Vitest.

This milestone ends at *discovery*. Nobody can contact anybody yet — that is Milestone 3.

## Scope

### In Scope

- `trips` table with create / edit / cancel
- `availability` table with create / edit / cancel
- City picker component with fuzzy search over `cities`
- Date-range picker with sensible constraints
- `search_matches(trip_id)` SQL function returning hosts, co-travellers and nearby hosts
- Haversine nearby-city fallback (≤ 100 km)
- Match results screen
- "My trips" and "My availability" list screens
- Empty states designed as encouraging, not broken
- Vitest coverage of all date-overlap logic

### Out of Scope

- Requests, offers, acceptance, contact reveal (Milestone 3)
- Push notifications (Milestone 3)
- Reviews shown on profiles (Milestone 4)
- Multi-city trips, recurring availability, saved searches
- Map views

---

## Technical Specification

### Components to Build

#### 1. Domain module — `packages/shared/domain/dates.ts`

- **Responsibility:** the single definition of what "overlapping dates" means.
- **Interface:**

```ts
export type DateRange = { start: string; end: string }   // ISO 'YYYY-MM-DD', inclusive

export function overlaps(a: DateRange, b: DateRange): boolean
export function intersect(a: DateRange, b: DateRange): DateRange | null
export function nightCount(r: DateRange): number          // end - start, in nights
export function overlapNights(a: DateRange, b: DateRange): number
```

- **Key notes:**
  - Ranges are **inclusive on both ends** and represent *days present in the city*, so a
    trip from the 3rd to the 10th is 7 nights.
  - Dates are plain date strings with no timezone. Never construct a `Date` from them
    without an explicit UTC parse — local-timezone parsing shifts dates by a day in
    negative offsets and is a classic source of off-by-one bugs.
  - Postgres uses `daterange(start, end, '[]')` with `&&`. The TypeScript and SQL
    definitions must agree; assert this with a test that exercises adjacent ranges
    (a range ending on the 5th and one starting on the 5th **do** overlap — one shared night).

#### 2. `CityPicker`

- **Responsibility:** turn typing into a `city_id`.
- **Interface:** `<CityPicker value={cityId} onChange={(city: City) => void} />`
- **Key notes:**
  - Queries `cities` with `ilike` against `name`, `name_local`, and `aliases` — or a single
    RPC `search_cities(q text, limit int)` using the `pg_trgm` index. Prefer the RPC.
  - Debounce 250 ms; show `name`, `name_local` when different, and country.
  - **Free text is never accepted.** The form cannot submit without a `city_id`.
  - Cache recent selections locally so the common case is one tap.

#### 3. `DateRangePicker`

- **Responsibility:** pick an inclusive start and end date.
- **Key notes:**
  - `react-native-calendars` in range mode.
  - Constraints: start not in the past; end ≥ start; maximum span 60 days (a guard against
    someone posting "available all year", which would flood every search).
  - Display the derived night count as the user selects — it is the unit that matters.

#### 4. Trips

- **Responsibility:** a traveller's stated need in a city for a date range.
- **Interface:** direct `insert` / `update` / `select` on `trips`.
- **Key notes:**
  - `needs` is a text array from `couch` / `tips` / `company` / `co_accommodation`. At
    least one is required.
  - Editing dates or city is allowed while `status = 'active'`. Milestone 3 adds the rule
    that editing a trip with an accepted offer is blocked.
  - Cancelling sets `status = 'cancelled'` — never a hard delete, because Milestone 4's
    reviews reference the resulting stay.

#### 5. Availability

- **Responsibility:** a host's offer window in their home city.
- **Key notes:**
  - `offers` is a text array from `couch` / `spare_room` / `tips` / `coffee`.
  - `constraints` is a text array from `no_pets` / `no_smoking` / `women_only` /
    `no_children` / `quiet_household`. Rendered as plain chips.
  - `women_only` is a real safety feature from the brief, not a preference. It filters
    results in `search_matches`, it is not merely displayed.
  - `max_nights` is optional and caps what a host is willing to offer.
  - `city_id` defaults to the profile's `home_city_id` but is editable — people sublet, or
    are temporarily elsewhere.

#### 6. `search_matches(trip_id uuid)`

- **Responsibility:** one round trip returning everything the match screen shows.
- **Interface:** `supabase.rpc('search_matches', { trip_id })`
- **Critical:** declare the function **`stable`, `security invoker`** — NOT
  `security definer`. RLS must remain active inside it so that pending users, blocked
  pairs and suspended profiles are filtered by the same policies as everywhere else.
- **Returns** a single JSON object:

```jsonc
{
  "hosts": [
    {
      "availabilityId": "uuid",
      "profile": { "id": "uuid", "displayName": "…", "discipline": "strings",
                   "specialisation": "cello", "photoPath": "…", "homeDistrict": "Neuhausen" },
      "cityId": "uuid",
      "offers": ["couch"],
      "constraints": ["no_pets"],
      "overlap": { "start": "2027-03-03", "end": "2027-03-05" },
      "overlapNights": 2,
      "maxNights": 3,
      "distanceKm": 0
    }
  ],
  "travellers": [
    { "tripId": "uuid", "profile": { … },
      "overlap": { "start": "…", "end": "…" }, "overlapNights": 4,
      "needs": ["couch","co_accommodation"] }
  ],
  "nearbyHosts": [ /* same shape as hosts, distanceKm > 0 */ ]
}
```

- **Logic:**
  1. Load the trip; abort unless it belongs to the caller.
  2. **hosts** — `availability` where `city_id` matches, `status = 'active'`, the
     ranges overlap, the owner is not the caller, and `women_only` is satisfied.
     Order by `overlapNights` desc, then `created_at` asc. Limit 50.
  3. **travellers** — other `trips` in the same city with overlapping ranges,
     `status = 'active'`, excluding the caller. Order by `overlapNights` desc. Limit 50.
  4. **nearbyHosts** — only computed when `hosts` has fewer than 5 rows. Cities within
     100 km by haversine, excluding the trip's own city, same overlap rules. Order by
     `distanceKm` asc. Limit 20.
  5. RLS filters suspended, pending and blocked profiles automatically. **Do not
     re-implement those checks in the function** — duplicated logic drifts.

- **`women_only` semantics:** the brief lists it as a host-side constraint but the schema
  has no gender field, and adding one has its own privacy cost. **Decision for v1:**
  `women_only` is stored and displayed prominently on the host card, and the host applies
  it themselves when responding to a request. It does **not** filter results, because
  there is no reliable field to filter on. Do not add a gender column to make filtering
  work — record this as a known limitation and revisit if beta feedback demands it.

#### 7. Match screen

- **Responsibility:** the moment that has to feel worth it.
- **Key notes:**
  - Three sections in order: **Hosts** → **Also travelling** → **Nearby**.
  - Host cards lead with **overlap nights**, not the host's full window — "3 nights of
    your 7" is the value proposition. Partial coverage is a success, not a shortfall;
    the copy must never frame it as partial failure.
  - Nearby section header states the distance plainly: "No hosts in Munich for your dates —
    2 nearby."
  - Cards show `homeDistrict`, never a precise location. There is no map.

#### 8. Empty states

Per NFR 4, these are a designed feature, not a fallback. Three distinct cases, each with a
different message and a different primary action:

| Case | Message | Action |
|---|---|---|
| No hosts, no travellers, no nearby | "You're early in Munich. Nobody's posted availability for these dates yet." | Invite a colleague / post your own availability |
| No hosts, but travellers exist | "No couches yet — but two other artists are in Munich that week." | Scroll to travellers |
| Hosts exist but none cover the full range | Not an empty state. Show them normally. | — |

Never show a bare "0 results". The most likely first experience of an early user is an
empty search, and that moment decides whether they come back.

---

### Data Model

```sql
-- ─── trips ────────────────────────────────────────────────────────────────
create type trip_status as enum ('active','cancelled','completed');

create table trips (
  id         uuid primary key default gen_random_uuid(),
  profile_id uuid not null references profiles(id) on delete cascade,
  city_id    uuid not null references cities(id),
  start_date date not null,
  end_date   date not null,
  needs      text[] not null default '{}',
  note       text check (char_length(note) <= 400),
  status     trip_status not null default 'active',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint trip_dates_ordered check (end_date >= start_date),
  constraint trip_span_sane   check (end_date - start_date <= 60),
  constraint trip_needs_present check (array_length(needs, 1) >= 1)
);
create index trips_city_dates on trips
  using gist (city_id, daterange(start_date, end_date, '[]'))
  where status = 'active';
create index trips_profile on trips (profile_id);

-- ─── availability ─────────────────────────────────────────────────────────
create type availability_status as enum ('active','cancelled');

create table availability (
  id          uuid primary key default gen_random_uuid(),
  profile_id  uuid not null references profiles(id) on delete cascade,
  city_id     uuid not null references cities(id),
  start_date  date not null,
  end_date    date not null,
  offers      text[] not null default '{}',
  constraints text[] not null default '{}',
  max_nights  int check (max_nights is null or max_nights > 0),
  note        text check (char_length(note) <= 400),
  status      availability_status not null default 'active',
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now(),
  constraint av_dates_ordered check (end_date >= start_date),
  constraint av_span_sane     check (end_date - start_date <= 60),
  constraint av_offers_present check (array_length(offers, 1) >= 1)
);
create index availability_city_dates on availability
  using gist (city_id, daterange(start_date, end_date, '[]'))
  where status = 'active';
create index availability_profile on availability (profile_id);
```

`btree_gist` must be enabled for the composite GiST indexes:
`create extension if not exists btree_gist;`

### RLS Policies

| Table | Operation | Rule |
|---|---|---|
| `trips` | select | own rows always; others only if `is_approved()` **and** owner's status is `approved` **and** `status = 'active'` **and** `not is_blocked(profile_id)` |
| `trips` | insert | `profile_id = auth.uid()` and `is_approved()` |
| `trips` | update | `profile_id = auth.uid()`; `profile_id` itself immutable |
| `trips` | delete | none — cancel instead |
| `availability` | select | same shape as `trips` |
| `availability` | insert | `profile_id = auth.uid()` and `is_approved()` |
| `availability` | update | `profile_id = auth.uid()` |
| `availability` | delete | none — cancel instead |

### Environment & Configuration

None new. `search_cities` and `search_matches` are database functions, not services.

---

## Implementation Order

1. **`packages/shared/domain/dates.ts` with full Vitest coverage.** Everything downstream
   depends on these semantics; get them right and frozen first.
2. **Migration: `trips` + `availability` + constraints + indexes + policies**, with pgTAP
   asserting a pending user sees nothing, a blocked pair sees nothing, and a cancelled
   trip is invisible to others.
3. **`search_cities` RPC + `CityPicker`.** Independently testable and reused by both forms.
4. **`DateRangePicker`.**
5. **Trip create form + "My trips" list + cancel.**
6. **Availability create form + "My availability" list + cancel.** Nearly the same shape —
   factor shared form pieces after the second one exists, not before.
7. **`search_matches` — hosts and travellers only.** Verify against seeded fixtures.
8. **Add `nearbyHosts`** with the haversine expression. Confirm Munich→Augsburg lands
   around 60 km.
9. **Match screen**, then empty states last, once the real shapes of "nothing found" are
   visible.

## Done Criteria

- [ ] Vitest covers `overlaps`, `intersect`, `nightCount`, `overlapNights`, including
      adjacent-range and single-day cases
- [ ] A test asserts the TypeScript overlap definition matches Postgres `daterange && `
- [ ] pgTAP: a `pending` user selecting `trips` or `availability` gets zero rows
- [ ] pgTAP: a cancelled trip is invisible to other users but visible to its owner
- [ ] A member can create, edit and cancel a trip on a real device
- [ ] A member can create, edit and cancel availability
- [ ] The city picker never permits a free-text city to be submitted
- [ ] Creating a trip navigates straight to matches — no extra tap
- [ ] `search_matches` returns hosts ranked by overlap nights, highest first
- [ ] Host cards state overlap nights ("3 of your 7 nights"), not raw host windows
- [ ] Co-travellers appear in their own section, excluding the caller
- [ ] With no hosts in the destination city, nearby-city hosts appear with distances
- [ ] All three empty states render correctly and none reads as an error
- [ ] `search_matches` returns nothing for a trip the caller does not own
- [ ] A trip is created end to end in under two minutes by a first-time user (NFR 4)

## Known Risks & Watch-Outs

- **Timezone drift on plain dates.** The single most likely bug here. Treat `YYYY-MM-DD`
  as an opaque string end to end; parse as UTC if you must parse at all.
- **Inclusive vs exclusive ranges.** Postgres `daterange` defaults to `[)`. Every
  construction in this codebase must pass `'[]'` explicitly.
- **`security definer` on `search_matches` would silently disable RLS** and leak suspended,
  pending and blocked profiles into results. It must be `security invoker`.
- **GiST index requires `btree_gist`** for the composite `(city_id, daterange)` form.
  Without it the index creation fails.
- **Haversine in SQL is fine at this scale** (a few thousand cities); do not reach for
  PostGIS. Materialise nearby-city pairs only if the query becomes slow, which it will not
  at hundreds of users.
- **The 60-day span cap is a real product decision.** Without it, one person posting a
  year of availability dominates every result set in their city.
- **`women_only` does not filter.** It is displayed and host-enforced. Note it in the beta
  feedback questions rather than quietly adding a gender field.
