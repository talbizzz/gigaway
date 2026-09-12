import { Stack } from 'expo-router'
import { StyleSheet, Text, View } from 'react-native'

import { TextLink } from '@/components/button'
import { Callout } from '@/components/callout'
import { PersonRow } from '@/components/person'
import { Screen } from '@/components/screen'
import { useMyBlocks, useUnblockMember } from '@/features/blocks/use-blocks'
import { useMemberProfile } from '@/features/profile/use-profile'
import { radius, spacing, typography } from '@/theme/tokens'
import { useTheme } from '@/theme/use-theme'

export default function BlockedScreen() {
  const theme = useTheme()
  const blocks = useMyBlocks()
  const count = blocks.data?.length ?? 0

  return (
    <Screen>
      <Stack.Screen options={{ title: 'Blocked members' }} />

      <View style={styles.header}>
        <Text style={[typography.display, { color: theme.text }]}>Blocked members</Text>
        <Text style={[typography.body, { color: theme.textMuted }]}>
          Blocking makes two people invisible to each other everywhere in the app. The
          other person is never told, and unblocking is instant.
        </Text>
      </View>

      {count === 0 ? (
        <Callout>You have not blocked anyone.</Callout>
      ) : (
        (blocks.data ?? []).map((block) => (
          <BlockedRow key={block.blocked_id} profileId={block.blocked_id} />
        ))
      )}
    </Screen>
  )
}

function BlockedRow({ profileId }: { profileId: string }) {
  const theme = useTheme()
  const profile = useMemberProfile(profileId)
  const unblock = useUnblockMember()

  return (
    <View style={[styles.row, { backgroundColor: theme.bgSubtle, borderColor: theme.border }]}>
      <View style={styles.rowText}>
        {/* RLS hides a blocked member's profile from the person who blocked
            them, which is the feature working — so there is usually no name to
            show here, only the fact of the block. */}
        <PersonRow
          person={profile.data ?? { display_name: 'Blocked member', discipline: '—' }}
          size={36}
        />
      </View>
      <TextLink label="Unblock" onPress={() => unblock.mutate(profileId)} />
    </View>
  )
}

const styles = StyleSheet.create({
  header: { gap: spacing.sm, marginBottom: spacing.lg },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
    padding: spacing.lg,
    borderRadius: radius.md,
    borderWidth: StyleSheet.hairlineWidth,
    marginBottom: spacing.sm,
  },
  rowText: { flex: 1 },
})
