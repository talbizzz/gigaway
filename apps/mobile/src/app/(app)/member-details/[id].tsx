import {
  formatDateRange,
  nightCount,
  TRIP_VISIBILITY_LABELS,
  type TripVisibility,
} from '@gigaway/shared'
import { Stack, useLocalSearchParams, useRouter } from 'expo-router'
import { ActivityIndicator, Pressable, StyleSheet, Text, View } from 'react-native'

import { Badge } from '@/components/badge'
import { Callout } from '@/components/callout'
import { ConnectionActions } from '@/components/connection-actions'
import { PersonRow } from '@/components/person'
import type { StatSection } from '@/components/profile-stats'
import { Screen } from '@/components/screen'
import { useSplitConnections } from '@/features/connections/use-connections'
import {
  useMemberConnections,
  useMemberServices,
  useMemberTrips,
  type MemberConnection,
  type MemberService,
  type MemberTrip,
  type ServiceKind,
} from '@/features/members/use-member-stats'
import { useMyProfile } from '@/features/profile/use-profile'
import { TRIP_NEEDS } from '@/features/trips/use-trips'
import { radius, spacing, typography } from '@/theme/tokens'
import { useTheme } from '@/theme/use-theme'

const TITLES: Record<StatSection, string> = {
  trips: 'Trips',
  connections: 'Connections',
  services: 'Services offered',
}

/**
 * What is behind a number on a profile: the trips, the connections, or the
 * services the member has given.
 *
 * THE SCREEN PERFORMS NO CHECK of who is looking. The database returns these
 * rows only to the member and to their connections, so a stranger who somehow
 * lands here sees an empty list, never somebody else's data.
 */
export default function MemberDetailsScreen() {
  const theme = useTheme()
  const { id, section } = useLocalSearchParams<{ id: string; section?: StatSection }>()
  const which: StatSection = section === 'connections' || section === 'services' ? section : 'trips'
  const me = useMyProfile().data?.id

  return (
    <Screen>
      <Stack.Screen options={{ title: TITLES[which] }} />
      <Text style={[typography.display, { color: theme.text }]}>{TITLES[which]}</Text>

      {which === 'trips' ? <TripsList profileId={id} isSelf={me === id} /> : null}
      {which === 'connections' ? <ConnectionsList profileId={id} /> : null}
      {which === 'services' ? <ServicesList profileId={id} /> : null}
    </Screen>
  )
}

function Loading() {
  const theme = useTheme()
  return <ActivityIndicator color={theme.accent} style={styles.spinner} />
}

// ── trips ───────────────────────────────────────────────────────────────────

function TripsList({ profileId, isSelf }: { profileId: string | undefined; isSelf: boolean }) {
  const theme = useTheme()
  const trips = useMemberTrips(profileId)

  if (trips.isPending) return <Loading />
  if (trips.isError) return <Callout tone="danger">{(trips.error as Error).message}</Callout>

  if (!trips.data?.length) {
    return (
      <Callout>
        {isSelf
          ? 'You have not posted a trip yet.'
          : 'No trips to show. Trips that are private are never listed.'}
      </Callout>
    )
  }

  return (
    <View style={styles.list}>
      {!isSelf ? (
        <Text style={[typography.caption, { color: theme.textMuted }]}>
          Only trips that are not private are shown.
        </Text>
      ) : null}
      {trips.data.map((trip) => (
        <TripCard key={trip.id} trip={trip} isSelf={isSelf} />
      ))}
    </View>
  )
}

function TripCard({ trip, isSelf }: { trip: MemberTrip; isSelf: boolean }) {
  const theme = useTheme()
  const router = useRouter()
  const nights = nightCount({ start: trip.start_date, end: trip.end_date })
  const needs = trip.needs
    .map((need) => TRIP_NEEDS.find((n) => n.value === need)?.label ?? need)
    .join(', ')

  // Somebody else's trip opens in full, where you can offer them something. Your
  // own opens the screen that shows who matches it.
  const open = () => router.push(isSelf ? `/trip/${trip.id}` : `/trip-view/${trip.id}`)

  return (
    <Pressable
      accessibilityRole="button"
      onPress={open}
      style={({ pressed }) => [
        styles.card,
        { backgroundColor: theme.bgSubtle, borderColor: theme.border },
        pressed && styles.pressed,
      ]}
    >
      <View style={styles.cardTop}>
        <Text style={[typography.bodyStrong, styles.grow, { color: theme.text }]}>
          {trip.city_name}
        </Text>
        {/* Only the member sees how each trip is shared; to anyone else every
            trip here is simply a trip. */}
        {isSelf ? (
          <Badge
            label={TRIP_VISIBILITY_LABELS[trip.visibility as TripVisibility]}
            tone={trip.visibility === 'private' ? 'warning' : 'muted'}
          />
        ) : null}
      </View>
      <Text style={[typography.caption, { color: theme.textMuted }]}>
        {formatDateRange(trip.start_date, trip.end_date)} · {nights} night{nights === 1 ? '' : 's'}
      </Text>
      {needs ? (
        <Text style={[typography.caption, { color: theme.textMuted }]}>Looking for {needs}</Text>
      ) : null}
      {trip.note ? (
        <Text style={[typography.body, { color: theme.text }]}>“{trip.note}”</Text>
      ) : null}
    </Pressable>
  )
}

// ── connections ─────────────────────────────────────────────────────────────

function ConnectionsList({ profileId }: { profileId: string | undefined }) {
  const connections = useMemberConnections(profileId)
  const { split } = useSplitConnections()

  if (connections.isPending) return <Loading />
  if (connections.isError) {
    return <Callout tone="danger">{(connections.error as Error).message}</Callout>
  }
  if (!connections.data?.length) return <Callout>No connections to show yet.</Callout>

  const idFor = (profile: MemberConnection) =>
    [...split.connected, ...split.incoming, ...split.outgoing].find(
      (entry) => entry.profile.id === profile.profile_id,
    )?.connectionId ?? null

  return (
    <View style={styles.list}>
      {connections.data.map((person) => (
        <ConnectionRow key={person.profile_id} person={person} connectionId={idFor(person)} />
      ))}
    </View>
  )
}

function ConnectionRow({
  person,
  connectionId,
}: {
  person: MemberConnection
  connectionId: string | null
}) {
  const router = useRouter()
  const theme = useTheme()

  return (
    <View style={styles.item}>
      <PersonRow
        person={person}
        trailing={person.username ? `@${person.username}` : undefined}
        onPress={() => router.push(`/member/${person.profile_id}`)}
      />
      {person.relationship === 'self' ? (
        <Text style={[typography.caption, { color: theme.textMuted }]}>This is you.</Text>
      ) : (
        <ConnectionActions
          profileId={person.profile_id}
          firstName={person.display_name.split(' ')[0] ?? 'them'}
          relationship={person.relationship === 'connected' ? 'connected' : person.relationship}
          connectionId={connectionId}
          compact
        />
      )}
    </View>
  )
}

// ── services ────────────────────────────────────────────────────────────────

const SERVICE_TITLES: Record<ServiceKind, string> = {
  couch: 'Hosted a couch',
  tips: 'Gave local tips',
  coffee: 'Met for a coffee',
}

function ServicesList({ profileId }: { profileId: string | undefined }) {
  const theme = useTheme()
  const services = useMemberServices(profileId)

  if (services.isPending) return <Loading />
  if (services.isError) return <Callout tone="danger">{(services.error as Error).message}</Callout>
  if (!services.data?.length) {
    return <Callout>Nothing here yet. A service appears once it has been accepted and is done.</Callout>
  }

  return (
    <View style={styles.list}>
      <Text style={[typography.caption, { color: theme.textMuted }]}>
        A service counts once it was accepted on both sides and has taken place.
      </Text>
      {services.data.map((service, index) => (
        <ServiceCard key={`${service.completed_on}-${service.kind}-${index}`} service={service} />
      ))}
    </View>
  )
}

function ServiceCard({ service }: { service: MemberService }) {
  const theme = useTheme()
  const router = useRouter()
  const when = new Date(`${service.completed_on}T00:00:00Z`).toLocaleDateString('en-GB', {
    month: 'long',
    year: 'numeric',
    timeZone: 'UTC',
  })

  return (
    <View style={[styles.card, { backgroundColor: theme.bgSubtle, borderColor: theme.border }]}>
      <Text style={[typography.bodyStrong, { color: theme.text }]}>
        {SERVICE_TITLES[service.kind]}
      </Text>
      <Text style={[typography.caption, { color: theme.textMuted }]}>
        {[service.city_name, when].filter(Boolean).join(' · ')}
      </Text>
      {service.recipient_id ? (
        <PersonRow
          person={{
            display_name: service.recipient_name ?? 'A member',
            discipline: service.discipline ?? '',
            photo_path: service.photo_path,
          }}
          size={36}
          trailing={service.username ? `@${service.username}` : undefined}
          onPress={() => router.push(`/member/${service.recipient_id}`)}
        />
      ) : (
        <Text style={[typography.body, { color: theme.textMuted }]}>For a member</Text>
      )}
    </View>
  )
}

const styles = StyleSheet.create({
  list: { gap: spacing.md },
  item: { gap: spacing.sm },
  spinner: { alignSelf: 'flex-start' },
  card: { padding: spacing.lg, borderRadius: radius.md, borderWidth: 1, gap: spacing.xs },
  cardTop: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm },
  grow: { flex: 1 },
  pressed: { opacity: 0.7 },
})
