import {
  SUBMIT_REPORT_MESSAGES,
  SubmitReportRequestSchema,
  type SubmitReportErrorCode,
} from '../_shared/gen/schemas/submit-report.ts'
import {
  errorResponse,
  jsonResponse,
  parseBody,
  preflight,
  requireUser,
  serviceClient,
} from '../_shared/http.ts'

/**
 * Files a report with the moderator.
 *
 * The only write path to the `reports` table, which has no client read path at
 * all — not even for the person filing. They get a confirmation notification
 * instead of the ability to read the row back.
 *
 * THE EMAIL IS SENT FROM HERE, not from the notification outbox. Safety cannot
 * wait a minute for a cron tick, and the outbox is explicitly a best-effort
 * queue with backoff. The report is already committed before the email is
 * attempted, so a Resend outage loses the alert, never the report — and
 * v_open_reports is the backstop.
 *
 * NOTE: imports from `_shared/gen/` are copies produced by `pnpm sync:shared`.
 * Edit the originals under packages/shared/src/.
 */

const STATUS_BY_ERROR: Record<SubmitReportErrorCode, number> = {
  subject_not_found: 404,
  invalid_category: 400,
  rate_limited: 429,
}

Deno.serve(async (request) => {
  const preflightResponse = preflight(request)
  if (preflightResponse) return preflightResponse

  const auth = await requireUser(request)
  if ('response' in auth) return auth.response

  const body = await parseBody(request, SubmitReportRequestSchema)
  if ('response' in body) return body.response

  const supabase = serviceClient()
  const { data, error } = await supabase.rpc('submit_report', {
    p_reporter: auth.userId,
    p_subject: body.data.subjectId,
    p_category: body.data.category,
    p_body: body.data.body,
    p_related_type: body.data.relatedType ?? null,
    p_related_id: body.data.relatedId ?? null,
    p_also_block: body.data.alsoBlock ?? false,
  })

  if (error) {
    console.error('submit_report rpc failed', error)
    return errorResponse('internal_error', 'Something went wrong. Please try again.', 500)
  }

  const result = data as { ok: true; reportId: string } | { ok: false; error: string }

  if (!result.ok) {
    const code = result.error as SubmitReportErrorCode
    return errorResponse(
      code,
      SUBMIT_REPORT_MESSAGES[code] ?? 'That report could not be filed.',
      STATUS_BY_ERROR[code] ?? 400,
    )
  }

  await alertModerator(result.reportId, body.data.category)

  // Nothing but the id. The response must never echo report content, because
  // the whole design rests on there being no read path.
  return jsonResponse({ ok: true, reportId: result.reportId })
})

/**
 * Emails the moderator immediately.
 *
 * Deliberately carries no report body — the moderator reads that in
 * v_open_reports, where it is behind an authenticated dashboard rather than
 * sitting in an inbox. The email exists to say "go and look", quickly.
 */
async function alertModerator(reportId: string, category: string): Promise<void> {
  const apiKey = Deno.env.get('RESEND_API_KEY')
  const to = Deno.env.get('MODERATOR_EMAIL')
  const from = Deno.env.get('RESEND_FROM') ?? 'GigAway <notifications@gigaway.app>'

  // Local development has no mail credentials. Log instead of failing: the
  // report is already committed and must not be rolled back over an email.
  if (!apiKey || !to) {
    console.log(`report ${reportId} (${category}) filed — no mail credentials configured`)
    return
  }

  try {
    const response = await fetch('https://api.resend.com/emails', {
      method: 'POST',
      headers: { Authorization: `Bearer ${apiKey}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({
        from,
        to,
        subject: `GigAway — ${category} report filed`,
        text:
          `A ${category} report has been filed.\n\n` +
          `Read it in the Supabase dashboard:\n` +
          `  select * from v_open_reports where report_id = '${reportId}';\n\n` +
          `Check the subject's history before acting:\n` +
          `  select * from v_user_summary where profile_id = '…';\n`,
      }),
    })

    if (!response.ok) {
      console.error('moderator alert failed', response.status, await response.text())
    }
  } catch (cause) {
    console.error('moderator alert request failed', cause)
  }
}
