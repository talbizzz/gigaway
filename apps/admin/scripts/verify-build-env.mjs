#!/usr/bin/env node
/**
 * Refuses a build whose Supabase settings are wrong, before anything is
 * published.
 *
 *   node scripts/verify-build-env.mjs <expected-project-ref>
 *
 * Everything in VITE_* is compiled into the public JavaScript bundle, so two
 * mistakes matter here and neither would announce itself later:
 *
 *   1. A SECRET key in VITE_SUPABASE_ANON_KEY. The service-role key sits next
 *      to the anon key in the dashboard; pasting the wrong one into a GitHub
 *      secret would publish full database access to anyone who opens
 *      devtools. Only an `anon` JWT (or a publishable key) is accepted.
 *   2. The right kind of key for the wrong project — the dev site quietly
 *      talking to the production database, or the reverse.
 *
 * Prints the project ref and key role only. Never the key.
 */

const expectedRef = process.argv[2]
const url = process.env.VITE_SUPABASE_URL ?? ''
const key = process.env.VITE_SUPABASE_ANON_KEY ?? ''

function fail(message) {
  console.error(`verify-build-env: ${message}`)
  process.exit(1)
}

if (!expectedRef) fail('usage: verify-build-env.mjs <expected-project-ref>')
if (!url) fail('VITE_SUPABASE_URL is empty.')
if (!key) {
  fail(
    'VITE_SUPABASE_ANON_KEY is empty — the matching GitHub secret ' +
      '(ADMIN_DEV_SUPABASE_ANON_KEY / ADMIN_PROD_SUPABASE_ANON_KEY) is missing or unset.',
  )
}

let urlRef
try {
  urlRef = new URL(url).hostname.split('.')[0]
} catch {
  fail(`VITE_SUPABASE_URL is not a valid URL: ${url}`)
}
if (urlRef !== expectedRef) {
  fail(`VITE_SUPABASE_URL is project "${urlRef}" but this build is for "${expectedRef}".`)
}

if (key.startsWith('sb_secret_')) {
  fail('VITE_SUPABASE_ANON_KEY is a SECRET key. It would be published in the JS bundle. Use the anon/publishable key.')
}

if (key.startsWith('sb_publishable_')) {
  // Opaque, so its project can't be read back — the URL check above is what we have.
  console.log(`verify-build-env: ok — project ${urlRef}, publishable key`)
  process.exit(0)
}

let claims
try {
  claims = JSON.parse(Buffer.from(key.split('.')[1] ?? '', 'base64url').toString('utf8'))
} catch {
  fail('VITE_SUPABASE_ANON_KEY is neither a Supabase JWT nor a publishable key.')
}

if (claims.role !== 'anon') {
  fail(`VITE_SUPABASE_ANON_KEY has role "${claims.role}", not "anon". Refusing to publish it in a public bundle.`)
}
if (claims.ref !== expectedRef) {
  fail(`VITE_SUPABASE_ANON_KEY belongs to project "${claims.ref}" but this build is for "${expectedRef}".`)
}

console.log(`verify-build-env: ok — project ${urlRef}, role ${claims.role}`)
