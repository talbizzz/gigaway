import { useRouter } from 'expo-router'
import { StyleSheet, View } from 'react-native'

import { TextLink } from '@/components/button'
import { Screen } from '@/components/screen'
import { SettingsRow } from '@/components/settings-row'
import { useMyBlocks } from '@/features/blocks/use-blocks'
import { unregisterPush } from '@/lib/push'
import { supabase } from '@/lib/supabase'
import { spacing } from '@/theme/tokens'

/**
 * Settings, as a menu rather than one long scroll of every section at once.
 *
 * Each row opens its own page under (app)/settings/ — the same pattern as
 * guidelines.tsx and every member/trip/offer detail screen already use, so
 * these get a back button and a place to breathe for free from the (app)
 * layout's shared screenOptions.
 *
 * The blocked-member count shown here comes from the same hook the
 * destination page uses. Fetching it here is not wasted work: React Query
 * caches by key, so opening the page from this menu usually shows data
 * immediately rather than a fresh loading state.
 *
 * Sign out has no page of its own — one paragraph and one button was not
 * enough to justify a whole screen — so it sits as a plain text link under
 * the menu instead.
 */
export default function SettingsScreen() {
  const router = useRouter()
  const blocks = useMyBlocks()

  return (
    <Screen>
      <SettingsRow
        title="Blocked members"
        description="Everyone you have made invisible to yourself, and to you."
        value={blocks.data && blocks.data.length > 0 ? `${blocks.data.length}` : undefined}
        onPress={() => router.push('/settings/blocked')}
      />
      <SettingsRow
        title="Community guidelines"
        description="What we hold members to, and why an account gets removed."
        onPress={() => router.push('/guidelines')}
      />
      <SettingsRow
        title="Your data"
        description="Export everything GigAway holds about you."
        onPress={() => router.push('/settings/data-export')}
      />
      <SettingsRow
        title="Delete account"
        description="Permanent. No undo, no backup, no way back in."
        tone="danger"
        onPress={() => router.push('/settings/delete-account')}
      />

      <View style={styles.signOut}>
        <TextLink
          label="Sign out"
          onPress={async () => {
            // Release this device's push token first. Otherwise the next
            // person to sign in on a shared or resold phone keeps receiving
            // the previous member's notifications.
            await unregisterPush()
            await supabase.auth.signOut()
          }}
        />
      </View>
    </Screen>
  )
}

const styles = StyleSheet.create({
  signOut: { alignItems: 'center', marginTop: spacing.xxl },
})
