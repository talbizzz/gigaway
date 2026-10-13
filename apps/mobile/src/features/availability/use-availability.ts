import type { DateRange, ServiceKind } from '@gigaway/shared'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'

import { useSessionStore } from '@/features/auth/session-store'
import { supabase } from '@/lib/supabase'

export const availabilityKeys = {
  mine: ['availability', 'mine'] as const,
}

export type HostConstraint =
  | 'no_pets'
  | 'no_smoking'
  | 'women_only'
  | 'no_children'
  | 'quiet_household'

export const HOST_CONSTRAINTS: { value: HostConstraint; label: string }[] = [
  { value: 'women_only', label: 'Women only' },
  { value: 'no_pets', label: 'No pets' },
  { value: 'no_smoking', label: 'No smoking' },
  { value: 'no_children', label: 'No children' },
  { value: 'quiet_household', label: 'Quiet household' },
]

export type Availability = {
  id: string
  city_id: string
  /** Null for a service that is always available. */
  start_date: string | null
  end_date: string | null
  always_available: boolean
  /** One service per post; an older post may still list several. */
  offers: string[]
  constraints: string[]
  max_nights: number | null
  note: string | null
  status: 'active' | 'cancelled'
  cities: { name: string; name_local: string | null; country_code: string } | null
}

const AVAILABILITY_SELECT =
  'id, city_id, start_date, end_date, always_available, offers, constraints, max_nights, note, status, cities(name, name_local, country_code)'

export function useMyAvailability() {
  const session = useSessionStore((state) => state.session)

  return useQuery({
    queryKey: availabilityKeys.mine,
    enabled: Boolean(session),
    queryFn: async (): Promise<Availability[]> => {
      const { data, error } = await supabase
        .from('availability')
        .select(AVAILABILITY_SELECT)
        .eq('profile_id', session!.user.id)
        .order('start_date', { ascending: true, nullsFirst: true })
      if (error) throw error
      return data as unknown as Availability[]
    },
  })
}

export function useCreateAvailability() {
  const queryClient = useQueryClient()
  const session = useSessionStore((state) => state.session)

  return useMutation({
    mutationFn: async (input: {
      cityId: string
      kind: ServiceKind
      /** Null when the service is always available. */
      range: DateRange | null
      alwaysAvailable: boolean
      constraints: HostConstraint[]
      maxNights?: number | null
      note?: string
    }) => {
      const { error } = await supabase.from('availability').insert({
        profile_id: session!.user.id,
        city_id: input.cityId,
        start_date: input.alwaysAvailable ? null : (input.range?.start ?? null),
        end_date: input.alwaysAvailable ? null : (input.range?.end ?? null),
        always_available: input.alwaysAvailable,
        offers: [input.kind],
        constraints: input.constraints,
        max_nights: input.maxNights ?? null,
        note: input.note?.trim() || null,
      })
      if (error) throw error
    },
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: availabilityKeys.mine })
    },
  })
}

export function useAvailability(id: string | undefined) {
  return useQuery({
    queryKey: ['availability', id],
    enabled: Boolean(id),
    queryFn: async (): Promise<Availability> => {
      const { data, error } = await supabase
        .from('availability')
        .select(AVAILABILITY_SELECT)
        .eq('id', id!)
        .single()
      if (error) throw error
      return data as unknown as Availability
    },
  })
}

export function useUpdateAvailability() {
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: async (input: {
      id: string
      cityId: string
      kind: ServiceKind
      range: DateRange | null
      alwaysAvailable: boolean
      constraints: HostConstraint[]
      maxNights?: number | null
      note?: string
    }) => {
      const { error } = await supabase
        .from('availability')
        .update({
          city_id: input.cityId,
          start_date: input.alwaysAvailable ? null : (input.range?.start ?? null),
          end_date: input.alwaysAvailable ? null : (input.range?.end ?? null),
          always_available: input.alwaysAvailable,
          offers: [input.kind],
          constraints: input.constraints,
          max_nights: input.maxNights ?? null,
          note: input.note?.trim() || null,
        })
        .eq('id', input.id)
      if (error) throw error
    },
    onSuccess: async (_data, variables) => {
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: availabilityKeys.mine }),
        queryClient.invalidateQueries({ queryKey: ['availability', variables.id] }),
      ])
    },
  })
}

export function useCancelAvailability() {
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase
        .from('availability')
        .update({ status: 'cancelled' })
        .eq('id', id)
      if (error) throw error
    },
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: availabilityKeys.mine })
    },
  })
}
