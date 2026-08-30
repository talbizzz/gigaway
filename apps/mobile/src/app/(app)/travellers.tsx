import { formatDateRange, nightCount } from '@gigaway/shared'
import { Stack, useRouter } from 'expo-router'
import { ActivityIndicator, StyleSheet, Text, View } from 'react-native'

import { Badge } from '@/components/badge'
import { Button } from '@/components/button'
import { Callout } from '@/components/callout'
import { PersonRow } from '@/components/person'
import { Screen } from '@/components/screen'
import { useMyAvailability } from '@/features/availability/use-availability'
import { useOpenTrips, useSentOffers, type OpenTrip } from '@/features/offers/use-offers'
import { radius, spacing, typography } from '@/theme/tokens'
import { useTheme } from '@/theme/use-theme'

const NEED_LABELS: Record<string, string> = {
  couch: 'a place to stay',
  tips: 'local tips',
  company: 'company',
  co_accommodation: 'to split a place',
}

/**
 * Travellers heading to a city this member has a couch in.
 *
 * The host's half of discovery, and the only way a proactive offer ever gets
 * made. A marketplace where one side can only wait to be asked is a
 * marketplace running at half speed — and in a small network, the host who
 * happens to notice a colleague arriving is often the only match there is.
 */
export default function TravellersScreen() {
  const theme = useTheme()
  const trips = useOpenTrips()
  const availability = useMyAvailability()
  const sentOffers = useSentOffers()

  if (trips.isPending) {
    return (
      <View style={[styles.centre, { backgroundColor: theme.bg }]}>
        <ActivityIndicator color={theme.accent} />
      </View>
    )
  }

  const rows = trips.data ?? []
  const hasAvailability = (availability.data ?? []).some((row) => row.status === 'active')

  // already_offered tells the card to stop offering the action, but not which
  // offer to open. At most one can be live per trip.
  const liveOfferByTrip = new Map(
    (sentOffers.data ?? [])
      .filter((offer) => offer.status === 'pending')
      .map((offer) => [offer.trip_id, offer.id]),
  )

  return (
    <Screen>
      <Stack.Screen options={{ title: 'Coming your way' }} />

      {!hasAvailability ? (
        <Callout title="Post your free nights first">
          This list is built from your own availability — it shows travellers whose dates
          overlap yours. Post some nights and they will appear here.
        </Callout>
      ) : rows.length === 0 ? (
        <Callout title="Nobody yet">
          No trips overlap your free nights at the moment. This changes week to week as
          colleagues post where they are going.
        </Callout>
      ) : (
        <>
          <Text style={[typography.caption, { color: theme.textMuted }]}>
            Artists arriving while you have room. You can offer any part of their dates —
            you do not need to cover the whole trip.
          </Text>
          {rows.map((trip) => (
            <OpenTripCard
              key={trip.trip_id}
              trip={trip}
              liveOfferId={liveOfferByTrip.get(trip.trip_id) ?? null}
            />
          ))}
        </>
      )}
    </Screen>
  )
}

function OpenTripCard({
  trip,
  liveOfferId,
}: {
  trip: OpenTrip
  /** This host's unanswered offer on the trip, if one exists. */
  liveOfferId: string | null
}) {
  const theme = useTheme()
  const router = useRouter()

  const tripNights = nightCount({ start: trip.trip_start, end: trip.trip_end })
  const partial = trip.overlap_nights < tripNights

  return (
    <View style={[styles.card, { backgroundColor: theme.bgSubtle, borderColor: theme.border }]}>
      <View style={styles.cardTop}>
        <PersonRow
          person={{
            display_name: trip.display_name,
            discipline: trip.discipline,
            specialisation: trip.specialisation,
            photo_path: trip.photo_path,
          }}
          onPress={() =>
            router.push({
              pathname: '/member/[id]',
              params: { id: trip.profile_id, tripId: trip.trip_id, action: 'offer' },
            })
          }
        />
        {trip.already_offered ? (
          <Badge label="Offered" tone="accent" />
        ) : trip.already_asked ? (
          <Badge label="They asked" tone="warning" />
        ) : null}
      </View>

      <Text style={[typography.bodyStrong, { color: theme.text }]}>
        {trip.city_name}
        {trip.distance_km > 0 ? ` · ${trip.distance_km} km from your couch` : ''}
      </Text>
      <Text style={[typography.caption, { color: theme.textMuted }]}>
        {formatDateRange(trip.trip_start, trip.trip_end)} · {tripNights} night
        {tripNights === 1 ? '' : 's'}
      </Text>

      {/* Their nights and yours, stated as what you could give. */}
      <Text style={[typography.bodyStrong, { color: theme.accent }]}>
        You are free for {trip.overlap_nights} of them
        {partial ? '' : ' — the whole trip'}
      </Text>
      <Text style={[typography.caption, { color: theme.textMuted }]}>
        {formatDateRange(trip.overlap_start, trip.overlap_end)}
      </Text>

      {trip.needs.length > 0 ? (
        <Text style={[typography.caption, { color: theme.textMuted }]}>
          Looking for {trip.needs.map((need) => NEED_LABELS[need] ?? need).join(', ')}
        </Text>
      ) : null}

      {trip.note ? (
        <Text style={[typography.body, { color: theme.text }]}>“{trip.note}”</Text>
      ) : null}

      {trip.already_offered ? (
        liveOfferId ? (
          <Button
            label="Change your offer"
            variant="secondary"
            onPress={() => router.push(`/offer/edit/${liveOfferId}`)}
            style={styles.action}
          />
        ) : null
      ) : (
        <Button
          label="Offer nights"
          onPress={() =>
            router.push({ pathname: '/offer/new', params: { tripId: trip.trip_id } })
          }
          style={styles.action}
        />
      )}
    </View>
  )
}

const styles = StyleSheet.create({
  centre: { flex: 1, alignItems: 'center', justifyContent: 'center' },
  card: {
    padding: spacing.lg,
    borderRadius: radius.md,
    borderWidth: StyleSheet.hairlineWidth,
    gap: spacing.xs,
  },
  cardTop: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: spacing.md,
    marginBottom: spacing.xs,
  },
  action: { marginTop: spacing.md },
})
