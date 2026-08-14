import { describe, expect, it } from 'vitest'

import {
  INVITE_CODE_ALPHABET,
  INVITE_CODE_LENGTH,
  InviteCodeSchema,
  looksLikeInviteCode,
} from './invite-code.ts'

describe('invite code alphabet', () => {
  it('excludes characters that are ambiguous when read aloud or retyped', () => {
    // Codes get dictated over the phone and screenshotted into WhatsApp, so
    // I/1 and O/0 confusion is a real failure mode, not a theoretical one.
    for (const character of ['I', 'O', '0', '1']) {
      expect(INVITE_CODE_ALPHABET).not.toContain(character)
    }
  })

  it('matches the SQL generator: 32 characters, length 8', () => {
    // generate_invite_code() in supabase/migrations duplicates these values.
    expect(INVITE_CODE_ALPHABET).toHaveLength(32)
    expect(INVITE_CODE_LENGTH).toBe(8)
  })
})

describe('InviteCodeSchema', () => {
  it('accepts a well-formed code', () => {
    expect(InviteCodeSchema.parse('K7M2XQ4P')).toBe('K7M2XQ4P')
  })

  it('normalises what users actually paste', () => {
    // Copying out of a chat message routinely brings whitespace and case with it.
    expect(InviteCodeSchema.parse('  k7m2xq4p ')).toBe('K7M2XQ4P')
  })

  it.each([
    ['too short', 'K7M2XQ4'],
    ['too long', 'K7M2XQ4PP'],
    ['contains an excluded letter', 'K7M2XQ4O'],
    ['contains punctuation', 'K7M2-XQ4'],
    ['empty', ''],
  ])('rejects a code that is %s', (_label, value) => {
    expect(InviteCodeSchema.safeParse(value).success).toBe(false)
  })
})

describe('looksLikeInviteCode', () => {
  it('is lenient about case and whitespace, matching the schema', () => {
    expect(looksLikeInviteCode(' k7m2xq4p ')).toBe(true)
  })

  it('rejects partial input, so the submit button stays disabled while typing', () => {
    expect(looksLikeInviteCode('K7M2')).toBe(false)
  })
})
