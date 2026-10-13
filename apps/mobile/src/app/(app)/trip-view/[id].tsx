import {
  formatDateRange,
  isStayService,
  nightCount,
  serviceLabel,
  type ServiceKind,
} from '@gigaway/shared'
import { Redirect, Stack, useLocalSearchParams, useRouter } from 'expo-router'
import { ActivityIndicator, StyleSheet, Text, View } from 'react-native'

import { Badge } from '@/components/badge'
import { Button, TextLink } from '@/components/button'
import { Callout } from '@/components/callout'
import { PersonRow } from '@/components/person'
import { Screen } from '@/components/screen'
import { VerifiedOnly } from '@/components/verified-only'
import { useMyAvailability, type Availability } from '@/features/availability/use-availability'
import { useSentOffers } from '@/features/offers/use-offers'
import { useMyProfile } from '@/features/profile/use-profile'
import {
  useAnswerServiceOffer,
  useSendServiceOffer,
  useSentServiceOffers,
  useVisibleTrip,
  type ServiceOfferKind,
  type VisibleTrip,
} from '@/features/service-offers/use-service-offers'
import { TRIP_NEEDS } from '@/features/trips/use-trips'
import { radius, spacing, typography } from '@/theme/tokens'
import { useTheme } from '@/theme/use-theme'

/**
 * Somebody else's trip, and what you can offer them for it.
 *
 * Reached by tapping a trip you can see: on Home, in a connection's list of trips,
 * or from someone's profile. You do not need to have been asked. The services
 * offered are your own posts that fit the trip (the same city, and dates that
 * overlap or an always-available post), so nothing here can be offered that you
 * have not actually put up.
 *
 * THE SCREEN CHECKS NOTHING ABOUT WHO MAY SEE THE TRIP. The database returns it
 * only when it is visible to you, so a trip you may not see is just "not
 * available", the same as one that does not exist.
 */
export default function TripViewScreen() {
  const theme = useTheme()
  const router = useRouter()
  const { id } = useLocalSearchParams<{ id: string }>()
  const trip = useVisibleTrip(id)
  const me = useMyProfile().data?.id

  if (trip.isPending) {
    return (
      <View style={[styles.centre, { backgroundColor: theme.bg }]}>
        <ActivityIndicator color={theme.accent} />
      </View>
    )
  }

  // Your own trip is the match screen, not this one.
  if (trip.data && trip.data.profile_id === me) return <Redirect href={`/trip/${id}`} />

  if (!trip.data) {
    return (
      <Screen>
        <Stack.Screen options={{ title: 'Trip' }} />
        <Callout title="Not available">This trip is no longer available to you.</Callout>
      </Screen>
    )
  }

  const t = trip.data
  const nights = nightCount({ start: t.start_date, end: t.end_date })
  const needs = t.needs
    .map((need) => TRIP_NEEDS.find((n) => n.value === need)?.label ?? need)
    .join(', ')

  return (
    <Screen>
      <Stack.Screen options={{ title: t.cities?.name ?? 'Trip' }} />

      <PersonRow
        person={t.traveller}
        size={56}
        onPress={() => router.push(`/member/${t.profile_id}`)}
      />

      <View style={styles.header}>
        <Text style={[typography.title, { color: theme.text }]}>{t.cities?.name}</Text>
        <Text style={[typography.body, { color: theme.textMuted }]}>
          {formatDateRange(t.start_date, t.end_date)} · {nights} night{nights === 1 ? '' : 's'}
        </Text>
        {needs ? (
          <Text style={[typography.caption, { color: theme.textMuted }]}>Looking for {needs}</Text>
        ) : null}
        {t.note ? <Text style={[typography.body, { color: theme.text }]}>“{t.note}”</Text> : null}
      </View>

      <OfferSection trip={t} />
    </Screen>
  )
}

/**
 * Your own services that fit this trip, each one tap away from being offered.
 * A couch or a room opens the nights form, because nights have to be chosen; a
 * coffee or local tips are offered straight away.
 */
function OfferSection({ trip }: { trip: VisibleTrip }) {
  const theme = useTheme()
  const router = useRouter()
  const mine = useMyAvailability()
  const sentOffers = useSentOffers()
  const sentServiceOffers = useSentServiceOffers()
  const send = useSendServiceOffer()
  const answer = useAnswerServiceOffer()

  const fitting = fittingServices(mine.data ?? [], trip)
  const firstName = trip.traveller?.display_name.split(' ')[0] ?? 'them'

  // What you have already offered here, so a button reads "Offered" rather than
  // inviting a second tap into a duplicate.
  const nightsOffered = (sentOffers.data ?? []).some(
    (offer) =>
      offer.trip_id === trip.id && (offer.status === 'pending' || offer.status === 'accepted'),
  )
  const sentForTrip = (sentServiceOffers.data ?? []).filter((offer) => offer.trip_id === trip.id)

  return (
    <View style={styles.section}>
      <Text style={[typography.heading, { color: theme.text }]}>Offer {firstName} something</Text>

      {mine.isPending ? (
        <ActivityIndicator color={theme.accent} style={styles.spinner} />
      ) : fitting.length === 0 ? (
        <>
          <Callout>
            You have not offered anything in {trip.cities?.name} that fits these dates. Offer a
            service there first, or make one always available, and it will appear here.
          </Callout>
          <VerifiedOnly>
            <Button
              label="Offer a service"
              variant="secondary"
              onPress={() => router.push('/availability/choose')}
            />
          </VerifiedOnly>
        </>
      ) : (
        <VerifiedOnly>
          <View style={styles.list}>
            {fitting.map((kind) => {
              const stay = isStayService(kind)
              const sent = sentForTrip.find((offer) => offer.kind === kind)
              const live = sent && (sent.status === 'pending' || sent.status === 'accepted')

              return (
                <View
                  key={kind}
                  style={[
                    styles.card,
                    { backgroundColor: theme.bgSubtle, borderColor: theme.border },
                  ]}
                >
                  <View style={styles.cardTop}>
                    <Text style={[typography.bodyStrong, styles.grow, { color: theme.text }]}>
                      {serviceLabel(kind)}
                    </Text>
                    {stay && nightsOffered ? <Badge label="Offered" tone="accent" /> : null}
                    {!stay && live ? (
                      <Badge
                        label={sent.status === 'accepted' ? 'Accepted' : 'Offered'}
                        tone={sent.status === 'accepted' ? 'success' : 'accent'}
                      />
                    ) : null}
                  </View>

                  {stay ? (
                    nightsOffered ? null : (
                      <Button
                        label="Offer nights"
                        onPress={() =>
                          router.push({ pathname: '/offer/new', params: { tripId: trip.id } })
                        }
                      />
                    )
                  ) : live ? (
                    sent.status === 'pending' ? (
                      <TextLink
                        label="Withdraw"
                        onPress={() => answer.mutate({ id: sent.id, status: 'withdrawn' })}
                      />
                    ) : null
                  ) : (
                    <Button
                      label={kind === 'coffee' ? 'Offer a coffee' : 'Offer local tips'}
                      onPress={() =>
                        send.mutate({
                          kind: kind as ServiceOfferKind,
                          tripId: trip.id,
                          toProfile: trip.profile_id,
                        })
                      }
                      loading={send.isPending && send.variables?.kind === kind}
                    />
                  )}
                </View>
              )
            })}

            {send.isError ? <Callout tone="danger">{(send.error as Error).message}</Callout> : null}
          </View>
        </VerifiedOnly>
      )}
    </View>
  )
}

/**
 * The services among the member's own posts that fit this trip: in the trip's
 * city, and either always available or overlapping its dates. One of each kind,
 * since two posts of the same service would offer the same thing twice.
 */
export function fittingServices(posts: Availability[], trip: VisibleTrip): ServiceKind[] {
  const kinds = new Set<ServiceKind>()

  for (const post of posts) {
    if (post.status !== 'active' || post.city_id !== trip.city_id) continue

    const overlaps =
      post.always_available ||
      (post.start_date !== null &&
        post.end_date !== null &&
        post.start_date <= trip.end_date &&
        post.end_date >= trip.start_date)
    if (!overlaps) continue

    for (const offer of post.offers) kinds.add(offer as ServiceKind)
  }

  return [...kinds]
}

const styles = StyleSheet.create({
  centre: { flex: 1, alignItems: 'center', justifyContent: 'center' },
  header: { gap: spacing.xs },
  section: { gap: spacing.md },
  list: { gap: spacing.md },
  spinner: { alignSelf: 'flex-start' },
  card: { padding: spacing.lg, borderRadius: radius.md, borderWidth: 1, gap: spacing.sm },
  cardTop: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm },
  grow: { flex: 1 },
})
