import { isRevealNotification, notificationCopy, notificationRoute } from '@gigaway/shared'
import { Stack, useRouter } from 'expo-router'
import { useEffect } from 'react'
import { ActivityIndicator, Pressable, StyleSheet, Text, View } from 'react-native'

import { Callout } from '@/components/callout'
import { Screen } from '@/components/screen'
import {
  useMarkAllRead,
  useNotifications,
  type AppNotification,
} from '@/features/notifications/use-notifications'
import { radius, spacing, typography } from '@/theme/tokens'
import { useTheme } from '@/theme/use-theme'

/**
 * Activity.
 *
 * This is what turns a missed push into a visible item, which is the whole
 * reason it exists — push delivery is not guaranteed, and an acceptance the
 * user never learns about is the failure that costs them money.
 *
 * One reverse-chronological list, no filters and no grouping. The volume is a
 * handful of rows per trip; every control added here is a control the user has
 * to understand before finding the thing they came for.
 */
export default function ActivityScreen() {
  const theme = useTheme()
  const notifications = useNotifications()
  const markAllRead = useMarkAllRead()

  // Opening the screen IS the acknowledgement. Making the user tap each row to
  // clear a badge is busywork.
  useEffect(() => {
    if (!notifications.data?.some((row) => row.read_at === null)) return
    markAllRead.mutate()
    // Deliberately keyed on the data only: re-running when the mutation object
    // changes identity would loop.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [notifications.data])

  if (notifications.isPending) {
    return (
      <View style={[styles.centre, { backgroundColor: theme.bg }]}>
        <ActivityIndicator color={theme.accent} />
      </View>
    )
  }

  const rows = notifications.data ?? []

  return (
    <Screen>
      <Stack.Screen options={{ title: 'Activity' }} />

      {rows.length === 0 ? (
        <Callout title="Nothing yet">
          Requests, offers and acceptances turn up here — so if a notification never
          reaches your phone, you have not missed it.
        </Callout>
      ) : (
        rows.map((row) => <ActivityRow key={row.id} notification={row} />)
      )}
    </Screen>
  )
}

function ActivityRow({ notification }: { notification: AppNotification }) {
  const theme = useTheme()
  const router = useRouter()

  const payload = notification.payload ?? {}
  const copy = notificationCopy(notification.type, payload)
  const unread = notification.read_at === null
  const reveal = isRevealNotification(notification.type)

  return (
    <Pressable
      accessibilityRole="button"
      onPress={() => router.push(notificationRoute(notification.type, payload) as never)}
      style={({ pressed }) => [
        styles.row,
        {
          backgroundColor: unread ? theme.accentSubtle : theme.bgSubtle,
          borderColor: reveal ? theme.accent : theme.border,
        },
        pressed && styles.pressed,
      ]}
    >
      <View style={styles.rowText}>
        <Text style={[typography.bodyStrong, { color: theme.text }]}>{copy.title}</Text>
        <Text style={[typography.body, { color: theme.textMuted }]}>{copy.body}</Text>
        <Text style={[typography.caption, { color: theme.textFaint }]}>
          {relativeTime(notification.created_at)}
        </Text>
      </View>
    </Pressable>
  )
}

/** "just now" / "3 hours ago" / "12 March". Exact timestamps help nobody here. */
function relativeTime(iso: string): string {
  const then = new Date(iso).getTime()
  const minutes = Math.floor((Date.now() - then) / 60_000)

  if (minutes < 1) return 'just now'
  if (minutes < 60) return `${minutes} minute${minutes === 1 ? '' : 's'} ago`

  const hours = Math.floor(minutes / 60)
  if (hours < 24) return `${hours} hour${hours === 1 ? '' : 's'} ago`

  const days = Math.floor(hours / 24)
  if (days < 7) return `${days} day${days === 1 ? '' : 's'} ago`

  return new Date(iso).toLocaleDateString('en-GB', { day: 'numeric', month: 'long' })
}

const styles = StyleSheet.create({
  centre: { flex: 1, alignItems: 'center', justifyContent: 'center' },
  row: {
    padding: spacing.lg,
    borderRadius: radius.md,
    borderWidth: StyleSheet.hairlineWidth,
  },
  rowText: { gap: spacing.xs },
  pressed: { opacity: 0.7 },
})
