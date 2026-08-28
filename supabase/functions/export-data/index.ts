import {
  EXPORT_DATA_MESSAGES,
  type ExportDataErrorCode,
} from '../_shared/gen/schemas/export-data.ts'
import {
  errorResponse,
  jsonResponse,
  preflight,
  requireUser,
  serviceClient,
} from '../_shared/http.ts'

/**
 * Returns everything the account holds about the caller — GDPR Art. 20.
 *
 * Assembled in SQL so that one function is the single definition of "all of
 * my data", rather than a list of queries here that quietly falls behind the
 * schema every time a table is added.
 *
 * Reports are excluded in both directions. See export_user_data's comment.
 *
 * NOTE: imports from `_shared/gen/` are copies produced by `pnpm sync:shared`.
 * Edit the originals under packages/shared/src/.
 */

const STATUS_BY_ERROR: Record<ExportDataErrorCode, number> = {
  rate_limited: 429,
}

Deno.serve(async (request) => {
  const preflightResponse = preflight(request)
  if (preflightResponse) return preflightResponse

  const auth = await requireUser(request)
  if ('response' in auth) return auth.response

  const supabase = serviceClient()

  const { data: recent, error: countError } = await supabase.rpc('recent_export_count', {
    p_user: auth.userId,
  })

  if (countError) {
    console.error('recent_export_count failed', countError)
    return errorResponse('internal_error', 'Something went wrong. Please try again.', 500)
  }

  if ((recent ?? 0) >= 1) {
    return errorResponse(
      'rate_limited',
      EXPORT_DATA_MESSAGES.rate_limited,
      STATUS_BY_ERROR.rate_limited,
    )
  }

  const { data, error } = await supabase.rpc('export_user_data', { p_user: auth.userId })

  if (error) {
    console.error('export_user_data failed', error)
    return errorResponse('internal_error', 'Something went wrong. Please try again.', 500)
  }

  return jsonResponse({
    ok: true,
    generatedAt: new Date().toISOString(),
    data,
  })
})
