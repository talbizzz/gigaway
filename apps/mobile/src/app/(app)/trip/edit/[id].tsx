import { useQuery } from '@tanstack/react-query'
import { Stack, useLocalSearchParams, useRouter } from 'expo-router'
import { ActivityIndicator, View } from 'react-native'

import type { City } from '@/components/city-picker'
import { TripForm } from '@/features/trips/trip-form'
import { useTrip, useUpdateTrip, type TripNeed } from '@/features/trips/use-trips'
import { supabase } from '@/lib/supabase'
import { useTheme } from '@/theme/use-theme'

export default function EditTripScreen() {
  const theme = useTheme()
  const router = useRouter()
  const { id } = useLocalSearchParams<{ id: string }>()
  const { data: trip } = useTrip(id)
  const update = useUpdateTrip()

  const city = useQuery({
    queryKey: ['cities', 'byId', trip?.city_id],
    enabled: Boolean(trip?.city_id),
    queryFn: async (): Promise<City> => {
      const { data, error } = await supabase
        .from('cities')
        .select('id, name, name_local, country_code, population')
        .eq('id', trip!.city_id)
        .single()
      if (error) throw error
      return data
    },
  })

  // The form seeds its state from these values, so it is mounted only once
  // they exist rather than being patched from an effect afterwards.
  if (!trip || !city.data) {
    return (
      <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center', backgroundColor: theme.bg }}>
        <ActivityIndicator color={theme.accent} />
      </View>
    )
  }

  return (
    <>
      <Stack.Screen options={{ title: 'Edit trip' }} />
      <TripForm
        initial={{
          city: city.data,
          range: { start: trip.start_date, end: trip.end_date },
          needs: trip.needs as TripNeed[],
          note: trip.note ?? '',
        }}
        submitLabel="Save changes"
        submitting={update.isPending}
        error={update.isError ? (update.error as Error).message : undefined}
        onSubmit={async ({ city: nextCity, range, needs, note }) => {
          await update.mutateAsync({
            tripId: trip.id,
            cityId: nextCity.id,
            range,
            needs,
            note,
          })
          router.replace(`/trip/${trip.id}`)
        }}
      />
    </>
  )
}
