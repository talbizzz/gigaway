import { z } from 'zod'
import { InviteCodeSchema } from './invite-code.ts'

/** POST /functions/v1/redeem-invite */
export const RedeemInviteRequestSchema = z.object({
  code: InviteCodeSchema,
})

export type RedeemInviteRequest = z.infer<typeof RedeemInviteRequestSchema>

export const RedeemInviteResponseSchema = z.object({
  ok: z.literal(true),
  invitedBy: z.object({
    id: z.string().uuid(),
    displayName: z.string(),
  }),
})

export type RedeemInviteResponse = z.infer<typeof RedeemInviteResponseSchema>

/** Machine codes returned in the error envelope. See ./errors.ts */
export const REDEEM_INVITE_ERRORS = {
  invite_not_found: 'invite_not_found',
  invite_expired: 'invite_expired',
  invite_revoked: 'invite_revoked',
  invite_exhausted: 'invite_exhausted',
  already_redeemed: 'already_redeemed',
  already_approved: 'already_approved',
} as const

export type RedeemInviteErrorCode =
  (typeof REDEEM_INVITE_ERRORS)[keyof typeof REDEEM_INVITE_ERRORS]

/** Human-facing copy for each failure, so app and function stay consistent. */
export const REDEEM_INVITE_MESSAGES: Record<RedeemInviteErrorCode, string> = {
  invite_not_found: "We don't recognise that code. Check it and try again.",
  invite_expired: 'That invite has expired. Ask your colleague for a new one.',
  invite_revoked: 'That invite is no longer active. Ask your colleague for a new one.',
  invite_exhausted: 'That invite has already been used. Ask your colleague for a new one.',
  already_redeemed: 'You have already joined using an invite.',
  already_approved: 'Your account is already active.',
}
