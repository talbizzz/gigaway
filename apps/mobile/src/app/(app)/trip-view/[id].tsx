import { formatDateRange, nightCount } from '@gigaway/shared'
import { Redirect, Stack, useLocalSearchParams, useRouter } from 'expo-router'
import { ActivityIndicator, StyleSheet, Text, View } from 'react-native'

import { Badge } from '@/components/badge'
import { Button, TextLink } from '@/components/button'
import { Callout } from '@/components/callout'
import { PersonRow } from '@/components/person'
import { Screen } from '@/components/screen'
import { VerifiedOnly } from '@/components/verified-only'
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
 * or from someone's profile. You do not need to have been asked, and you do not
 * need to have posted anything: a place to stay, a coffee or local tips each go
 * straight to this person alone.
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
 * What you can offer this person: somewhere to stay, a coffee, or local tips, each
 * one tap from being sent to them and only them. A stay opens the nights form,
 * because nights have to be chosen; a coffee or tips are sent straight away.
 */
function OfferSection({ trip }: { trip: VisibleTrip }) {
  const theme = useTheme()
  const router = useRouter()
  const sentOffers = useSentOffers()
  const sentServiceOffers = useSentServiceOffers()
  const send = useSendServiceOffer()
  const answer = useAnswerServiceOffer()

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

      <VerifiedOnly>
        <View style={styles.list}>
          <View
            style={[styles.card, { backgroundColor: theme.bgSubtle, borderColor: theme.border }]}
          >
            <View style={styles.cardTop}>
              <Text style={[typography.bodyStrong, styles.grow, { color: theme.text }]}>
                A place to stay
              </Text>
              {nightsOffered ? <Badge label="Offered" tone="accent" /> : null}
            </View>
            {nightsOffered ? null : (
              <Button
                label="Offer nights"
                onPress={() => router.push({ pathname: '/offer/new', params: { tripId: trip.id } })}
              />
            )}
          </View>

          {SENT_DIRECT.map(({ kind, title, action }) => {
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
                    {title}
                  </Text>
                  {live ? (
                    <Badge
                      label={sent.status === 'accepted' ? 'Accepted' : 'Offered'}
                      tone={sent.status === 'accepted' ? 'success' : 'accent'}
                    />
                  ) : null}
                </View>

                {live ? (
                  sent.status === 'pending' ? (
                    <TextLink
                      label="Withdraw"
                      onPress={() => answer.mutate({ id: sent.id, status: 'withdrawn' })}
                    />
                  ) : null
                ) : (
                  <Button
                    label={action}
                    onPress={() =>
                      send.mutate({ kind, tripId: trip.id, toProfile: trip.profile_id })
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
    </View>
  )
}

const SENT_DIRECT: { kind: ServiceOfferKind; title: string; action: string }[] = [
  { kind: 'coffee', title: 'Coffee', action: 'Offer a coffee' },
  { kind: 'tips', title: 'Local tips', action: 'Offer local tips' },
]

const styles = StyleSheet.create({
  centre: { flex: 1, alignItems: 'center', justifyContent: 'center' },
  header: { gap: spacing.xs },
  section: { gap: spacing.md },
  list: { gap: spacing.md },
  card: { padding: spacing.lg, borderRadius: radius.md, borderWidth: 1, gap: spacing.sm },
  cardTop: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm },
  grow: { flex: 1 },
})
