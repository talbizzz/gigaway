import { describe, expect, it } from 'vitest'

import {
  isValidUsername,
  normaliseUsername,
  usernameProblem,
  usernameProblemMessage,
} from './username.ts'

describe('normaliseUsername', () => {
  it('lower-cases, trims and drops a leading @', () => {
    expect(normaliseUsername('  @Aziz_T ')).toBe('aziz_t')
  })
})

describe('usernameProblem', () => {
  it('accepts ordinary usernames', () => {
    for (const ok of ['aziz', 'aziz_t', 'anna.weber', 'a1b', 'x'.repeat(20), 'AZIZ']) {
      expect(usernameProblem(ok)).toBeNull()
    }
  })

  it('has a length floor and ceiling', () => {
    expect(usernameProblem('ab')).toBe('too_short')
    expect(usernameProblem('x'.repeat(21))).toBe('too_long')
  })

  it('allows only letters, digits, dots and underscores', () => {
    expect(usernameProblem('anna weber')).toBe('characters')
    expect(usernameProblem('anna-weber')).toBe('characters')
    expect(usernameProblem('anna!')).toBe('characters')
  })

  it('must start and end with a letter or digit', () => {
    expect(usernameProblem('_anna')).toBe('edges')
    expect(usernameProblem('anna.')).toBe('edges')
  })

  it('refuses two dots or underscores in a row', () => {
    expect(usernameProblem('anna..weber')).toBe('repeated')
    expect(usernameProblem('anna__weber')).toBe('repeated')
    expect(usernameProblem('anna._weber')).toBe('repeated')
  })

  it('reserves names that could pass for the team', () => {
    expect(usernameProblem('admin')).toBe('reserved')
    expect(usernameProblem('GigAway')).toBe('reserved')
  })
})

describe('isValidUsername and the message', () => {
  it('agree with each other', () => {
    expect(isValidUsername('anna_w')).toBe(true)
    expect(usernameProblemMessage('anna_w')).toBeNull()
    expect(isValidUsername('no')).toBe(false)
    expect(usernameProblemMessage('no')).toContain('at least 3')
  })
})
