import { describe, expect, it } from 'vitest'

import { DISCIPLINES, disciplineExample, disciplineLabel } from './disciplines.ts'

describe('DISCIPLINES', () => {
  it('lists the categories in the agreed order, ending with Other', () => {
    expect(DISCIPLINES.map((d) => d.label)).toEqual([
      'Singer',
      'Instrumentalist',
      'Musical Theatre',
      'Dancer',
      'Actor/Actress',
      'Conductor',
      'Stage Director',
      'Artist',
      'Photographer',
      'Designer',
      'Other',
    ])
  })

  it('has unique stored values, all lower snake_case', () => {
    const values = DISCIPLINES.map((d) => d.value)
    expect(new Set(values).size).toBe(values.length)
    for (const value of values) expect(value).toMatch(/^[a-z]+(_[a-z]+)*$/)
  })
})

describe('disciplineLabel', () => {
  it('turns a stored value into its label', () => {
    expect(disciplineLabel('musical_theatre')).toBe('Musical Theatre')
    expect(disciplineLabel('actor')).toBe('Actor/Actress')
  })

  it('shows an unknown value as it is, and nothing for none', () => {
    expect(disciplineLabel('voice')).toBe('voice')
    expect(disciplineLabel(null)).toBe('')
  })
})

describe('disciplineExample', () => {
  it('suggests something for a category, and nothing for Other or unknown', () => {
    expect(disciplineExample('singer')).toBe('Mezzo-soprano')
    expect(disciplineExample('other')).toBe('')
    expect(disciplineExample('nonsense')).toBe('')
  })
})
