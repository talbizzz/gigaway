import * as Clipboard from 'expo-clipboard'
import { Stack, useRouter } from 'expo-router'
import { Pressable, Share, StyleSheet, Text, View } from 'react-native'

import { Button } from '@/components/button'
import { Callout } from '@/components/callout'
import { Screen } from '@/components/screen'
import { useMyProfile } from '@/features/profile/use-profile'
import {
  useCreateInvite,
  useMyInvites,
  useRemainingQuota,
  useRevokeInvite,
} from '@/features/invites/use-invites'
import { env } from '@/lib/env'
import { supabase } from '@/lib/supabase'
import { radius, spacing, typography } from '@/theme/tokens'
import { useTheme } from '@/theme/use-theme'

/**
 * Home. Trips, availability and matching arrive in Milestone 2 — for now this
 * is the verified member's landing place and where they invite colleagues,
 * which is the mechanism the whole network depends on.
 */
export default function HomeScreen() {
  const theme = useTheme()
  const router = useRouter()
  const { data: profile } = useMyProfile()
  const invites = useMyInvites()
  const quota = useRemainingQuota()
  const createInvite = useCreateInvite()
  const revokeInvite = useRevokeInvite()

  const liveInvites = (invites.data ?? []).filter(
    (invite) => !invite.revoked_at && invite.uses < invite.max_uses,
  )

  const shareInvite = async (code: string) => {
    await Share.share({
      message:
        `Join me on GigAway — free couches between working artists.\n\n` +
        `${env.webBaseUrl}/i/${code}`,
    })
  }

  return (
    <Screen>
      <Stack.Screen options={{ title: 'GigAway' }} />

      <View style={styles.header}>
        <Text style={[typography.title, { color: theme.text }]}>
          Hello, {profile?.display_name?.split(' ')[0] ?? 'there'}
        </Text>
        <Text style={[typography.body, { color: theme.textMuted }]}>
          Trips and matching arrive next. In the meantime, the network only works if the
          right people are in it.
        </Text>
      </View>

      <View style={styles.section}>
        <Text style={[typography.heading, { color: theme.text }]}>Invite a colleague</Text>
        <Text style={[typography.caption, { color: theme.textMuted }]}>
          {quota.data ?? 0} invite{quota.data === 1 ? '' : 's'} left. Each one vouches for
          someone — your name is attached to who you bring in.
        </Text>

        {liveInvites.map((invite) => (
          <View
            key={invite.id}
            style={[styles.invite, { backgroundColor: theme.bgSubtle, borderColor: theme.border }]}
          >
            <Pressable
              accessibilityRole="button"
              accessibilityLabel={`Copy invite code ${invite.code}`}
              onPress={() => Clipboard.setStringAsync(invite.code)}
            >
              <Text style={[styles.code, { color: theme.text }]}>{invite.code}</Text>
            </Pressable>

            <View style={styles.inviteActions}>
              <Button
                label="Share"
                variant="secondary"
                onPress={() => shareInvite(invite.code)}
                style={styles.action}
              />
              <Button
                label="Revoke"
                variant="ghost"
                onPress={() => revokeInvite.mutate(invite.id)}
                loading={revokeInvite.isPending}
                style={styles.action}
              />
            </View>
          </View>
        ))}

        {liveInvites.length === 0 ? (
          <Callout>
            You haven't created any invites yet. Codes last 30 days and can be revoked at
            any time.
          </Callout>
        ) : null}

        <Button
          label="Create an invite"
          onPress={() => createInvite.mutate()}
          loading={createInvite.isPending}
          disabled={(quota.data ?? 0) <= 0}
        />

        {createInvite.isError ? (
          <Callout tone="danger">{(createInvite.error as Error).message}</Callout>
        ) : null}
      </View>

      <Button
        label="Your profile"
        variant="secondary"
        onPress={() => router.push('/profile')}
      />

      <Button label="Sign out" variant="ghost" onPress={() => supabase.auth.signOut()} />
    </Screen>
  )
}

const styles = StyleSheet.create({
  header: { gap: spacing.sm },
  section: { gap: spacing.md },
  invite: {
    padding: spacing.lg,
    borderRadius: radius.md,
    borderWidth: StyleSheet.hairlineWidth,
    gap: spacing.md,
  },
  code: {
    fontSize: 28,
    letterSpacing: 6,
    fontWeight: '700',
    textAlign: 'center',
  },
  inviteActions: { flexDirection: 'row', gap: spacing.sm },
  action: { flex: 1 },
})
