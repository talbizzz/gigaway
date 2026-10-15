import { Pressable, StyleSheet, Text, View } from 'react-native'

import { CountBadge } from '@/components/badge'
import type { MemberStats } from '@/features/members/use-member-stats'
import { fonts, spacing, typography } from '@/theme/tokens'
import { useTheme } from '@/theme/use-theme'

export type StatSection = 'connections' | 'trips' | 'services'

/**
 * Three numbers across the profile, Instagram style: connections, trips, and
 * services offered.
 *
 * Everyone sees the numbers. Only someone who may open them (the member, or a
 * connection) gets a tappable column; for anyone else a number is just a number
 * and pressing it does nothing, which is also why it does not look pressable.
 */
export function ProfileStats({
  stats,
  canOpen,
  onOpen,
  waitingConnections = 0,
}: {
  /** Undefined while loading. */
  stats: MemberStats | null | undefined
  canOpen: boolean
  onOpen: (section: StatSection) => void
  /** Connection requests waiting on the member's answer, on their own profile. */
  waitingConnections?: number
}) {
  const columns: { section: StatSection; label: string; value: number | undefined }[] = [
    { section: 'connections', label: 'Connections', value: stats?.connections },
    { section: 'trips', label: 'Trips', value: stats?.trips },
    { section: 'services', label: 'Services offered', value: stats?.services },
  ]

  return (
    <View style={styles.row}>
      {columns.map((column) => (
        <Stat
          key={column.section}
          label={column.label}
          value={column.value}
          badge={column.section === 'connections' ? waitingConnections : 0}
          onPress={canOpen ? () => onOpen(column.section) : undefined}
        />
      ))}
    </View>
  )
}

function Stat({
  label,
  value,
  badge,
  onPress,
}: {
  label: string
  value: number | undefined
  badge: number
  onPress?: () => void
}) {
  const theme = useTheme()

  const content = (
    <>
      <View>
        <Text style={[styles.value, { color: theme.text }]}>{value ?? '–'}</Text>
        <View style={styles.badge}>
          <CountBadge count={badge} />
        </View>
      </View>
      <Text
        style={[typography.caption, styles.label, { color: theme.textMuted }]}
        numberOfLines={1}
      >
        {label}
      </Text>
    </>
  )

  if (!onPress) {
    return (
      <View
        accessible
        accessibilityLabel={`${label}, ${value ?? 'loading'}`}
        style={styles.stat}
      >
        {content}
      </View>
    )
  }

  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={`${label}, ${value ?? 'loading'}. Tap to see them.`}
      onPress={onPress}
      style={({ pressed }) => [styles.stat, pressed && styles.pressed]}
    >
      {content}
    </Pressable>
  )
}

const styles = StyleSheet.create({
  row: { flex: 1, flexDirection: 'row', justifyContent: 'space-around', gap: spacing.sm },
  stat: { flex: 1, minWidth: 0, alignItems: 'center', gap: 2 },
  pressed: { opacity: 0.6 },
  value: { fontFamily: fonts.bodyBold, fontSize: 22, lineHeight: 28, textAlign: 'center' },
  label: { textAlign: 'center' },
  badge: { position: 'absolute', top: -6, right: -14 },
})
