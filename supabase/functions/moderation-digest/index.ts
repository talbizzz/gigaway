import { jsonResponse, preflight, requireServiceRole, serviceClient } from '../_shared/http.ts'

/**
 * Emails the moderator about verification applications that have been waiting
 * longer than the configured nudge window.
 *
 * This is the mechanism that actually fixes slow review. Document retention was
 * never the right lever for it: the purge window only bounds exposure, whereas
 * a nudge gets applications decided.
 *
 * Invoked daily by pg_cron. Sends nothing when the queue is clear.
 */

Deno.serve(async (request) => {
  const preflightResponse = preflight(request)
  if (preflightResponse) return preflightResponse

  const denied = requireServiceRole(request)
  if (denied) return denied

  const supabase = serviceClient()

  const { data: nudgeDays } = await supabase.rpc('config_int', {
    config_key: 'doc_nudge_days',
  })
  const threshold = new Date(Date.now() - (nudgeDays ?? 3) * 86_400_000).toISOString()

  const { data: waiting, error } = await supabase
    .from('verification_applications')
    .select('id, submitted_at, profile_id, profiles(display_name, discipline)')
    .eq('status', 'pending')
    .lt('submitted_at', threshold)
    .order('submitted_at', { ascending: true })

  if (error) {
    console.error('moderation-digest query failed', error)
    return jsonResponse({ ok: false, error: 'query_failed', message: error.message }, 500)
  }

  if (!waiting || waiting.length === 0) {
    return jsonResponse({ ok: true, waiting: 0, emailed: false })
  }

  const apiKey = Deno.env.get('RESEND_API_KEY')
  const to = Deno.env.get('MODERATOR_EMAIL')
  const from = Deno.env.get('RESEND_FROM') ?? 'GigAway <notifications@gigaway.app>'

  // Local development has no mail credentials; log instead of failing, so the
  // job can still be exercised end to end.
  if (!apiKey || !to) {
    console.log(`moderation-digest: ${waiting.length} waiting, no mail credentials configured`)
    return jsonResponse({ ok: true, waiting: waiting.length, emailed: false })
  }

  const lines = waiting
    .map((row) => {
      const profile = row.profiles as { display_name?: string; discipline?: string } | null
      const days = Math.floor(
        (Date.now() - new Date(row.submitted_at as string).getTime()) / 86_400_000,
      )
      return `• ${profile?.display_name ?? 'Unknown'} (${profile?.discipline ?? '—'}) — ${days} days`
    })
    .join('\n')

  const response = await fetch('https://api.resend.com/emails', {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${apiKey}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      from,
      to,
      subject: `GigAway — ${waiting.length} application${waiting.length === 1 ? '' : 's'} waiting`,
      text:
        `${waiting.length} verification application${waiting.length === 1 ? ' has' : 's have'} ` +
        `been waiting for review:\n\n${lines}\n\n` +
        `Review them in the Supabase dashboard: select * from v_pending_verifications;\n\n` +
        `Documents are deleted automatically once you decide.`,
    }),
  })

  if (!response.ok) {
    const body = await response.text()
    console.error('resend failed', response.status, body)
    return jsonResponse({ ok: false, error: 'email_failed', message: body }, 502)
  }

  return jsonResponse({ ok: true, waiting: waiting.length, emailed: true })
})
