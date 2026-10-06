import { describe, expect, it } from 'vitest'

import {
  isValidPhoneNumber,
  normalisePhoneNumber,
  PhoneNumberSchema,
  telLink,
} from './phone.ts'

describe('normalisePhoneNumber', () => {
  it('strips the punctuation people actually type', () => {
    expect(normalisePhoneNumber('+49 170 123 4567')).toBe('+491701234567')
    expect(normalisePhoneNumber('+44 (0)20-7946-0958')).toBe('+4402079460958')
    expect(normalisePhoneNumber('+33.6.12.34.56.78')).toBe('+33612345678')
  })

  it('rewrites a 00 international prefix to +', () => {
    // Most of Europe writes it this way, and it means the same thing.
    expect(normalisePhoneNumber('0049 170 1234567')).toBe('+491701234567')
  })
})

describe('isValidPhoneNumber', () => {
  it('accepts international numbers', () => {
    expect(isValidPhoneNumber('+491701234567')).toBe(true)
    expect(isValidPhoneNumber('0049 170 1234567')).toBe(true)
  })

  it('rejects a national number with no country code', () => {
    // The failure this whole module exists to prevent: whoever calls has no idea
    // what country it was written in, so this would dial the wrong number.
    expect(isValidPhoneNumber('0170 1234567')).toBe(false)
  })

  it('rejects numbers that cannot be dialled', () => {
    expect(isValidPhoneNumber('')).toBe(false)
    expect(isValidPhoneNumber('+')).toBe(false)
    expect(isValidPhoneNumber('+49')).toBe(false)
    expect(isValidPhoneNumber('+0491701234567')).toBe(false)
    expect(isValidPhoneNumber('not a number')).toBe(false)
  })

  it('rejects more than the 15 digits E.164 allows', () => {
    expect(isValidPhoneNumber('+1234567890123456')).toBe(false)
  })
})

describe('PhoneNumberSchema', () => {
  it('normalises on the way through, so storage is always E.164', () => {
    expect(PhoneNumberSchema.parse('+49 170 123 4567')).toBe('+491701234567')
  })

  it('explains what is missing rather than just failing', () => {
    const result = PhoneNumberSchema.safeParse('0170 1234567')
    expect(result.success).toBe(false)
    if (!result.success) {
      expect(result.error.issues[0]?.message).toContain('country code')
    }
  })
})

describe('telLink', () => {
  it('gives a dialable tel: link with no spaces or punctuation', () => {
    expect(telLink('+49 170 123 4567')).toBe('tel:+491701234567')
    expect(telLink('0049 (170) 1234567')).toBe('tel:+491701234567')
  })
})
