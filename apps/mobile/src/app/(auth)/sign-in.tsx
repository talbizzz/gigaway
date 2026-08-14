import { zodResolver } from '@hookform/resolvers/zod'
import { useRouter } from 'expo-router'
import { useState } from 'react'
import { Controller, useForm } from 'react-hook-form'
import { StyleSheet, Text, View } from 'react-native'

import { Button, TextLink } from '@/components/button'
import { Callout } from '@/components/callout'
import { Screen } from '@/components/screen'
import { TextField } from '@/components/text-field'
import { SignInSchema, type SignInValues } from '@/features/auth/schemas'
import { supabase } from '@/lib/supabase'
import { spacing, typography } from '@/theme/tokens'
import { useTheme } from '@/theme/use-theme'

export default function SignInScreen() {
  const theme = useTheme()
  const router = useRouter()
  const [submitError, setSubmitError] = useState<string | null>(null)

  const form = useForm<SignInValues>({
    resolver: zodResolver(SignInSchema),
    defaultValues: { email: '', password: '' },
  })

  const onSubmit = form.handleSubmit(async (values) => {
    setSubmitError(null)
    const { error } = await supabase.auth.signInWithPassword({
      email: values.email,
      password: values.password,
    })

    // The session listener in the root layout handles navigation on success.
    if (error) {
      setSubmitError(
        error.message === 'Email not confirmed'
          ? 'Please confirm your email address first — check your inbox.'
          : error.message,
      )
    }
  })

  return (
    <Screen
      footer={
        <>
          <Button label="Sign in" onPress={onSubmit} loading={form.formState.isSubmitting} />
          <TextLink label="Create an account" onPress={() => router.replace('/sign-up')} />
        </>
      }
    >
      <View style={styles.header}>
        <Text style={[typography.display, { color: theme.text }]}>GigAway</Text>
        <Text style={[typography.body, { color: theme.textMuted }]}>
          A couch, a colleague, a city you don't know yet.
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
            error={fieldState.error?.message}
          />
        )}
      />

      <Controller
        control={form.control}
        name="password"
        render={({ field, fieldState }) => (
          <TextField
            label="Password"
            value={field.value}
            onChangeText={field.onChange}
            onBlur={field.onBlur}
            autoCapitalize="none"
            autoComplete="current-password"
            textContentType="password"
            secureTextEntry
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
