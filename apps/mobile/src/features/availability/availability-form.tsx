import { serviceDefinition, type DateRange, type ServiceKind } from '@gigaway/shared'
import { useState } from 'react'
import { Pressable, StyleSheet, Switch, Text, View } from 'react-native'

import { Button } from '@/components/button'
import { Callout } from '@/components/callout'
import { CityPicker, type City } from '@/components/city-picker'
import { DateRangePicker } from '@/components/date-range-picker'
import { Screen } from '@/components/screen'
import { TextField } from '@/components/text-field'
import { HOST_CONSTRAINTS, type HostConstraint } from '@/features/availability/use-availability'
import { radius, spacing, typography } from '@/theme/tokens'
import { useTheme } from '@/theme/use-theme'

export type AvailabilityFormValues = {
  city: City
  kind: ServiceKind
  /** When true there are no dates: the service stays open until it is switched off. */
  alwaysAvailable: boolean
  range: DateRange | null
  constraints: HostConstraint[]
  maxNights: number | null
  note: string
}

const NOTE_PLACEHOLDERS: Record<ServiceKind, string> = {
  couch: 'Sofa bed in the living room, 10 minutes from the Gasteig.',
  spare_room: 'A quiet room with its own desk, bike storage in the hall.',
  coffee: 'Usually the café by the Hochschule, most weekday mornings.',
  tips: 'Best rehearsal rooms, where to eat after a late call, who to ask.',
}

/**
 * The form for ONE service. Which service is decided before this screen, on the
 * chooser, so the form asks only what that service needs: a couch or a room has
 * nights, house rules and a maximum stay; a coffee or tips does not.
 *
 * Shared by the create and edit screens so validation cannot drift.
 */
export function AvailabilityForm({
  kind,
  initial,
  submitLabel,
  onSubmit,
  submitting,
  error,
}: {
  kind: ServiceKind
  initial?: Partial<Omit<AvailabilityFormValues, 'kind'>>
  submitLabel: string
  onSubmit: (values: AvailabilityFormValues) => void
  submitting: boolean
  error?: string
}) {
  const theme = useTheme()
  const service = serviceDefinition(kind)
  const stay = service?.stay ?? false

  const [city, setCity] = useState<City | null>(initial?.city ?? null)
  const [alwaysAvailable, setAlwaysAvailable] = useState(initial?.alwaysAvailable ?? false)
  const [range, setRange] = useState<DateRange | null>(initial?.range ?? null)
  const [constraints, setConstraints] = useState<HostConstraint[]>(initial?.constraints ?? [])
  const [maxNights, setMaxNights] = useState(initial?.maxNights ? String(initial.maxNights) : '')
  const [note, setNote] = useState(initial?.note ?? '')

  const ready = Boolean(city && (alwaysAvailable || range))

  const toggleConstraint = (value: HostConstraint) =>
    setConstraints((current) =>
      current.includes(value) ? current.filter((item) => item !== value) : [...current, value],
    )

  return (
    <Screen
      footer={
        <Button
          label={submitLabel}
          onPress={() =>
            city &&
            onSubmit({
              city,
              kind,
              alwaysAvailable,
              range: alwaysAvailable ? null : range,
              // Conditions and a maximum are about a stay; a coffee has neither.
              constraints: stay ? constraints : [],
              maxNights: stay && maxNights ? Number.parseInt(maxNights, 10) : null,
              note,
            })
          }
          loading={submitting}
          disabled={!ready}
        />
      }
    >
      <View style={styles.intro}>
        <Text style={[typography.title, { color: theme.text }]}>{service?.title}</Text>
        <Text style={[typography.body, { color: theme.textMuted }]}>{service?.description}</Text>
      </View>

      <CityPicker label={stay ? 'Where is it?' : 'Which city?'} value={city} onChange={setCity} />

      {/* No dates at all: it stays open, and requests keep coming, until switched
          off. The dates only appear when this is off. */}
      <View
        style={[styles.always, { backgroundColor: theme.bgSubtle, borderColor: theme.border }]}
      >
        <View style={styles.alwaysText}>
          <Text style={[typography.bodyStrong, { color: theme.text }]}>Always available</Text>
          <Text style={[typography.caption, { color: theme.textMuted }]}>
            No dates. It stays open, and people can keep asking, until you switch it off.
          </Text>
        </View>
        <Switch
          accessibilityLabel="Always available"
          value={alwaysAvailable}
          onValueChange={setAlwaysAvailable}
          trackColor={{ true: theme.accent, false: theme.border }}
        />
      </View>

      {!alwaysAvailable ? (
        <DateRangePicker
          label={stay ? 'Which nights?' : 'Which days?'}
          value={range}
          onChange={setRange}
        />
      ) : null}

      {stay ? (
        <>
          <View style={styles.section}>
            <Text style={[typography.captionStrong, { color: theme.textMuted }]}>
              ANYTHING GUESTS SHOULD KNOW?
            </Text>
            <View style={styles.chips}>
              {HOST_CONSTRAINTS.map((option) => {
                const selected = constraints.includes(option.value)
                return (
                  <Pressable
                    key={option.value}
                    accessibilityRole="checkbox"
                    accessibilityState={{ checked: selected }}
                    onPress={() => toggleConstraint(option.value)}
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
                      style={[
                        typography.caption,
                        { color: selected ? theme.accentText : theme.text },
                      ]}
                    >
                      {option.label}
                    </Text>
                  </Pressable>
                )
              })}
            </View>
          </View>

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
            hint="Leave empty if you're happy for someone to stay the whole time."
          />
        </>
      ) : null}

      <TextField
        label="A note (optional)"
        value={note}
        onChangeText={setNote}
        placeholder={NOTE_PLACEHOLDERS[kind]}
        multiline
        numberOfLines={3}
        maxLength={400}
        style={styles.note}
      />

      {error ? <Callout tone="danger">{error}</Callout> : null}
    </Screen>
  )
}

const styles = StyleSheet.create({
  intro: { gap: spacing.xs },
  section: { gap: spacing.sm },
  chips: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.sm },
  chip: {
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
    borderRadius: radius.pill,
    borderWidth: 1,
  },
  pressed: { opacity: 0.7 },
  always: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
    padding: spacing.md,
    borderRadius: radius.md,
    borderWidth: 1,
  },
  alwaysText: { flex: 1, minWidth: 0, gap: 2 },
  note: { minHeight: 90, textAlignVertical: 'top' },
})
