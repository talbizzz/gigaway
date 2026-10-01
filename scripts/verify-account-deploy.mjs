#!/usr/bin/env node
/**
 * Checks that a deployed account-callback site is up and correctly
 * configured.
 *
 *   verify-account-deploy.mjs <base-url>
 *
 * Three things, each a way a "successful" upload can still be broken:
 *   - `/callback` serves the fallback page with no redirect — pinned by an
 *     explicit `_redirects` rewrite rule in build-account-web.mjs, not left
 *     to Cloudflare's own extensionless-path handling, which turned out to
 *     normalize in opposite directions on the bare *.pages.dev URL versus
 *     the real custom domain (confirmed empirically 2026-10-02)
 *   - `/callback` serves it as `text/html`, not the backing file's
 *     extension-default `application/octet-stream` — a real browser
 *     downloads the latter instead of rendering it (also found 2026-10-02)
 *   - `/.well-known/apple-app-site-association` serves as application/json —
 *     proof _headers was applied; Apple follows no redirects and does no
 *     content negotiation to fetch this file, so the wrong content type
 *     means Universal Links silently never verify
 *
 * Retries instead of checking once, same reasoning as verify-admin-deploy.mjs:
 * a brand-new Pages project has no certificate for its subdomain for a short
 * while after the first deploy.
 *
 * VERIFY_TIMEOUT_SECONDS (default 180) and VERIFY_INTERVAL_SECONDS (default 10)
 * exist so this can be tested without waiting minutes.
 */
const base = process.argv[2]?.replace(/\/+$/, '')
if (!base || !/^https:\/\//.test(base)) {
  console.error('::error::verify-account-deploy — usage: verify-account-deploy.mjs <https-url> (was the publish step skipped?)')
  process.exit(1)
}

const timeoutMs = Number(process.env.VERIFY_TIMEOUT_SECONDS ?? 180) * 1000
const intervalMs = Number(process.env.VERIFY_INTERVAL_SECONDS ?? 10) * 1000
const startedAt = Date.now()

const get = (path) => fetch(`${base}${path}`, { redirect: 'manual', signal: AbortSignal.timeout(20_000) })

async function check() {
  const callback = await get('/callback')
  if (callback.status !== 200) throw new Error(`/callback returned ${callback.status}`)
  // Status 200 alone isn't enough — this exact page once served 200 with
  // Content-Type: application/octet-stream (its backing file's extension
  // has no implied type, and the _headers rule fixing that has to target
  // the requested path, not the internal one — easy to get wrong again).
  // A real browser would try to download that instead of rendering it.
  const callbackContentType = callback.headers.get('content-type') ?? ''
  if (!callbackContentType.startsWith('text/html')) {
    throw new Error(`/callback served as '${callbackContentType}', not text/html`)
  }

  const aasa = await get('/.well-known/apple-app-site-association')
  if (aasa.status !== 200) throw new Error(`/.well-known/apple-app-site-association returned ${aasa.status}`)
  const contentType = aasa.headers.get('content-type') ?? ''
  if (!contentType.startsWith('application/json')) {
    throw new Error(`/.well-known/apple-app-site-association served as '${contentType}', not application/json`)
  }
}

console.log(`checking ${base}`)
for (let attempt = 1; ; attempt++) {
  try {
    await check()
    console.log(`live and correctly configured (attempt ${attempt}, ${Math.round((Date.now() - startedAt) / 1000)}s)`)
    break
  } catch (error) {
    const reason = error.cause?.message ?? error.cause?.code ?? error.message
    const elapsed = Date.now() - startedAt
    if (elapsed + intervalMs > timeoutMs) {
      console.error(`::error::${base} did not become healthy within ${Math.round(timeoutMs / 1000)}s. Last problem: ${reason}`)
      process.exit(1)
    }
    console.log(`  attempt ${attempt} (${Math.round(elapsed / 1000)}s): ${reason} — retrying`)
    await new Promise((resolve) => setTimeout(resolve, intervalMs))
  }
}
