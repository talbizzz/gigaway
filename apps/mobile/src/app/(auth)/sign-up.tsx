import { zodResolver } from '@hookform/resolvers/zod'
import { useRouter } from 'expo-router'
import { useState } from 'react'
import { Controller, useForm } from 'react-hook-form'
import { StyleSheet, Text, View } from 'react-native'

import { Button, TextLink } from '@/components/button'
import { Callout } from '@/components/callout'
import { OptionChips } from '@/components/option-chips'
import { Screen } from '@/components/screen'
import { TextField } from '@/components/text-field'
import { SignUpSchema, type SignUpValues } from '@/features/auth/schemas'
import { DISCIPLINES, type DisciplineValue } from '@/features/profile/use-profile'
import { track } from '@/lib/analytics'
import { supabase } from '@/lib/supabase'
import { spacing, typography } from '@/theme/tokens'
import { useTheme } from '@/theme/use-theme'

export default function SignUpScreen() {
  const theme = useTheme()
  const router = useRouter()
  const [submitError, setSubmitError] = useState<string | null>(null)

  const form = useForm<SignUpValues>({
    resolver: zodResolver(SignUpSchema),
    defaultValues: { displayName: '', email: '', password: '' },
  })

  const onSubmit = form.handleSubmit(async (values) => {
    setSubmitError(null)

    // display_name and discipline travel as auth metadata so the database
    // trigger can build a complete profile row at sign-up.
    const { error } = await supabase.auth.signUp({
      email: values.email,
      password: values.password,
      options: {
        data: {
          display_name: values.displayName,
          discipline: values.discipline,
        },
      },
    })

    if (error) {
      setSubmitError(error.message)
      return
    }

    track('signup_completed', { discipline: values.discipline })
    router.replace('/check-email')
  })

  return (
    <Screen
      footer={
        <>
          <Button
            label="Create account"
            onPress={onSubmit}
            loading={form.formState.isSubmitting}
          />
          <TextLink label="I already have an account" onPress={() => router.replace('/sign-in')} />
        </>
      }
    >
      <View style={styles.header}>
        <Text style={[typography.display, { color: theme.text }]}>Join GigAway</Text>
        <Text style={[typography.body, { color: theme.textMuted }]}>
          A closed network of working performers. You'll need an invite from a colleague, or
          we'll verify you by hand.
        </Text>
      </View>

      <Controller
        control={form.control}
        name="displayName"
        render={({ field, fieldState }) => (
          <TextField
            label="Your name"
            value={field.value}
            onChangeText={field.onChange}
            onBlur={field.onBlur}
            autoCapitalize="words"
            autoComplete="name"
            textContentType="name"
            placeholder="Anna Weber"
            hint="As colleagues would know you professionally."
            error={fieldState.error?.message}
          />
        )}
      />

      <Controller
        control={form.control}
        name="discipline"
        render={({ field, fieldState }) => (
          <OptionChips<DisciplineValue>
            label="Discipline"
            options={DISCIPLINES}
            value={field.value as DisciplineValue | undefined}
            onChange={field.onChange}
            error={fieldState.error?.message}
          />
        )}
      />

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
            autoComplete="new-password"
            textContentType="newPassword"
            secureTextEntry
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
  header: { gap: spacing.sm, marginBottom: spacing.sm },
})
