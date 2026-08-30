import { StyleSheet, Text, View } from 'react-native'

import { radius, spacing, typography } from '@/theme/tokens'
import { useTheme } from '@/theme/use-theme'

export type BadgeTone = 'accent' | 'muted' | 'success' | 'warning' | 'danger'

/** A small status pill. Used for offer and request state throughout the loop. */
export function Badge({ label, tone = 'muted' }: { label: string; tone?: BadgeTone }) {
  const theme = useTheme()

  const surface: Record<BadgeTone, { bg: string; fg: string }> = {
    accent: { bg: theme.accentSubtle, fg: theme.text },
    muted: { bg: theme.bgRaised, fg: theme.textMuted },
    success: { bg: theme.successSubtle, fg: theme.success },
    warning: { bg: theme.warningSubtle, fg: theme.warning },
    danger: { bg: theme.dangerSubtle, fg: theme.danger },
  }

  return (
    <View style={[styles.badge, { backgroundColor: surface[tone].bg }]}>
      <Text style={[typography.caption, { color: surface[tone].fg }]}>{label}</Text>
    </View>
  )
}

/** The unread count on the Activity entry point. Renders nothing at zero. */
export function CountBadge({ count }: { count: number }) {
  const theme = useTheme()
  if (count <= 0) return null

  return (
    <View style={[styles.count, { backgroundColor: theme.accent }]}>
      <Text style={[typography.caption, { color: theme.accentText, fontWeight: '700' }]}>
        {count > 99 ? '99+' : count}
      </Text>
    </View>
  )
}

const styles = StyleSheet.create({
  badge: {
    paddingHorizontal: spacing.sm,
    paddingVertical: 4,
    borderRadius: radius.sm,
    // The pill is the short half of a card header — the name row beside it is
    // what gives way when the two do not fit.
    flexShrink: 0,
  },
  // Sized to sit on the corner of a 24px header glyph without swamping it.
  count: {
    minWidth: 18,
    height: 18,
    paddingHorizontal: 5,
    borderRadius: radius.pill,
    alignItems: 'center',
    justifyContent: 'center',
  },
})
