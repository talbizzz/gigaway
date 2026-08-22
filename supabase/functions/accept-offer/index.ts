import {
  ACCEPT_OFFER_MESSAGES,
  AcceptOfferRequestSchema,
  type AcceptOfferErrorCode,
} from '../_shared/gen/schemas/accept-offer.ts'
import {
  errorResponse,
  jsonResponse,
  parseBody,
  preflight,
  requireUser,
  serviceClient,
} from '../_shared/http.ts'

/**
 * Accepts an offer: reveals contact details, creates the stay, and closes
 * every competing offer on the trip.
 *
 * The work happens inside the `accept_offer` database function so that all of
 * it is one transaction — a grant with no stay, or a stay with no sibling
 * declines, is the worst failure mode in the product. This handler is
 * authentication, validation and error mapping only.
 *
 * Idempotent by design: accepting an already-accepted offer returns 200 with
 * the existing stay. Users double-tap on bad connections, and that must not
 * produce a second stay or an error they cannot act on.
 *
 * NOTE: imports from `_shared/gen/` are copies produced by `pnpm sync:shared`.
 * Edit the originals under packages/shared/src/.
 */

const STATUS_BY_ERROR: Record<AcceptOfferErrorCode, number> = {
  offer_not_found: 404,
  offer_not_pending: 409,
  offer_expired: 409,
  trip_cancelled: 409,
  not_approved: 403,
}

Deno.serve(async (request) => {
  const preflightResponse = preflight(request)
  if (preflightResponse) return preflightResponse

  const auth = await requireUser(request)
  if ('response' in auth) return auth.response

  const body = await parseBody(request, AcceptOfferRequestSchema)
  if ('response' in body) return body.response

  const supabase = serviceClient()
  const { data, error } = await supabase.rpc('accept_offer', {
    p_offer_id: body.data.offerId,
    p_user: auth.userId,
  })

  if (error) {
    console.error('accept_offer rpc failed', error)
    return errorResponse('internal_error', 'Something went wrong. Please try again.', 500)
  }

  const result = data as
    | {
        ok: true
        stayId: string
        range: { start: string; end: string }
        nights: number
        autoDeclinedCount: number
      }
    | { ok: false; error: string }

  if (!result.ok) {
    const code = result.error as AcceptOfferErrorCode
    return errorResponse(
      code,
      ACCEPT_OFFER_MESSAGES[code] ?? 'That offer could not be accepted.',
      STATUS_BY_ERROR[code] ?? 400,
    )
  }

  return jsonResponse(result)
})
