/**
 * Notification types, their copy, and where each one leads.
 *
 * Shared deliberately: dispatch-notifications renders these into pushes and
 * the in-app Activity list renders the same rows on screen. If the two
 * disagreed, a user tapping a notification would land somewhere that does not
 * match what they just read.
 *
 * THE HARD RULE: nothing here may read a phone number, an email address or an
 * exact location out of the payload, because these strings are rendered on
 * lock screens and travel through Apple's and Google's infrastructure. The
 * enqueue triggers only ever put IDs, display names, city names and dates into
 * a payload — this file is the second half of that promise.
 */

export const NOTIFICATION_TYPES = [
  'request_received',
  'co_request_received',
  'offer_received',
  'offer_accepted',
  'offer_confirmed',
  'offer_declined',
  'co_request_accepted',
  'co_request_declined',
  'request_withdrawn',
  // Milestone 4
  'review_prompt',
  'review_reminder',
  'review_published',
  'report_received',
] as const

export type NotificationType = (typeof NOTIFICATION_TYPES)[number]

/** IDs and short display strings only. Mirrors what the SQL triggers write. */
export type NotificationPayload = {
  tripId?: string
  cityName?: string
  startDate?: string
  endDate?: string
  requestId?: string
  offerId?: string
  fromProfileId?: string
  fromName?: string
  toProfileId?: string
  toName?: string
  withProfileId?: string
  withName?: string
  offerStart?: string
  offerEnd?: string
  nights?: number
  autoDeclined?: boolean
  // Milestone 4
  stayId?: string
  reviewId?: string
  reportId?: string
  closesAt?: string
}

export type NotificationCopy = {
  title: string
  body: string
}

function nightsLabel(nights: number | undefined): string {
  if (!nights || nights < 1) return 'some nights'
  return `${nights} night${nights === 1 ? '' : 's'}`
}

function someone(name: string | undefined): string {
  return name?.trim() || 'A colleague'
}

/** "3–10 March" / "28 February – 3 March". Never ambiguous about order. */
export function formatDateRange(start?: string, end?: string): string {
  if (!start || !end) return ''
  const from = new Date(`${start}T00:00:00Z`)
  const to = new Date(`${end}T00:00:00Z`)
  const month = (date: Date) =>
    date.toLocaleDateString('en-GB', { month: 'long', timeZone: 'UTC' })
  const day = (date: Date) =>
    date.toLocaleDateString('en-GB', { day: 'numeric', timeZone: 'UTC' })

  return start.slice(0, 7) === end.slice(0, 7)
    ? `${day(from)}–${day(to)} ${month(to)}`
    : `${day(from)} ${month(from)} – ${day(to)} ${month(to)}`
}

/**
 * The words a member actually reads, on a lock screen and in the Activity
 * list.
 *
 * A shorter offer is presented as a good outcome throughout — "3 of the 7
 * nights" is three nights not paid for, not a shortfall — because the product
 * only works if partial hosting feels like generosity rather than a let-down.
 */
export function notificationCopy(
  type: NotificationType,
  payload: NotificationPayload,
): NotificationCopy {
  const city = payload.cityName ?? 'your city'
  const tripDates = formatDateRange(payload.startDate, payload.endDate)
  const offerDates = formatDateRange(payload.offerStart, payload.offerEnd)

  switch (type) {
    case 'request_received':
      return {
        title: `${someone(payload.fromName)} asked about your couch`,
        body: `${city}, ${tripDates}. Any nights you can manage help — it does not have to be all of them.`,
      }

    case 'co_request_received':
      return {
        title: `${someone(payload.fromName)} wants to split a place`,
        body: `${city}, ${tripDates}. Neither of you is hosting — you would book something together.`,
      }

    case 'offer_received':
      return {
        title: `${someone(payload.fromName)} offered you ${nightsLabel(payload.nights)}`,
        body: `${city}, ${offerDates}.`,
      }

    case 'offer_accepted':
      return {
        title: `${someone(payload.withName)} accepted your offer`,
        body: `${nightsLabel(payload.nights)} in ${city}, ${offerDates}. You can see each other's contact details in the app.`,
      }

    case 'offer_confirmed':
      return {
        title: `You have a couch in ${city}`,
        body: `${nightsLabel(payload.nights)} with ${someone(payload.withName)}, ${offerDates}. Their contact details are in the app.`,
      }

    case 'offer_declined':
      return payload.autoDeclined
        ? {
            title: `${someone(payload.withName)} found a couch`,
            body: `They accepted another offer for ${city}, so your nights are free again. Thank you for offering.`,
          }
        : {
            title: `${someone(payload.withName)} declined your offer`,
            body: `${city}, ${offerDates}. Your nights are free again.`,
          }

    case 'co_request_accepted':
      return {
        title: `${someone(payload.withName)} said yes`,
        body: `You are splitting a place in ${city}. Contact details are in the app.`,
      }

    case 'co_request_declined':
      return {
        title: `${someone(payload.toName)} cannot split a place`,
        body: `${city}, ${tripDates}.`,
      }

    case 'request_withdrawn':
      return {
        title: `${someone(payload.fromName)} withdrew their request`,
        body: `${city}, ${tripDates}. Nothing to do.`,
      }

    case 'review_prompt':
      return {
        title: `How was ${someone(payload.withName)}?`,
        body: `Your ${city} stay has finished. Neither of you sees the other's review until you have both written one.`,
      }

    case 'review_reminder':
      return {
        title: `${someone(payload.withName)} is still waiting on your review`,
        body: `A word about your ${city} stay helps the next colleague decide. It only takes a moment.`,
      }

    case 'review_published':
      return {
        title: `${someone(payload.withName)} reviewed you`,
        body: `Your ${city} stay is now on your profile.`,
      }

    // Deliberately vague about the subject. This lands on a lock screen, and
    // naming who was reported would put the reporter at risk if somebody else
    // picked up the phone.
    case 'report_received':
      return {
        title: 'Your report has gone to a moderator',
        body: 'A person reads every report. You will not hear back automatically.',
      }
  }
}

/**
 * Where tapping the notification lands, in Expo Router path form.
 *
 * A host cannot open a traveller's match screen — search_matches is scoped to
 * the trip's owner — so anything addressed to a host goes to their own
 * requests-and-offers list instead.
 */
export function notificationRoute(
  type: NotificationType,
  payload: NotificationPayload,
): string {
  switch (type) {
    case 'offer_accepted':
    case 'offer_confirmed':
    case 'co_request_accepted':
      return payload.withProfileId ? `/contact/${payload.withProfileId}` : '/activity'

    case 'offer_received':
      return payload.tripId ? `/trip/${payload.tripId}` : '/activity'

    case 'request_received':
    case 'co_request_received':
    case 'request_withdrawn':
    case 'co_request_declined':
    case 'offer_declined':
      return '/requests'

    case 'review_prompt':
    case 'review_reminder':
      return payload.stayId ? `/review/${payload.stayId}` : '/activity'

    case 'review_published':
      return payload.withProfileId ? `/member/${payload.withProfileId}` : '/activity'

    // No deep link. There is no report to open — the reports table has no
    // client read path at all, which is the point.
    case 'report_received':
      return '/activity'
  }
}

/** True for the types that mean "you now have someone to contact". */
export function isRevealNotification(type: NotificationType): boolean {
  return (
    type === 'offer_accepted' || type === 'offer_confirmed' || type === 'co_request_accepted'
  )
}
