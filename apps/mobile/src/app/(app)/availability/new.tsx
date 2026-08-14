import { useQuery } from '@tanstack/react-query'
import { Stack, useRouter } from 'expo-router'

import type { City } from '@/components/city-picker'
import { AvailabilityForm } from '@/features/availability/availability-form'
import { useCreateAvailability } from '@/features/availability/use-availability'
import { useMyProfile } from '@/features/profile/use-profile'
import { track } from '@/lib/analytics'
import { supabase } from '@/lib/supabase'

export default function NewAvailabilityScreen() {
  const router = useRouter()
  const { data: profile } = useMyProfile()
  const create = useCreateAvailability()

  // Defaults to the host's home city, but stays editable — people sublet, or
  // are temporarily somewhere else.
  const homeCity = useQuery({
    queryKey: ['cities', 'byId', profile?.home_city_id],
    enabled: Boolean(profile?.home_city_id),
    queryFn: async (): Promise<City> => {
      const { data, error } = await supabase
        .from('cities')
        .select('id, name, name_local, country_code, population')
        .eq('id', profile!.home_city_id!)
        .single()
      if (error) throw error
      return data
    },
  })

  // Wait for the default city before mounting, so the form seeds it as initial
  // state rather than having it patched in afterwards.
  if (profile?.home_city_id && homeCity.isPending) return null

  return (
    <>
      <Stack.Screen options={{ title: 'Offer a couch' }} />
      <AvailabilityForm
        initial={{ city: homeCity.data ?? undefined }}
        submitLabel="Post availability"
        submitting={create.isPending}
        error={create.isError ? (create.error as Error).message : undefined}
        onSubmit={async ({ city, range, offers, constraints, maxNights, note }) => {
          await create.mutateAsync({
            cityId: city.id,
            range,
            offers,
            constraints,
            maxNights,
            note,
          })
          track('availability_created', { offers: offers.length })
          router.back()
        }}
      />
    </>
  )
}
