import { Redirect } from 'expo-router'
import { ActivityIndicator, Text, View } from 'react-native'

import { Callout } from '@/components/callout'
import { Screen } from '@/components/screen'
import { TextLink } from '@/components/button'
import { useMyApplication } from '@/features/verification/use-verification'
import { supabase } from '@/lib/supabase'
import { spacing, typography } from '@/theme/tokens'
import { useTheme } from '@/theme/use-theme'

/**
 * Where the verification flow starts. An applicant with an application under
 * review sees the waiting screen. Everyone else is sent to the first question.
 * The gate sends every unapproved member here.
 */
export default function VerifyIndex() {
  const theme = useTheme()
  const { data: application, isPending } = useMyApplication()

  if (isPending) {
    return (
      <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center' }}>
        <ActivityIndicator color={theme.accent} />
      </View>
    )
  }

  if (application?.status === 'pending') {
    return (
      <Screen footer={<TextLink label="Sign out" onPress={() => supabase.auth.signOut()} />}>
        <Text style={[typography.display, { color: theme.text }]}>With us for review</Text>
        <Callout tone="warning" title="Usually a day or two">
          A human reads every application. It's the reason a colleague will trust you with their
          keys. We'll email you as soon as it's decided.
        </Callout>
        <Text style={[typography.caption, { color: theme.textMuted, marginTop: spacing.md }]}>
          Your selfie, ID and any documents were emailed once and never stored here. This app
          doesn't hold a copy.
        </Text>
      </Screen>
    )
  }

  return <Redirect href="/(onboarding)/verify/name" />
}
