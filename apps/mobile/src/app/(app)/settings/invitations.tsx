import * as Clipboard from 'expo-clipboard'
import { Stack } from 'expo-router'
import { Pressable, Share, StyleSheet, Text, View } from 'react-native'

import { Badge } from '@/components/badge'
import { Button, TextLink } from '@/components/button'
import { Callout } from '@/components/callout'
import { PersonRow } from '@/components/person'
import { Screen } from '@/components/screen'
import {
  useCreateInvite,
  useMyInvitedMembers,
  useMyInvites,
} from '@/features/invites/use-invites'
import { useMemberProfile } from '@/features/profile/use-profile'
import { env } from '@/lib/env'
import { fonts, radius, spacing, typography } from '@/theme/tokens'
import { useTheme } from '@/theme/use-theme'

/**
 * Invitations, on its own page rather than a section on the settings index.
 *
 * There is no cap on how many you may issue — the five-invite quota was
 * removed in 20260909180000 — but your name is still attached to whoever you
 * bring in, and the whole trust model rests on that, so the list of who has
 * actually joined sits here front and centre rather than buried in a "your
 * invites" count.
 */
export default function InvitationsScreen() {
  const theme = useTheme()
  const invites = useMyInvites()
  const createInvite = useCreateInvite()
  const invited = useMyInvitedMembers()

  const liveInvite = (invites.data ?? []).find(
    (invite) => !invite.revoked_at && invite.uses < invite.max_uses,
  )
  const joinedCount = invited.data?.length ?? 0

  return (
    <Screen>
      <Stack.Screen options={{ title: 'Invitations' }} />

      <View style={styles.header}>
        <Text style={[typography.display, { color: theme.text }]}>Invite a colleague</Text>
        <Text style={[typography.body, { color: theme.textMuted }]}>
          Your name is attached to whoever you bring in — it's how every member here is
          traceable to someone who vouched for them.
        </Text>
      </View>

      <View style={styles.section}>
        {liveInvite ? (
          <View
            style={[
              styles.invite,
              { backgroundColor: theme.bgSubtle, borderColor: theme.border },
            ]}
          >
            <Pressable
              accessibilityRole="button"
              accessibilityLabel={`Copy invite code ${liveInvite.code}`}
              onPress={() => Clipboard.setStringAsync(liveInvite.code)}
            >
              <Text style={[styles.code, { color: theme.text }]}>{liveInvite.code}</Text>
            </Pressable>
            <TextLink
              label="Share this invite"
              onPress={() =>
                Share.share({
                  message:
                    'Join me on GigAway — free couches between working artists.\n\n' +
                    `${env.webBaseUrl}/i/${liveInvite.code}`,
                })
              }
            />
          </View>
        ) : (
          <Button
            label="Create an invite"
            variant="secondary"
            onPress={() => createInvite.mutate()}
            loading={createInvite.isPending}
          />
        )}
      </View>

      <View style={styles.section}>
        <Text style={[typography.heading, { color: theme.text }]}>
          {joinedCount === 0
            ? 'Nobody has joined yet'
            : joinedCount === 1
              ? '1 colleague has joined'
              : `${joinedCount} colleagues have joined`}
        </Text>

        {joinedCount === 0 ? (
          <Callout>
            Once someone redeems your code, they'll show up here — and whether they're
            currently visible to you.
          </Callout>
        ) : (
          (invited.data ?? []).map((member) => (
            <InvitedMemberRow key={member.redeemedBy} redeemedBy={member.redeemedBy} />
          ))
        )}
      </View>
    </Screen>
  )
}

function InvitedMemberRow({ redeemedBy }: { redeemedBy: string }) {
  const theme = useTheme()
  const profile = useMemberProfile(redeemedBy)

  // A profile stops being visible this way if it is later suspended or
  // removed — RLS hides anything short of 'approved' from another member,
  // and does not say which of those states it is. There is nothing more
  // specific and honest to say than that they are not visible right now.
  const visible = Boolean(profile.data)

  return (
    <View style={[styles.row, { backgroundColor: theme.bgSubtle, borderColor: theme.border }]}>
      <View style={styles.rowText}>
        <PersonRow
          person={profile.data ?? { display_name: 'Not visible right now', discipline: '—' }}
          size={36}
        />
      </View>
      <Badge label={visible ? 'Joined' : 'Not visible'} tone={visible ? 'success' : 'muted'} />
    </View>
  )
}

const styles = StyleSheet.create({
  header: { gap: spacing.sm, marginBottom: spacing.lg },
  section: { gap: spacing.md, marginBottom: spacing.xl },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
    padding: spacing.lg,
    borderRadius: radius.md,
    borderWidth: StyleSheet.hairlineWidth,
  },
  rowText: { flex: 1 },
  invite: {
    padding: spacing.lg,
    borderRadius: radius.md,
    borderWidth: StyleSheet.hairlineWidth,
    gap: spacing.md,
  },
  code: {
    fontSize: 26,
    letterSpacing: 6,
    fontFamily: fonts.bodyBold,
    textAlign: 'center',
  },
})
