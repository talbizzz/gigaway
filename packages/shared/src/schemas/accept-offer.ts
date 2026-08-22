import { z } from 'zod'

/** POST /functions/v1/accept-offer */
export const AcceptOfferRequestSchema = z.object({
  offerId: z.string().uuid(),
})

export type AcceptOfferRequest = z.infer<typeof AcceptOfferRequestSchema>

export const AcceptOfferResponseSchema = z.object({
  ok: z.literal(true),
  stayId: z.string().uuid(),
  range: z.object({
    start: z.string(),
    end: z.string(),
  }),
  nights: z.number().int().positive(),
  /** Other pending offers on the same trip that this acceptance closed. */
  autoDeclinedCount: z.number().int().nonnegative(),
})

export type AcceptOfferResponse = z.infer<typeof AcceptOfferResponseSchema>

/** Machine codes returned in the error envelope. See ./errors.ts */
export const ACCEPT_OFFER_ERRORS = {
  offer_not_found: 'offer_not_found',
  offer_not_pending: 'offer_not_pending',
  offer_expired: 'offer_expired',
  trip_cancelled: 'trip_cancelled',
  not_approved: 'not_approved',
} as const

export type AcceptOfferErrorCode =
  (typeof ACCEPT_OFFER_ERRORS)[keyof typeof ACCEPT_OFFER_ERRORS]

/**
 * Human-facing copy for each failure, so app and function stay consistent.
 *
 * Note what is absent: there is no message for "you accepted this already".
 * That case returns 200 with the existing stay, because a second tap on a bad
 * connection is a network artefact, not a user error.
 */
export const ACCEPT_OFFER_MESSAGES: Record<AcceptOfferErrorCode, string> = {
  offer_not_found: 'That offer is no longer available.',
  offer_not_pending: 'That offer has been withdrawn or has already been answered.',
  offer_expired: 'Those nights have already passed.',
  trip_cancelled: 'This trip has been cancelled, so the offer no longer applies.',
  not_approved: 'This account is not active, so contact details cannot be shared.',
}
