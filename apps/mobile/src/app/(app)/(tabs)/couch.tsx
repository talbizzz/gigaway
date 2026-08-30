import { nightCount } from '@gigaway/shared'
import { useRouter } from 'expo-router'
import { StyleSheet, Text, View } from 'react-native'

import { Button, TextLink } from '@/components/button'
import { Callout } from '@/components/callout'
import { Screen } from '@/components/screen'
import {
  useCancelAvailability,
  useMyAvailability,
  type Availability,
} from '@/features/availability/use-availability'
import { radius, spacing, typography } from '@/theme/tokens'
import { useTheme } from '@/theme/use-theme'

/**
 * The host's side, on its own tab.
 *
 * This used to be a section two thirds of the way down the home screen, which
 * put the whole hosting half of the product behind a scroll. Posting nights is
 * the scarce side of a couch network — the side that has to be easy to reach
 * and easy to keep current.
 *
 * Posting itself is not here: that is the centre button in the tab bar, next to
 * adding a trip, because the two are the same kind of act.
 */
export default function CouchScreen() {
  const theme = useTheme()
  const router = useRouter()
  const availability = useMyAvailability()

  const activeAvailability = (availability.data ?? []).filter(
    (row) => row.status === 'active',
  )

  return (
    <Screen>
      <View style={styles.section}>
        <Text style={[typography.heading, { color: theme.text }]}>Your free nights</Text>

        {activeAvailability.length === 0 ? (
          <>
            <Callout>
              Free nights at home? Offering them is how the network keeps working — and
              how someone hosts you next spring.
            </Callout>
            {/* The one place the CTA is repeated outside the tab bar: a member
                with nothing posted should not have to find the plus button to
                get started. */}
            <Button
              label="Offer a couch"
              onPress={() => router.push('/availability/new')}
            />
          </>
        ) : (
          activeAvailability.map((row) => (
            <AvailabilityRow key={row.id} availability={row} />
          ))
        )}
      </View>

      {/* The host's half of discovery. Only worth showing once there are nights
          to match against. */}
      {activeAvailability.length > 0 ? (
        <View style={styles.section}>
          <Text style={[typography.heading, { color: theme.text }]}>Coming your way</Text>
          <Text style={[typography.caption, { color: theme.textMuted }]}>
            Colleagues whose trip lands on nights you have posted. Offering first is how
            most stays here actually start.
          </Text>
          <Button
            label="See who's coming your way"
            variant="secondary"
            onPress={() => router.push('/travellers')}
          />
        </View>
      ) : null}
    </Screen>
  )
}

function AvailabilityRow({ availability }: { availability: Availability }) {
  const theme = useTheme()
  const router = useRouter()
  const cancel = useCancelAvailability()
  const nights = nightCount({
    start: availability.start_date,
    end: availability.end_date,
  })

  return (
    <View
      style={[
        styles.row,
        { backgroundColor: theme.bgSubtle, borderColor: theme.border },
      ]}
    >
      <View style={styles.rowText}>
        <Text style={[typography.bodyStrong, { color: theme.text }]}>
          {availability.cities?.name}
        </Text>
        <Text style={[typography.caption, { color: theme.textMuted }]}>
          {availability.start_date} → {availability.end_date} · {nights} night
          {nights === 1 ? '' : 's'}
        </Text>
      </View>
      <View style={styles.rowActions}>
        <TextLink
          label="Edit"
          onPress={() => router.push(`/availability/edit/${availability.id}`)}
        />
        <TextLink label="Cancel" onPress={() => cancel.mutate(availability.id)} />
      </View>
    </View>
  )
}

const styles = StyleSheet.create({
  section: { gap: spacing.md },
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
})
