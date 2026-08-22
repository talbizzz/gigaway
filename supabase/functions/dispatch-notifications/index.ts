import {
  notificationCopy,
  notificationRoute,
  type NotificationPayload,
  type NotificationType,
} from '../_shared/gen/domain/notifications.ts'
import { jsonResponse, preflight, requireServiceRole, serviceClient } from '../_shared/http.ts'

/**
 * Drains the notification outbox.
 *
 * SYSTEM ONLY. Invoked by pg_net the instant a row is written, and by pg_cron
 * every minute for anything still unsent. Both arrive through
 * call_edge_function, which authenticates with the service role key from
 * Vault, so requireServiceRole is the whole gate — a user JWT can never
 * satisfy it however it is shaped.
 *
 * Four jobs per run, in order:
 *   1. send claimed pushes to Expo
 *   2. read the receipts of pushes sent earlier, invalidating dead tokens
 *   3. email the one notification type whose loss costs real money
 *
 * Every claim happens in SQL with `for update skip locked`, so overlapping
 * cron and pg_net invocations cannot send the same push twice, and a run that
 * dies halfway leaves its rows unsent for the next sweep to recover.
 *
 * NOTE: imports from `_shared/gen/` are copies produced by `pnpm sync:shared`.
 * Edit the originals under packages/shared/src/.
 */

const EXPO_PUSH_URL = 'https://exp.host/--/api/v2/push/send'
const EXPO_RECEIPT_URL = 'https://exp.host/--/api/v2/push/getReceipts'
const EXPO_CHUNK = 100

type NotificationRow = {
  id: string
  profile_id: string
  type: NotificationType
  payload: NotificationPayload
}

/**
 * Expo names the offending token in `details.expoPushToken` whenever it
 * reports DeviceNotRegistered — on tickets and on receipts alike. That is the
 * only way to know WHICH of a member's devices died, so it is the field the
 * token invalidation turns on.
 */
type ExpoErrorDetails = { error?: string; expoPushToken?: string }

type ExpoTicket =
  | { status: 'ok'; id: string }
  | { status: 'error'; message: string; details?: ExpoErrorDetails }

type ExpoReceipt = {
  status: 'ok' | 'error'
  message?: string
  details?: ExpoErrorDetails
}

function expoHeaders(): HeadersInit {
  const headers: Record<string, string> = {
    'Content-Type': 'application/json',
    Accept: 'application/json',
    'Accept-Encoding': 'gzip, deflate',
  }
  // Only needed when Expo's enhanced push security is switched on for the
  // project. Harmless when absent.
  const accessToken = Deno.env.get('EXPO_ACCESS_TOKEN')
  if (accessToken) headers.Authorization = `Bearer ${accessToken}`
  return headers
}

function chunk<T>(items: T[], size: number): T[][] {
  const out: T[][] = []
  for (let i = 0; i < items.length; i += size) out.push(items.slice(i, i + size))
  return out
}

Deno.serve(async (request) => {
  const preflightResponse = preflight(request)
  if (preflightResponse) return preflightResponse

  const denied = requireServiceRole(request)
  if (denied) return denied

  const body = (await request.json().catch(() => ({}))) as { limit?: number }
  const limit = Math.min(Math.max(Number(body.limit) || 100, 1), 100)

  const supabase = serviceClient()

  // ── 1. claim ──────────────────────────────────────────────────────────────
  const { data: claimed, error: claimError } = await supabase.rpc('claim_notifications', {
    p_limit: limit,
  })

  if (claimError) {
    console.error('claim_notifications failed', claimError)
    return jsonResponse({ ok: false, error: 'claim_failed', message: claimError.message }, 500)
  }

  const rows = (claimed ?? []) as NotificationRow[]
  let sent = 0
  let failed = 0

  if (rows.length > 0) {
    // ── 2. resolve live tokens ──────────────────────────────────────────────
    const profileIds = [...new Set(rows.map((row) => row.profile_id))]
    const { data: tokenRows, error: tokenError } = await supabase
      .from('push_tokens')
      .select('profile_id, token')
      .in('profile_id', profileIds)
      .is('invalidated_at', null)

    if (tokenError) {
      console.error('push token lookup failed', tokenError)
      return jsonResponse({ ok: false, error: 'token_lookup_failed' }, 500)
    }

    const tokensByProfile = new Map<string, string[]>()
    for (const row of tokenRows ?? []) {
      const list = tokensByProfile.get(row.profile_id) ?? []
      list.push(row.token as string)
      tokensByProfile.set(row.profile_id, list)
    }

    // ── 3. build messages ───────────────────────────────────────────────────
    // One message per (notification × live token). The results are keyed back
    // to the notification, so a member with three devices still produces one
    // outbox result — the first ticket wins, and any failure is recorded.
    const messages: { to: string; notificationId: string; message: unknown }[] = []
    const results = new Map<string, { id: string; receiptId?: string; error?: string }>()
    const deadTokens = new Set<string>()

    for (const row of rows) {
      const tokens = tokensByProfile.get(row.profile_id) ?? []

      if (tokens.length === 0) {
        // Not a failure worth retrying eight times: the member simply has no
        // device registered. Mark it done — the Activity list still shows it.
        results.set(row.id, { id: row.id })
        continue
      }

      const copy = notificationCopy(row.type, row.payload ?? {})
      for (const token of tokens) {
        messages.push({
          to: token,
          notificationId: row.id,
          message: {
            to: token,
            title: copy.title,
            body: copy.body,
            sound: 'default',
            channelId: 'default',
            // Tapping deep-links here. IDs only — the same rule as the payload.
            data: {
              notificationId: row.id,
              type: row.type,
              route: notificationRoute(row.type, row.payload ?? {}),
            },
          },
        })
      }
    }

    // ── 4. send, in chunks of 100 ───────────────────────────────────────────
    for (const batch of chunk(messages, EXPO_CHUNK)) {
      try {
        const response = await fetch(EXPO_PUSH_URL, {
          method: 'POST',
          headers: expoHeaders(),
          body: JSON.stringify(batch.map((entry) => entry.message)),
        })

        if (!response.ok) {
          const text = await response.text()
          console.error('expo push rejected the batch', response.status, text)
          for (const entry of batch) {
            results.set(entry.notificationId, {
              id: entry.notificationId,
              error: `expo ${response.status}`,
            })
          }
          continue
        }

        const payload = (await response.json()) as { data?: ExpoTicket[] }
        const tickets = payload.data ?? []

        batch.forEach((entry, index) => {
          const ticket = tickets[index]
          const existing = results.get(entry.notificationId)

          if (!ticket) {
            if (!existing?.receiptId) {
              results.set(entry.notificationId, {
                id: entry.notificationId,
                error: 'expo returned no ticket',
              })
            }
            return
          }

          if (ticket.status === 'ok') {
            // A success on any device is a success for the notification.
            results.set(entry.notificationId, { id: entry.notificationId, receiptId: ticket.id })
            return
          }

          // DeviceNotRegistered here — rather than in a receipt — means the
          // token was already dead when we tried. Collect it; the whole set is
          // invalidated below, awaited, so the write cannot be cut off when
          // the function returns.
          if (ticket.details?.error === 'DeviceNotRegistered') {
            deadTokens.add(ticket.details.expoPushToken ?? entry.to)
          }

          if (!existing?.receiptId) {
            results.set(entry.notificationId, {
              id: entry.notificationId,
              error: ticket.details?.error ?? ticket.message,
            })
          }
        })
      } catch (cause) {
        console.error('expo push request failed', cause)
        for (const entry of batch) {
          const existing = results.get(entry.notificationId)
          if (!existing?.receiptId) {
            results.set(entry.notificationId, {
              id: entry.notificationId,
              error: cause instanceof Error ? cause.message : 'network error',
            })
          }
        }
      }
    }

    if (deadTokens.size > 0) {
      const { error: invalidateError } = await supabase
        .from('push_tokens')
        .update({ invalidated_at: new Date().toISOString() })
        .in('token', [...deadTokens])
      if (invalidateError) console.error('token invalidation failed', invalidateError)
    }

    const resultList = [...results.values()]
    sent = resultList.filter((entry) => !entry.error).length
    failed = resultList.filter((entry) => entry.error).length

    const { error: recordError } = await supabase.rpc('record_notification_results', {
      p_results: resultList,
    })
    if (recordError) console.error('record_notification_results failed', recordError)
  }

  // ── 5. receipts ───────────────────────────────────────────────────────────
  const receiptsChecked = await checkReceipts(supabase)

  // ── 6. email fallback ─────────────────────────────────────────────────────
  const emailsSent = await sendEmailFallbacks(supabase)

  return jsonResponse({
    ok: true,
    claimed: rows.length,
    sent,
    failed,
    receiptsChecked,
    emailsSent,
  })
})

/**
 * Reads Expo's receipts for pushes sent earlier and invalidates dead tokens.
 *
 * A ticket only says Expo accepted the message. The receipt says whether the
 * device got it, and DeviceNotRegistered is how a deleted app or a restored
 * phone announces itself.
 */
async function checkReceipts(supabase: ReturnType<typeof serviceClient>): Promise<number> {
  const { data: claimed, error } = await supabase.rpc('claim_notification_receipts', {
    p_limit: 100,
  })

  if (error) {
    console.error('claim_notification_receipts failed', error)
    return 0
  }

  const rows = (claimed ?? []) as { id: string; expo_receipt_id: string }[]
  if (rows.length === 0) return 0

  const results: {
    id: string
    ok?: boolean
    pending?: boolean
    error?: string
    token?: string
  }[] = []

  for (const batch of chunk(rows, EXPO_CHUNK)) {
    try {
      const response = await fetch(EXPO_RECEIPT_URL, {
        method: 'POST',
        headers: expoHeaders(),
        body: JSON.stringify({ ids: batch.map((row) => row.expo_receipt_id) }),
      })

      if (!response.ok) {
        // Leave them to the next sweep rather than guessing.
        for (const row of batch) results.push({ id: row.id, pending: true })
        continue
      }

      const payload = (await response.json()) as { data?: Record<string, ExpoReceipt> }
      const receipts = payload.data ?? {}

      for (const row of batch) {
        const receipt = receipts[row.expo_receipt_id]

        // Expo has not produced this receipt yet. Clearing the stamp puts the
        // row back in the queue instead of recording a verdict we do not have.
        if (!receipt) {
          results.push({ id: row.id, pending: true })
          continue
        }

        if (receipt.status === 'ok') {
          results.push({ id: row.id, ok: true })
          continue
        }

        results.push({
          id: row.id,
          ok: false,
          error: receipt.details?.error ?? receipt.message ?? 'receipt error',
          // record_notification_receipts invalidates only the token named
          // here, so one dead device never silences a member's others.
          token: receipt.details?.expoPushToken,
        })
      }
    } catch (cause) {
      console.error('expo receipt request failed', cause)
      for (const row of batch) results.push({ id: row.id, pending: true })
    }
  }

  const { error: recordError } = await supabase.rpc('record_notification_receipts', {
    p_results: results,
  })
  if (recordError) console.error('record_notification_receipts failed', recordError)

  return results.filter((entry) => !entry.pending).length
}

/**
 * The second channel on the one notification whose loss costs real money.
 *
 * Only offer_accepted escalates. A host who never learns their couch was taken
 * is a broken promise to two people; every other missed push is recoverable
 * from the Activity list.
 */
async function sendEmailFallbacks(
  supabase: ReturnType<typeof serviceClient>,
): Promise<number> {
  const { data: claimed, error } = await supabase.rpc('claim_notification_emails', {
    p_limit: 20,
  })

  if (error) {
    console.error('claim_notification_emails failed', error)
    return 0
  }

  const rows = (claimed ?? []) as {
    id: string
    profile_id: string
    email: string
    payload: NotificationPayload
  }[]
  if (rows.length === 0) return 0

  const apiKey = Deno.env.get('RESEND_API_KEY')
  const from = Deno.env.get('RESEND_FROM') ?? 'GigAway <notifications@gigaway.app>'
  const webBaseUrl = Deno.env.get('WEB_BASE_URL') ?? 'https://gigaway.app'

  // Local development has no mail credentials. Log instead of failing, so the
  // whole path can still be exercised end to end.
  if (!apiKey) {
    console.log(`email fallback: ${rows.length} due, no RESEND_API_KEY configured`)
    return 0
  }

  let emailsSent = 0

  for (const row of rows) {
    const copy = notificationCopy('offer_accepted', row.payload ?? {})

    try {
      const response = await fetch('https://api.resend.com/emails', {
        method: 'POST',
        headers: { Authorization: `Bearer ${apiKey}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({
          from,
          to: row.email,
          subject: copy.title,
          text:
            `${copy.body}\n\n` +
            `We sent this by email because the notification did not reach your phone.\n\n` +
            `Open GigAway to see their contact details: ${webBaseUrl}\n`,
        }),
      })

      if (!response.ok) {
        console.error('resend failed', response.status, await response.text())
        continue
      }

      emailsSent += 1
    } catch (cause) {
      console.error('resend request failed', cause)
    }
  }

  return emailsSent
}
