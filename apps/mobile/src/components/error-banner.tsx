import { useEffect, useState } from 'react'
import { Animated, Easing, Pressable, StyleSheet, Text } from 'react-native'

import { radius, spacing, typography } from '@/theme/tokens'
import { useTheme } from '@/theme/use-theme'

/** What the banner is saying. A new object each time, so a repeat of the same message shows again. */
export type Notice = { id: number; message: string }

export function notice(error: unknown): Notice {
  return { id: Date.now(), message: messageOf(error) }
}

/**
 * Supabase and Postgres errors are plain objects with a `message`, not Error
 * instances, so checking instanceof would throw their wording away.
 */
function messageOf(error: unknown): string {
  if (typeof error === 'string' && error) return error
  if (typeof error === 'object' && error !== null && 'message' in error) {
    const { message } = error as { message: unknown }
    if (typeof message === 'string' && message) return message
  }
  return 'Something went wrong.'
}

const VISIBLE_MS = 5000

/**
 * A small banner that drops in from the top of the screen, over the content, and
 * leaves on its own.
 *
 * For errors that arise from something the member just did. An inline callout at
 * the foot of a long form is below the fold by the time the error exists, so the
 * member taps Save, nothing appears to happen, and they never learn why. Render
 * it as the last child of a full-screen container so it floats over the rest.
 */
export function ErrorBanner({ notice }: { notice: Notice | null }) {
  const [dismissed, setDismissed] = useState<number | null>(null)

  if (!notice || notice.id === dismissed) return null

  return <Banner key={notice.id} message={notice.message} onDone={() => setDismissed(notice.id)} />
}

function Banner({ message, onDone }: { message: string; onDone: () => void }) {
  const theme = useTheme()
  const [shown] = useState(() => new Animated.Value(0))

  useEffect(() => {
    let leaving = false
    const enter = Animated.timing(shown, {
      toValue: 1,
      duration: 220,
      easing: Easing.out(Easing.cubic),
      useNativeDriver: true,
    })
    enter.start()

    const timer = setTimeout(() => {
      leaving = true
      Animated.timing(shown, {
        toValue: 0,
        duration: 180,
        useNativeDriver: true,
      }).start(onDone)
    }, VISIBLE_MS)

    return () => {
      clearTimeout(timer)
      if (!leaving) enter.stop()
    }
  }, [shown, onDone])

  return (
    <Animated.View
      style={[
        styles.wrap,
        {
          opacity: shown,
          transform: [
            {
              translateY: shown.interpolate({
                inputRange: [0, 1],
                outputRange: [-24, 0],
              }),
            },
          ],
        },
      ]}
    >
      <Pressable
        accessibilityRole="alert"
        accessibilityLabel={message}
        onPress={onDone}
        style={[styles.banner, { backgroundColor: theme.danger }]}
      >
        <Text style={[typography.bodyStrong, styles.text]}>{message}</Text>
      </Pressable>
    </Animated.View>
  )
}

const styles = StyleSheet.create({
  wrap: {
    position: 'absolute',
    top: spacing.sm,
    left: spacing.lg,
    right: spacing.lg,
  },
  banner: {
    paddingVertical: spacing.md,
    paddingHorizontal: spacing.lg,
    borderRadius: radius.md,
    shadowColor: '#000',
    shadowOpacity: 0.25,
    shadowRadius: 12,
    shadowOffset: { width: 0, height: 4 },
    elevation: 6,
  },
  text: { color: '#FFFFFF' },
})
