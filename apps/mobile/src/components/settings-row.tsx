import { Pressable, StyleSheet, Text, View } from 'react-native'

import { spacing, typography } from '@/theme/tokens'
import { useTheme } from '@/theme/use-theme'

/**
 * One row on the settings index: a title, a one-line description, an optional
 * value pulled from the right (an invite count, a blocked-member count), and
 * a disclosure chevron.
 *
 * The chevron is a Text character rather than a drawn icon. This app has no
 * icon font — tab-icon.tsx builds its glyphs from view borders because a
 * handful of icons is not worth the dependency — and a hand-built chevron
 * would be more code than "›" for something this small.
 */
export function SettingsRow({
  title,
  description,
  value,
  tone,
  onPress,
}: {
  title: string
  description: string
  /** A short trailing fact — "3 joined", "2 blocked" — before the chevron. */
  value?: string
  tone?: 'default' | 'danger'
  onPress: () => void
}) {
  const theme = useTheme()
  const titleColor = tone === 'danger' ? theme.danger : theme.text

  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={title}
      onPress={onPress}
      style={({ pressed }) => [
        styles.row,
        { borderColor: theme.border },
        pressed && { backgroundColor: theme.bgSubtle },
      ]}
    >
      <View style={styles.text}>
        <Text style={[typography.bodyStrong, { color: titleColor }]}>{title}</Text>
        <Text style={[typography.caption, { color: theme.textMuted }]} numberOfLines={2}>
          {description}
        </Text>
      </View>
      {value ? (
        <Text style={[typography.caption, { color: theme.textFaint }]}>{value}</Text>
      ) : null}
      <Text style={[styles.chevron, { color: theme.textFaint }]}>›</Text>
    </Pressable>
  )
}

const styles = StyleSheet.create({
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
    paddingVertical: spacing.md,
    borderBottomWidth: StyleSheet.hairlineWidth,
  },
  text: { flex: 1, gap: 2 },
  chevron: { fontSize: 22, lineHeight: 22 },
})
