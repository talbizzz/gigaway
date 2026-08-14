import { jsonResponse, preflight, requireServiceRole, serviceClient } from '../_shared/http.ts'

/**
 * Deletes verification documents whose purge has been requested.
 *
 * This exists because Postgres cannot do it. Supabase blocks direct deletion
 * from storage.objects (`storage.protect_delete`) specifically to stop rows
 * being removed while files linger on disk, so the only honest way to delete a
 * document is through the Storage API — which means an HTTP client, which
 * means an Edge Function.
 *
 * Invoked every minute by pg_cron. Idempotent: a row is only stamped
 * `docs_deleted_at` once its objects are actually gone, so a failed run simply
 * retries on the next tick.
 */

const BATCH_SIZE = 50

Deno.serve(async (request) => {
  const preflightResponse = preflight(request)
  if (preflightResponse) return preflightResponse

  const denied = requireServiceRole(request)
  if (denied) return denied

  const supabase = serviceClient()

  const { data: pending, error } = await supabase
    .from('verification_applications')
    .select('id, doc_paths')
    .not('docs_deletion_requested_at', 'is', null)
    .is('docs_deleted_at', null)
    .order('docs_deletion_requested_at', { ascending: true })
    .limit(BATCH_SIZE)

  if (error) {
    console.error('failed to load applications awaiting purge', error)
    return jsonResponse({ ok: false, error: 'query_failed', message: error.message }, 500)
  }

  let purged = 0
  let failed = 0

  for (const application of pending ?? []) {
    const paths = (application.doc_paths ?? []) as string[]

    if (paths.length > 0) {
      const { error: removeError } = await supabase.storage
        .from('verification-docs')
        .remove(paths)

      if (removeError) {
        // Leave the row untouched so the next tick tries again.
        console.error(`purge failed for application ${application.id}`, removeError)
        failed += 1
        continue
      }
    }

    const { error: updateError } = await supabase
      .from('verification_applications')
      .update({ doc_paths: [], docs_deleted_at: new Date().toISOString() })
      .eq('id', application.id)

    if (updateError) {
      // The objects are gone but the record still says otherwise. Retrying is
      // safe: storage.remove on already-absent paths does not error.
      console.error(`purge bookkeeping failed for application ${application.id}`, updateError)
      failed += 1
      continue
    }

    purged += 1
  }

  if (purged > 0 || failed > 0) {
    console.log(`purge-verification-docs: purged=${purged} failed=${failed}`)
  }

  return jsonResponse({ ok: true, purged, failed })
})
