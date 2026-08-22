import Constants from 'expo-constants'
import * as Device from 'expo-device'
import * as Notifications from 'expo-notifications'
import { Platform } from 'react-native'

import { track } from '@/lib/analytics'
import { reportError } from '@/lib/monitoring'
import { supabase } from '@/lib/supabase'

/**
 * Expo push registration.
 *
 * TIMING IS THE DESIGN DECISION HERE. Permission is requested after the user's
 * first meaningful action — their first trip or first posted availability —
 * and never on launch. A cold prompt on a screen the user has not yet
 * understood gets denied, and on iOS a denial cannot be re-asked from inside
 * the app: the user has to find it in Settings, which they will not. One badly
 * timed prompt costs the notification channel permanently.
 *
 * Remote push does NOT work in Expo Go. All of this requires an EAS
 * development build on a real device.
 */

/** Foreground behaviour: show the banner, since a missed offer matters. */
Notifications.setNotificationHandler({
  handleNotification: async () => ({
    shouldShowBanner: true,
    shouldShowList: true,
    shouldPlaySound: true,
    shouldSetBadge: true,
  }),
})

let cachedToken: string | null = null

/** The token this device is currently registered with, if any. */
export function currentPushToken(): string | null {
  return cachedToken
}

async function ensureAndroidChannel(): Promise<void> {
  if (Platform.OS !== 'android') return
  await Notifications.setNotificationChannelAsync('default', {
    name: 'GigAway',
    importance: Notifications.AndroidImportance.DEFAULT,
    vibrationPattern: [0, 250, 250, 250],
  })
}

/**
 * Asks for permission and stores the resulting token.
 *
 * Returns false when permission is unavailable or refused — callers should
 * treat that as ordinary, not as an error. The Activity list and the email
 * fallback exist precisely so that a member who says no still gets told.
 */
export async function registerForPush(
  profileId: string,
  { prompt = true }: { prompt?: boolean } = {},
): Promise<boolean> {
  // A simulator cannot receive remote push and throws rather than returning a
  // token, so bail before prompting for a permission that buys nothing.
  if (!Device.isDevice) return false

  try {
    await ensureAndroidChannel()

    const existing = await Notifications.getPermissionsAsync()
    let status = existing.status

    if (status !== 'granted') {
      // Silent mode: refresh an existing registration on launch without ever
      // putting a dialog in front of someone who has not asked for one.
      if (!prompt) return false

      // Do not re-prompt after a denial: iOS will not show the dialog again,
      // and the call silently resolves to denied.
      if (!existing.canAskAgain) {
        track('push_permission_denied')
        return false
      }
      const requested = await Notifications.requestPermissionsAsync()
      status = requested.status
    }

    if (status !== 'granted') {
      track('push_permission_denied')
      return false
    }

    const projectId = resolveProjectId()
    const { data: token } = await Notifications.getExpoPushTokenAsync(
      projectId ? { projectId } : undefined,
    )

    cachedToken = token
    track('push_permission_granted')

    // Upsert on the token, not the profile: reinstalling gives a new token,
    // and one profile legitimately has several live devices. A token that was
    // invalidated earlier — by sign-out or a dead-device receipt — comes back
    // to life here, which is exactly right for a reinstall.
    const { error } = await supabase.from('push_tokens').upsert(
      {
        profile_id: profileId,
        token,
        platform: Platform.OS === 'ios' ? 'ios' : 'android',
        last_seen_at: new Date().toISOString(),
        invalidated_at: null,
      },
      { onConflict: 'token' },
    )
    if (error) throw error

    return true
  } catch (cause) {
    // Never let a push failure break the action the user actually took.
    reportError(cause, { feature: 'push_registration' })
    return false
  }
}

/**
 * Keeps the token warm.
 *
 * The dispatcher only sends to live tokens; last_seen_at is what tells a
 * future cleanup which of a member's registered devices they still use.
 */
export async function touchPushToken(): Promise<void> {
  if (!cachedToken) return
  await supabase
    .from('push_tokens')
    .update({ last_seen_at: new Date().toISOString() })
    .eq('token', cachedToken)
}

/**
 * Invalidates this device's token on sign-out.
 *
 * Without it, the next person to sign in on a shared or resold phone would
 * keep receiving the previous member's notifications.
 */
export async function unregisterPush(): Promise<void> {
  if (!cachedToken) return
  await supabase
    .from('push_tokens')
    .update({ invalidated_at: new Date().toISOString() })
    .eq('token', cachedToken)
  cachedToken = null
}

/** The EAS project id, which getExpoPushTokenAsync needs in a bare build. */
function resolveProjectId(): string | undefined {
  const extra = Constants.expoConfig?.extra as { eas?: { projectId?: string } } | undefined
  return extra?.eas?.projectId ?? Constants.easConfig?.projectId
}
