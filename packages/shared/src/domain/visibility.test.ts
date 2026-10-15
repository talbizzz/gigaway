import { describe, expect, it } from 'vitest'

import {
  DEFAULT_TRIP_VISIBILITY,
  isTripVisibility,
  TRIP_VISIBILITIES,
  TRIP_VISIBILITY_LABELS,
  tripVisibilityDescription,
} from './visibility.ts'

describe('trip visibility', () => {
  it('has the three levels, public by default', () => {
    expect([...TRIP_VISIBILITIES]).toEqual(['public', 'connections', 'private'])
    expect(DEFAULT_TRIP_VISIBILITY).toBe('public')
  })

  it('labels every level', () => {
    for (const level of TRIP_VISIBILITIES) {
      expect(TRIP_VISIBILITY_LABELS[level].length).toBeGreaterThan(0)
    }
  })

  it('explains each level, naming the city when it knows it', () => {
    expect(tripVisibilityDescription('public', 'Munich')).toContain('Munich')
    expect(tripVisibilityDescription('public')).toContain('the city you are going to')
    expect(tripVisibilityDescription('connections')).toBe('Only your connections.')
    expect(tripVisibilityDescription('private')).toContain('ask')
  })

  it('recognises only the stored values', () => {
    expect(isTripVisibility('connections')).toBe(true)
    expect(isTripVisibility('everyone')).toBe(false)
    expect(isTripVisibility(null)).toBe(false)
  })
})
