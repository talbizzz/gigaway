import { z } from 'zod'

/**
 * POST /functions/v1/delete-account
 *
 * Irreversible. The auth user is erased outright; the profile row survives as
 * an anonymised tombstone named "Deleted member", because the stays, published
 * reviews and invite chain belonging to OTHER people hang off it.
 *
 * Two independent confirmations are required — typing the word and
 * re-entering the password — because there is no undo and no support channel
 * that can put it back.
 */
export const DELETE_CONFIRMATION = 'DELETE'

export const DeleteAccountRequestSchema = z.object({
  confirm: z.literal(DELETE_CONFIRMATION),
  password: z.string().min(1),
})

export type DeleteAccountRequest = z.infer<typeof DeleteAccountRequestSchema>

export const DeleteAccountResponseSchema = z.object({
  ok: z.literal(true),
})

export type DeleteAccountResponse = z.infer<typeof DeleteAccountResponseSchema>

export const DELETE_ACCOUNT_ERRORS = {
  reauth_failed: 'reauth_failed',
  confirm_mismatch: 'confirm_mismatch',
} as const

export type DeleteAccountErrorCode =
  (typeof DELETE_ACCOUNT_ERRORS)[keyof typeof DELETE_ACCOUNT_ERRORS]

export const DELETE_ACCOUNT_MESSAGES: Record<DeleteAccountErrorCode, string> = {
  reauth_failed: 'That password is not right. Your account has not been touched.',
  confirm_mismatch: `Type ${DELETE_CONFIRMATION} exactly to confirm.`,
}
