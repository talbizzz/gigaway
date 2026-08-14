import {
  ActivityIndicator,
  Pressable,
  StyleSheet,
  Text,
  View,
  type ViewStyle,
} from 'react-native'

import { radius, spacing, typography } from '@/theme/tokens'
import { useTheme } from '@/theme/use-theme'

type ButtonProps = {
  label: string
  onPress: () => void
  variant?: 'primary' | 'secondary' | 'ghost' | 'danger'
  loading?: boolean
  disabled?: boolean
  style?: ViewStyle
}

export function Button({
  label,
  onPress,
  variant = 'primary',
  loading = false,
  disabled = false,
  style,
}: ButtonProps) {
  const theme = useTheme()
  const inactive = disabled || loading

  const surface: Record<NonNullable<ButtonProps['variant']>, ViewStyle> = {
    primary: { backgroundColor: theme.accent },
    secondary: { backgroundColor: theme.bgSubtle, borderWidth: 1, borderColor: theme.border },
    ghost: { backgroundColor: 'transparent' },
    danger: { backgroundColor: theme.dangerSubtle },
  }

  const labelColour = {
    primary: theme.accentText,
    secondary: theme.text,
    ghost: theme.accent,
    danger: theme.danger,
  }[variant]

  return (
    <Pressable
      accessibilityRole="button"
      accessibilityState={{ disabled: inactive, busy: loading }}
      onPress={onPress}
      disabled={inactive}
      style={({ pressed }) => [
        styles.base,
        surface[variant],
        pressed && styles.pressed,
        inactive && styles.inactive,
        style,
      ]}
    >
      {loading ? (
        <ActivityIndicator color={labelColour} />
      ) : (
        <Text style={[typography.bodyStrong, { color: labelColour }]}>{label}</Text>
      )}
    </Pressable>
  )
}

/** A row of text with a tappable trailing link, used under forms. */
export function TextLink({ label, onPress }: { label: string; onPress: () => void }) {
  const theme = useTheme()
  return (
    <Pressable accessibilityRole="link" onPress={onPress} hitSlop={8}>
      {({ pressed }) => (
        <View style={pressed ? styles.pressed : undefined}>
          <Text style={[typography.body, { color: theme.accent, textAlign: 'center' }]}>
            {label}
          </Text>
        </View>
      )}
    </Pressable>
  )
}

const styles = StyleSheet.create({
  base: {
    minHeight: 50,
    borderRadius: radius.md,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: spacing.lg,
  },
  pressed: { opacity: 0.7 },
  inactive: { opacity: 0.45 },
})
