import { useRouter } from 'expo-router'
import { ActivityIndicator, StyleSheet, Text, View } from 'react-native'

import { Button } from '@/components/button'
import { Callout } from '@/components/callout'
import { Screen } from '@/components/screen'
import { TripRow } from '@/components/trip-row'
import { useMyTrips } from '@/features/trips/use-trips'
import { spacing, typography } from '@/theme/tokens'
import { useTheme } from '@/theme/use-theme'

/**
 * Every trip the member has posted: the live ones to edit or cancel, and the
 * finished or cancelled ones below, read-only.
 */
export default function TripsScreen() {
  const theme = useTheme()
  const router = useRouter()
  const trips = useMyTrips()

  if (trips.isPending) {
    return (
      <View style={styles.centre}>
        <ActivityIndicator color={theme.accent} />
      </View>
    )
  }

  const all = trips.data ?? []
  const active = all.filter((trip) => trip.status === 'active')
  const earlier = all.filter((trip) => trip.status !== 'active')

  return (
    <Screen>
      {all.length === 0 ? (
        <Callout title="No trips yet">
          Post somewhere you are going and you will see who else will be there.
        </Callout>
      ) : null}

      {active.length > 0 ? (
        <View style={styles.section}>
          <Text style={[typography.heading, { color: theme.text }]}>Upcoming</Text>
          {active.map((trip) => (
            <TripRow key={trip.id} trip={trip} onPress={() => router.push(`/trip/${trip.id}`)} />
          ))}
        </View>
      ) : null}

      {earlier.length > 0 ? (
        <View style={styles.section}>
          <Text style={[typography.heading, { color: theme.text }]}>Earlier</Text>
          {earlier.map((trip) => (
            <TripRow
              key={trip.id}
              trip={trip}
              editable={false}
              onPress={() => router.push(`/trip/${trip.id}`)}
            />
          ))}
        </View>
      ) : null}

      <Button label="Add a trip" onPress={() => router.push('/trip/new')} />
    </Screen>
  )
}

const styles = StyleSheet.create({
  centre: { flex: 1, alignItems: 'center', justifyContent: 'center' },
  section: { gap: spacing.md },
})
