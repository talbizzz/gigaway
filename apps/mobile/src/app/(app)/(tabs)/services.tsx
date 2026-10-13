import {
  formatDateRange,
  nightCount,
  offersAStay,
  serviceLabel,
} from '@gigaway/shared'
import { useRouter } from 'expo-router'
import { StyleSheet, Text, View } from 'react-native'

import { Badge } from '@/components/badge'
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
 * What a member offers, on its own tab.
 *
 * Each post is one service: a couch, a spare room, a coffee or local tips. A post
 * is either for certain dates or always available, open until it is switched off.
 * Offering is the scarce side of the network, so it has a tab of its own rather
 * than a section partway down the home screen.
 *
 * Starting a post is not here only: the centre button in the tab bar does the
 * same, next to adding a trip, because the two are the same kind of act.
 */
export default function ServicesScreen() {
  const theme = useTheme()
  const router = useRouter()
  const availability = useMyAvailability()

  // Always-available first: they are the standing offers, and the dated ones are
  // the ones that come and go.
  const services = (availability.data ?? [])
    .filter((row) => row.status === 'active')
    .sort((a, b) => Number(b.always_available) - Number(a.always_available))

  // The host's half of discovery lists travellers whose trip lands on a place to
  // sleep, so it only matters once there is a couch or a room posted.
  const hasAStay = services.some((row) => offersAStay(row.offers))

  return (
    <Screen>
      <View style={styles.section}>
        <Text style={[typography.heading, { color: theme.text }]}>Your services</Text>

        {services.length === 0 ? (
          <Callout>
            Offer a couch, a spare room, a coffee or local tips. Offering is how the network
            keeps working, and how someone helps you next spring.
          </Callout>
        ) : (
          services.map((row) => <ServiceRow key={row.id} service={row} />)
        )}

        <Button
          label={services.length === 0 ? 'Offer a service' : 'Offer another service'}
          variant={services.length === 0 ? 'primary' : 'secondary'}
          onPress={() => router.push('/availability/choose')}
        />
      </View>

      {hasAStay ? (
        <View style={styles.section}>
          <Text style={[typography.heading, { color: theme.text }]}>Coming your way</Text>
          <Text style={[typography.caption, { color: theme.textMuted }]}>
            Colleagues whose trip lands on nights you offer. Offering first is how most stays
            here actually start.
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

function ServiceRow({ service }: { service: Availability }) {
  const theme = useTheme()
  const router = useRouter()
  const cancel = useCancelAvailability()

  const kind = service.offers[0]
  const stay = offersAStay(service.offers)
  const nights =
    service.start_date && service.end_date
      ? nightCount({ start: service.start_date, end: service.end_date })
      : 0

  return (
    <View style={[styles.row, { backgroundColor: theme.bgSubtle, borderColor: theme.border }]}>
      <View style={styles.rowText}>
        <View style={styles.rowTitle}>
          <Text style={[typography.bodyStrong, { color: theme.text }]}>{serviceLabel(kind)}</Text>
          {service.always_available ? <Badge label="Always available" tone="success" /> : null}
        </View>
        <Text style={[typography.caption, { color: theme.textMuted }]}>
          {service.cities?.name}
          {service.always_available
            ? ''
            : ` · ${formatDateRange(service.start_date ?? undefined, service.end_date ?? undefined)}${
                stay ? ` · ${nights} night${nights === 1 ? '' : 's'}` : ''
              }`}
        </Text>
      </View>
      <View style={styles.rowActions}>
        <TextLink label="Edit" onPress={() => router.push(`/availability/edit/${service.id}`)} />
        <TextLink
          label={service.always_available ? 'Switch off' : 'Cancel'}
          onPress={() => cancel.mutate(service.id)}
        />
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
  rowText: { flex: 1, minWidth: 0, gap: 2 },
  rowTitle: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm, flexWrap: 'wrap' },
  rowActions: { gap: spacing.sm, alignItems: 'flex-end' },
})
