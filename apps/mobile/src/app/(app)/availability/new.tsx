import { useQuery } from '@tanstack/react-query'
import { isServiceKind, serviceDefinition } from '@gigaway/shared'
import { Redirect, Stack, useLocalSearchParams, useRouter } from 'expo-router'

import type { City } from '@/components/city-picker'
import { AvailabilityForm } from '@/features/availability/availability-form'
import { useCreateAvailability } from '@/features/availability/use-availability'
import { usePushPrompt } from '@/features/notifications/use-push'
import { useMyProfile } from '@/features/profile/use-profile'
import { track } from '@/lib/analytics'
import { supabase } from '@/lib/supabase'

export default function NewAvailabilityScreen() {
  const router = useRouter()
  const { kind } = useLocalSearchParams<{ kind?: string }>()
  const { data: profile } = useMyProfile()
  const create = useCreateAvailability()
  const promptForPush = usePushPrompt()

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

  // Arriving without a valid service (a stale link, say) goes back to choosing.
  if (!isServiceKind(kind)) return <Redirect href="/availability/choose" />

  // Wait for the default city before mounting, so the form seeds it as initial
  // state rather than having it patched in afterwards.
  if (profile?.home_city_id && homeCity.isPending) return null

  return (
    <>
      <Stack.Screen options={{ title: serviceDefinition(kind)?.title }} />
      <AvailabilityForm
        kind={kind}
        initial={{ city: homeCity.data ?? undefined }}
        submitLabel="Post it"
        submitting={create.isPending}
        error={create.isError ? (create.error as Error).message : undefined}
        onSubmit={async ({ city, range, alwaysAvailable, constraints, maxNights, note }) => {
          await create.mutateAsync({
            cityId: city.id,
            kind,
            range,
            alwaysAvailable,
            constraints,
            maxNights,
            note,
          })
          track('availability_created', { kind, alwaysAvailable })
          // Someone who has just posted a service is exactly who needs to hear
          // that somebody asked for it, so this is where the notification prompt
          // earns its one shot.
          await promptForPush()
          // Back past the chooser, to wherever they started.
          router.dismiss(2)
        }}
      />
    </>
  )
}
