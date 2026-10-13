import { describe, expect, it } from 'vitest'

import {
  isServiceKind,
  isStayService,
  offersAStay,
  SERVICE_KINDS,
  serviceLabel,
  SERVICES,
} from './services.ts'

describe('services', () => {
  it('has the four, each defined once and in the same order', () => {
    expect([...SERVICE_KINDS]).toEqual(['couch', 'spare_room', 'coffee', 'tips'])
    expect(SERVICES.map((s) => s.value)).toEqual([...SERVICE_KINDS])
  })

  it('says which of them is somewhere to sleep', () => {
    expect(isStayService('couch')).toBe(true)
    expect(isStayService('spare_room')).toBe(true)
    expect(isStayService('coffee')).toBe(false)
    expect(isStayService('tips')).toBe(false)
    expect(isStayService('nonsense')).toBe(false)
    expect(isStayService(null)).toBe(false)
  })

  it('knows whether a set of services includes a bed', () => {
    expect(offersAStay(['coffee', 'couch'])).toBe(true)
    expect(offersAStay(['coffee', 'tips'])).toBe(false)
    expect(offersAStay([])).toBe(false)
    expect(offersAStay(undefined)).toBe(false)
  })

  it('names each one, and recognises only the stored values', () => {
    expect(serviceLabel('tips')).toBe('Local tips')
    expect(serviceLabel('unknown')).toBe('unknown')
    expect(isServiceKind('coffee')).toBe(true)
    expect(isServiceKind('Coffee')).toBe(false)
  })

  it('gives every service a title and a description', () => {
    for (const service of SERVICES) {
      expect(service.title.length).toBeGreaterThan(0)
      expect(service.description.length).toBeGreaterThan(0)
    }
  })
})
