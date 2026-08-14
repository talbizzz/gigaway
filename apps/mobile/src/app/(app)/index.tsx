import { nightCount } from '@gigaway/shared'
import * as Clipboard from 'expo-clipboard'
import { Stack, useRouter } from 'expo-router'
import { Pressable, Share, StyleSheet, Text, View } from 'react-native'

import { Button, TextLink } from '@/components/button'
import { Callout } from '@/components/callout'
import { Screen } from '@/components/screen'
import {
  useCancelAvailability,
  useMyAvailability,
  type Availability,
} from '@/features/availability/use-availability'
import { useCreateInvite, useMyInvites, useRemainingQuota } from '@/features/invites/use-invites'
import { useMyProfile } from '@/features/profile/use-profile'
import { useCancelTrip, useMyTrips, type Trip } from '@/features/trips/use-trips'
import { env } from '@/lib/env'
import { supabase } from '@/lib/supabase'
import { radius, spacing, typography } from '@/theme/tokens'
import { useTheme } from '@/theme/use-theme'

export default function HomeScreen() {
  const theme = useTheme()
  const router = useRouter()
  const { data: profile } = useMyProfile()
  const trips = useMyTrips()
  const availability = useMyAvailability()
  const invites = useMyInvites()
  const quota = useRemainingQuota()
  const createInvite = useCreateInvite()

  const activeTrips = (trips.data ?? []).filter((trip) => trip.status === 'active')
  const activeAvailability = (availability.data ?? []).filter((row) => row.status === 'active')
  const liveInvite = (invites.data ?? []).find(
    (invite) => !invite.revoked_at && invite.uses < invite.max_uses,
  )

  return (
    <Screen>
      <Stack.Screen options={{ title: 'GigAway' }} />

      <Text style={[typography.title, { color: theme.text }]}>
        Hello, {profile?.display_name?.split(' ')[0] ?? 'there'}
      </Text>

      {/* ── Trips ───────────────────────────────────────────────────────── */}
      <View style={styles.section}>
        <Text style={[typography.heading, { color: theme.text }]}>Your trips</Text>

        {activeTrips.length === 0 ? (
          <Callout>
            Going somewhere for a gig or an audition? Post it and see who is there.
          </Callout>
        ) : (
          activeTrips.map((trip) => (
            <TripRow key={trip.id} trip={trip} onPress={() => router.push(`/trip/${trip.id}`)} />
          ))
        )}

        <Button label="Add a trip" onPress={() => router.push('/trip/new')} />
      </View>

      {/* ── Availability ────────────────────────────────────────────────── */}
      <View style={styles.section}>
        <Text style={[typography.heading, { color: theme.text }]}>Your couch</Text>

        {activeAvailability.length === 0 ? (
          <Callout>
            Free nights at home? Offering them is how the network keeps working — and how
            someone hosts you next spring.
          </Callout>
        ) : (
          activeAvailability.map((row) => <AvailabilityRow key={row.id} availability={row} />)
        )}

        <Button
          label="Offer a couch"
          variant="secondary"
          onPress={() => router.push('/availability/new')}
        />
      </View>

      {/* ── Invites ─────────────────────────────────────────────────────── */}
      <View style={styles.section}>
        <Text style={[typography.heading, { color: theme.text }]}>Invite a colleague</Text>
        <Text style={[typography.caption, { color: theme.textMuted }]}>
          {quota.data ?? 0} left. Your name is attached to whoever you bring in.
        </Text>

        {liveInvite ? (
          <View style={[styles.invite, { backgroundColor: theme.bgSubtle, borderColor: theme.border }]}>
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

      <Button label="Your profile" variant="ghost" onPress={() => router.push('/profile')} />
      <Button label="Sign out" variant="ghost" onPress={() => supabase.auth.signOut()} />
    </Screen>
  )
}

function TripRow({ trip, onPress }: { trip: Trip; onPress: () => void }) {
  const theme = useTheme()
  const router = useRouter()
  const cancel = useCancelTrip()
  const nights = nightCount({ start: trip.start_date, end: trip.end_date })

  return (
    <Pressable
      accessibilityRole="button"
      onPress={onPress}
      style={({ pressed }) => [
        styles.row,
        { backgroundColor: theme.bgSubtle, borderColor: theme.border },
        pressed && styles.pressed,
      ]}
    >
      <View style={styles.rowText}>
        <Text style={[typography.bodyStrong, { color: theme.text }]}>{trip.cities?.name}</Text>
        <Text style={[typography.caption, { color: theme.textMuted }]}>
          {trip.start_date} → {trip.end_date} · {nights} night{nights === 1 ? '' : 's'}
        </Text>
      </View>
      <View style={styles.rowActions}>
        <TextLink label="Edit" onPress={() => router.push(`/trip/edit/${trip.id}`)} />
        <TextLink label="Cancel" onPress={() => cancel.mutate(trip.id)} />
      </View>
    </Pressable>
  )
}

function AvailabilityRow({ availability }: { availability: Availability }) {
  const theme = useTheme()
  const router = useRouter()
  const cancel = useCancelAvailability()
  const nights = nightCount({ start: availability.start_date, end: availability.end_date })

  return (
    <View style={[styles.row, { backgroundColor: theme.bgSubtle, borderColor: theme.border }]}>
      <View style={styles.rowText}>
        <Text style={[typography.bodyStrong, { color: theme.text }]}>
          {availability.cities?.name}
        </Text>
        <Text style={[typography.caption, { color: theme.textMuted }]}>
          {availability.start_date} → {availability.end_date} · {nights} night
          {nights === 1 ? '' : 's'}
        </Text>
      </View>
      <View style={styles.rowActions}>
        <TextLink
          label="Edit"
          onPress={() => router.push(`/availability/edit/${availability.id}`)}
        />
        <TextLink label="Cancel" onPress={() => cancel.mutate(availability.id)} />
      </View>
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
  rowText: { flex: 1, gap: 2 },
  rowActions: { gap: spacing.sm, alignItems: 'flex-end' },
  pressed: { opacity: 0.7 },
  invite: {
    padding: spacing.lg,
    borderRadius: radius.md,
    borderWidth: StyleSheet.hairlineWidth,
    gap: spacing.md,
  },
  code: { fontSize: 26, letterSpacing: 6, fontWeight: '700', textAlign: 'center' },
})
