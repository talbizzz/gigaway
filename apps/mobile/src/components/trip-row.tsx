import { nightCount } from '@gigaway/shared'
import { useRouter } from 'expo-router'
import { Pressable, StyleSheet, Text, View } from 'react-native'

import { TextLink } from '@/components/button'
import { useCancelTrip, type Trip } from '@/features/trips/use-trips'
import { radius, spacing, typography } from '@/theme/tokens'
import { useTheme } from '@/theme/use-theme'

/** One of the member's own trips, with the two things they can do to it. */
export function TripRow({
  trip,
  onPress,
  editable = true,
}: {
  trip: Trip
  onPress: () => void
  /** Past and cancelled trips are read-only. */
  editable?: boolean
}) {
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
      {editable ? (
        <View style={styles.rowActions}>
          <TextLink label="Edit" onPress={() => router.push(`/trip/edit/${trip.id}`)} />
          <TextLink label="Cancel" onPress={() => cancel.mutate(trip.id)} />
        </View>
      ) : null}
    </Pressable>
  )
}

const styles = StyleSheet.create({
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
