import { z } from 'zod'

/**
 * POST /functions/v1/accept-co-request
 *
 * Traveller-to-traveller. There is no offer step and no stay: neither party
 * has a couch, so nothing is negotiated on-platform — accepting simply reveals
 * contact so the two of them can book something together.
 */
export const AcceptCoRequestRequestSchema = z.object({
  requestId: z.string().uuid(),
})

export type AcceptCoRequestRequest = z.infer<typeof AcceptCoRequestRequestSchema>

export const AcceptCoRequestResponseSchema = z.object({
  ok: z.literal(true),
  /** The profile whose contact details are now readable. */
  grantedWith: z.string().uuid(),
})

export type AcceptCoRequestResponse = z.infer<typeof AcceptCoRequestResponseSchema>

/** Machine codes returned in the error envelope. See ./errors.ts */
export const ACCEPT_CO_REQUEST_ERRORS = {
  request_not_found: 'request_not_found',
  request_not_pending: 'request_not_pending',
  trip_cancelled: 'trip_cancelled',
  not_approved: 'not_approved',
} as const

export type AcceptCoRequestErrorCode =
  (typeof ACCEPT_CO_REQUEST_ERRORS)[keyof typeof ACCEPT_CO_REQUEST_ERRORS]

export const ACCEPT_CO_REQUEST_MESSAGES: Record<AcceptCoRequestErrorCode, string> = {
  request_not_found: 'That request is no longer available.',
  request_not_pending: 'That request has been withdrawn or has already been answered.',
  trip_cancelled: 'That trip has been cancelled, so the request no longer applies.',
  not_approved: 'This account is not active, so contact details cannot be shared.',
}
