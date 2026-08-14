import { describe, expect, it } from 'vitest'

import {
  addDays,
  intersect,
  isValidRange,
  nightCount,
  overlapNights,
  overlaps,
  type DateRange,
} from './dates.ts'

const range = (start: string, end: string): DateRange => ({ start, end })

describe('nightCount', () => {
  it('counts both ends, matching the brief', () => {
    // Project-Raw.md: "his couch for the 3rd to the 5th — ... three nights"
    expect(nightCount(range('2027-03-03', '2027-03-05'))).toBe(3)
  })

  it('treats a single date as one night, not zero', () => {
    expect(nightCount(range('2027-03-03', '2027-03-03'))).toBe(1)
  })

  it('returns zero for an inverted range rather than a negative count', () => {
    expect(nightCount(range('2027-03-05', '2027-03-03'))).toBe(0)
  })

  it('counts across a month boundary', () => {
    expect(nightCount(range('2027-01-30', '2027-02-02'))).toBe(4)
  })

  it('counts across a leap day', () => {
    expect(nightCount(range('2028-02-28', '2028-03-01'))).toBe(3)
  })
})

describe('overlaps', () => {
  it('is true for ranges sharing several nights', () => {
    expect(overlaps(range('2027-03-03', '2027-03-10'), range('2027-03-05', '2027-03-12'))).toBe(
      true,
    )
  })

  it('is TRUE for ranges touching on a single date', () => {
    // The whole point of inclusive ends: a host free on the 5th can house a
    // traveller whose last night is the 5th. Postgres must use '[]' to agree.
    expect(overlaps(range('2027-03-03', '2027-03-05'), range('2027-03-05', '2027-03-09'))).toBe(
      true,
    )
  })

  it('is false for ranges one day apart', () => {
    expect(overlaps(range('2027-03-03', '2027-03-05'), range('2027-03-06', '2027-03-09'))).toBe(
      false,
    )
  })

  it('is symmetric', () => {
    const a = range('2027-03-03', '2027-03-08')
    const b = range('2027-03-06', '2027-03-12')
    expect(overlaps(a, b)).toBe(overlaps(b, a))
  })

  it('is true when one range contains the other', () => {
    expect(overlaps(range('2027-03-01', '2027-03-31'), range('2027-03-10', '2027-03-12'))).toBe(
      true,
    )
  })
})

describe('intersect', () => {
  it('returns the shared portion', () => {
    expect(
      intersect(range('2027-03-03', '2027-03-10'), range('2027-03-05', '2027-03-12')),
    ).toEqual(range('2027-03-05', '2027-03-10'))
  })

  it('returns the single shared date for touching ranges', () => {
    expect(
      intersect(range('2027-03-03', '2027-03-05'), range('2027-03-05', '2027-03-09')),
    ).toEqual(range('2027-03-05', '2027-03-05'))
  })

  it('returns null when there is no overlap', () => {
    expect(intersect(range('2027-03-03', '2027-03-05'), range('2027-03-06', '2027-03-09'))).toBe(
      null,
    )
  })
})

describe('overlapNights', () => {
  it('counts the nights a partial offer actually covers', () => {
    // The traveller needs the 3rd–10th; the host offers the 3rd–5th.
    // The match screen leads with this number, so it has to be right.
    expect(
      overlapNights(range('2027-03-03', '2027-03-10'), range('2027-03-03', '2027-03-05')),
    ).toBe(3)
  })

  it('is one for touching ranges, not zero', () => {
    expect(
      overlapNights(range('2027-03-03', '2027-03-05'), range('2027-03-05', '2027-03-09')),
    ).toBe(1)
  })

  it('is zero when the ranges miss each other', () => {
    expect(
      overlapNights(range('2027-03-03', '2027-03-05'), range('2027-03-06', '2027-03-09')),
    ).toBe(0)
  })
})

describe('timezone safety', () => {
  it('does not shift dates regardless of the host timezone', () => {
    // `new Date('2027-03-03')` is UTC midnight, but `new Date('2027-03-03')`
    // rendered with local getters moves a day west of Greenwich. Parsing and
    // formatting must both be UTC or ranges silently drift.
    expect(addDays('2027-03-03', 1)).toBe('2027-03-04')
    expect(addDays('2027-03-01', -1)).toBe('2027-02-28')
    expect(addDays('2028-03-01', -1)).toBe('2028-02-29')
  })

  it('survives a DST transition', () => {
    // Europe/Berlin springs forward on 2027-03-28. A local-time implementation
    // would produce a 23-hour day and round the wrong way here.
    expect(nightCount(range('2027-03-27', '2027-03-29'))).toBe(3)
    expect(addDays('2027-03-27', 1)).toBe('2027-03-28')
  })
})

describe('input validation', () => {
  it('accepts a well-formed range', () => {
    expect(isValidRange(range('2027-03-03', '2027-03-05'))).toBe(true)
    expect(isValidRange(range('2027-03-03', '2027-03-03'))).toBe(true)
  })

  it('rejects an inverted range', () => {
    expect(isValidRange(range('2027-03-05', '2027-03-03'))).toBe(false)
  })

  it.each(['03-03-2027', '2027-3-3', 'tomorrow', '', '2027-02-30'])(
    'rejects "%s" rather than coercing it',
    (value) => {
      expect(isValidRange(range(value, '2027-03-05'))).toBe(false)
    },
  )

  it('throws on malformed input to the arithmetic helpers', () => {
    expect(() => nightCount(range('not-a-date', '2027-03-05'))).toThrow(TypeError)
  })
})
