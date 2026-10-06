import { describe, expect, it } from 'vitest'

import {
  COUNTRIES,
  countryByIso,
  defaultCountry,
  flagEmoji,
  joinPhoneNumber,
  splitPhoneNumber,
} from './countries.ts'

describe('COUNTRIES', () => {
  it('has unique ISO codes and plain-digit calling codes', () => {
    const isos = COUNTRIES.map((country) => country.iso)
    expect(new Set(isos).size).toBe(isos.length)
    for (const country of COUNTRIES) {
      expect(country.iso).toMatch(/^[A-Z]{2}$/)
      expect(country.dial).toMatch(/^[1-9]\d{0,2}$/)
    }
  })

  it('knows the countries the first cities are in', () => {
    expect(countryByIso('DE')?.dial).toBe('49')
    expect(countryByIso('AT')?.dial).toBe('43')
    expect(countryByIso('CH')?.dial).toBe('41')
    expect(countryByIso('GB')?.dial).toBe('44')
    expect(countryByIso('us')?.dial).toBe('1')
  })
})

describe('flagEmoji', () => {
  it('builds a flag from the ISO code', () => {
    expect(flagEmoji('DE')).toBe('🇩🇪')
    expect(flagEmoji('gb')).toBe('🇬🇧')
  })
})

describe('defaultCountry', () => {
  it('uses the device region when it is known, and Germany otherwise', () => {
    expect(defaultCountry('AT').iso).toBe('AT')
    expect(defaultCountry('ZZ').iso).toBe('DE')
    expect(defaultCountry(null).iso).toBe('DE')
  })
})

describe('splitPhoneNumber', () => {
  it('finds the country and keeps the rest as the national number', () => {
    expect(splitPhoneNumber('+491701234567')).toMatchObject({
      country: { iso: 'DE' },
      national: '1701234567',
    })
    expect(splitPhoneNumber('+4915123456789')?.country.iso).toBe('DE')
  })

  it('tells one-, two- and three-digit codes apart', () => {
    expect(splitPhoneNumber('+14155550123')?.country.dial).toBe('1')
    expect(splitPhoneNumber('+447911123456')?.country.dial).toBe('44')
    expect(splitPhoneNumber('+353851234567')?.country.dial).toBe('353')
    expect(splitPhoneNumber('+420601234567')?.country.iso).toBe('CZ')
  })

  it('shows a shared code as its primary country', () => {
    expect(splitPhoneNumber('+14155550123')?.country.iso).toBe('US')
    expect(splitPhoneNumber('+79161234567')?.country.iso).toBe('RU')
  })

  it('returns null for anything that is not a stored number', () => {
    expect(splitPhoneNumber('')).toBeNull()
    expect(splitPhoneNumber('0170 1234567')).toBeNull()
    expect(splitPhoneNumber('+0491701234567')).toBeNull()
  })
})

describe('joinPhoneNumber', () => {
  it('puts the code and the digits together', () => {
    expect(joinPhoneNumber('49', '170 123 4567')).toBe('+491701234567')
  })

  it('drops the zero people write for calls within their own country', () => {
    expect(joinPhoneNumber('49', '0170 1234567')).toBe('+491701234567')
    expect(joinPhoneNumber('44', '07911 123456')).toBe('+447911123456')
  })

  it('keeps the leading zero for Italy, where it belongs to the number', () => {
    expect(joinPhoneNumber('39', '06 1234 5678')).toBe('+390612345678')
  })

  it('ignores punctuation and gives nothing when nothing was typed', () => {
    expect(joinPhoneNumber('49', '(170) 123-4567')).toBe('+491701234567')
    expect(joinPhoneNumber('49', '')).toBe('')
    expect(joinPhoneNumber('49', ' - ')).toBe('')
  })
})
