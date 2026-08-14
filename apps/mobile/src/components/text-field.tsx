import { forwardRef } from 'react'
import { StyleSheet, Text, TextInput, View, type TextInputProps } from 'react-native'

import { radius, spacing, typography } from '@/theme/tokens'
import { useTheme } from '@/theme/use-theme'

type TextFieldProps = TextInputProps & {
  label: string
  /** Validation message. Its presence also drives the error styling. */
  error?: string
  hint?: string
}

export const TextField = forwardRef<TextInput, TextFieldProps>(function TextField(
  { label, error, hint, style, ...inputProps },
  ref,
) {
  const theme = useTheme()

  return (
    <View style={styles.container}>
      <Text style={[typography.captionStrong, { color: theme.textMuted }]}>
        {label.toUpperCase()}
      </Text>

      <TextInput
        ref={ref}
        accessibilityLabel={label}
        placeholderTextColor={theme.textFaint}
        style={[
          styles.input,
          typography.body,
          {
            backgroundColor: theme.bgSubtle,
            borderColor: error ? theme.danger : theme.border,
            color: theme.text,
          },
          style,
        ]}
        {...inputProps}
      />

      {error ? (
        <Text style={[typography.caption, { color: theme.danger }]}>{error}</Text>
      ) : hint ? (
        <Text style={[typography.caption, { color: theme.textMuted }]}>{hint}</Text>
      ) : null}
    </View>
  )
})

const styles = StyleSheet.create({
  container: { gap: spacing.xs },
  input: {
    minHeight: 50,
    borderRadius: radius.md,
    borderWidth: 1,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.md,
  },
})
