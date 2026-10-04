import { useRouter } from 'expo-router'
import { useEffect, useState } from 'react'
import { Text, View } from 'react-native'

import { Button } from '@/components/button'
import { Screen } from '@/components/screen'
import { useDeepLinkError } from '@/features/auth/deep-link'
import { spacing, typography } from '@/theme/tokens'
import { useTheme } from '@/theme/use-theme'

/**
 * Reached only through the Universal Link in a confirmation or password-
 * recovery email. The deep-link listener (features/auth/deep-link.ts)
 * verifies the token, and the auth gate moves the user on once that succeeds:
 * PASSWORD_RECOVERY goes to set-new-password, SIGNED_IN goes into the app.
 * A failed verification shows here straight away, and the raw error is shown
 * in development builds only.
 */
export default function CallbackScreen() {
  const theme = useTheme()
  const router = useRouter()
  const deepLinkError = useDeepLinkError((state) => state.error)
  const [stalled, setStalled] = useState(false)

  useEffect(() => {
    const timer = setTimeout(() => setStalled(true), 8000)
    return () => clearTimeout(timer)
  }, [])

  const failed = deepLinkError !== null || stalled

  return (
    <Screen
      footer={failed ? <Button label="Back to sign in" onPress={() => router.replace('/sign-in')} /> : undefined}
    >
      <View style={{ gap: spacing.sm }}>
        <Text style={[typography.display, { color: theme.text }]}>
          {failed ? "This link didn't work" : 'One moment…'}
        </Text>
        <Text style={[typography.body, { color: theme.textMuted }]}>
          {failed
            ? 'It may have expired or already been used. Request a new one from the app.'
            : 'Confirming your link.'}
        </Text>
        {__DEV__ && deepLinkError ? (
          <Text style={[typography.caption, { color: theme.danger }]}>
            {deepLinkError.code ? `${deepLinkError.code}: ` : ''}
            {deepLinkError.message}
          </Text>
        ) : null}
      </View>
    </Screen>
  )
}
