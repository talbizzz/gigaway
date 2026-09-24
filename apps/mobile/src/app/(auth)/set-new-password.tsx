import { zodResolver } from '@hookform/resolvers/zod'
import { useState } from 'react'
import { Controller, useForm } from 'react-hook-form'
import { StyleSheet, Text, View } from 'react-native'

import { Button } from '@/components/button'
import { Callout } from '@/components/callout'
import { Screen } from '@/components/screen'
import { TextField } from '@/components/text-field'
import { SetNewPasswordSchema, type SetNewPasswordValues } from '@/features/auth/schemas'
import { useSessionStore } from '@/features/auth/session-store'
import { supabase } from '@/lib/supabase'
import { spacing, typography } from '@/theme/tokens'
import { useTheme } from '@/theme/use-theme'

/**
 * Reached only via the deep-link handler exchanging a password-recovery
 * code — never pushed from within the app, which is why it carries no
 * background artwork or back button, the same treatment as check-email.tsx.
 */
export default function SetNewPasswordScreen() {
  const theme = useTheme()
  const [submitError, setSubmitError] = useState<string | null>(null)

  const form = useForm<SetNewPasswordValues>({
    resolver: zodResolver(SetNewPasswordSchema),
    defaultValues: { password: '' },
  })

  const onSubmit = form.handleSubmit(async (values) => {
    setSubmitError(null)
    const { error } = await supabase.auth.updateUser({ password: values.password })

    if (error) {
      setSubmitError(error.message)
      return
    }

    // The recovery session is now a real one. Clear the flag and let the
    // auth gate route on from here, exactly as it does after a normal sign-in.
    useSessionStore.getState().setRecovering(false)
  })

  return (
    <Screen
      footer={
        <Button label="Set new password" onPress={onSubmit} loading={form.formState.isSubmitting} />
      }
    >
      <View style={styles.header}>
        <Text style={[typography.display, { color: theme.text }]}>Set a new password</Text>
        <Text style={[typography.body, { color: theme.textMuted }]}>
          Choose a new password for your account.
        </Text>
      </View>

      <Controller
        control={form.control}
        name="password"
        render={({ field, fieldState }) => (
          <TextField
            label="New password"
            value={field.value}
            onChangeText={field.onChange}
            onBlur={field.onBlur}
            autoCapitalize="none"
            autoComplete="new-password"
            textContentType="newPassword"
            secureTextEntry
            onSubmitEditing={onSubmit}
            returnKeyType="go"
            hint="At least 10 characters."
            error={fieldState.error?.message}
          />
        )}
      />

      {submitError ? <Callout tone="danger">{submitError}</Callout> : null}
    </Screen>
  )
}

const styles = StyleSheet.create({
  header: { gap: spacing.sm, marginBottom: spacing.lg },
})
