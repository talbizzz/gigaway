/**
 * Date-range arithmetic — the single definition of what "overlapping dates"
 * means across the app, the Edge Functions and (by agreement) the database.
 *
 * SEMANTICS, decided from the brief's own arithmetic:
 *
 *   `start` and `end` are the FIRST and LAST NIGHT of a stay, inclusive.
 *
 *   Project-Raw.md: "offers you his couch for the 3rd to the 5th — not the
 *   whole week, but three nights". 3rd→5th is three nights, so both ends count
 *   and nightCount is `end - start + 1`.
 *
 * Consequences worth holding onto:
 *   - A range where start === end is one night, not zero.
 *   - Two ranges that touch at a single date DO overlap, by that one shared
 *     night. A host free on the 5th can house a traveller whose last night is
 *     the 5th.
 *   - Postgres must therefore use `daterange(start, end, '[]')` — inclusive on
 *     both ends. The default '[)' would silently drop the shared night.
 *
 * Dates are opaque 'YYYY-MM-DD' strings. They are parsed as UTC and never with
 * `new Date(string)`, which interprets bare dates as local midnight and shifts
 * them by a day in negative offsets — a classic and invisible off-by-one.
 */

export type DateRange = {
  /** First night, 'YYYY-MM-DD'. */
  start: string
  /** Last night, 'YYYY-MM-DD', inclusive. */
  end: string
}

const MS_PER_DAY = 86_400_000
const ISO_DATE = /^\d{4}-\d{2}-\d{2}$/

/** Parses 'YYYY-MM-DD' as UTC midnight. Throws on anything else. */
function toUtc(date: string): number {
  if (!ISO_DATE.test(date)) {
    throw new TypeError(`Expected a YYYY-MM-DD date, received "${date}"`)
  }
  const value = Date.parse(`${date}T00:00:00Z`)
  if (Number.isNaN(value)) {
    throw new TypeError(`"${date}" is not a real date`)
  }
  // Date.parse rolls impossible dates over silently: '2027-02-30' becomes
  // 2 March rather than failing. Round-tripping catches that, so a typo in a
  // trip's dates surfaces as an error instead of a stay shifted by two days.
  if (new Date(value).toISOString().slice(0, 10) !== date) {
    throw new TypeError(`"${date}" is not a real date`)
  }
  return value
}

function fromUtc(value: number): string {
  return new Date(value).toISOString().slice(0, 10)
}

/** True when the range is well-formed (end is not before start). */
export function isValidRange(range: DateRange): boolean {
  try {
    return toUtc(range.end) >= toUtc(range.start)
  } catch {
    return false
  }
}

/** Nights in a range, counting both ends. A single-date range is one night. */
export function nightCount(range: DateRange): number {
  const start = toUtc(range.start)
  const end = toUtc(range.end)
  if (end < start) return 0
  return Math.round((end - start) / MS_PER_DAY) + 1
}

/** True when the two ranges share at least one night. */
export function overlaps(a: DateRange, b: DateRange): boolean {
  return toUtc(a.start) <= toUtc(b.end) && toUtc(b.start) <= toUtc(a.end)
}

/** The shared portion of two ranges, or null when they do not overlap. */
export function intersect(a: DateRange, b: DateRange): DateRange | null {
  const start = Math.max(toUtc(a.start), toUtc(b.start))
  const end = Math.min(toUtc(a.end), toUtc(b.end))
  if (start > end) return null
  return { start: fromUtc(start), end: fromUtc(end) }
}

/** Nights the two ranges share. Zero when they do not overlap. */
export function overlapNights(a: DateRange, b: DateRange): number {
  const shared = intersect(a, b)
  return shared ? nightCount(shared) : 0
}

/** Adds `days` to a date, returning 'YYYY-MM-DD'. Negative values subtract. */
export function addDays(date: string, days: number): string {
  return fromUtc(toUtc(date) + days * MS_PER_DAY)
}

/** Today in UTC, as 'YYYY-MM-DD'. Used to reject trips posted into the past. */
export function today(): string {
  return fromUtc(Date.now())
}

/** True when the range's last night has already passed. */
export function isPast(range: DateRange): boolean {
  return toUtc(range.end) < toUtc(today())
}
