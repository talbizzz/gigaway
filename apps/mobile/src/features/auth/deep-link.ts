import * as Linking from 'expo-linking'

import { reportError } from '@/lib/monitoring'
import { supabase } from '@/lib/supabase'

/**
 * Catches the Universal Link Supabase Auth redirects to after a confirmation
 * or password-recovery email is followed, and exchanges the PKCE code it
 * carries for a session.
 *
 * Navigation is not this module's job. A confirmation link's session is an
 * ordinary sign-in — the auth gate routes on from it exactly as it does after
 * signInWithPassword. A recovery link's session is flagged separately (the
 * PASSWORD_RECOVERY event, handled in session-store.ts) precisely so the gate
 * can send it to the set-new-password screen instead.
 */
async function handleUrl(url: string | null): Promise<void> {
  if (!url) return

  const { queryParams } = Linking.parse(url)
  const code = queryParams?.code
  if (typeof code !== 'string') return

  try {
    await supabase.auth.exchangeCodeForSession(code)
  } catch (error) {
    reportError(error, { feature: 'auth-deep-link' })
  }
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
