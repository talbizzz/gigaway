#!/usr/bin/env node
/**
 * Checks that a deployed admin site is up and correctly configured.
 *
 *   verify-admin-deploy.mjs <base-url>
 *
 * Three things, each a way a "successful" upload can still be broken:
 *   - `/` serves the app (its <title>), not a Cloudflare error page
 *   - `/users` also returns 200 — the single-page-app fallback; without it a
 *     refresh on any deep link is a 404
 *   - X-Frame-Options: DENY is present — proof public/_headers was applied
 *
 * It retries instead of checking once. A brand-new Pages project has no
 * certificate for its subdomain for a short while after the first deploy
 * ("sslv3 alert handshake failure"), and any deploy can take a few seconds to
 * be served everywhere. Anything that fails is retried until the deadline, and
 * the last reason is what gets reported.
 *
 * VERIFY_TIMEOUT_SECONDS (default 180) and VERIFY_INTERVAL_SECONDS (default 10)
 * exist so this can be tested without waiting minutes.
 */
const base = process.argv[2]?.replace(/\/+$/, '')
if (!base || !/^https:\/\//.test(base)) {
  console.error('::error::verify-admin-deploy — usage: verify-admin-deploy.mjs <https-url> (was the publish step skipped?)')
  process.exit(1)
}

const timeoutMs = Number(process.env.VERIFY_TIMEOUT_SECONDS ?? 180) * 1000
const intervalMs = Number(process.env.VERIFY_INTERVAL_SECONDS ?? 10) * 1000
const startedAt = Date.now()

// `redirect: 'manual'` so a redirect is reported as one, not silently followed.
const get = (path) => fetch(`${base}${path}`, { redirect: 'manual', signal: AbortSignal.timeout(20_000) })

async function check() {
  const home = await get('/')
  if (home.status !== 200) throw new Error(`/ returned ${home.status}`)
  if (!(await home.text()).includes('<title>GigAway Admin</title>')) {
    throw new Error("/ is being served, but it is not the admin app (its <title> is missing)")
  }
  if (home.headers.get('x-frame-options')?.toLowerCase() !== 'deny') {
    throw new Error('_headers was not applied (no X-Frame-Options: DENY)')
  }
  const users = await get('/users')
  if (users.status !== 200) throw new Error(`/users returned ${users.status}, so deep links are not falling back to the app`)
}

console.log(`checking ${base}`)
for (let attempt = 1; ; attempt++) {
  try {
    await check()
    console.log(`live and correctly configured (attempt ${attempt}, ${Math.round((Date.now() - startedAt) / 1000)}s)`)
    break
  } catch (error) {
    // fetch() wraps network/TLS failures as "fetch failed"; the real reason is the cause.
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
