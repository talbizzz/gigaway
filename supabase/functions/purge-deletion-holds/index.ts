import { jsonResponse, preflight, requireServiceRole, serviceClient } from '../_shared/http.ts'

/**
 * Erases deleted members' held identity once the hold has run out.
 *
 * delete_account() copies a member's identity into deletion_holds before it
 * erases them, and the selfie and CV stay in Storage with it. This is what
 * ends that: for every hold past its date, remove the files, then the row.
 *
 * Files first, row second. Storage objects are not reachable from SQL, and the
 * row is the only record of where they are, so deleting it first would orphan
 * them for good. If a removal fails the row stays, and the next daily run tries
 * again.
 *
 * Invoked daily by pg_cron. Does nothing when there is nothing to do.
 */

Deno.serve(async (request) => {
  const preflightResponse = preflight(request)
  if (preflightResponse) return preflightResponse

  const denied = requireServiceRole(request)
  if (denied) return denied

  const supabase = serviceClient()

  const { data: expired, error } = await supabase.rpc('claim_expired_deletion_holds', {
    p_limit: 50,
  })

  if (error) {
    console.error('purge-deletion-holds: claim failed', error)
    return jsonResponse({ ok: false, error: 'claim_failed', message: error.message }, 500)
  }

  let purged = 0
  let failed = 0

  for (const hold of (expired ?? []) as {
    profile_id: string
    selfie_path: string | null
    cv_path: string | null
  }[]) {
    const paths = [hold.selfie_path, hold.cv_path].filter((p): p is string => Boolean(p))

    if (paths.length > 0) {
      const { error: removeError } = await supabase.storage.from('verification-docs').remove(paths)
      if (removeError) {
        console.error('purge-deletion-holds: file removal failed', hold.profile_id, removeError)
        failed += 1
        continue
      }
    }

    const { error: finishError } = await supabase.rpc('finish_deletion_hold', {
      p_profile_id: hold.profile_id,
    })
    if (finishError) {
      console.error('purge-deletion-holds: row removal failed', hold.profile_id, finishError)
      failed += 1
      continue
    }

    purged += 1
  }

  return jsonResponse({ ok: failed === 0, purged, failed })
})
