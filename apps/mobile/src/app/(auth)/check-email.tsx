import { useRouter } from 'expo-router'
import { Text, View } from 'react-native'

import { Button, TextLink } from '@/components/button'
import { Callout } from '@/components/callout'
import { Screen } from '@/components/screen'
import { supabase } from '@/lib/supabase'
import { spacing, typography } from '@/theme/tokens'
import { useTheme } from '@/theme/use-theme'

/**
 * Shown after sign-up while the email confirmation is outstanding. Supabase
 * issues no session until the link is followed, so there is nothing to poll —
 * the user confirms, comes back, and signs in.
 */
export default function CheckEmailScreen() {
  const theme = useTheme()
  const router = useRouter()

  return (
    <Screen
      footer={
        <>
          <Button label="Back to sign in" onPress={() => router.replace('/sign-in')} />
          <TextLink
            label="Use a different email"
            onPress={async () => {
              await supabase.auth.signOut()
              router.replace('/sign-up')
            }}
          />
        </>
      }
    >
      <View style={{ gap: spacing.sm }}>
        <Text style={[typography.display, { color: theme.text }]}>Check your email</Text>
        <Text style={[typography.body, { color: theme.textMuted }]}>
          We've sent you a link to confirm your address. Open it, then come back and sign in.
        </Text>
      </View>

      <Callout title="Not arrived?">
        Check your spam folder. Confirmation emails sometimes take a minute or two.
      </Callout>
    </Screen>
  )
}
