import {
  REDEEM_INVITE_MESSAGES,
  RedeemInviteRequestSchema,
  type RedeemInviteErrorCode,
} from '../_shared/gen/schemas/redeem-invite.ts'
import {
  errorResponse,
  jsonResponse,
  parseBody,
  preflight,
  requireUser,
  serviceClient,
} from '../_shared/http.ts'

/**
 * Redeems an invite code and approves the caller.
 *
 * The actual work happens inside the `redeem_invite` database function so that
 * quota decrement, redemption record and approval are one transaction. This
 * handler is authentication, validation and error mapping only.
 *
 * NOTE: imports from `_shared/gen/` are copies produced by `pnpm sync:shared`.
 * Edit the originals under packages/shared/src/.
 */

const STATUS_BY_ERROR: Record<RedeemInviteErrorCode, number> = {
  invite_not_found: 404,
  invite_expired: 410,
  invite_revoked: 410,
  invite_exhausted: 409,
  already_redeemed: 409,
  already_approved: 409,
}

Deno.serve(async (request) => {
  const preflightResponse = preflight(request)
  if (preflightResponse) return preflightResponse

  const auth = await requireUser(request)
  if ('response' in auth) return auth.response

  const body = await parseBody(request, RedeemInviteRequestSchema)
  if ('response' in body) return body.response

  const supabase = serviceClient()
  const { data, error } = await supabase.rpc('redeem_invite', {
    p_code: body.data.code,
    p_user: auth.userId,
  })

  if (error) {
    console.error('redeem_invite rpc failed', error)
    return errorResponse('internal_error', 'Something went wrong. Please try again.', 500)
  }

  const result = data as
    | { ok: true; invitedBy: { id: string; displayName: string } }
    | { ok: false; error: string }

  if (!result.ok) {
    const code = result.error as RedeemInviteErrorCode
    return errorResponse(
      code,
      REDEEM_INVITE_MESSAGES[code] ?? 'That invite could not be used.',
      STATUS_BY_ERROR[code] ?? 400,
    )
  }

  return jsonResponse(result)
})
