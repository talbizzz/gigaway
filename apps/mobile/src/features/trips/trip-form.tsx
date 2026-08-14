import { nightCount, type DateRange } from '@gigaway/shared'
import { useState } from 'react'
import { Pressable, StyleSheet, Text, View } from 'react-native'

import { Button } from '@/components/button'
import { Callout } from '@/components/callout'
import { CityPicker, type City } from '@/components/city-picker'
import { DateRangePicker } from '@/components/date-range-picker'
import { Screen } from '@/components/screen'
import { TextField } from '@/components/text-field'
import { TRIP_NEEDS, type TripNeed } from '@/features/trips/use-trips'
import { radius, spacing, typography } from '@/theme/tokens'
import { useTheme } from '@/theme/use-theme'

export type TripFormValues = {
  city: City
  range: DateRange
  needs: TripNeed[]
  note: string
}

/**
 * Shared by the create and edit screens so the two cannot drift — a trip edited
 * through a different form than it was created with is how validation rules
 * quietly diverge.
 */
export function TripForm({
  initial,
  submitLabel,
  onSubmit,
  submitting,
  error,
}: {
  initial?: Partial<TripFormValues>
  submitLabel: string
  onSubmit: (values: TripFormValues) => void
  submitting: boolean
  error?: string
}) {
  const theme = useTheme()

  const [city, setCity] = useState<City | null>(initial?.city ?? null)
  const [range, setRange] = useState<DateRange | null>(initial?.range ?? null)
  const [needs, setNeeds] = useState<TripNeed[]>(initial?.needs ?? ['couch'])
  const [note, setNote] = useState(initial?.note ?? '')

  const toggleNeed = (need: TripNeed) =>
    setNeeds((current) =>
      current.includes(need) ? current.filter((n) => n !== need) : [...current, need],
    )

  const ready = Boolean(city && range && needs.length > 0)
  const nights = range ? nightCount(range) : 0

  return (
    <Screen
      footer={
        <Button
          label={submitLabel}
          onPress={() => city && range && onSubmit({ city, range, needs, note })}
          loading={submitting}
          disabled={!ready}
        />
      }
    >
      <CityPicker label="Where are you going?" value={city} onChange={setCity} />

      <DateRangePicker label="When?" value={range} onChange={setRange} />

      <View style={styles.section}>
        <Text style={[typography.captionStrong, { color: theme.textMuted }]}>
          WHAT ARE YOU AFTER?
        </Text>
        <View style={styles.chips}>
          {TRIP_NEEDS.map((need) => {
            const selected = needs.includes(need.value)
            return (
              <Pressable
                key={need.value}
                accessibilityRole="checkbox"
                accessibilityState={{ checked: selected }}
                onPress={() => toggleNeed(need.value)}
                style={({ pressed }) => [
                  styles.chip,
                  {
                    backgroundColor: selected ? theme.accent : theme.bgSubtle,
                    borderColor: selected ? theme.accent : theme.border,
                  },
                  pressed && styles.pressed,
                ]}
              >
                <Text
                  style={[typography.caption, { color: selected ? theme.accentText : theme.text }]}
                >
                  {need.label}
                </Text>
              </Pressable>
            )
          })}
        </View>
        {needs.length === 0 ? (
          <Text style={[typography.caption, { color: theme.danger }]}>
            Pick at least one — it tells hosts how they can help.
          </Text>
        ) : null}
      </View>

      <TextField
        label="Anything to add? (optional)"
        value={note}
        onChangeText={setNote}
        placeholder="Singing in the ARD competition, arriving late on the 3rd."
        multiline
        numberOfLines={3}
        maxLength={400}
        style={styles.note}
      />

      {nights > 0 ? (
        <Text style={[typography.caption, { color: theme.textMuted }]}>
          {nights} night{nights === 1 ? '' : 's'} away.
        </Text>
      ) : null}

      {error ? <Callout tone="danger">{error}</Callout> : null}
    </Screen>
  )
}

const styles = StyleSheet.create({
  section: { gap: spacing.sm },
  chips: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.sm },
  chip: {
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
    borderRadius: radius.pill,
    borderWidth: 1,
  },
  pressed: { opacity: 0.7 },
  note: { minHeight: 90, textAlignVertical: 'top' },
})
