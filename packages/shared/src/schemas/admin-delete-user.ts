import { z } from 'zod'

/**
 * POST /functions/v1/admin-delete-user
 *
 * Irreversible. Consolidates the three manual steps MODERATION.md's
 * "Deleting someone" section used to list separately: delete_account (the
 * SQL tombstone), the avatar and verification-evidence objects (Storage,
 * unreachable from SQL), and the auth.users row (the Auth Admin API,
 * likewise unreachable from SQL).
 *
 * `confirm` must match the target's current display name or email —
 * checked server-side, not just enabled-by-typing in the UI — so a stale
 * profileId reference can't be deleted just because the confirmation field
 * on screen happened to show the right name.
 */
export const AdminDeleteUserRequestSchema = z.object({
  profileId: z.string().uuid(),
  confirm: z.string().min(1),
})

export type AdminDeleteUserRequest = z.infer<typeof AdminDeleteUserRequestSchema>

export const AdminDeleteUserResponseSchema = z.object({
  ok: z.literal(true),
  accountDeleted: z.boolean(),
  authUserDeleted: z.boolean(),
  avatarRemoved: z.boolean(),
  verificationEvidenceRemoved: z.boolean(),
})

export type AdminDeleteUserResponse = z.infer<typeof AdminDeleteUserResponseSchema>

export const ADMIN_DELETE_USER_ERRORS = {
  forbidden: 'forbidden',
  not_found: 'not_found',
  confirm_mismatch: 'confirm_mismatch',
} as const

export type AdminDeleteUserErrorCode =
  (typeof ADMIN_DELETE_USER_ERRORS)[keyof typeof ADMIN_DELETE_USER_ERRORS]

export const ADMIN_DELETE_USER_MESSAGES: Record<AdminDeleteUserErrorCode, string> = {
  forbidden: 'Admin access required.',
  not_found: 'No profile found with that id.',
  confirm_mismatch: "That doesn't match the member's name or email. Nothing was deleted.",
}
