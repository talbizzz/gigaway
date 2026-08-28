import { formatDateRange, nightCount, type DateRange } from '@gigaway/shared'
import { Stack, useLocalSearchParams, useRouter } from 'expo-router'
import { useState } from 'react'
import { ActivityIndicator, Pressable, StyleSheet, Text, View } from 'react-native'

import { Button, TextLink } from '@/components/button'
import { Callout } from '@/components/callout'
import { DateRangePicker } from '@/components/date-range-picker'
import { PersonRow } from '@/components/person'
import { Screen } from '@/components/screen'
import { TextField } from '@/components/text-field'
import {
  useOffer,
  useOfferableWindows,
  useUpdateOffer,
  useWithdrawOffer,
  type Offer,
  type OfferableWindow,
} from '@/features/offers/use-offers'
import { radius, spacing, typography } from '@/theme/tokens'
import { useTheme } from '@/theme/use-theme'

/**
 * Revising an offer that has not been answered.
 *
 * This exists because answering a request twice used to be possible: a host
 * could leave two overlapping offers on one trip and the traveller could
 * accept either. There is now one live offer per host per trip, enforced by a
 * unique index, and this is the screen that changes it.
 *
 * The traveller is notified again when the nights or the note change, because
 * an offer silently shrinking from five nights to two is the failure this
 * screen would otherwise introduce.
 */
export default function EditOfferScreen() {
  const theme = useTheme()
  const { id } = useLocalSearchParams<{ id: string }>()
  const offer = useOffer(id)

  if (offer.isPending) {
    return (
      <View style={[styles.centre, { backgroundColor: theme.bg }]}>
        <Stack.Screen options={{ title: 'Change your offer' }} />
        <ActivityIndicator color={theme.accent} />
      </View>
    )
  }

  if (!offer.data) {
    return (
      <Screen>
        <Stack.Screen options={{ title: 'Change your offer' }} />
        <Callout title="Not available">This offer no longer exists.</Callout>
      </Screen>
    )
  }

  // Only an unanswered offer can be revised — the database says so too, and
  // saying it here avoids a form that submits into a 42501.
  if (offer.data.status !== 'pending') {
    return (
      <Screen>
        <Stack.Screen options={{ title: 'Your offer' }} />
        <Callout title="Already answered">
          {offer.data.status === 'accepted'
            ? 'This offer was accepted, so the nights are settled. Sort anything else out with them directly.'
            : 'This offer is closed. You can make a new one from their trip.'}
        </Callout>
      </Screen>
    )
  }

  return <EditOfferForm key={offer.data.id} offer={offer.data} />
}

function EditOfferForm({ offer }: { offer: Offer }) {
  const theme = useTheme()
  const router = useRouter()
  const windows = useOfferableWindows(offer.trip_id)
  const updateOffer = useUpdateOffer()
  const withdrawOffer = useWithdrawOffer()

  const [pickedWindowId, setPickedWindowId] = useState<string | null>(null)
  const [pickedRange, setPickedRange] = useState<DateRange | null>(null)
  const [message, setMessage] = useState(offer.message ?? '')
  const [error, setError] = useState<string | null>(null)

  const windowList = windows.data ?? []

  // Seeded from the offer as it stands, not from the first window: the host
  // came here to change what they already said, so that is what the form has
  // to open on.
  const selectedWindow =
    windowList.find((option) => option.availability_id === pickedWindowId) ??
    windowList.find((option) =>
      option.window_start <= offer.start_date && option.window_end >= offer.end_date,
    ) ??
    windowList[0] ??
    null

  const range = pickedRange ?? { start: offer.start_date, end: offer.end_date }

  const selectWindow = (option: OfferableWindow) => {
    setPickedWindowId(option.availability_id)
    setPickedRange({ start: option.window_start, end: option.window_end })
  }

  const trip = offer.trips
  const tripNights = trip ? nightCount({ start: trip.start_date, end: trip.end_date }) : 0
  const offeredNights = nightCount(range)
  const firstName = offer.traveller?.display_name?.split(' ')[0] ?? 'They'

  const changed =
    range.start !== offer.start_date ||
    range.end !== offer.end_date ||
    (message.trim() || null) !== (offer.message ?? null)

  if (windows.isPending) {
    return (
      <View style={[styles.centre, { backgroundColor: theme.bg }]}>
        <ActivityIndicator color={theme.accent} />
      </View>
    )
  }

  const submit = () => {
    setError(null)
    updateOffer.mutate(
      { offerId: offer.id, tripId: offer.trip_id, range, message },
      {
        onSuccess: () => router.back(),
        // The containment trigger is the real check, and its message is
        // already written for a person.
        onError: (cause) =>
          setError(
            cause instanceof Error
              ? cause.message
              : 'Those nights could not be offered. Check your availability.',
          ),
      },
    )
  }

  return (
    <Screen
      footer={
        <Button
          label={
            changed
              ? `Offer ${offeredNights} night${offeredNights === 1 ? '' : 's'} instead`
              : `Offering ${offeredNights} night${offeredNights === 1 ? '' : 's'}`
          }
          onPress={submit}
          disabled={!changed}
          loading={updateOffer.isPending}
        />
      }
    >
      <Stack.Screen options={{ title: 'Change your offer' }} />

      <PersonRow
        person={offer.traveller}
        onPress={() => router.push(`/member/${offer.to_profile}`)}
      />

      <Text style={[typography.caption, { color: theme.textMuted }]}>
        {offer.cities?.name ?? trip?.cities?.name} ·{' '}
        {formatDateRange(trip?.start_date, trip?.end_date)} · needs {tripNights} night
        {tripNights === 1 ? '' : 's'}
      </Text>

      <Callout tone="neutral" title="They have already been told about this offer">
        {firstName} was sent your original {nightCount({ start: offer.start_date, end: offer.end_date })}{' '}
        night
        {nightCount({ start: offer.start_date, end: offer.end_date }) === 1 ? '' : 's'} (
        {formatDateRange(offer.start_date, offer.end_date)}). Changing it here tells them
        again, with the new nights.
      </Callout>

      {windowList.length > 1 ? (
        <View style={styles.section}>
          <Text style={[typography.captionStrong, { color: theme.textMuted }]}>
            WHICH PLACE
          </Text>
          <View style={styles.windows}>
            {windowList.map((option) => {
              const selected = option.availability_id === selectedWindow?.availability_id
              return (
                <Pressable
                  key={option.availability_id}
                  accessibilityRole="button"
                  accessibilityState={{ selected }}
                  onPress={() => selectWindow(option)}
                  style={[
                    styles.window,
                    {
                      backgroundColor: selected ? theme.accentSubtle : theme.bgSubtle,
                      borderColor: selected ? theme.accent : theme.border,
                    },
                  ]}
                >
                  <Text style={[typography.bodyStrong, { color: theme.text }]}>
                    {option.city_name}
                    {option.distance_km > 0 ? ` · ${option.distance_km} km away` : ''}
                  </Text>
                  <Text style={[typography.caption, { color: theme.textMuted }]}>
                    {formatDateRange(option.window_start, option.window_end)}
                  </Text>
                </Pressable>
              )
            })}
          </View>
        </View>
      ) : null}

      {selectedWindow ? (
        <DateRangePicker
          label="Nights you can offer"
          value={range}
          onChange={setPickedRange}
          windowStart={selectedWindow.window_start}
          windowEnd={selectedWindow.window_end}
          hint={`You are free ${formatDateRange(selectedWindow.window_start, selectedWindow.window_end)}. Offer any part of it.`}
        />
      ) : (
        <Callout tone="warning" title="No availability covers these nights any more">
          You can still withdraw this offer. To offer different nights, post availability
          that covers them first.
        </Callout>
      )}

      <TextField
        label="A note (optional)"
        value={message}
        onChangeText={setMessage}
        placeholder="Which nights suit, how to find you, anything they should know."
        multiline
        numberOfLines={3}
        maxLength={500}
        style={styles.note}
      />

      {error ? <Callout tone="danger">{error}</Callout> : null}

      {/* The way out, for a host whose plans fell through entirely. */}
      <TextLink
        label="Withdraw this offer"
        onPress={() =>
          withdrawOffer.mutate(offer.id, { onSuccess: () => router.back() })
        }
      />
    </Screen>
  )
}

const styles = StyleSheet.create({
  centre: { flex: 1, alignItems: 'center', justifyContent: 'center' },
  section: { gap: spacing.sm },
  windows: { gap: spacing.sm },
  window: {
    padding: spacing.lg,
    borderRadius: radius.md,
    borderWidth: 1,
    gap: 2,
  },
  note: { minHeight: 90, textAlignVertical: 'top', paddingTop: spacing.md },
})
