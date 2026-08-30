import { DELETE_CONFIRMATION } from '@gigaway/shared'
import * as Clipboard from 'expo-clipboard'
import { useRouter } from 'expo-router'
import { useState } from 'react'
import { Pressable, Share, StyleSheet, Text, View } from 'react-native'

import { Button, TextLink } from '@/components/button'
import { Callout } from '@/components/callout'
import { PersonRow } from '@/components/person'
import { Screen } from '@/components/screen'
import { TextField } from '@/components/text-field'
import { useDeleteAccount, useExportData } from '@/features/account/use-account'
import { useMyBlocks, useUnblockMember } from '@/features/blocks/use-blocks'
import { useCreateInvite, useMyInvites, useRemainingQuota } from '@/features/invites/use-invites'
import { useMemberProfile } from '@/features/profile/use-profile'
import { env } from '@/lib/env'
import { unregisterPush } from '@/lib/push'
import { supabase } from '@/lib/supabase'
import { radius, spacing, typography } from '@/theme/tokens'
import { useTheme } from '@/theme/use-theme'

/**
 * Settings: invites, blocked members, the guidelines, data export, signing out,
 * and account deletion.
 *
 * Invites sit here rather than on the feed because bringing someone in is a
 * deliberate, occasional act — it was competing with the people already in the
 * network for the bottom of the home screen, and losing.
 *
 * The deletion section is deliberately the last thing on the screen and
 * deliberately not a single button. It asks for the word and the password
 * because there is no undo, no backup and no support channel that can put an
 * account back.
 */
export default function SettingsScreen() {
  const theme = useTheme()
  const router = useRouter()

  const blocks = useMyBlocks()
  const exportData = useExportData()

  return (
    <Screen>
      <InviteSection />

      {/* ── Blocked ─────────────────────────────────────────────────────── */}
      <View style={styles.section}>
        <Text style={[typography.heading, { color: theme.text }]}>Blocked members</Text>
        {(blocks.data ?? []).length === 0 ? (
          <Callout>
            You have not blocked anyone. Blocking makes two people invisible to each other
            everywhere in the app, and the other person is never told.
          </Callout>
        ) : (
          (blocks.data ?? []).map((block) => (
            <BlockedRow key={block.blocked_id} profileId={block.blocked_id} />
          ))
        )}
      </View>

      {/* ── Guidelines ──────────────────────────────────────────────────── */}
      <View style={styles.section}>
        <Text style={[typography.heading, { color: theme.text }]}>Community guidelines</Text>
        <Text style={[typography.caption, { color: theme.textMuted }]}>
          What we hold members to, and the basis on which accounts are removed.
        </Text>
        <Button
          label="Read the guidelines"
          variant="secondary"
          onPress={() => router.push('/guidelines')}
        />
      </View>

      {/* ── Export ──────────────────────────────────────────────────────── */}
      <View style={styles.section}>
        <Text style={[typography.heading, { color: theme.text }]}>Your data</Text>
        <Text style={[typography.caption, { color: theme.textMuted }]}>
          Everything GigAway holds about you, as a JSON file you can keep. Reports are not
          included — including them would expose the people who filed them.
        </Text>
        <Button
          label="Export my data"
          variant="secondary"
          onPress={() => exportData.mutate()}
          loading={exportData.isPending}
        />
        {exportData.isError ? (
          <Callout tone="danger">{(exportData.error as Error).message}</Callout>
        ) : null}
      </View>

      {/* ── Session ────────────────────────────────────────────────────── */}
      <View style={styles.section}>
        <Text style={[typography.heading, { color: theme.text }]}>This device</Text>
        <Text style={[typography.caption, { color: theme.textMuted }]}>
          Signing out leaves your account untouched — everything is here when you come
          back.
        </Text>
        <Button
          label="Sign out"
          variant="secondary"
          onPress={async () => {
            // Release this device's push token first. Otherwise the next person
            // to sign in on a shared or resold phone keeps receiving the
            // previous member's notifications.
            await unregisterPush()
            await supabase.auth.signOut()
          }}
        />
      </View>

      <DeleteAccountSection />
    </Screen>
  )
}

/**
 * One live invite at a time, with the quota stated plainly. Your name is
 * attached to whoever you bring in — the whole trust model rests on that, so it
 * is said on the screen rather than buried in the guidelines.
 */
function InviteSection() {
  const theme = useTheme()
  const invites = useMyInvites()
  const quota = useRemainingQuota()
  const createInvite = useCreateInvite()

  const liveInvite = (invites.data ?? []).find(
    (invite) => !invite.revoked_at && invite.uses < invite.max_uses,
  )

  return (
    <View style={styles.section}>
      <Text style={[typography.heading, { color: theme.text }]}>Invite a colleague</Text>
      <Text style={[typography.caption, { color: theme.textMuted }]}>
        {quota.data ?? 0} left. Your name is attached to whoever you bring in.
      </Text>

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
          disabled={(quota.data ?? 0) <= 0}
        />
      )}
    </View>
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

/**
 * Account deletion.
 *
 * Two confirmations, and copy that says plainly what survives. Somebody who
 * deletes expecting their reviews of other people to vanish and finds they
 * have not would rightly feel misled — so the screen says it before, not
 * after.
 */
function DeleteAccountSection() {
  const theme = useTheme()
  const deleteAccount = useDeleteAccount()

  const [open, setOpen] = useState(false)
  const [confirm, setConfirm] = useState('')
  const [password, setPassword] = useState('')

  const ready = confirm === DELETE_CONFIRMATION && password.length > 0

  return (
    <View style={styles.section}>
      <Text style={[typography.heading, { color: theme.danger }]}>Delete your account</Text>

      {!open ? (
        <Button label="Delete my account" variant="danger" onPress={() => setOpen(true)} />
      ) : (
        <>
          <Callout tone="danger" title="This cannot be undone">
            Your profile, trips, availability, contact details and notifications are
            deleted outright, and you will never be able to sign in again.
            {'\n\n'}
            Two things deliberately survive, and you should know before you continue.
            Reviews you have written about other people stay published, with your name
            replaced by "Deleted member" — otherwise deleting and rejoining would be a way
            to erase a bad reputation. Stays you were part of stay in the other person's
            history. Any report you filed is also kept.
          </Callout>

          <TextField
            label={`Type ${DELETE_CONFIRMATION} to confirm`}
            value={confirm}
            onChangeText={setConfirm}
            autoCapitalize="characters"
            autoCorrect={false}
            placeholder={DELETE_CONFIRMATION}
          />

          <TextField
            label="Your password"
            value={password}
            onChangeText={setPassword}
            secureTextEntry
            autoCapitalize="none"
            placeholder="••••••••"
          />

          {deleteAccount.isError ? (
            <Callout tone="danger">{(deleteAccount.error as Error).message}</Callout>
          ) : null}

          <Button
            label="Permanently delete my account"
            variant="danger"
            disabled={!ready}
            loading={deleteAccount.isPending}
            onPress={() => deleteAccount.mutate(password)}
          />
          <TextLink label="Keep my account" onPress={() => setOpen(false)} />
        </>
      )}
    </View>
  )
}

const styles = StyleSheet.create({
  section: { gap: spacing.md },
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
    fontWeight: '700',
    textAlign: 'center',
  },
})
