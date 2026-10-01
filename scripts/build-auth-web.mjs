#!/usr/bin/env node
/**
 * Adds three things to site/ that build-legal.mjs deliberately doesn't touch,
 * because they're a different concern (Universal Links / App Links, not the
 * legal Markdown pages):
 *
 *   /.well-known/apple-app-site-association
 *   /.well-known/assetlinks.json
 *   /auth/callback      (prod's password-reset / confirmation fallback page)
 *   /auth/dev-callback   (the dev variant's)
 *
 * Both app variants claim gigaway.app, path-scoped to their own callback
 * path, so they can stay installed side by side on one test device without
 * the OS having to guess which should open a given link — see
 * Milestone-5-Ship-It.md, "Corrections made during implementation" 5.
 *
 * Runs after build-legal.mjs, into the same site/ directory — this script
 * must not call rmSync on it, or it would wipe the legal pages back out.
 */

import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

const root = join(dirname(fileURLToPath(import.meta.url)), '..')
const outDir = join(root, 'site')

if (!existsSync(outDir)) {
  console.error('site/ does not exist yet — run `pnpm build:legal` first.')
  process.exit(1)
}

function required(value, name) {
  if (!value) {
    console.error(`Missing ${name}. This script needs both projects' URL and anon key.`)
    process.exit(1)
  }
  return value
}

// Apple Team IDs are not secret — every AASA file and every signed binary
// already exposes this one publicly.
const APPLE_TEAM_ID = '6V6QDY52A4'
const PROD_BUNDLE_ID = 'app.gigaway.mobile'
const DEV_BUNDLE_ID = 'app.gigaway.mobile.dev'

// Like APPLE_TEAM_ID above, neither of these is secret — assetlinks.json is
// published specifically so Android can fetch and read it. Hardcoded rather
// than routed through a GitHub secret for the same reason.
//
// Prod's is the Play App Signing certificate (Play re-signs every published
// app with its own key, so this is NOT the same certificate `eas
// credentials` would show — that's the upload key, a different thing).
// Retrieved 2026-10-01 from Play Console → Protected with Play → Automatic
// protection → Advanced settings → Classical key → SHA-256 certificate
// fingerprint.
const PROD_ANDROID_SHA256 =
  'C6:53:65:58:FA:D6:5F:4B:3A:6B:93:25:AC:48:63:93:A8:6C:B8:AE:DB:23:5C:F6:DD:81:37:0E:2F:DB:FD:AB'

// Dev's is the project-local debug keystore CNG/Gradle generates on a local
// `expo run:android` build — note this one is NOT ~/.android/debug.keystore
// (the machine-wide default keytool docs usually point at); this project's
// build puts it inside the generated android/ folder instead. Retrieved
// 2026-10-01 with:
//   keytool -list -v -keystore apps/mobile/android/app/debug.keystore \
//     -alias androiddebugkey -storepass android -keypass android
// Tied to this machine — regenerate if the keystore is ever reset or dev
// testing moves to a different computer.
const DEV_ANDROID_SHA256 =
  'FA:C6:17:45:DC:09:03:78:6F:B9:ED:E6:2A:96:2B:39:9F:73:48:F0:BB:6F:89:9B:83:32:66:75:91:03:3B:9C'

const PROD_SUPABASE_URL = required(process.env.SUPABASE_URL, 'SUPABASE_URL')
const PROD_SUPABASE_ANON_KEY = required(process.env.SUPABASE_ANON_KEY, 'SUPABASE_ANON_KEY')
const DEV_SUPABASE_URL = required(process.env.SUPABASE_DEV_URL, 'SUPABASE_DEV_URL')
const DEV_SUPABASE_ANON_KEY = required(process.env.SUPABASE_DEV_ANON_KEY, 'SUPABASE_DEV_ANON_KEY')

// --- apple-app-site-association ---------------------------------------

const aasa = {
  applinks: {
    details: [
      {
        appIDs: [`${APPLE_TEAM_ID}.${PROD_BUNDLE_ID}`],
        components: [{ '/': '/auth/callback/*', comment: 'Password reset and email confirmation' }],
      },
      {
        appIDs: [`${APPLE_TEAM_ID}.${DEV_BUNDLE_ID}`],
        components: [{ '/': '/auth/dev-callback/*', comment: 'Dev variant — same, different path' }],
      },
    ],
  },
}

// No file extension, and Cloudflare must serve this as application/json —
// see the _headers rule below. Apple follows no redirects to get here.
const wellKnownDir = join(outDir, '.well-known')
mkdirSync(wellKnownDir, { recursive: true })
writeFileSync(join(wellKnownDir, 'apple-app-site-association'), JSON.stringify(aasa, null, 2))
console.log('  /.well-known/apple-app-site-association'.padEnd(42) + '← generated')

// --- assetlinks.json -----------------------------------------------------

// Path-scoping for Android lives in each variant's own intent filter
// (app.config.ts's `pathPrefix`), not in this file — assetlinks.json only
// ever asserts "this package may be this domain," never which paths.
const assetlinks = [
  {
    relation: ['delegate_permission/common.handle_all_urls'],
    target: {
      namespace: 'android_app',
      package_name: PROD_BUNDLE_ID,
      sha256_cert_fingerprints: [PROD_ANDROID_SHA256],
    },
  },
  {
    relation: ['delegate_permission/common.handle_all_urls'],
    target: {
      namespace: 'android_app',
      package_name: DEV_BUNDLE_ID,
      sha256_cert_fingerprints: [DEV_ANDROID_SHA256],
    },
  },
]

writeFileSync(join(wellKnownDir, 'assetlinks.json'), JSON.stringify(assetlinks, null, 2))
console.log('  /.well-known/assetlinks.json'.padEnd(42) + '← generated')

// --- auth callback fallback pages ----------------------------------------

/**
 * Reached only when the OS couldn't hand the link to a native app — no
 * matching variant installed, or opened on a desktop. Runs Supabase's JS
 * client straight in the browser (CDN import, no build step): PKCE +
 * detectSessionInUrl both apply correctly here, unlike in the native app,
 * because a browser tab genuinely has a window.location to read the `?code=`
 * from. onAuthStateChange distinguishes a confirmation link (SIGNED_IN) from
 * a recovery one (PASSWORD_RECOVERY) exactly the way the native app's gate
 * does — see features/auth/session-store.ts.
 */
function callbackPage({ supabaseUrl, supabaseAnonKey }) {
  return `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8" />
<meta name="viewport" content="width=device-width, initial-scale=1" />
<meta name="robots" content="noindex" />
<title>GigAway</title>
<style>
  :root{ --bg:#fff; --bg-subtle:#F4F6F8; --border:#E4E9ED; --text:#0B0E11; --text-muted:#5C6B7A; --accent:#8A6320; --danger:#B3261E; }
  @media (prefers-color-scheme:dark){ :root{ --bg:#0B0E11; --bg-subtle:#101418; --border:#1A2027; --text:#F4F6F8; --text-muted:#8A99A8; --accent:#D4A548; --danger:#F2B8B5; } }
  *{box-sizing:border-box}
  body{ margin:0; min-height:100dvh; display:flex; align-items:center; justify-content:center; background:var(--bg); color:var(--text);
        font:16px/1.5 ui-sans-serif,system-ui,-apple-system,"Segoe UI",Roboto,sans-serif; padding:1.5rem; }
  .card{ width:100%; max-width:24rem; }
  h1{ font-size:1.375rem; margin:0 0 .5rem; }
  p{ color:var(--text-muted); margin:0 0 1.5rem; }
  label{ display:block; font-size:.8rem; font-weight:600; color:var(--text-muted); text-transform:uppercase; letter-spacing:.02em; margin-bottom:.375rem; }
  input{ width:100%; min-height:44px; padding:0 .75rem; border-radius:10px; border:1px solid var(--border); background:var(--bg-subtle); color:var(--text); font-size:1rem; }
  button{ width:100%; min-height:44px; margin-top:1rem; border:0; border-radius:10px; background:var(--accent); color:#101418; font-size:1rem; font-weight:600; cursor:pointer; }
  button:disabled{ opacity:.6; cursor:default; }
  .error{ color:var(--danger); font-size:.875rem; margin-top:.75rem; }
  .hidden{ display:none; }
</style>
</head>
<body>
<div class="card">
  <div id="loading">
    <h1>One moment…</h1>
    <p>Confirming your link.</p>
  </div>

  <div id="confirmed" class="hidden">
    <h1>You're confirmed</h1>
    <p>Open the GigAway app to continue.</p>
  </div>

  <div id="reset-form" class="hidden">
    <h1>Set a new password</h1>
    <p>Choose a new password for your account.</p>
    <form id="form">
      <label for="password">New password</label>
      <input id="password" type="password" autocomplete="new-password" minlength="10" required />
      <button type="submit">Set new password</button>
      <p id="form-error" class="error hidden"></p>
    </form>
  </div>

  <div id="done" class="hidden">
    <h1>Password updated</h1>
    <p>Open the GigAway app and sign in with your new password.</p>
  </div>

  <div id="failed" class="hidden">
    <h1>This link didn't work</h1>
    <p>It may have expired or already been used. Request a new one from the app.</p>
  </div>
</div>

<script type="module">
  import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

  const supabase = createClient(${JSON.stringify(supabaseUrl)}, ${JSON.stringify(supabaseAnonKey)}, {
    auth: { flowType: 'pkce', detectSessionInUrl: true, persistSession: false },
  })

  function show(id) {
    for (const el of document.querySelectorAll('.card > div')) el.classList.add('hidden')
    document.getElementById(id).classList.remove('hidden')
  }

  const params = new URLSearchParams(window.location.search)
  if (!params.get('code')) {
    show('failed')
  } else {
    supabase.auth.onAuthStateChange((event) => {
      if (event === 'PASSWORD_RECOVERY') show('reset-form')
      else if (event === 'SIGNED_IN') show('confirmed')
    })

    // If exchanging the code itself fails (expired, already used), neither
    // event above ever fires — time out to the failure state rather than
    // leaving "One moment…" showing forever.
    setTimeout(() => {
      if (!document.getElementById('reset-form').classList.contains('hidden')) return
      if (!document.getElementById('confirmed').classList.contains('hidden')) return
      show('failed')
    }, 8000)
  }

  document.getElementById('form').addEventListener('submit', async (e) => {
    e.preventDefault()
    const button = e.target.querySelector('button')
    const errorEl = document.getElementById('form-error')
    errorEl.classList.add('hidden')
    button.disabled = true

    const { error } = await supabase.auth.updateUser({
      password: document.getElementById('password').value,
    })

    if (error) {
      errorEl.textContent = error.message
      errorEl.classList.remove('hidden')
      button.disabled = false
      return
    }

    show('done')
  })
</script>
</body>
</html>
`
}

const authDir = join(outDir, 'auth')
mkdirSync(authDir, { recursive: true })

writeFileSync(
  join(authDir, 'callback.html'),
  callbackPage({ supabaseUrl: PROD_SUPABASE_URL, supabaseAnonKey: PROD_SUPABASE_ANON_KEY }),
)
console.log('  /auth/callback'.padEnd(42) + '← generated (prod)')

writeFileSync(
  join(authDir, 'dev-callback.html'),
  callbackPage({ supabaseUrl: DEV_SUPABASE_URL, supabaseAnonKey: DEV_SUPABASE_ANON_KEY }),
)
console.log('  /auth/dev-callback'.padEnd(42) + '← generated (dev)')

// --- _headers --------------------------------------------------------

// Cloudflare Pages must serve the AASA file as application/json with no
// redirect and no extension — Apple follows neither redirects nor content
// negotiation to fetch it. Appended, not overwritten: build-legal.mjs writes
// nothing here today, but if it ever does, this must not clobber it.
const headersPath = join(outDir, '_headers')
const headersRules = `
/.well-known/apple-app-site-association
  Content-Type: application/json

/.well-known/assetlinks.json
  Content-Type: application/json
`
const existingHeaders = existsSync(headersPath) ? readFileSync(headersPath, 'utf8') : ''
writeFileSync(headersPath, existingHeaders + headersRules)
console.log('  _headers'.padEnd(42) + '← appended')

console.log('\nauth web files built into site/')
