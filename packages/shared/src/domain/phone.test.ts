import { describe, expect, it } from 'vitest'

import {
  isValidWhatsAppNumber,
  normalisePhoneNumber,
  WhatsAppNumberSchema,
  whatsAppLink,
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

describe('isValidWhatsAppNumber', () => {
  it('accepts international numbers', () => {
    expect(isValidWhatsAppNumber('+491701234567')).toBe(true)
    expect(isValidWhatsAppNumber('0049 170 1234567')).toBe(true)
  })

  it('rejects a national number with no country code', () => {
    // The failure this whole module exists to prevent: wa.me has no idea what
    // country the reader is in, so this would dial the wrong number entirely.
    expect(isValidWhatsAppNumber('0170 1234567')).toBe(false)
  })

  it('rejects numbers that cannot be dialled', () => {
    expect(isValidWhatsAppNumber('')).toBe(false)
    expect(isValidWhatsAppNumber('+')).toBe(false)
    expect(isValidWhatsAppNumber('+49')).toBe(false)
    expect(isValidWhatsAppNumber('+0491701234567')).toBe(false)
    expect(isValidWhatsAppNumber('not a number')).toBe(false)
  })

  it('rejects more than the 15 digits E.164 allows', () => {
    expect(isValidWhatsAppNumber('+1234567890123456')).toBe(false)
  })
})

describe('WhatsAppNumberSchema', () => {
  it('normalises on the way through, so storage is always E.164', () => {
    expect(WhatsAppNumberSchema.parse('+49 170 123 4567')).toBe('+491701234567')
  })

  it('explains what is missing rather than just failing', () => {
    const result = WhatsAppNumberSchema.safeParse('0170 1234567')
    expect(result.success).toBe(false)
    if (!result.success) {
      expect(result.error.issues[0]?.message).toContain('country code')
    }
  })
})

describe('whatsAppLink', () => {
  it('strips the plus, which wa.me rejects', () => {
    expect(whatsAppLink('+49 170 123 4567')).toBe('https://wa.me/491701234567')
  })
})
