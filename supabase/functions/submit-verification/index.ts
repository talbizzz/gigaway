import {
  SUBMIT_VERIFICATION_MESSAGES,
  SubmitVerificationRequestSchema,
  type SubmitVerificationErrorCode,
} from '../_shared/gen/schemas/submit-verification.ts'
import {
  errorResponse,
  jsonResponse,
  parseBody,
  preflight,
  requireUser,
  serviceClient,
} from '../_shared/http.ts'

/**
 * Records a verification application whose selfie and optional CV have
 * already been uploaded, by the caller, straight to the verification-docs
 * Storage bucket — this function never sees file bytes, only the paths.
 *
 * It also emails a short, attachment-free notice to the review mailbox, so a
 * moderator learns of a new application before the admin dashboard
 * (Milestone 6) exists to surface it any other way. That email is
 * best-effort: unlike the email-only design this replaced, the evidence is
 * already safely in Storage by the time this runs, so a failed notification
 * loses nothing — it is logged, not fatal.
 *
 * NOTE: imports from `_shared/gen/` are copies produced by `pnpm sync:shared`.
 * Edit the originals under packages/shared/src/.
 */

const RESUBMIT_COOLDOWN_MS = 5 * 60 * 1000

// A profile in any other status either already has a decided application
// (approved) or is not the applicant's to resolve through this flow
// (suspended, deleted) — 'rejected' stays eligible so a rejection is not
// permanent by construction.
const ELIGIBLE_STATUSES = new Set(['pending', 'rejected'])

function fail(code: SubmitVerificationErrorCode, status: number): Response {
  return errorResponse(code, SUBMIT_VERIFICATION_MESSAGES[code], status)
}

Deno.serve(async (request) => {
  const preflightResponse = preflight(request)
  if (preflightResponse) return preflightResponse

  const auth = await requireUser(request)
  if ('response' in auth) return auth.response

  const body = await parseBody(request, SubmitVerificationRequestSchema)
  if ('response' in body) return body.response

  // The storage write policy already confines an upload to the caller's own
  // folder, so a path outside it could only arrive from a client sending a
  // fabricated value rather than a real upload — reject it rather than
  // record an application pointing at something that was never actually
  // written.
  const ownFolder = `${auth.userId}/`
  if (
    !body.data.selfiePath.startsWith(ownFolder) ||
    (body.data.cvPath && !body.data.cvPath.startsWith(ownFolder))
  ) {
    return fail('path_mismatch', 400)
  }

  if (!body.data.cvPath && body.data.links.length === 0) {
    return fail('no_evidence', 400)
  }

  const supabase = serviceClient()

  const { data: profile, error: profileError } = await supabase
    .from('profiles')
    .select('status, display_name, discipline')
    .eq('id', auth.userId)
    .single()

  if (profileError || !profile) {
    console.error('submit-verification: profile lookup failed', profileError)
    return errorResponse('internal_error', 'Something went wrong. Please try again.', 500)
  }

  if (!ELIGIBLE_STATUSES.has(profile.status)) {
    return fail('not_eligible', 409)
  }

  const { data: existing } = await supabase
    .from('verification_applications')
    .select('status, submitted_at')
    .eq('profile_id', auth.userId)
    .maybeSingle()

  if (existing?.status === 'pending') {
    const waitedMs = Date.now() - new Date(existing.submitted_at as string).getTime()
    if (waitedMs < RESUBMIT_COOLDOWN_MS) {
      return fail('too_soon', 429)
    }
  }

  const { error: upsertError } = await supabase.from('verification_applications').upsert(
    {
      profile_id: auth.userId,
      status: 'pending',
      full_legal_name: body.data.fullLegalName,
      selfie_prompt: body.data.selfiePrompt,
      selfie_path: body.data.selfiePath,
      cv_path: body.data.cvPath ?? null,
      links: body.data.links,
      note: body.data.note ?? null,
      submitted_at: new Date().toISOString(),
      reviewed_at: null,
      reviewed_by: null,
      decision_reason: null,
    },
    { onConflict: 'profile_id' },
  )

  if (upsertError) {
    console.error('submit-verification: application row upsert failed', upsertError)
    return errorResponse('internal_error', 'Something went wrong. Please try again.', 500)
  }

  await notifyModerator(auth.userId, profile.display_name, profile.discipline, body.data)

  return jsonResponse({ ok: true })
})

async function notifyModerator(
  profileId: string,
  displayName: string,
  discipline: string,
  fields: { fullLegalName: string; selfiePrompt: string; links: string[]; note?: string },
): Promise<void> {
  const apiKey = Deno.env.get('RESEND_API_KEY')
  const to = Deno.env.get('VERIFICATION_EMAIL')
  const from = Deno.env.get('MODERATOR_FROM') ?? 'GigAway <moderation@gigaway.app>'

  // Best-effort, deliberately: the application row is already committed and
  // the evidence already in Storage, so a missing credential here costs a
  // notification, not the application itself. moderation-digest is the
  // backstop that still finds it even if this never sends.
  if (!apiKey || !to) {
    console.log(`submit-verification: application from ${profileId}, no mail credentials configured`)
    return
  }

  const linksText = fields.links.length
    ? fields.links.map((link) => `  • ${link}`).join('\n')
    : '  (none)'

  try {
    const response = await fetch('https://api.resend.com/emails', {
      method: 'POST',
      headers: { Authorization: `Bearer ${apiKey}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({
        from,
        to,
        subject: `GigAway verification — ${displayName} (${profileId})`,
        text:
          `A new verification application is waiting.\n\n` +
          `user id: ${profileId}\n` +
          `name on file: ${displayName}\n` +
          `discipline: ${discipline}\n` +
          `full legal name given: ${fields.fullLegalName}\n\n` +
          `Required pose for this submission — check the stored photo against it:\n` +
          `  "${fields.selfiePrompt}"\n\n` +
          `Evidence links:\n${linksText}\n` +
          (fields.note ? `\nNote from applicant:\n${fields.note}\n` : '') +
          `\nReview it in the Supabase dashboard:\n` +
          `  select * from v_pending_verifications where profile_id = '${profileId}';\n` +
          `The selfie and CV (if any) are in the verification-docs Storage bucket, ` +
          `at the paths that query returns — open them from the dashboard's Storage browser.\n\n` +
          `To approve: update verification_applications set status = 'approved' ` +
          `where profile_id = '${profileId}';\n` +
          `To reject: update verification_applications set status = 'rejected', ` +
          `decision_reason = '…' where profile_id = '${profileId}';`,
      }),
    })

    if (!response.ok) {
      console.error('submit-verification: moderator notice failed', response.status, await response.text())
    }
  } catch (cause) {
    console.error('submit-verification: moderator notice request failed', cause)
  }
}
