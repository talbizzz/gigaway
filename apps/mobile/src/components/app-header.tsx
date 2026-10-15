import { useRouter } from 'expo-router'
import type { ReactNode } from 'react'
import { Pressable, StyleSheet, Text, View } from 'react-native'
import { useSafeAreaInsets } from 'react-native-safe-area-context'

import { CountBadge } from '@/components/badge'
import { useUnreadCount } from '@/features/notifications/use-notifications'
import { BellIcon, SettingsIcon } from '@/components/tab-icon'
import { useIncomingRequests } from '@/features/requests/use-requests'
import { useReceivedServiceOffers } from '@/features/service-offers/use-service-offers'
import { spacing, typography } from '@/theme/tokens'
import { useTheme } from '@/theme/use-theme'

/**
 * The bar across the top of the tab screens: the screen's name between the bell
 * on the left and settings on the right.
 *
 * The bell is the one place anything waiting on the member lives — activity, and
 * the requests that used to have an envelope of their own. Its count is both
 * added together; the Activity screen it opens leads with a Requests row.
 */
export function AppHeader({ title }: { title?: string }) {
  const theme = useTheme()
  const insets = useSafeAreaInsets()
  const router = useRouter()

  const unread = useUnreadCount()
  const incoming = useIncomingRequests()
  const serviceOffers = useReceivedServiceOffers()
  const waiting =
    unread +
    (incoming.data ?? []).filter((row) => row.status === 'pending').length +
    (serviceOffers.data ?? []).filter((row) => row.status === 'pending').length

  return (
    <View style={[styles.header, { backgroundColor: theme.bg, paddingTop: insets.top }]}>
      <View style={styles.bar}>
        <HeaderButton
          side="left"
          count={waiting}
          accessibilityLabel={waiting > 0 ? `Notifications, ${waiting} waiting` : 'Notifications'}
          onPress={() => router.push('/activity')}
        >
          <BellIcon color={theme.text} />
        </HeaderButton>

        <Text
          style={[typography.bodyStrong, styles.title, { color: theme.text }]}
          numberOfLines={1}
        >
          {title}
        </Text>

        <HeaderButton
          side="right"
          count={0}
          accessibilityLabel="Settings"
          onPress={() => router.push('/settings')}
        >
          <SettingsIcon color={theme.text} focused={false} />
        </HeaderButton>
      </View>
    </View>
  )
}

/**
 * One side of the bar. Both sides reserve the same width whatever they hold, so
 * the title between them is centred on the screen rather than on whatever space
 * the icons happen to leave.
 */
function HeaderButton({
  side,
  count,
  accessibilityLabel,
  onPress,
  children,
}: {
  side: 'left' | 'right'
  count: number
  accessibilityLabel: string
  onPress: () => void
  children: ReactNode
}) {
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={accessibilityLabel}
      onPress={onPress}
      style={({ pressed }) => [
        styles.button,
        side === 'left' ? styles.buttonLeft : styles.buttonRight,
        pressed && styles.pressed,
      ]}
    >
      <View style={styles.icon}>
        {children}
        {/* Sits on the icon's corner, and renders nothing at zero. */}
        <View style={styles.count}>
          <CountBadge count={count} />
        </View>
      </View>
    </Pressable>
  )
}

const ICON = 24
const SIDE = 40

const styles = StyleSheet.create({
  header: { width: '100%' },
  bar: {
    height: 44,
    flexDirection: 'row',
    alignItems: 'center',
    // Same inset as Screen's content, so the two glyphs line up with the text
    // and cards below them rather than sitting 8px further out.
    paddingHorizontal: spacing.xl,
  },
  title: { flex: 1, textAlign: 'center' },
  button: { width: SIDE, height: 44, justifyContent: 'center' },
  buttonLeft: { alignItems: 'flex-start' },
  buttonRight: { alignItems: 'flex-end' },
  pressed: { opacity: 0.5 },
  icon: { width: ICON, height: ICON },
  count: { position: 'absolute', top: -7, right: -7 },
})
