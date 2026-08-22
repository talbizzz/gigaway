import * as Notifications from 'expo-notifications'
import { useRouter } from 'expo-router'
import { useCallback, useEffect } from 'react'
import { AppState } from 'react-native'

import { useSessionStore } from '@/features/auth/session-store'
import { notificationKeys } from '@/features/notifications/use-notifications'
import { registerForPush, touchPushToken } from '@/lib/push'
import { queryClient } from '@/lib/query'

/**
 * Push lifecycle for a signed-in member.
 *
 * Deliberately does NOT prompt. It refreshes a registration the user has
 * already granted, keeps last_seen_at warm, and routes taps. The permission
 * dialog itself belongs to usePushPrompt below, which fires after the user's
 * first real action.
 */
export function usePushLifecycle(): void {
  const session = useSessionStore((state) => state.session)
  const router = useRouter()
  const profileId = session?.user.id

  // Refresh the token silently on launch. Tokens rotate on reinstall and after
  // some OS updates, and a stale one fails silently — the member simply stops
  // getting notifications and never finds out why.
  useEffect(() => {
    if (!profileId) return
    void registerForPush(profileId, { prompt: false })
  }, [profileId])

  useEffect(() => {
    if (!profileId) return

    const subscription = AppState.addEventListener('change', (state) => {
      if (state !== 'active') return
      void touchPushToken()
      // Coming back to the app is the moment a missed push becomes visible, so
      // refetch the feed the badge is derived from.
      void queryClient.invalidateQueries({ queryKey: notificationKeys.feed })
    })

    return () => subscription.remove()
  }, [profileId])

  // Tapping a notification must land on the thing it was about. The route is
  // computed by the same shared function that wrote the copy, so the two
  // cannot disagree about where a given type leads.
  useEffect(() => {
    const subscription = Notifications.addNotificationResponseReceivedListener((response) => {
      const data = response.notification.request.content.data as { route?: string } | undefined
      if (data?.route) router.push(data.route as never)
      void queryClient.invalidateQueries({ queryKey: notificationKeys.feed })
    })

    return () => subscription.remove()
  }, [router])

  // A push arriving while the app is open should update the badge too.
  useEffect(() => {
    const subscription = Notifications.addNotificationReceivedListener(() => {
      void queryClient.invalidateQueries({ queryKey: notificationKeys.feed })
    })

    return () => subscription.remove()
  }, [])
}

/**
 * Asks for notification permission — once the user has done something that
 * makes the ask make sense.
 *
 * Call this after a trip or availability is posted, NEVER on launch. At that
 * moment the user has just told the app they want to hear from someone, so the
 * dialog reads as useful rather than as a toll booth. Get it wrong and the
 * denial is permanent: iOS will not show the system prompt a second time.
 *
 * The returned promise never rejects. A member who says no still gets the
 * Activity list, and an accepted offer still reaches them by email.
 */
export function usePushPrompt(): () => Promise<void> {
  const session = useSessionStore((state) => state.session)
  const profileId = session?.user.id

  return useCallback(async () => {
    if (!profileId) return
    await registerForPush(profileId, { prompt: true })
  }, [profileId])
}
