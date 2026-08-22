import { formatDateRange, nightCount } from '@gigaway/shared'
import { Image } from 'expo-image'
import { Stack, useLocalSearchParams, useRouter } from 'expo-router'
import { useEffect } from 'react'
import { ActivityIndicator, StyleSheet, Text, View } from 'react-native'

import { Badge } from '@/components/badge'
import { Button, TextLink } from '@/components/button'
import { Callout } from '@/components/callout'
import { PersonRow } from '@/components/person'
import { Screen } from '@/components/screen'
import {
  isCompletelyEmpty,
  useMatches,
  type HostMatch,
  type TravellerMatch,
} from '@/features/matches/use-matches'
import {
  useAcceptOffer,
  useDeclineOffer,
  useOffersForTrip,
  type Offer,
} from '@/features/offers/use-offers'
import { avatarUrl } from '@/features/profile/use-update-profile'
import { useRequestsForTrip, useSendRequest } from '@/features/requests/use-requests'
import { useTrip } from '@/features/trips/use-trips'
import { track } from '@/lib/analytics'
import { radius, spacing, typography } from '@/theme/tokens'
import { useTheme } from '@/theme/use-theme'

const OFFER_LABELS: Record<string, string> = {
  couch: 'Couch',
  spare_room: 'Spare room',
  tips: 'Local tips',
  coffee: 'Coffee',
}

const CONSTRAINT_LABELS: Record<string, string> = {
  women_only: 'Women only',
  no_pets: 'No pets',
  no_smoking: 'No smoking',
  no_children: 'No children',
  quiet_household: 'Quiet household',
}

const NEED_LABELS: Record<string, string> = {
  couch: 'a place to stay',
  tips: 'local tips',
  company: 'company',
  co_accommodation: 'to split a place',
}

export default function TripMatchesScreen() {
  const theme = useTheme()
  const router = useRouter()
  const { id } = useLocalSearchParams<{ id: string }>()
  const { data: trip } = useTrip(id)
  const matches = useMatches(id)
  const offers = useOffersForTrip(id)
  const sentRequests = useRequestsForTrip(id)

  // Who has already been asked, so a host's button reads "Asked" rather than
  // letting the user tap into a unique-constraint violation.
  const askedProfiles = new Set(
    (sentRequests.data ?? [])
      .filter((request) => request.status !== 'withdrawn')
      .map((request) => request.to_profile),
  )
  const pendingOffers = (offers.data ?? []).filter((offer) => offer.status === 'pending')
  const acceptedOffer = (offers.data ?? []).find((offer) => offer.status === 'accepted')

  const tripNights = trip ? nightCount({ start: trip.start_date, end: trip.end_date }) : 0

  useEffect(() => {
    if (!matches.data) return
    track('matches_viewed', {
      hosts: matches.data.hosts.length,
      travellers: matches.data.travellers.length,
      nearby: matches.data.nearbyHosts.length,
    })
  }, [matches.data])

  if (matches.isPending || !trip) {
    return (
      <View style={[styles.centre, { backgroundColor: theme.bg }]}>
        <ActivityIndicator color={theme.accent} />
      </View>
    )
  }

  const { hosts, travellers, nearbyHosts } = matches.data ?? {
    hosts: [],
    travellers: [],
    nearbyHosts: [],
  }

  return (
    <Screen>
      <Stack.Screen options={{ title: trip.cities?.name ?? 'Matches' }} />

      <View style={styles.header}>
        <Text style={[typography.title, { color: theme.text }]}>
          {trip.cities?.name}
        </Text>
        <Text style={[typography.body, { color: theme.textMuted }]}>
          {formatRange(trip.start_date, trip.end_date)} · {tripNights} night
          {tripNights === 1 ? '' : 's'}
        </Text>
      </View>

      {/* ── Offers ──────────────────────────────────────────────────────────
          Above everything else: an offer is a person waiting on an answer,
          which outranks a list of people who have not replied yet. */}
      {acceptedOffer ? (
        <View style={styles.section}>
          <Callout tone="success" title="You have a couch">
            {acceptedOffer.host?.display_name} is hosting you for{' '}
            {nightCount({ start: acceptedOffer.start_date, end: acceptedOffer.end_date })}{' '}
            night
            {nightCount({ start: acceptedOffer.start_date, end: acceptedOffer.end_date }) === 1
              ? ''
              : 's'}
            , {formatDateRange(acceptedOffer.start_date, acceptedOffer.end_date)}.
          </Callout>
          <Button
            label="See their contact details"
            onPress={() => router.push(`/contact/${acceptedOffer.from_profile}`)}
          />
        </View>
      ) : pendingOffers.length > 0 ? (
        <View style={styles.section}>
          <Text style={[typography.heading, { color: theme.text }]}>
            {pendingOffers.length === 1 ? 'An offer for you' : `${pendingOffers.length} offers for you`}
          </Text>
          {pendingOffers.length > 1 ? (
            <Text style={[typography.caption, { color: theme.textMuted }]}>
              Accepting one lets the others know their nights are free again.
            </Text>
          ) : null}
          {pendingOffers.map((offer) => (
            <OfferCard key={offer.id} offer={offer} tripNights={tripNights} />
          ))}
        </View>
      ) : null}

      {/* ── Hosts ───────────────────────────────────────────────────────── */}
      {hosts.length > 0 ? (
        <View style={styles.section}>
          <Text style={[typography.heading, { color: theme.text }]}>
            {hosts.length} {hosts.length === 1 ? 'host' : 'hosts'} free during your dates
          </Text>
          {hosts.map((host) => (
            <HostCard
              key={host.availabilityId}
              host={host}
              tripNights={tripNights}
              tripId={id}
              asked={askedProfiles.has(host.profile.id)}
            />
          ))}
        </View>
      ) : null}

      {/* ── Travellers ──────────────────────────────────────────────────── */}
      {travellers.length > 0 ? (
        <View style={styles.section}>
          <Text style={[typography.heading, { color: theme.text }]}>Also travelling</Text>
          <Text style={[typography.caption, { color: theme.textMuted }]}>
            Artists heading to {trip.cities?.name} the same week. You might split a place.
          </Text>
          {travellers.map((traveller) => (
            <TravellerCard
              key={traveller.tripId}
              traveller={traveller}
              tripId={id}
              asked={askedProfiles.has(traveller.profile.id)}
            />
          ))}
        </View>
      ) : null}

      {/* ── Nearby ──────────────────────────────────────────────────────── */}
      {nearbyHosts.length > 0 ? (
        <View style={styles.section}>
          <Text style={[typography.heading, { color: theme.text }]}>Nearby</Text>
          <Text style={[typography.caption, { color: theme.textMuted }]}>
            {hosts.length === 0
              ? `Nobody in ${trip.cities?.name} for these dates — but these are close.`
              : 'A little further out, if the dates above do not work.'}
          </Text>
          {nearbyHosts.map((host) => (
            <HostCard
              key={host.availabilityId}
              host={host}
              tripNights={tripNights}
              tripId={id}
              asked={askedProfiles.has(host.profile.id)}
            />
          ))}
        </View>
      ) : null}

      {/* ── Empty states ────────────────────────────────────────────────── */}
      {isCompletelyEmpty(matches.data) ? (
        <Callout title={`You're early in ${trip.cities?.name}`}>
          Nobody has posted availability for these dates yet. That will change as more
          colleagues join — and your trip stays visible, so a host arriving next week can
          still find you.
        </Callout>
      ) : hosts.length === 0 && nearbyHosts.length === 0 && travellers.length > 0 ? (
        <Callout title="No couches yet">
          But {travellers.length === 1 ? 'another artist is' : `${travellers.length} other artists are`} in{' '}
          {trip.cities?.name} that week — splitting a flat is often cheaper than a hotel.
        </Callout>
      ) : null}

      {isCompletelyEmpty(matches.data) ? (
        <Button
          label="Invite a colleague"
          variant="secondary"
          onPress={() => router.push('/')}
        />
      ) : null}

    </Screen>
  )
}

function HostCard({
  host,
  tripNights,
  tripId,
  asked,
}: {
  host: HostMatch
  tripNights: number
  tripId: string
  asked: boolean
}) {
  const theme = useTheme()
  const sendRequest = useSendRequest()
  const photo = avatarUrl(host.profile.photoPath)
  const partial = host.overlapNights < tripNights

  return (
    <View style={[styles.card, { backgroundColor: theme.bgSubtle, borderColor: theme.border }]}>
      <View style={styles.cardHeader}>
        <View style={[styles.avatar, { backgroundColor: theme.bgRaised }]}>
          {photo ? <Image source={{ uri: photo }} style={styles.avatarImage} contentFit="cover" /> : null}
        </View>
        <View style={styles.cardHeaderText}>
          <Text style={[typography.bodyStrong, { color: theme.text }]}>
            {host.profile.displayName}
          </Text>
          <Text style={[typography.caption, { color: theme.textMuted }]}>
            {[host.profile.specialisation ?? host.profile.discipline, host.profile.homeDistrict]
              .filter(Boolean)
              .join(' · ')}
            {host.distanceKm > 0 ? ` · ${host.cityName}, ${host.distanceKm} km` : ''}
          </Text>
        </View>
      </View>

      {/*
        Overlap nights lead, not the host's raw window. Partial coverage is the
        product working, not falling short — three nights not paid for is three
        nights not paid for.
      */}
      <Text style={[typography.bodyStrong, { color: theme.accent }]}>
        {host.overlapNights} of your {tripNights} night{tripNights === 1 ? '' : 's'}
        {partial ? '' : ' — the whole trip'}
      </Text>
      <Text style={[typography.caption, { color: theme.textMuted }]}>
        {formatRange(host.overlap.start, host.overlap.end)}
        {host.maxNights ? ` · up to ${host.maxNights} nights` : ''}
      </Text>

      <View style={styles.tags}>
        {host.offers.map((offer) => (
          <Tag key={offer} label={OFFER_LABELS[offer] ?? offer} tone="accent" />
        ))}
        {host.constraints.map((constraint) => (
          <Tag
            key={constraint}
            label={CONSTRAINT_LABELS[constraint] ?? constraint}
            tone={constraint === 'women_only' ? 'warning' : 'muted'}
          />
        ))}
      </View>

      {/*
        One tap, no form. Asking is the action this product needs to happen
        most often, and putting a message box in the way turns it into a small
        piece of writing that people put off. The host can be told more later,
        on WhatsApp, once there is something to arrange.
      */}
      {asked ? (
        <View style={styles.action}>
          <Badge label="Asked" tone="accent" />
          <Text style={[typography.caption, { color: theme.textMuted }]}>
            They will see it next time they open the app.
          </Text>
        </View>
      ) : (
        <Button
          label="Ask about these nights"
          onPress={() =>
            sendRequest.mutate({
              kind: 'host_stay',
              tripId,
              toProfile: host.profile.id,
            })
          }
          loading={sendRequest.isPending}
          style={styles.actionButton}
        />
      )}
    </View>
  )
}

function TravellerCard({
  traveller,
  tripId,
  asked,
}: {
  traveller: TravellerMatch
  tripId: string
  asked: boolean
}) {
  const theme = useTheme()
  const sendRequest = useSendRequest()
  const photo = avatarUrl(traveller.profile.photoPath)

  return (
    <View style={[styles.card, { backgroundColor: theme.bgSubtle, borderColor: theme.border }]}>
      <View style={styles.cardHeader}>
        <View style={[styles.avatar, { backgroundColor: theme.bgRaised }]}>
          {photo ? <Image source={{ uri: photo }} style={styles.avatarImage} contentFit="cover" /> : null}
        </View>
        <View style={styles.cardHeaderText}>
          <Text style={[typography.bodyStrong, { color: theme.text }]}>
            {traveller.profile.displayName}
          </Text>
          <Text style={[typography.caption, { color: theme.textMuted }]}>
            {traveller.profile.specialisation ?? traveller.profile.discipline}
          </Text>
        </View>
      </View>

      <Text style={[typography.caption, { color: theme.textMuted }]}>
        {formatRange(traveller.overlap.start, traveller.overlap.end)} · overlapping{' '}
        {traveller.overlapNights} night{traveller.overlapNights === 1 ? '' : 's'}
      </Text>

      {traveller.needs.length > 0 ? (
        <Text style={[typography.caption, { color: theme.textMuted }]}>
          Looking for {traveller.needs.map((need) => NEED_LABELS[need] ?? need).join(', ')}
        </Text>
      ) : null}

      {/*
        Co-accommodation has no offer step: neither of them has a couch, so
        there is nothing to negotiate here. Accepting reveals contact and they
        book something together off-platform.
      */}
      {asked ? (
        <View style={styles.action}>
          <Badge label="Asked" tone="accent" />
        </View>
      ) : (
        <Button
          label="Ask about splitting a place"
          variant="secondary"
          onPress={() =>
            sendRequest.mutate({
              kind: 'co_accommodation',
              tripId,
              toProfile: traveller.profile.id,
            })
          }
          loading={sendRequest.isPending}
          style={styles.actionButton}
        />
      )}
    </View>
  )
}

/**
 * An offer waiting on an answer.
 *
 * The nights lead, and a partial offer is stated as a gain — "4 of your 7
 * nights" — never as a shortfall. Accepting is deliberately one clear primary
 * action; it is the moment the whole product exists for.
 */
function OfferCard({ offer, tripNights }: { offer: Offer; tripNights: number }) {
  const theme = useTheme()
  const router = useRouter()
  const acceptOffer = useAcceptOffer()
  const declineOffer = useDeclineOffer()

  const nights = nightCount({ start: offer.start_date, end: offer.end_date })
  const partial = nights < tripNights

  return (
    <View style={[styles.card, { backgroundColor: theme.bgSubtle, borderColor: theme.accent }]}>
      <PersonRow person={offer.host} />

      <Text style={[typography.bodyStrong, { color: theme.accent }]}>
        {partial ? `${nights} of your ${tripNights} nights` : `All ${tripNights} nights`}
      </Text>
      <Text style={[typography.caption, { color: theme.textMuted }]}>
        {formatDateRange(offer.start_date, offer.end_date)}
        {offer.cities?.name ? ` · ${offer.cities.name}` : ''}
      </Text>

      {offer.message ? (
        <Text style={[typography.body, { color: theme.text, marginTop: spacing.xs }]}>
          “{offer.message}”
        </Text>
      ) : null}

      <Button
        label="Accept"
        onPress={() =>
          acceptOffer.mutate(offer.id, {
            onSuccess: () => router.push(`/contact/${offer.from_profile}`),
          })
        }
        loading={acceptOffer.isPending}
        style={styles.actionButton}
      />
      <TextLink label="No thanks" onPress={() => declineOffer.mutate(offer.id)} />
    </View>
  )
}

function Tag({ label, tone }: { label: string; tone: 'accent' | 'muted' | 'warning' }) {
  const theme = useTheme()
  const background = {
    accent: theme.accentSubtle,
    muted: theme.bgRaised,
    warning: theme.warningSubtle,
  }[tone]
  const colour = { accent: theme.text, muted: theme.textMuted, warning: theme.warning }[tone]

  return (
    <View style={[styles.tag, { backgroundColor: background }]}>
      <Text style={[typography.caption, { color: colour }]}>{label}</Text>
    </View>
  )
}

/** "3–10 March" / "28 Feb – 3 March" — compact, and never ambiguous about order. */
function formatRange(start: string, end: string): string {
  const from = new Date(`${start}T00:00:00Z`)
  const to = new Date(`${end}T00:00:00Z`)
  const sameMonth = start.slice(0, 7) === end.slice(0, 7)
  const month = (date: Date) =>
    date.toLocaleDateString('en-GB', { month: 'long', timeZone: 'UTC' })
  const day = (date: Date) => date.toLocaleDateString('en-GB', { day: 'numeric', timeZone: 'UTC' })

  return sameMonth
    ? `${day(from)}–${day(to)} ${month(to)}`
    : `${day(from)} ${month(from)} – ${day(to)} ${month(to)}`
}

const styles = StyleSheet.create({
  centre: { flex: 1, alignItems: 'center', justifyContent: 'center' },
  header: { gap: spacing.xs },
  section: { gap: spacing.md },
  card: {
    padding: spacing.lg,
    borderRadius: radius.md,
    borderWidth: StyleSheet.hairlineWidth,
    gap: spacing.xs,
  },
  cardHeader: { flexDirection: 'row', alignItems: 'center', gap: spacing.md, marginBottom: spacing.xs },
  cardHeaderText: { flex: 1, gap: 2 },
  avatar: { width: 44, height: 44, borderRadius: radius.pill, overflow: 'hidden' },
  avatarImage: { width: '100%', height: '100%' },
  tags: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.sm, marginTop: spacing.sm },
  action: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm, marginTop: spacing.md },
  actionButton: { marginTop: spacing.md },
  tag: {
    paddingHorizontal: spacing.sm,
    paddingVertical: 4,
    borderRadius: radius.sm,
  },
})
