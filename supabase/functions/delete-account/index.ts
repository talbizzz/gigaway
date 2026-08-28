import {
  DELETE_ACCOUNT_MESSAGES,
  DELETE_CONFIRMATION,
  DeleteAccountRequestSchema,
} from '../_shared/gen/schemas/delete-account.ts'
import { createClient } from '@supabase/supabase-js'
import {
  errorResponse,
  jsonResponse,
  preflight,
  requireUser,
  serviceClient,
} from '../_shared/http.ts'

/**
 * Deletes the caller's account. Irreversible.
 *
 * Order is load-bearing:
 *
 *   1. Re-authenticate. A session left open on a borrowed laptop must not be
 *      enough to destroy somebody's account.
 *   2. Run delete_account, which does all the SQL in one transaction —
 *      anonymising the profile into a tombstone and hard-deleting everything
 *      nobody else depends on.
 *   3. Delete the avatar object, which SQL cannot reach.
 *   4. Delete the auth user LAST. Doing it first would end the session and
 *      leave the data half-processed with no way back in to retry.
 *
 * The profile row deliberately survives as "Deleted member" so that the stays,
 * published reviews and invite chain belonging to other people stay intact.
 *
 * NOTE: imports from `_shared/gen/` are copies produced by `pnpm sync:shared`.
 * Edit the originals under packages/shared/src/.
 */

Deno.serve(async (request) => {
  const preflightResponse = preflight(request)
  if (preflightResponse) return preflightResponse

  const auth = await requireUser(request)
  if ('response' in auth) return auth.response

  let raw: unknown
  try {
    raw = await request.json()
  } catch {
    return errorResponse('invalid_request', 'Expected a JSON body.', 400)
  }

  const parsed = DeleteAccountRequestSchema.safeParse(raw)
  if (!parsed.success) {
    // The confirmation word gets its own code so the screen can highlight the
    // right field rather than showing a generic validation error.
    const confirmWrong = (raw as { confirm?: unknown })?.confirm !== DELETE_CONFIRMATION
    return confirmWrong
      ? errorResponse('confirm_mismatch', DELETE_ACCOUNT_MESSAGES.confirm_mismatch, 400)
      : errorResponse('invalid_request', 'Enter your password to confirm.', 400)
  }

  const supabase = serviceClient()

  // ── 1. re-authenticate ───────────────────────────────────────────────────
  const { data: userData, error: userError } = await supabase.auth.admin.getUserById(
    auth.userId,
  )
  if (userError || !userData.user?.email) {
    console.error('could not load user for reauth', userError)
    return errorResponse('internal_error', 'Something went wrong. Please try again.', 500)
  }

  const reauth = createClient(
    Deno.env.get('SUPABASE_URL')!,
    Deno.env.get('SUPABASE_ANON_KEY')!,
    { auth: { persistSession: false, autoRefreshToken: false } },
  )
  const { error: signInError } = await reauth.auth.signInWithPassword({
    email: userData.user.email,
    password: parsed.data.password,
  })

  if (signInError) {
    return errorResponse('reauth_failed', DELETE_ACCOUNT_MESSAGES.reauth_failed, 401)
  }

  // ── 2. the transaction ───────────────────────────────────────────────────
  const { data, error } = await supabase.rpc('delete_account', { p_user: auth.userId })

  if (error) {
    console.error('delete_account rpc failed', error)
    return errorResponse('internal_error', 'Something went wrong. Please try again.', 500)
  }

  const result = data as { ok: true; photoPath: string | null }

  // ── 3. the avatar, which SQL cannot delete ───────────────────────────────
  if (result.photoPath) {
    const { error: removeError } = await supabase.storage
      .from('avatars')
      .remove([result.photoPath])
    // Not fatal. The path is already cleared from the profile, so the object is
    // orphaned rather than exposed, and a failure here must not leave the
    // account half-deleted.
    if (removeError) console.error('avatar removal failed', removeError)
  }

  // ── 4. the auth user, last ───────────────────────────────────────────────
  const { error: deleteError } = await supabase.auth.admin.deleteUser(auth.userId)

  if (deleteError) {
    console.error('auth user deletion failed', deleteError)
    return errorResponse(
      'internal_error',
      'Your data was removed but the account could not be closed. Please contact us.',
      500,
    )
  }

  return jsonResponse({ ok: true })
})
