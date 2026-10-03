import * as Linking from 'expo-linking'

import { reportError } from '@/lib/monitoring'
import { supabase } from '@/lib/supabase'

/**
 * Catches the Universal Link carried by a password-recovery or confirmation
 * email and verifies its hashed token with verifyOtp.
 *
 * The email links straight to this app's own domain with a token_hash, not to
 * a Supabase-hosted URL that redirects back: a redirect chain starting at
 * supabase.co never opens the app, because iOS only hands over navigations to
 * the associated domain itself. verifyOtp is used instead of PKCE's
 * exchangeCodeForSession because a PKCE verifier lives on the device that
 * requested the reset, so a link opened anywhere else could never finish.
 *
 * Navigation is not this module's job. A recovery verification emits
 * PASSWORD_RECOVERY (handled in session-store.ts) so the gate can send the
 * user to set-new-password; a signup verification signs the user in and the
 * gate routes on from there.
 */
async function handleUrl(url: string | null): Promise<void> {
  if (!url) return

  const { queryParams } = Linking.parse(url)
  const tokenHash = queryParams?.token_hash
  const type = queryParams?.type
  if (typeof tokenHash !== 'string') return
  if (type !== 'recovery' && type !== 'signup') return

  const { error } = await supabase.auth.verifyOtp({ token_hash: tokenHash, type })
  if (error) reportError(error, { feature: 'auth-deep-link' })
}

/**
 * Wires the listener into the store. Call once, from the root layout.
 * Returns an unsubscribe function.
 *
 * Handles both cold start (the app was not running — Linking.getInitialURL())
 * and warm start (the app was already open — the 'url' event). Cold start is
 * the common case: tapping a link in an email almost always launches the app
 * fresh rather than finding it already running.
 */
export function initialiseAuthDeepLink(): () => void {
  void Linking.getInitialURL().then(handleUrl)

  const subscription = Linking.addEventListener('url', ({ url }) => {
    void handleUrl(url)
  })

  return () => subscription.remove()
}
