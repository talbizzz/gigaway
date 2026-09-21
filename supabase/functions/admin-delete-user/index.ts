import { AdminDeleteUserRequestSchema } from '../_shared/gen/schemas/admin-delete-user.ts'
import {
  errorResponse,
  jsonResponse,
  parseBody,
  preflight,
  requireAdmin,
  serviceClient,
} from '../_shared/http.ts'

/**
 * Consolidates the three manual steps MODERATION.md's "Deleting someone"
 * section used to list separately for a founder working the Supabase
 * dashboard: delete_account (the SQL tombstone), the avatar/verification
 * objects in Storage, and the auth.users row via the Auth Admin API. None
 * of the last two is reachable from SQL, which is why this exists as an
 * Edge Function rather than a security-definer RPC like admin_delete_trip.
 *
 * Order mirrors delete-account/index.ts: SQL first, Storage second, the
 * auth user LAST. A failure partway through leaves the account already
 * unusable (the tombstone's status is 'deleted') rather than half-processed
 * with no way to retry cleanly.
 *
 * The audit log write goes straight to the table via the service client
 * rather than through log_admin_action() — that RPC is deliberately
 * unreachable from any client role, even an admin's, because it's meant to
 * be the sole gate for SQL-callable admin_* functions. Here, requireAdmin()
 * already performed that gate in this same request; a second RPC hop
 * through a wrapper would add nothing but indirection.
 */
Deno.serve(async (request) => {
  const preflightResponse = preflight(request)
  if (preflightResponse) return preflightResponse

  const admin = await requireAdmin(request)
  if ('response' in admin) return admin.response

  const parsed = await parseBody(request, AdminDeleteUserRequestSchema)
  if ('response' in parsed) return parsed.response
  const { profileId, confirm } = parsed.data

  const supabase = serviceClient()

  // ── who is this, and does the confirmation actually match them? ─────────
  const { data: rows, error: detailError } = await admin.client.rpc('admin_get_user_detail', {
    p_profile_id: profileId,
  })
  if (detailError) {
    console.error('admin_get_user_detail failed', detailError)
    return errorResponse('internal_error', 'Something went wrong. Please try again.', 500)
  }

  const target = rows?.[0]
  if (!target) {
    return errorResponse('not_found', 'No profile found with that id.', 404)
  }

  const confirmLower = confirm.trim().toLowerCase()
  const matches =
    confirmLower === target.display_name?.toLowerCase() ||
    (target.email != null && confirmLower === target.email.toLowerCase())
  if (!matches) {
    return errorResponse(
      'confirm_mismatch',
      "That doesn't match the member's name or email. Nothing was deleted.",
      400,
    )
  }

  // ── 1. the SQL tombstone, in one transaction ─────────────────────────────
  const { data: deleteResult, error: deleteError } = await supabase.rpc('delete_account', {
    p_user: profileId,
  })
  if (deleteError) {
    console.error('delete_account rpc failed', deleteError)
    return errorResponse('internal_error', 'Something went wrong. Please try again.', 500)
  }

  const result = deleteResult as {
    ok: true
    photoPath: string | null
    selfiePath: string | null
    cvPath: string | null
  }

  // ── 2. storage objects, which SQL cannot delete ──────────────────────────
  let avatarRemoved = true
  if (result.photoPath) {
    const { error } = await supabase.storage.from('avatars').remove([result.photoPath])
    if (error) {
      console.error('avatar removal failed', error)
      avatarRemoved = false
    }
  }

  let verificationEvidenceRemoved = true
  const verificationPaths = [result.selfiePath, result.cvPath].filter(
    (path): path is string => Boolean(path),
  )
  if (verificationPaths.length > 0) {
    const { error } = await supabase.storage.from('verification-docs').remove(verificationPaths)
    if (error) {
      console.error('verification evidence removal failed', error)
      verificationEvidenceRemoved = false
    }
  }

  // ── 3. the auth user, last ───────────────────────────────────────────────
  const { error: authDeleteError } = await supabase.auth.admin.deleteUser(profileId)
  const authUserDeleted = !authDeleteError
  if (authDeleteError) console.error('auth user deletion failed', authDeleteError)

  // ── 4. the audit trail, regardless of how the steps above went ───────────
  const { error: auditError } = await supabase.from('audit_log').insert({
    admin_id: admin.userId,
    action: 'delete_user',
    target_table: 'profiles',
    target_id: profileId,
    detail: {
      displayName: target.display_name,
      email: target.email,
      avatarRemoved,
      verificationEvidenceRemoved,
      authUserDeleted,
    },
  })
  if (auditError) console.error('audit log write failed', auditError)

  return jsonResponse({
    ok: true,
    accountDeleted: true,
    authUserDeleted,
    avatarRemoved,
    verificationEvidenceRemoved,
  })
})
