import {
  ACCEPT_CO_REQUEST_MESSAGES,
  AcceptCoRequestRequestSchema,
  type AcceptCoRequestErrorCode,
} from '../_shared/gen/schemas/accept-co-request.ts'
import {
  errorResponse,
  jsonResponse,
  parseBody,
  preflight,
  requireUser,
  serviceClient,
} from '../_shared/http.ts'

/**
 * Accepts a co-accommodation request between two travellers.
 *
 * The same shape as accept-offer, shorter: there is no offer to close and no
 * stay to create, because neither party hosted the other. Acceptance reveals
 * contact and the two of them book something together off-platform.
 *
 * NOTE: imports from `_shared/gen/` are copies produced by `pnpm sync:shared`.
 * Edit the originals under packages/shared/src/.
 */

const STATUS_BY_ERROR: Record<AcceptCoRequestErrorCode, number> = {
  request_not_found: 404,
  request_not_pending: 409,
  trip_cancelled: 409,
  not_approved: 403,
}

Deno.serve(async (request) => {
  const preflightResponse = preflight(request)
  if (preflightResponse) return preflightResponse

  const auth = await requireUser(request)
  if ('response' in auth) return auth.response

  const body = await parseBody(request, AcceptCoRequestRequestSchema)
  if ('response' in body) return body.response

  const supabase = serviceClient()
  const { data, error } = await supabase.rpc('accept_co_request', {
    p_request_id: body.data.requestId,
    p_user: auth.userId,
  })

  if (error) {
    console.error('accept_co_request rpc failed', error)
    return errorResponse('internal_error', 'Something went wrong. Please try again.', 500)
  }

  const result = data as
    | { ok: true; grantedWith: string }
    | { ok: false; error: string }

  if (!result.ok) {
    const code = result.error as AcceptCoRequestErrorCode
    return errorResponse(
      code,
      ACCEPT_CO_REQUEST_MESSAGES[code] ?? 'That request could not be accepted.',
      STATUS_BY_ERROR[code] ?? 400,
    )
  }

  return jsonResponse(result)
})
