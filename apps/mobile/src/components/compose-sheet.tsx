import { Modal, Pressable, StyleSheet, Text, View } from 'react-native'
import { useSafeAreaInsets } from 'react-native-safe-area-context'

import { radius, spacing, typography } from '@/theme/tokens'
import { useTheme } from '@/theme/use-theme'

type Choice = {
  label: string
  detail: string
  onPress: () => void
}

/**
 * What the centre button in the tab bar opens.
 *
 * A member posts two things — a trip and free nights — and which one they mean
 * is a decision, not a mode. Putting both behind one button keeps the tab bar at
 * five slots and makes the pair legible as two halves of the same act, which is
 * the thing a new member most often misunderstands about this product.
 */
export function ComposeSheet({
  visible,
  onClose,
  choices,
}: {
  visible: boolean
  onClose: () => void
  choices: Choice[]
}) {
  const theme = useTheme()
  const insets = useSafeAreaInsets()

  return (
    <Modal
      visible={visible}
      transparent
      animationType="slide"
      // Android's back button has to close the sheet rather than the screen
      // underneath it.
      onRequestClose={onClose}
    >
      <Pressable
        accessibilityRole="button"
        accessibilityLabel="Close"
        style={styles.backdrop}
        onPress={onClose}
      />

      <View
        style={[
          styles.sheet,
          {
            backgroundColor: theme.bg,
            borderColor: theme.border,
            paddingBottom: Math.max(insets.bottom, spacing.lg),
          },
        ]}
      >
        <View style={[styles.grip, { backgroundColor: theme.border }]} />

        {choices.map((choice) => (
          <Pressable
            key={choice.label}
            accessibilityRole="button"
            accessibilityLabel={`${choice.label} — ${choice.detail}`}
            onPress={choice.onPress}
            style={({ pressed }) => [
              styles.choice,
              { backgroundColor: theme.bgSubtle, borderColor: theme.border },
              pressed && styles.pressed,
            ]}
          >
            <Text style={[typography.bodyStrong, { color: theme.text }]}>{choice.label}</Text>
            <Text style={[typography.caption, { color: theme.textMuted }]}>
              {choice.detail}
            </Text>
          </Pressable>
        ))}
      </View>
    </Modal>
  )
}

const styles = StyleSheet.create({
  backdrop: { flex: 1, backgroundColor: 'rgba(0, 0, 0, 0.4)' },
  sheet: {
    padding: spacing.xl,
    paddingTop: spacing.md,
    gap: spacing.md,
    borderTopLeftRadius: radius.lg,
    borderTopRightRadius: radius.lg,
    borderTopWidth: StyleSheet.hairlineWidth,
  },
  grip: {
    alignSelf: 'center',
    width: 36,
    height: 4,
    borderRadius: 2,
    marginBottom: spacing.sm,
  },
  choice: {
    padding: spacing.lg,
    borderRadius: radius.md,
    borderWidth: StyleSheet.hairlineWidth,
    gap: 2,
  },
  pressed: { opacity: 0.7 },
})
