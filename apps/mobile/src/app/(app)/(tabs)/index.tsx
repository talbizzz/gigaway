import {
  formatDateRange,
  nightCount,
  notificationCopy,
  notificationRoute,
} from '@gigaway/shared'
import { useRouter } from 'expo-router'
import { Pressable, StyleSheet, Text, View } from 'react-native'

import { Button, TextLink } from '@/components/button'
import { Callout } from '@/components/callout'
import { PersonRow, personFrom } from '@/components/person'
import { Screen } from '@/components/screen'
import { useDismissRequest, useDismissedRequests } from '@/features/feed/use-dismissed-requests'
import {
  useHomeFeed,
  type FeedDestination,
  type FeedPerson,
  type FeedVisitor,
} from '@/features/feed/use-home-feed'
import {
  useMarkNotificationRead,
  useNotifications,
} from '@/features/notifications/use-notifications'
import { useMyProfile } from '@/features/profile/use-profile'
import { useIncomingRequests, type StayRequest } from '@/features/requests/use-requests'
import { useReviewableStays } from '@/features/reviews/use-reviews'
import { useCancelTrip, useMyTrips, type Trip } from '@/features/trips/use-trips'
import { radius, spacing, typography } from '@/theme/tokens'
import { useTheme } from '@/theme/use-theme'

/**
 * The feed.
 *
 * This screen used to be the member's own filing — their trips, their couch,
 * their invite codes — which meant there was no reason to open the app unless
 * you were posting something. It is now about who is around: colleagues in your
 * city today, colleagues arriving this month, and who will be in the city you
 * are about to travel to.
 *
 * Anything actually waiting on an answer sits above all of it as a card that
 * can be swept away, so the feed can be read without being a to-do list.
 */
export default function HomeScreen() {
  const theme = useTheme()
  const router = useRouter()

  const { data: profile } = useMyProfile()
  const trips = useMyTrips()
  const feed = useHomeFeed()
  const reviewable = useReviewableStays()
  const incoming = useIncomingRequests()
  const notifications = useNotifications()

  const dismissed = useDismissedRequests()
  const dismissRequest = useDismissRequest()
  const markRead = useMarkNotificationRead()

  const owedReviews = reviewable.data ?? []
  const activeTrips = (trips.data ?? []).filter((trip) => trip.status === 'active')

  const pendingRequests = (incoming.data ?? []).filter((row) => row.status === 'pending')
  const dismissedIds = new Set(dismissed.data ?? [])
  const requestCards = pendingRequests.filter((row) => !dismissedIds.has(row.id))
  const activityCards = (notifications.data ?? []).filter((row) => row.read_at === null)

  const inYourCity = feed.data?.inYourCity ?? []
  const comingToYourCity = feed.data?.comingToYourCity ?? []
  const destinations = feed.data?.destinations ?? []
  const cityName = feed.data?.homeCityName

  const nothingAtAll =
    requestCards.length === 0 &&
    activityCards.length === 0 &&
    owedReviews.length === 0 &&
    activeTrips.length === 0 &&
    inYourCity.length === 0 &&
    comingToYourCity.length === 0 &&
    destinations.length === 0

  return (
    <Screen>
      <Text style={[typography.title, { color: theme.text }]}>
        Hello, {profile?.display_name?.split(' ')[0] ?? 'there'}
      </Text>

      {/*
        Waiting on you. Requests first: a colleague who asked and heard nothing
        is the worst outcome this product has, and it stays on the card until
        it is answered or swept aside. Sweeping a request is local — it has not
        been answered just because it was pushed out of the way — while sweeping
        an activity card marks it read, which is exactly what it means.
      */}
      {requestCards.map((request) => (
        <RequestCard
          key={request.id}
          request={request}
          onPress={() => router.push('/requests')}
          onDismiss={() =>
            dismissRequest.mutate({
              id: request.id,
              liveIds: pendingRequests.map((row) => row.id),
            })
          }
        />
      ))}

      {activityCards.map((row) => {
        const payload = row.payload ?? {}
        const copy = notificationCopy(row.type, payload)

        return (
          <FeedCard
            key={row.id}
            title={copy.title}
            body={copy.body}
            onPress={() => router.push(notificationRoute(row.type, payload) as never)}
            onDismiss={() => markRead.mutate(row.id)}
          />
        )
      })}

      {/*
        Reviews owed. The only thing here with a deadline attached — the window
        closes after a fortnight and the chance is gone — so it outranks the
        feed proper but not somebody waiting on an answer.
      */}
      {owedReviews.map((stay) => (
        <ReviewPromptCard key={stay.id} stayId={stay.id} city={stay.cities?.name} />
      ))}

      {/* Deliberately vague: the reason is a network or a schema problem, and
          neither is the member's to act on. Saying nothing at all would be
          worse — an empty feed reads as "nobody is around". */}
      {feed.isError ? (
        <Callout tone="warning" title="Could not load who is around">
          Your trips and anything waiting on you are still here. Pull again in a
          moment for the rest.
        </Callout>
      ) : null}

      {nothingAtAll && !feed.isError ? (
        <Callout title="Nothing here yet">
          Post a trip and this fills up with the colleagues who will be there. Until
          then there is nobody to show you.
        </Callout>
      ) : null}

      {/* ── Your trips ──────────────────────────────────────────────────── */}
      {activeTrips.length > 0 ? (
        <View style={styles.section}>
          <Text style={[typography.heading, { color: theme.text }]}>Your trips</Text>
          {activeTrips.map((trip) => (
            <TripRow
              key={trip.id}
              trip={trip}
              onPress={() => router.push(`/trip/${trip.id}`)}
            />
          ))}
        </View>
      ) : null}

      {/* ── Who is here now ─────────────────────────────────────────────── */}
      {inYourCity.length > 0 ? (
        <View style={styles.section}>
          <Text style={[typography.heading, { color: theme.text }]}>
            In {cityName ?? 'your city'} now
          </Text>
          <Text style={[typography.caption, { color: theme.textMuted }]}>
            Colleagues whose trip is running today. A couch, or just a coffee.
          </Text>
          {inYourCity.map((visitor) => (
            <VisitorRow key={visitor.tripId} visitor={visitor} />
          ))}
        </View>
      ) : null}

      {/* ── Who is on the way ───────────────────────────────────────────── */}
      {comingToYourCity.length > 0 ? (
        <View style={styles.section}>
          <Text style={[typography.heading, { color: theme.text }]}>
            Coming to {cityName ?? 'your city'}
          </Text>
          <Text style={[typography.caption, { color: theme.textMuted }]}>
            Arriving within the month.
          </Text>
          {comingToYourCity.map((visitor) => (
            <VisitorRow key={visitor.tripId} visitor={visitor} />
          ))}
        </View>
      ) : null}

      {/* ── Who will be where you are going ─────────────────────────────── */}
      {destinations.map((destination) => (
        <DestinationSection key={destination.tripId} destination={destination} />
      ))}
    </Screen>
  )
}

/**
 * A request, as the feed shows it: who asked and for what, with the answering
 * left to the Requests screen. Deciding is a screen's worth of context — dates,
 * how many nights, what else you have on — and none of that belongs on a card.
 */
function RequestCard({
  request,
  onPress,
  onDismiss,
}: {
  request: StayRequest
  onPress: () => void
  onDismiss: () => void
}) {
  const name = request.sender?.display_name ?? 'A colleague'
  const city = request.trips?.cities?.name
  const dates = formatDateRange(request.trips?.start_date, request.trips?.end_date)

  return (
    <FeedCard
      title={
        request.kind === 'co_accommodation'
          ? `${name} wants to split a place`
          : `${name} asked about your couch`
      }
      body={[city, dates].filter(Boolean).join(', ')}
      onPress={onPress}
      onDismiss={onDismiss}
    />
  )
}

/** The card shape shared by requests and activity. */
function FeedCard({
  title,
  body,
  onPress,
  onDismiss,
}: {
  title: string
  body: string
  onPress: () => void
  onDismiss: () => void
}) {
  const theme = useTheme()

  return (
    <View style={[styles.card, { backgroundColor: theme.accentSubtle }]}>
      <Pressable
        accessibilityRole="button"
        accessibilityLabel={`${title}. ${body}`}
        onPress={onPress}
        style={({ pressed }) => [styles.cardBody, pressed && styles.pressed]}
      >
        <Text style={[typography.bodyStrong, { color: theme.text }]}>{title}</Text>
        <Text style={[typography.caption, { color: theme.textMuted }]}>{body}</Text>
      </Pressable>

      <Pressable
        accessibilityRole="button"
        accessibilityLabel="Dismiss"
        onPress={onDismiss}
        hitSlop={12}
        style={({ pressed }) => [pressed && styles.pressed]}
      >
        <Text style={[styles.dismiss, { color: theme.textMuted }]}>×</Text>
      </Pressable>
    </View>
  )
}

/** Somebody whose own trip brings them here. */
function VisitorRow({ visitor }: { visitor: FeedVisitor }) {
  const router = useRouter()

  return (
    <PersonRow
      person={personFrom(visitor.profile)}
      size={36}
      trailing={formatDateRange(visitor.start, visitor.end)}
      onPress={() => router.push(`/member/${visitor.profile.id}`)}
    />
  )
}

/**
 * Who will be in a city this member is travelling to — the first few, with the
 * rest left to the trip screen, which already ranks them properly and is where
 * asking happens.
 */
function DestinationSection({ destination }: { destination: FeedDestination }) {
  const theme = useTheme()
  const router = useRouter()
  const nights = nightCount({ start: destination.start, end: destination.end })

  return (
    <View style={styles.section}>
      <Text style={[typography.heading, { color: theme.text }]}>
        In {destination.cityName} when you are
      </Text>
      <Text style={[typography.caption, { color: theme.textMuted }]}>
        {formatDateRange(destination.start, destination.end)} · {nights} night
        {nights === 1 ? '' : 's'}
      </Text>

      {destination.people.length === 0 ? (
        <Callout>
          Nobody yet. The list fills as colleagues post trips and free nights, so it is
          worth looking again closer to the date.
        </Callout>
      ) : (
        destination.people.map((person) => (
          <PersonRow
            key={person.profile.id}
            person={personFrom(person.profile)}
            size={36}
            trailing={KIND_LABELS[person.kind]}
            onPress={() => router.push(`/member/${person.profile.id}`)}
          />
        ))
      )}

      {destination.total > destination.people.length ? (
        <TextLink
          label={`See everyone in ${destination.cityName}`}
          onPress={() => router.push(`/trip/${destination.tripId}`)}
        />
      ) : null}
    </View>
  )
}

const KIND_LABELS: Record<FeedPerson['kind'], string> = {
  host: 'offering nights',
  local: 'lives there',
  traveller: 'travelling there',
}

function ReviewPromptCard({ stayId, city }: { stayId: string; city?: string }) {
  const theme = useTheme()
  const router = useRouter()

  return (
    <View style={[styles.prompt, { backgroundColor: theme.accentSubtle }]}>
      <Text style={[typography.bodyStrong, { color: theme.text }]}>
        How was your stay{city ? ` in ${city}` : ''}?
      </Text>
      <Text style={[typography.caption, { color: theme.textMuted }]}>
        Neither of you sees the other&apos;s review until you have both written one.
      </Text>
      <Button label="Write a review" onPress={() => router.push(`/review/${stayId}`)} />
    </View>
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
        <Text style={[typography.bodyStrong, { color: theme.text }]}>
          {trip.cities?.name}
        </Text>
        <Text style={[typography.caption, { color: theme.textMuted }]}>
          {trip.start_date} → {trip.end_date} · {nights} night
          {nights === 1 ? '' : 's'}
        </Text>
      </View>
      <View style={styles.rowActions}>
        <TextLink label="Edit" onPress={() => router.push(`/trip/edit/${trip.id}`)} />
        <TextLink label="Cancel" onPress={() => cancel.mutate(trip.id)} />
      </View>
    </Pressable>
  )
}

const styles = StyleSheet.create({
  section: { gap: spacing.md },
  prompt: { padding: spacing.lg, borderRadius: radius.md, gap: spacing.sm },
  card: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: spacing.md,
    padding: spacing.lg,
    borderRadius: radius.md,
  },
  cardBody: { flex: 1, minWidth: 0, gap: 2 },
  dismiss: { fontSize: 22, lineHeight: 24 },
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
})
