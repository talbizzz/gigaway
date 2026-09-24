import { zodResolver } from '@hookform/resolvers/zod'
import { useRouter } from 'expo-router'
import { useState } from 'react'
import { Controller, useForm } from 'react-hook-form'
import { StyleSheet, Text, View } from 'react-native'

import { Button, TextLink } from '@/components/button'
import { Callout } from '@/components/callout'
import { Screen } from '@/components/screen'
import { TextField } from '@/components/text-field'
import { ForgotPasswordSchema, type ForgotPasswordValues } from '@/features/auth/schemas'
import { env } from '@/lib/env'
import { supabase } from '@/lib/supabase'
import { spacing, typography } from '@/theme/tokens'
import { useTheme } from '@/theme/use-theme'

export default function ForgotPasswordScreen() {
  const theme = useTheme()
  const router = useRouter()
  const [submitError, setSubmitError] = useState<string | null>(null)
  const [sent, setSent] = useState(false)

  const form = useForm<ForgotPasswordValues>({
    resolver: zodResolver(ForgotPasswordSchema),
    defaultValues: { email: '' },
  })

  const onSubmit = form.handleSubmit(async (values) => {
    setSubmitError(null)
    const { error } = await supabase.auth.resetPasswordForEmail(values.email, {
      redirectTo: `${env.webBaseUrl}${env.authCallbackPath}`,
    })

    if (error) {
      setSubmitError(error.message)
      return
    }

    // Supabase itself never reveals whether the address has an account —
    // show the same confirmation regardless, so this screen doesn't leak it.
    setSent(true)
  })

  if (sent) {
    return (
      <Screen
        footer={<Button label="Back to sign in" onPress={() => router.replace('/sign-in')} />}
      >
        <View style={styles.header}>
          <Text style={[typography.display, { color: theme.text }]}>Check your email</Text>
          <Text style={[typography.body, { color: theme.textMuted }]}>
            If that address has an account, we've sent a link to reset the password. Open it on
            this phone to continue here, or on any other device to reset it from the web.
          </Text>
        </View>
      </Screen>
    )
  }

  return (
    <Screen
      background={require('@/assets/images/auth-dancer.webp')}
      floatingHeader
      footer={
        <>
          <Button label="Send reset link" onPress={onSubmit} loading={form.formState.isSubmitting} />
          <TextLink label="Back to sign in" onPress={() => router.replace('/sign-in')} />
        </>
      }
    >
      <View style={styles.header}>
        <Text style={[typography.display, { color: theme.text }]}>Reset your password</Text>
        <Text style={[typography.body, { color: theme.textMuted }]}>
          Enter the email you signed up with and we'll send you a link to set a new one.
        </Text>
      </View>

      <Controller
        control={form.control}
        name="email"
        render={({ field, fieldState }) => (
          <TextField
            label="Email"
            value={field.value}
            onChangeText={field.onChange}
            onBlur={field.onBlur}
            autoCapitalize="none"
            autoComplete="email"
            keyboardType="email-address"
            textContentType="emailAddress"
            placeholder="you@example.com"
            onSubmitEditing={onSubmit}
            returnKeyType="go"
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
