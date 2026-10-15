import { isServiceKind, serviceDefinition } from '@gigaway/shared'
import { useQuery } from '@tanstack/react-query'
import { Stack, useLocalSearchParams, useRouter } from 'expo-router'
import { ActivityIndicator, View } from 'react-native'

import type { City } from '@/components/city-picker'
import { AvailabilityForm } from '@/features/availability/availability-form'
import {
  useAvailability,
  useUpdateAvailability,
  type HostConstraint,
} from '@/features/availability/use-availability'
import { supabase } from '@/lib/supabase'
import { useTheme } from '@/theme/use-theme'

export default function EditAvailabilityScreen() {
  const theme = useTheme()
  const router = useRouter()
  const { id } = useLocalSearchParams<{ id: string }>()
  const { data: availability } = useAvailability(id)
  const update = useUpdateAvailability()

  const city = useQuery({
    queryKey: ['cities', 'byId', availability?.city_id],
    enabled: Boolean(availability?.city_id),
    queryFn: async (): Promise<City> => {
      const { data, error } = await supabase
        .from('cities')
        .select('id, name, name_local, country_code, population')
        .eq('id', availability!.city_id)
        .single()
      if (error) throw error
      return data
    },
  })

  if (!availability || !city.data) {
    return (
      <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center', backgroundColor: theme.bg }}>
        <ActivityIndicator color={theme.accent} />
      </View>
    )
  }

  // One service per post. An older post may still list several; the first is
  // the one it is edited as.
  const kind = availability.offers.find(isServiceKind) ?? 'couch'

  return (
    <>
      <Stack.Screen options={{ title: `Edit: ${serviceDefinition(kind)?.label ?? 'service'}` }} />
      <AvailabilityForm
        kind={kind}
        initial={{
          city: city.data,
          alwaysAvailable: availability.always_available,
          range:
            availability.start_date && availability.end_date
              ? { start: availability.start_date, end: availability.end_date }
              : null,
          constraints: availability.constraints as HostConstraint[],
          maxNights: availability.max_nights,
          note: availability.note ?? '',
        }}
        submitLabel="Save changes"
        submitting={update.isPending}
        error={update.isError ? (update.error as Error).message : undefined}
        onSubmit={async ({ city: nextCity, range, alwaysAvailable, constraints, maxNights, note }) => {
          await update.mutateAsync({
            id: availability.id,
            cityId: nextCity.id,
            kind,
            range,
            alwaysAvailable,
            constraints,
            maxNights,
            note,
          })
          router.back()
        }}
      />
    </>
  )
}
