import { zodResolver } from '@hookform/resolvers/zod'
import { useRouter } from 'expo-router'
import { useState } from 'react'
import { Controller, useForm, useWatch } from 'react-hook-form'
import { StyleSheet, Text, View } from 'react-native'

import { Button, TextLink } from '@/components/button'
import { Callout } from '@/components/callout'
import { OptionChips } from '@/components/option-chips'
import { Screen } from '@/components/screen'
import { UsernameField } from '@/components/username-field'
import { TextField } from '@/components/text-field'
import { SignUpSchema, type SignUpValues } from '@/features/auth/schemas'
import { DISCIPLINES, type DisciplineValue } from '@/features/profile/use-profile'
import { useUsernameStatus } from '@/features/profile/use-username-status'
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
    defaultValues: {
      firstName: '',
      lastName: '',
      username: '',
      email: '',
      password: '',
      confirmPassword: '',
    },
  })

  // Whether the chosen username is free, checked as it is typed. Submitting
  // waits on it; the database still refuses a taken name, and falls back to a
  // generated one if two people pick the same at the same instant.
  const usernameStatus = useUsernameStatus(useWatch({ control: form.control, name: 'username' }))

  const onSubmit = form.handleSubmit(async (values) => {
    setSubmitError(null)

    if (usernameStatus.state === 'taken') {
      form.setError('username', { message: 'That username is already taken.' })
      return
    }

    // The names and discipline travel as auth metadata so the database
    // trigger can build a complete profile row at sign-up. Other members only
    // ever see the first name and the initial of the family name.
    const { data, error } = await supabase.auth.signUp({
      email: values.email,
      password: values.password,
      options: {
        data: {
          first_name: values.firstName,
          last_name: values.lastName,
          username: values.username,
          discipline: values.discipline,
        },
      },
    })

    if (error) {
      setSubmitError(error.message)
      return
    }

    track('signup_completed', { discipline: values.discipline })

    // With email confirmation off, sign-up returns a session straight away and
    // the auth gate routes on from here. With it on there is no session until
    // the link is followed, and the only thing to show is "check your email".
    if (data.session) return

    router.replace('/check-email')
  })

  return (
    <Screen
      background={require('@/assets/images/auth-dancer.webp')}
      floatingHeader
      footer={
        <>
          <Button
            label="Create account"
            onPress={onSubmit}
            loading={form.formState.isSubmitting}
          />
          {/* replace, not push: the two forms swap in place so back always
              returns to welcome rather than walking a chain of them. */}
          <TextLink label="I already have an account" onPress={() => router.replace('/sign-in')} />
        </>
      }
    >
      <View style={styles.header}>
        <Text style={[typography.display, { color: theme.text }]}>Join GigAway</Text>
        <Text style={[typography.body, { color: theme.textMuted }]}>
          A closed network of working performers. Every account is verified by hand before it
          can see anyone else's.
        </Text>
      </View>

      <Controller
        control={form.control}
        name="firstName"
        render={({ field, fieldState }) => (
          <TextField
            label="First name"
            value={field.value}
            onChangeText={field.onChange}
            onBlur={field.onBlur}
            autoCapitalize="words"
            autoComplete="given-name"
            textContentType="givenName"
            placeholder="Anna"
            error={fieldState.error?.message}
          />
        )}
      />

      <Controller
        control={form.control}
        name="lastName"
        render={({ field, fieldState }) => (
          <TextField
            label="Family name"
            value={field.value}
            onChangeText={field.onChange}
            onBlur={field.onBlur}
            autoCapitalize="words"
            autoComplete="family-name"
            textContentType="familyName"
            placeholder="Weber"
            hint="Other members only see the first letter, like “Anna W.”."
            error={fieldState.error?.message}
          />
        )}
      />

      <Controller
        control={form.control}
        name="username"
        render={({ field, fieldState }) => (
          <UsernameField
            value={field.value}
            onChangeText={field.onChange}
            status={usernameStatus}
            hint="How colleagues find you. Letters, digits, dots and underscores."
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

      <Controller
        control={form.control}
        name="confirmPassword"
        render={({ field, fieldState }) => (
          <TextField
            label="Confirm password"
            value={field.value}
            onChangeText={field.onChange}
            onBlur={field.onBlur}
            autoCapitalize="none"
            autoComplete="new-password"
            textContentType="newPassword"
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
  header: { gap: spacing.sm, marginBottom: spacing.sm },
})
