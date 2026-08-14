import { nightCount } from '@gigaway/shared'
import { Stack, useRouter } from 'expo-router'

import { TripForm } from '@/features/trips/trip-form'
import { useCreateTrip } from '@/features/trips/use-trips'
import { track } from '@/lib/analytics'

export default function NewTripScreen() {
  const router = useRouter()
  const createTrip = useCreateTrip()

  return (
    <>
      <Stack.Screen options={{ title: 'Add a trip' }} />
      <TripForm
        submitLabel="See who's there"
        submitting={createTrip.isPending}
        error={createTrip.isError ? (createTrip.error as Error).message : undefined}
        onSubmit={async ({ city, range, needs, note }) => {
          const trip = await createTrip.mutateAsync({ cityId: city.id, range, needs, note })
          track('trip_created', { nights: nightCount(range), needs: needs.length })
          // Straight to matches — seeing who is there is the payoff, and making
          // the user hunt for it is how a first trip ends in nothing.
          router.replace(`/trip/${trip.id}`)
        }}
      />
    </>
  )
}
