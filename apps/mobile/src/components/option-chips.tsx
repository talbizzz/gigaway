import { Pressable, StyleSheet, Text, View } from 'react-native'

import { radius, spacing, typography } from '@/theme/tokens'
import { useTheme } from '@/theme/use-theme'

type Option<T extends string> = { value: T; label: string }

/**
 * A wrapping row of selectable chips. Preferred over a native picker for short
 * closed lists — it shows every option at once, which keeps sign-up to a single
 * screen rather than pushing a modal.
 */
export function OptionChips<T extends string>({
  label,
  options,
  value,
  onChange,
  error,
}: {
  label: string
  options: readonly Option<T>[]
  value: T | undefined
  onChange: (value: T) => void
  error?: string
}) {
  const theme = useTheme()

  return (
    <View style={styles.container}>
      <Text style={[typography.captionStrong, { color: theme.textMuted }]}>
        {label.toUpperCase()}
      </Text>

      <View style={styles.row}>
        {options.map((option) => {
          const selected = option.value === value
          return (
            <Pressable
              key={option.value}
              accessibilityRole="radio"
              accessibilityState={{ selected }}
              onPress={() => onChange(option.value)}
              style={({ pressed }) => [
                styles.chip,
                {
                  backgroundColor: selected ? theme.accent : theme.bgSubtle,
                  borderColor: selected ? theme.accent : theme.border,
                },
                pressed && styles.pressed,
              ]}
            >
              <Text
                style={[
                  typography.caption,
                  { color: selected ? theme.accentText : theme.text },
                ]}
              >
                {option.label}
              </Text>
            </Pressable>
          )
        })}
      </View>

      {error ? (
        <Text style={[typography.caption, { color: theme.danger }]}>{error}</Text>
      ) : null}
    </View>
  )
}

const styles = StyleSheet.create({
  container: { gap: spacing.sm },
  row: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.sm },
  chip: {
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
    borderRadius: radius.pill,
    borderWidth: 1,
  },
  pressed: { opacity: 0.7 },
})
