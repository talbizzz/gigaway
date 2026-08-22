import { nightCount } from '@gigaway/shared'
import { Stack, useRouter } from 'expo-router'

import { usePushPrompt } from '@/features/notifications/use-push'
import { TripForm } from '@/features/trips/trip-form'
import { useCreateTrip } from '@/features/trips/use-trips'
import { track } from '@/lib/analytics'

export default function NewTripScreen() {
  const router = useRouter()
  const createTrip = useCreateTrip()
  const promptForPush = usePushPrompt()

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
          // The first meaningful action, and therefore the moment to ask about
          // notifications: the user has just said they want to hear from a
          // host, so the dialog reads as useful rather than as a toll booth.
          await promptForPush()
          // Straight to matches — seeing who is there is the payoff, and making
          // the user hunt for it is how a first trip ends in nothing.
          router.replace(`/trip/${trip.id}`)
        }}
      />
    </>
  )
}
