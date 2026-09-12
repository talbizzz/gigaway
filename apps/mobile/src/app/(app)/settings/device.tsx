import { Stack } from 'expo-router'
import { StyleSheet, Text, View } from 'react-native'

import { Button } from '@/components/button'
import { Screen } from '@/components/screen'
import { unregisterPush } from '@/lib/push'
import { supabase } from '@/lib/supabase'
import { spacing, typography } from '@/theme/tokens'
import { useTheme } from '@/theme/use-theme'

export default function DeviceScreen() {
  const theme = useTheme()

  return (
    <Screen
      footer={
        <Button
          label="Sign out"
          variant="secondary"
          onPress={async () => {
            // Release this device's push token first. Otherwise the next
            // person to sign in on a shared or resold phone keeps receiving
            // the previous member's notifications.
            await unregisterPush()
            await supabase.auth.signOut()
          }}
        />
      }
    >
      <Stack.Screen options={{ title: 'This device' }} />

      <View style={styles.header}>
        <Text style={[typography.display, { color: theme.text }]}>This device</Text>
        <Text style={[typography.body, { color: theme.textMuted }]}>
          Signing out leaves your account untouched — everything is here when you come
          back. Push notifications for this device stop the moment you do.
        </Text>
      </View>
    </Screen>
  )
}

const styles = StyleSheet.create({
  header: { gap: spacing.sm },
})
