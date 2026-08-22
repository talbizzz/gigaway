import { describe, expect, it } from 'vitest'

import {
  NOTIFICATION_TYPES,
  formatDateRange,
  isRevealNotification,
  notificationCopy,
  notificationRoute,
  type NotificationPayload,
  type NotificationType,
} from './notifications.ts'

/** A payload shaped exactly as the SQL triggers write one. */
const payload: NotificationPayload = {
  tripId: '11111111-1111-1111-1111-111111111111',
  cityName: 'Munich',
  startDate: '2027-03-03',
  endDate: '2027-03-10',
  offerId: '22222222-2222-2222-2222-222222222222',
  requestId: '33333333-3333-3333-3333-333333333333',
  withProfileId: '44444444-4444-4444-4444-444444444444',
  withName: 'Bruno Kraus',
  fromName: 'Anna Weber',
  toName: 'Clara Ortiz',
  offerStart: '2027-03-03',
  offerEnd: '2027-03-05',
  nights: 3,
}

describe('formatDateRange', () => {
  it('collapses the month when both ends share it', () => {
    expect(formatDateRange('2027-03-03', '2027-03-10')).toBe('3–10 March')
  })

  it('names both months when the range crosses one', () => {
    expect(formatDateRange('2027-02-28', '2027-03-03')).toBe('28 February – 3 March')
  })

  it('renders a single night without a dash artefact', () => {
    expect(formatDateRange('2027-03-03', '2027-03-03')).toBe('3–3 March')
  })

  it('is empty rather than "Invalid Date" when a bound is missing', () => {
    expect(formatDateRange(undefined, '2027-03-10')).toBe('')
    expect(formatDateRange('2027-03-03', undefined)).toBe('')
  })

  it('does not shift the day in a negative UTC offset', () => {
    // Parsed as UTC, never as local midnight — the classic off-by-one that
    // moves a stay by a day for anyone west of Greenwich.
    expect(formatDateRange('2027-01-01', '2027-01-01')).toBe('1–1 January')
  })
})

describe('notificationCopy', () => {
  it('produces title and body for every type, with nothing left blank', () => {
    for (const type of NOTIFICATION_TYPES) {
      const copy = notificationCopy(type, payload)
      expect(copy.title.length, `${type} title`).toBeGreaterThan(0)
      expect(copy.body.length, `${type} body`).toBeGreaterThan(0)
      expect(copy.title, `${type} title`).not.toContain('undefined')
      expect(copy.body, `${type} body`).not.toContain('undefined')
    }
  })

  it('survives an empty payload without printing "undefined" at the user', () => {
    for (const type of NOTIFICATION_TYPES) {
      const copy = notificationCopy(type, {})
      expect(copy.title, `${type} title`).not.toContain('undefined')
      expect(copy.body, `${type} body`).not.toContain('undefined')
      expect(copy.title, `${type} title`).not.toContain('NaN')
    }
  })

  it('leads an offer with the nights, since that is the unit that matters', () => {
    const copy = notificationCopy('offer_received', payload)
    expect(copy.title).toContain('3 nights')
    expect(copy.title).toContain('Anna Weber')
  })

  it('singularises one night', () => {
    const copy = notificationCopy('offer_received', { ...payload, nights: 1 })
    expect(copy.title).toContain('1 night')
    expect(copy.title).not.toContain('1 nights')
  })

  it('distinguishes an auto-decline from a refusal', () => {
    const auto = notificationCopy('offer_declined', { ...payload, autoDeclined: true })
    const manual = notificationCopy('offer_declined', { ...payload, autoDeclined: false })

    expect(auto.title).not.toEqual(manual.title)
    // A host whose offer lost to a sibling has not been turned down, and the
    // copy must not imply they were.
    expect(auto.title).toContain('found a couch')
    expect(manual.title).toContain('declined')
  })

  it('falls back to a neutral noun when a display name is missing', () => {
    const copy = notificationCopy('request_received', { ...payload, fromName: undefined })
    expect(copy.title).toContain('A colleague')
  })

  it('tells a host that a partial answer is welcome', () => {
    // The single most load-bearing sentence in the product: a host who thinks
    // half an answer is no use simply does not reply.
    const copy = notificationCopy('request_received', payload)
    expect(copy.body).toContain('does not have to be all of them')
  })

  /**
   * The privacy guarantee, restated as a test.
   *
   * Push payloads render on lock screens and pass through Apple and Google. If
   * a phone number ever reaches this function, it must still not reach the
   * text — this is the second half of the promise the SQL triggers make by
   * only ever writing IDs, names, cities and dates.
   */
  it('never renders contact details, even if a payload somehow carries them', () => {
    const poisoned = {
      ...payload,
      withName: 'Bruno Kraus',
      // Fields the triggers never write, present here as a regression guard.
      phone: '+49 170 1234567',
      email: 'bruno@example.test',
      address: 'Leopoldstrasse 12, Munich',
    } as NotificationPayload

    for (const type of NOTIFICATION_TYPES) {
      const rendered = JSON.stringify(notificationCopy(type, poisoned))
      expect(rendered, type).not.toContain('1234567')
      expect(rendered, type).not.toContain('@example.test')
      expect(rendered, type).not.toContain('Leopoldstrasse')
    }
  })
})

describe('notificationRoute', () => {
  it('sends every reveal to the contact card', () => {
    const reveals: NotificationType[] = [
      'offer_accepted',
      'offer_confirmed',
      'co_request_accepted',
    ]
    for (const type of reveals) {
      expect(notificationRoute(type, payload)).toBe(`/contact/${payload.withProfileId}`)
    }
  })

  it('sends an incoming offer to the trip it answers', () => {
    expect(notificationRoute('offer_received', payload)).toBe(`/trip/${payload.tripId}`)
  })

  it('never sends a host to a traveller\'s match screen', () => {
    // search_matches is scoped to the trip's owner, so a host landing on
    // /trip/:id would see an empty screen and assume the app is broken.
    const hostFacing: NotificationType[] = ['offer_declined', 'co_request_declined']
    for (const type of hostFacing) {
      expect(notificationRoute(type, payload)).toBe('/requests')
    }
  })

  it('routes requests to the requests list', () => {
    expect(notificationRoute('request_received', payload)).toBe('/requests')
    expect(notificationRoute('co_request_received', payload)).toBe('/requests')
    expect(notificationRoute('request_withdrawn', payload)).toBe('/requests')
  })

  it('falls back to Activity rather than a broken path when an id is missing', () => {
    expect(notificationRoute('offer_confirmed', {})).toBe('/activity')
    expect(notificationRoute('offer_received', {})).toBe('/activity')
  })

  it('returns a usable route for every type', () => {
    for (const type of NOTIFICATION_TYPES) {
      expect(notificationRoute(type, payload), type).toMatch(/^\//)
    }
  })
})

describe('isRevealNotification', () => {
  it('is true exactly for the three types that mean contact is now shared', () => {
    const reveals = NOTIFICATION_TYPES.filter(isRevealNotification)
    expect(reveals).toEqual(['offer_accepted', 'offer_confirmed', 'co_request_accepted'])
  })
})
