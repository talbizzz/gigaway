import type { DateRange } from '@gigaway/shared'
import { useState } from 'react'
import { Pressable, StyleSheet, Text, View } from 'react-native'

import { Button } from '@/components/button'
import { Callout } from '@/components/callout'
import { CityPicker, type City } from '@/components/city-picker'
import { DateRangePicker } from '@/components/date-range-picker'
import { Screen } from '@/components/screen'
import { TextField } from '@/components/text-field'
import {
  HOST_CONSTRAINTS,
  OFFER_KINDS,
  type HostConstraint,
  type OfferKind,
} from '@/features/availability/use-availability'
import { radius, spacing, typography } from '@/theme/tokens'
import { useTheme } from '@/theme/use-theme'

export type AvailabilityFormValues = {
  city: City
  range: DateRange
  offers: OfferKind[]
  constraints: HostConstraint[]
  maxNights: number | null
  note: string
}

/** Shared by the create and edit screens so validation cannot drift. */
export function AvailabilityForm({
  initial,
  submitLabel,
  onSubmit,
  submitting,
  error,
}: {
  initial?: Partial<AvailabilityFormValues>
  submitLabel: string
  onSubmit: (values: AvailabilityFormValues) => void
  submitting: boolean
  error?: string
}) {
  const [city, setCity] = useState<City | null>(initial?.city ?? null)
  const [range, setRange] = useState<DateRange | null>(initial?.range ?? null)
  const [offers, setOffers] = useState<OfferKind[]>(initial?.offers ?? ['couch'])
  const [constraints, setConstraints] = useState<HostConstraint[]>(initial?.constraints ?? [])
  const [maxNights, setMaxNights] = useState(
    initial?.maxNights ? String(initial.maxNights) : '',
  )
  const [note, setNote] = useState(initial?.note ?? '')

  const ready = Boolean(city && range && offers.length > 0)

  const toggle = <T,>(list: T[], value: T): T[] =>
    list.includes(value) ? list.filter((item) => item !== value) : [...list, value]

  return (
    <Screen
      footer={
        <Button
          label={submitLabel}
          onPress={() =>
            city &&
            range &&
            onSubmit({
              city,
              range,
              offers,
              constraints,
              maxNights: maxNights ? Number.parseInt(maxNights, 10) : null,
              note,
            })
          }
          loading={submitting}
          disabled={!ready}
        />
      }
    >
      <CityPicker label="Where?" value={city} onChange={setCity} />

      <DateRangePicker label="Which nights?" value={range} onChange={setRange} />

      <ChipGroup
        label="What can you offer?"
        options={OFFER_KINDS}
        selected={offers}
        onToggle={(value) => setOffers((current) => toggle(current, value))}
      />

      <ChipGroup
        label="Anything guests should know?"
        options={HOST_CONSTRAINTS}
        selected={constraints}
        onToggle={(value) => setConstraints((current) => toggle(current, value))}
      />

      {constraints.includes('women_only') ? (
        <Callout tone="warning">
          Shown prominently to anyone who sees this. You decide who to accept — GigAway
          never asks members for their gender.
        </Callout>
      ) : null}

      <TextField
        label="Maximum nights (optional)"
        value={maxNights}
        onChangeText={(value) => setMaxNights(value.replace(/[^0-9]/g, ''))}
        keyboardType="number-pad"
        placeholder="3"
        hint="Leave empty if you're happy for someone to stay the whole window."
      />

      <TextField
        label="A note (optional)"
        value={note}
        onChangeText={setNote}
        placeholder="Sofa bed in the living room, 10 minutes from the Gasteig."
        multiline
        numberOfLines={3}
        maxLength={400}
        style={styles.note}
      />

      {error ? <Callout tone="danger">{error}</Callout> : null}
    </Screen>
  )
}

function ChipGroup<T extends string>({
  label,
  options,
  selected,
  onToggle,
}: {
  label: string
  options: readonly { value: T; label: string }[]
  selected: T[]
  onToggle: (value: T) => void
}) {
  const theme = useTheme()

  return (
    <View style={styles.section}>
      <Text style={[typography.captionStrong, { color: theme.textMuted }]}>
        {label.toUpperCase()}
      </Text>
      <View style={styles.chips}>
        {options.map((option) => {
          const isSelected = selected.includes(option.value)
          return (
            <Pressable
              key={option.value}
              accessibilityRole="checkbox"
              accessibilityState={{ checked: isSelected }}
              onPress={() => onToggle(option.value)}
              style={({ pressed }) => [
                styles.chip,
                {
                  backgroundColor: isSelected ? theme.accent : theme.bgSubtle,
                  borderColor: isSelected ? theme.accent : theme.border,
                },
                pressed && styles.pressed,
              ]}
            >
              <Text
                style={[typography.caption, { color: isSelected ? theme.accentText : theme.text }]}
              >
                {option.label}
              </Text>
            </Pressable>
          )
        })}
      </View>
    </View>
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
