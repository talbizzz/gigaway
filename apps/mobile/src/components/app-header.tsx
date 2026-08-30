import { useRouter } from 'expo-router'
import type { ReactNode } from 'react'
import { Pressable, StyleSheet, Text, View, type ColorValue } from 'react-native'
import { useSafeAreaInsets } from 'react-native-safe-area-context'

import { CountBadge } from '@/components/badge'
import { useUnreadCount } from '@/features/notifications/use-notifications'
import { useIncomingRequests } from '@/features/requests/use-requests'
import { spacing, typography } from '@/theme/tokens'
import { useTheme } from '@/theme/use-theme'

/**
 * The bar across the top of the three tab screens: the screen's name between
 * the two things that can be waiting on the member — requests on the left,
 * activity on the right, each carrying its own count.
 *
 * Both used to be rows at the top of the home screen, which meant they were
 * only reachable from there and scrolled away with everything else. Up here
 * they are reachable from all three tabs and stay put.
 */
export function AppHeader({ title }: { title?: string }) {
  const theme = useTheme()
  const insets = useSafeAreaInsets()
  const router = useRouter()

  const unread = useUnreadCount()
  const incoming = useIncomingRequests()
  const waitingOnYou = (incoming.data ?? []).filter((row) => row.status === 'pending').length

  return (
    <View style={[styles.header, { backgroundColor: theme.bg, paddingTop: insets.top }]}>
      <View style={styles.bar}>
        <HeaderButton
          side="left"
          count={waitingOnYou}
          accessibilityLabel={
            waitingOnYou > 0 ? `Requests, ${waitingOnYou} waiting on you` : 'Requests'
          }
          onPress={() => router.push('/requests')}
        >
          <EnvelopeIcon color={theme.text} />
        </HeaderButton>

        <Text
          style={[typography.bodyStrong, styles.title, { color: theme.text }]}
          numberOfLines={1}
        >
          {title}
        </Text>

        <HeaderButton
          side="right"
          count={unread}
          accessibilityLabel={unread > 0 ? `Activity, ${unread} new` : 'Activity'}
          onPress={() => router.push('/activity')}
        >
          <BellIcon color={theme.text} />
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

/**
 * Requests. Drawn from primitives like the tab glyphs — there is no SVG runtime
 * in this app — so the flap is two bars meeting in the middle rather than a
 * path.
 */
function EnvelopeIcon({ color }: { color: ColorValue }) {
  return (
    <View style={styles.glyph}>
      <View style={[styles.envelope, { borderColor: color }]} />
      <View style={[styles.flap, styles.flapLeft, { backgroundColor: color }]} />
      <View style={[styles.flap, styles.flapRight, { backgroundColor: color }]} />
    </View>
  )
}

/** Activity. A dome open at the bottom, closed by its own rim. */
function BellIcon({ color }: { color: ColorValue }) {
  return (
    <View style={styles.glyph}>
      <View style={[styles.dome, { borderColor: color }]} />
      <View style={[styles.rim, { backgroundColor: color }]} />
      <View style={[styles.clapper, { backgroundColor: color }]} />
    </View>
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

  glyph: { width: ICON, height: ICON },
  envelope: {
    position: 'absolute',
    left: 1,
    top: 5,
    width: 22,
    height: 15,
    borderWidth: 2,
    borderRadius: 3,
  },
  // Both halves run corner-to-centre: 13.6 long at 36°, which is the diagonal
  // of the 11×8 box each one crosses.
  flap: { position: 'absolute', top: 8, width: 13.6, height: 2, borderRadius: 1 },
  flapLeft: { left: -0.3, transform: [{ rotate: '36deg' }] },
  flapRight: { left: 10.7, transform: [{ rotate: '-36deg' }] },

  dome: {
    position: 'absolute',
    left: 4,
    top: 3,
    width: 16,
    height: 13,
    borderWidth: 2,
    borderBottomWidth: 0,
    borderTopLeftRadius: 8,
    borderTopRightRadius: 8,
  },
  rim: { position: 'absolute', left: 1, top: 15, width: 22, height: 2, borderRadius: 1 },
  clapper: { position: 'absolute', left: 10, top: 18, width: 4, height: 4, borderRadius: 2 },
})
