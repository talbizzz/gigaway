import { z } from 'zod'

/**
 * POST /functions/v1/submit-report
 *
 * The private channel to the moderator. Reports are never public, never shown
 * to the reported user, and never readable back — not even by the person who
 * filed one. The response deliberately carries an id and nothing else.
 */
export const REPORT_CATEGORIES = [
  'safety',
  'harassment',
  'no_show',
  'misrepresentation',
  'spam',
  'other',
] as const

export type ReportCategory = (typeof REPORT_CATEGORIES)[number]

/** Copy for the category picker. Ordered by seriousness, not alphabetically. */
export const REPORT_CATEGORY_LABELS: Record<ReportCategory, string> = {
  safety: 'I felt unsafe',
  harassment: 'Harassment or abuse',
  no_show: 'Did not show up',
  misrepresentation: 'Not who they said they were',
  spam: 'Spam or advertising',
  other: 'Something else',
}

export const SubmitReportRequestSchema = z.object({
  subjectId: z.string().uuid(),
  category: z.enum(REPORT_CATEGORIES),
  body: z.string().trim().min(1, 'Tell us what happened.').max(2000),
  relatedType: z.enum(['stay', 'request', 'offer']).optional(),
  relatedId: z.string().uuid().optional(),
  /** Offered alongside the report, never forced. */
  alsoBlock: z.boolean().optional(),
})

export type SubmitReportRequest = z.infer<typeof SubmitReportRequestSchema>

export const SubmitReportResponseSchema = z.object({
  ok: z.literal(true),
  reportId: z.string().uuid(),
})

export type SubmitReportResponse = z.infer<typeof SubmitReportResponseSchema>

export const SUBMIT_REPORT_ERRORS = {
  subject_not_found: 'subject_not_found',
  invalid_category: 'invalid_category',
  rate_limited: 'rate_limited',
} as const

export type SubmitReportErrorCode =
  (typeof SUBMIT_REPORT_ERRORS)[keyof typeof SUBMIT_REPORT_ERRORS]

export const SUBMIT_REPORT_MESSAGES: Record<SubmitReportErrorCode, string> = {
  subject_not_found: 'We could not find that member.',
  invalid_category: 'Choose one of the listed reasons.',
  rate_limited:
    'You have filed several reports today. If something urgent is happening, email us directly.',
}
