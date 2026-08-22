import { formatDateRange, nightCount, type DateRange } from '@gigaway/shared'
import { Stack, useLocalSearchParams, useRouter } from 'expo-router'
import { useState } from 'react'
import { ActivityIndicator, Pressable, StyleSheet, Text, View } from 'react-native'

import { Button } from '@/components/button'
import { Callout } from '@/components/callout'
import { DateRangePicker } from '@/components/date-range-picker'
import { PersonRow } from '@/components/person'
import { Screen } from '@/components/screen'
import { TextField } from '@/components/text-field'
import {
  useCreateOffer,
  useOfferTrip,
  useOfferableWindows,
  type OfferableWindow,
} from '@/features/offers/use-offers'
import { radius, spacing, typography } from '@/theme/tokens'
import { useTheme } from '@/theme/use-theme'

/**
 * The offer form.
 *
 * PARTIAL OFFERS ARE THE POINT. It opens on the full overlap so the generous
 * default costs no taps, and every piece of copy frames a shorter offer as a
 * good outcome — "3 of the 7 nights she needs" is three nights she does not
 * pay for, not a shortfall. A host who believes half an answer is no use
 * simply does not reply, and that is how this product dies quietly.
 *
 * The picker is bounded by offerable_windows, which is the database's own rule
 * about what may be offered. The trigger still enforces it on insert — this is
 * only so the host cannot pick a night that would be rejected.
 */
export default function NewOfferScreen() {
  const theme = useTheme()
  const router = useRouter()
  const { tripId, requestId } = useLocalSearchParams<{ tripId: string; requestId?: string }>()

  const trip = useOfferTrip(tripId)
  const windows = useOfferableWindows(tripId)
  const createOffer = useCreateOffer()

  const [pickedWindowId, setPickedWindowId] = useState<string | null>(null)
  const [pickedRange, setPickedRange] = useState<DateRange | null>(null)
  const [message, setMessage] = useState('')
  const [error, setError] = useState<string | null>(null)

  // Derived, not stored in an effect. The default is the first window —
  // nearest, then earliest — offered in full, so the generous answer is the
  // one that costs no taps.
  const windowList = windows.data ?? []
  const selectedWindow =
    windowList.find((option) => option.availability_id === pickedWindowId) ?? windowList[0] ?? null
  const range =
    pickedRange ??
    (selectedWindow
      ? { start: selectedWindow.window_start, end: selectedWindow.window_end }
      : null)

  const selectWindow = (option: OfferableWindow) => {
    setPickedWindowId(option.availability_id)
    setPickedRange({ start: option.window_start, end: option.window_end })
  }

  if (trip.isPending || windows.isPending) {
    return (
      <View style={[styles.centre, { backgroundColor: theme.bg }]}>
        <ActivityIndicator color={theme.accent} />
      </View>
    )
  }

  const tripRange = trip.data
    ? { start: trip.data.start_date, end: trip.data.end_date }
    : null
  const tripNights = tripRange ? nightCount(tripRange) : 0
  const offeredNights = range ? nightCount(range) : 0
  const firstName = trip.data?.traveller?.display_name?.split(' ')[0] ?? 'They'

  if (windowList.length === 0) {
    return (
      <Screen>
        <Stack.Screen options={{ title: 'Offer nights' }} />
        <Callout title="No availability covering these dates">
          You can only offer nights you have already posted. Add availability for{' '}
          {trip.data?.cities?.name} that overlaps {formatDateRange(trip.data?.start_date, trip.data?.end_date)},
          then come back.
        </Callout>
        <Button
          label="Post availability"
          onPress={() => router.push('/availability/new')}
        />
      </Screen>
    )
  }

  const submit = () => {
    if (!range || !trip.data) return
    setError(null)
    createOffer.mutate(
      {
        tripId: trip.data.id,
        toProfile: trip.data.profile_id,
        range,
        requestId: requestId ?? null,
        message,
      },
      {
        onSuccess: () => router.replace('/requests'),
        // The containment trigger is the real check. Its message is already
        // written for a person, so show it rather than inventing one.
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
            offeredNights > 0
              ? `Offer ${offeredNights} night${offeredNights === 1 ? '' : 's'}`
              : 'Pick your nights'
          }
          onPress={submit}
          disabled={!range}
          loading={createOffer.isPending}
        />
      }
    >
      <Stack.Screen options={{ title: 'Offer nights' }} />

      <PersonRow person={trip.data?.traveller} />

      <Text style={[typography.caption, { color: theme.textMuted }]}>
        {trip.data?.cities?.name} · {formatDateRange(trip.data?.start_date, trip.data?.end_date)}{' '}
        · needs {tripNights} night{tripNights === 1 ? '' : 's'}
      </Text>

      {trip.data?.note ? (
        <Text style={[typography.body, { color: theme.text }]}>“{trip.data.note}”</Text>
      ) : null}

      {/* More than one availability row can cover this trip — a couch at home
          and a spare room in the next town over. Let the host say which. */}
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
      ) : null}

      {/*
        The single most important sentence on this screen. It must read as
        "here is what you are giving", never as "here is what you are failing
        to give".
      */}
      {offeredNights > 0 ? (
        <Callout tone="success" title={coverageTitle(offeredNights, tripNights, firstName)}>
          {offeredNights < tripNights
            ? `${firstName} will look for the rest elsewhere, and ${offeredNights} night${offeredNights === 1 ? '' : 's'} off a hotel bill is real money saved.`
            : `That covers the whole trip.`}
        </Callout>
      ) : null}

      {selectedWindow?.max_nights && offeredNights > selectedWindow.max_nights ? (
        <Callout tone="warning" title="Longer than your usual limit">
          You said {selectedWindow.max_nights} nights maximum for this place. You can still
          offer more — this is only a reminder of what you wrote.
        </Callout>
      ) : null}

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

      <Text style={[typography.caption, { color: theme.textMuted }]}>
        Your contact details stay hidden until they accept. Neither of you sees the other's
        number before that.
      </Text>
    </Screen>
  )
}

function coverageTitle(offered: number, tripNights: number, firstName: string): string {
  if (offered >= tripNights) {
    return `You're offering all ${tripNights} night${tripNights === 1 ? '' : 's'}`
  }
  return `You're offering ${offered} of the ${tripNights} nights ${firstName} needs`
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
