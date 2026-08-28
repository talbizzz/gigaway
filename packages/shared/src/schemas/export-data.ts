import { z } from 'zod'

/**
 * POST /functions/v1/export-data — GDPR Art. 20 portability.
 *
 * Returns everything the account holds about them EXCEPT reports, in either
 * direction. Returning reports they filed would reveal which counterparties
 * they raised concerns about; returning reports about them would expose their
 * reporters. Either one destroys the private channel, so both are excluded and
 * the privacy policy says so.
 */
export const ExportDataRequestSchema = z.object({}).optional()

export type ExportDataRequest = z.infer<typeof ExportDataRequestSchema>

export const ExportDataResponseSchema = z.object({
  ok: z.literal(true),
  generatedAt: z.string(),
  data: z.record(z.unknown()),
})

export type ExportDataResponse = z.infer<typeof ExportDataResponseSchema>

export const EXPORT_DATA_ERRORS = {
  rate_limited: 'rate_limited',
} as const

export type ExportDataErrorCode =
  (typeof EXPORT_DATA_ERRORS)[keyof typeof EXPORT_DATA_ERRORS]

export const EXPORT_DATA_MESSAGES: Record<ExportDataErrorCode, string> = {
  rate_limited: 'You already exported your data today. Try again tomorrow.',
}
