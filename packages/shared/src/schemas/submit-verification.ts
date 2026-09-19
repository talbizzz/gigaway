import { z } from 'zod'

/**
 * POST /functions/v1/submit-verification
 *
 * A plain JSON request, not multipart — the selfie and optional CV are
 * uploaded straight from the app to Supabase Storage (the verification-docs
 * bucket, in the caller's own folder) before this is ever called. This
 * endpoint only records what was uploaded and emails a short, attachment-free
 * notice to the review mailbox; it never sees file bytes.
 */

export const MAX_VERIFICATION_LINKS = 8

export const SubmitVerificationRequestSchema = z.object({
  fullLegalName: z
    .string()
    .trim()
    .min(2, 'Enter the name as it appears on your ID.')
    .max(120),
  /**
   * The pose instruction shown for this attempt, echoed back so a moderator
   * can check the stored photo against it. Generated client-side from a
   * fixed list; nothing here polices which one was used — a human looking
   * at the photo is the actual check.
   */
  selfiePrompt: z.string().trim().min(1).max(200),
  /** Storage path in verification-docs, e.g. "{userId}/selfie-171234.jpg". */
  selfiePath: z.string().trim().min(1, 'Take the selfie before submitting.'),
  /** Storage path in verification-docs, if a CV was attached. */
  cvPath: z.string().trim().min(1).optional(),
  links: z
    .array(z.string().trim().url('Enter a full link, including https://'))
    .max(MAX_VERIFICATION_LINKS, `Up to ${MAX_VERIFICATION_LINKS} links.`)
    .default([]),
  note: z.string().trim().max(1000).optional(),
})

export type SubmitVerificationRequest = z.infer<typeof SubmitVerificationRequestSchema>

export const SubmitVerificationResponseSchema = z.object({
  ok: z.literal(true),
})

export type SubmitVerificationResponse = z.infer<typeof SubmitVerificationResponseSchema>

export const SUBMIT_VERIFICATION_ERRORS = {
  not_eligible: 'not_eligible',
  too_soon: 'too_soon',
  no_evidence: 'no_evidence',
  path_mismatch: 'path_mismatch',
} as const

export type SubmitVerificationErrorCode =
  (typeof SUBMIT_VERIFICATION_ERRORS)[keyof typeof SUBMIT_VERIFICATION_ERRORS]

export const SUBMIT_VERIFICATION_MESSAGES: Record<SubmitVerificationErrorCode, string> = {
  not_eligible: 'Your account is not awaiting verification right now.',
  too_soon: "You've already sent an application. Give us a little longer before sending another.",
  no_evidence: 'Add a CV or at least one link showing your work as a performing artist.',
  path_mismatch: 'That upload could not be verified. Please retake the selfie and try again.',
}
