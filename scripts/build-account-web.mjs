#!/usr/bin/env node
/**
 * Builds the two account-callback sites — site-account/ (account.gigaway.app,
 * prod) and site-account-dev/ (account-dev.gigaway.app, dev) — each a
 * standalone Universal Link / App Link target plus the password-reset /
 * confirmation fallback page, for Supabase Auth's confirmation and
 * password-recovery emails.
 *
 * Was one shared gigaway.app, path-scoped (/auth/callback vs
 * /auth/dev-callback) so both app variants could claim the same domain
 * without the OS having to guess which should open a link. Split into two
 * real domains instead, once it became clear "account" needed its own
 * genuinely-testable staging target, not just a path on a shared one — see
 * Milestone-5-Ship-It.md, "Corrections made during implementation" 6. Each
 * domain now needs only one app ID in its own AASA/assetlinks files, and
 * app.config.ts's associatedDomains is a plain per-variant domain swap
 * instead of a shared one.
 *
 * Independent of build-legal.mjs — no shared output directory, nothing to
 * clobber or coordinate ordering with.
 */

import { mkdirSync, rmSync, writeFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

const root = join(dirname(fileURLToPath(import.meta.url)), '..')

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

// No trailing slash — and it's pinned by an explicit _redirects rewrite
// below, not left to Cloudflare's own clean-URL guessing. Confirmed
// empirically, 2026-10-02: the bare *.pages.dev deployment URL and the real
// account-dev.gigaway.app custom domain normalize extensionless paths in
// OPPOSITE directions (one redirects /callback -> /callback/, the other
// /callback/ -> /callback) — almost certainly because the custom domain
// sits inside the gigaway.app zone, picking up zone-level behavior the raw
// pages.dev hostname never sees. Chasing whichever one the OS validator
// happens to hit was never going to be reliable, hence the rewrite rule
// instead of relying on either host's default.
const CALLBACK_PATH = '/callback'

const PROD_SUPABASE_URL = required(process.env.SUPABASE_URL, 'SUPABASE_URL')
const PROD_SUPABASE_ANON_KEY = required(process.env.SUPABASE_ANON_KEY, 'SUPABASE_ANON_KEY')
const DEV_SUPABASE_URL = required(process.env.SUPABASE_DEV_URL, 'SUPABASE_DEV_URL')
const DEV_SUPABASE_ANON_KEY = required(process.env.SUPABASE_DEV_ANON_KEY, 'SUPABASE_DEV_ANON_KEY')

const ENVIRONMENTS = [
  {
    name: 'prod',
    outDir: join(root, 'site-account'),
    domain: 'account.gigaway.app',
    bundleId: 'app.gigaway.mobile',
    // Play App Signing re-signs the published app with its own key, so this
    // is NOT the same certificate `eas credentials` would show (that's the
    // upload key, a different thing). Retrieved 2026-10-01 from Play Console
    // → Protected with Play → Automatic protection → Advanced settings →
    // Classical key → SHA-256 certificate fingerprint.
    androidSha256: 'C6:53:65:58:FA:D6:5F:4B:3A:6B:93:25:AC:48:63:93:A8:6C:B8:AE:DB:23:5C:F6:DD:81:37:0E:2F:DB:FD:AB',
    supabaseUrl: PROD_SUPABASE_URL,
    supabaseAnonKey: PROD_SUPABASE_ANON_KEY,
  },
  {
    name: 'dev',
    outDir: join(root, 'site-account-dev'),
    domain: 'account-dev.gigaway.app',
    bundleId: 'app.gigaway.mobile.dev',
    // The project-local debug keystore CNG/Gradle generates on a local
    // `expo run:android` build — note this is NOT ~/.android/debug.keystore
    // (the machine-wide default most keytool instructions assume); this
    // project's build puts it inside the generated android/ folder instead.
    // Retrieved 2026-10-01 with:
    //   keytool -list -v -keystore apps/mobile/android/app/debug.keystore \
    //     -alias androiddebugkey -storepass android -keypass android
    // Tied to this machine — regenerate if the keystore is ever reset or dev
    // testing moves to a different computer.
    androidSha256: 'FA:C6:17:45:DC:09:03:78:6F:B9:ED:E6:2A:96:2B:39:9F:73:48:F0:BB:6F:89:9B:83:32:66:75:91:03:3B:9C',
    supabaseUrl: DEV_SUPABASE_URL,
    supabaseAnonKey: DEV_SUPABASE_ANON_KEY,
  },
]

/**
 * Reached only when the OS couldn't hand the link to a native app — no
 * matching variant installed, or opened on a desktop. Runs Supabase's JS
 * client straight in the browser (CDN import, no build step): PKCE +
 * detectSessionInUrl both apply correctly here, unlike in the native app,
 * because a browser tab genuinely has a window.location to read the `?code=`
 * from. onAuthStateChange distinguishes a confirmation link (SIGNED_IN) from
 * a recovery one (PASSWORD_RECOVERY) exactly the way the native app's gate
 * does — see apps/mobile/src/features/auth/session-store.ts.
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

for (const env of ENVIRONMENTS) {
  rmSync(env.outDir, { recursive: true, force: true })
  mkdirSync(env.outDir, { recursive: true })

  // --- apple-app-site-association ---
  // No file extension, and Cloudflare must serve this as application/json —
  // see the _headers rule below. Apple follows no redirects to get here.
  //
  // Exact match on CALLBACK_PATH, pinned to resolve with no redirect by the
  // _redirects rewrite below — see that constant's own comment for why this
  // isn't just left to Cloudflare's default extensionless-path handling.
  const aasa = {
    applinks: {
      details: [
        {
          appIDs: [`${APPLE_TEAM_ID}.${env.bundleId}`],
          components: [{ '/': CALLBACK_PATH }],
        },
      ],
    },
  }
  const wellKnownDir = join(env.outDir, '.well-known')
  mkdirSync(wellKnownDir, { recursive: true })
  writeFileSync(join(wellKnownDir, 'apple-app-site-association'), JSON.stringify(aasa, null, 2))

  // --- assetlinks.json ---
  const assetlinks = [
    {
      relation: ['delegate_permission/common.handle_all_urls'],
      target: {
        namespace: 'android_app',
        package_name: env.bundleId,
        sha256_cert_fingerprints: [env.androidSha256],
      },
    },
  ]
  writeFileSync(join(wellKnownDir, 'assetlinks.json'), JSON.stringify(assetlinks, null, 2))

  // --- the fallback page itself ---
  // Written as callback.html; _redirects below is what actually makes
  // CALLBACK_PATH (/callback) serve this, not Cloudflare's own guess.
  writeFileSync(
    join(env.outDir, 'callback.html'),
    callbackPage({ supabaseUrl: env.supabaseUrl, supabaseAnonKey: env.supabaseAnonKey }),
  )

  // --- _headers ---
  // Cloudflare Pages must serve the AASA file as application/json with no
  // redirect and no extension — Apple follows neither redirects nor content
  // negotiation to fetch it.
  writeFileSync(
    join(env.outDir, '_headers'),
    `/.well-known/apple-app-site-association\n  Content-Type: application/json\n\n/.well-known/assetlinks.json\n  Content-Type: application/json\n`,
  )

  // --- _redirects ---
  // A 200 status here is a rewrite, not an HTTP redirect: Cloudflare serves
  // callback.html's content at the exact CALLBACK_PATH URL, with no
  // round-trip and no dependence on whichever way a given hostname's
  // default extensionless-path handling happens to go (see CALLBACK_PATH's
  // comment above — confirmed to differ between the bare *.pages.dev URL
  // and the real custom domain for this exact project).
  writeFileSync(join(env.outDir, '_redirects'), `${CALLBACK_PATH}  /callback.html  200\n`)

  console.log(`${env.outDir.replace(root + '/', '')}/ built — ${env.domain}`)
}
