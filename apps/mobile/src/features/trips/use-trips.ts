import type { DateRange } from '@gigaway/shared'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'

import { useSessionStore } from '@/features/auth/session-store'
import { supabase } from '@/lib/supabase'

export const tripKeys = {
  mine: ['trips', 'mine'] as const,
  one: (id: string) => ['trips', id] as const,
}

export type TripNeed = 'couch' | 'tips' | 'company' | 'co_accommodation'

export const TRIP_NEEDS: { value: TripNeed; label: string }[] = [
  { value: 'couch', label: 'A place to stay' },
  { value: 'tips', label: 'Local tips' },
  { value: 'company', label: 'Coffee & company' },
  { value: 'co_accommodation', label: 'Split a place' },
]

export type Trip = {
  id: string
  city_id: string
  start_date: string
  end_date: string
  needs: string[]
  note: string | null
  status: 'active' | 'cancelled' | 'completed'
  cities: { name: string; name_local: string | null; country_code: string } | null
}

const TRIP_SELECT = 'id, city_id, start_date, end_date, needs, note, status, cities(name, name_local, country_code)'

export function useMyTrips() {
  const session = useSessionStore((state) => state.session)

  return useQuery({
    queryKey: tripKeys.mine,
    enabled: Boolean(session),
    queryFn: async (): Promise<Trip[]> => {
      const { data, error } = await supabase
        .from('trips')
        .select(TRIP_SELECT)
        .eq('profile_id', session!.user.id)
        .order('start_date', { ascending: true })
      if (error) throw error
      return data as unknown as Trip[]
    },
  })
}

export function useTrip(id: string | undefined) {
  return useQuery({
    queryKey: tripKeys.one(id ?? ''),
    enabled: Boolean(id),
    queryFn: async (): Promise<Trip> => {
      const { data, error } = await supabase
        .from('trips')
        .select(TRIP_SELECT)
        .eq('id', id!)
        .single()
      if (error) throw error
      return data as unknown as Trip
    },
  })
}

export function useCreateTrip() {
  const queryClient = useQueryClient()
  const session = useSessionStore((state) => state.session)

  return useMutation({
    mutationFn: async (input: {
      cityId: string
      range: DateRange
      needs: TripNeed[]
      note?: string
    }): Promise<Trip> => {
      const { data, error } = await supabase
        .from('trips')
        .insert({
          profile_id: session!.user.id,
          city_id: input.cityId,
          start_date: input.range.start,
          end_date: input.range.end,
          needs: input.needs,
          note: input.note?.trim() || null,
        })
        .select(TRIP_SELECT)
        .single()
      if (error) throw error
      return data as unknown as Trip
    },
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: tripKeys.mine })
    },
  })
}

export function useUpdateTrip() {
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: async (input: {
      tripId: string
      cityId: string
      range: DateRange
      needs: TripNeed[]
      note?: string
    }) => {
      const { error } = await supabase
        .from('trips')
        .update({
          city_id: input.cityId,
          start_date: input.range.start,
          end_date: input.range.end,
          needs: input.needs,
          note: input.note?.trim() || null,
        })
        .eq('id', input.tripId)
      if (error) throw error
    },
    onSuccess: async (_data, variables) => {
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: tripKeys.mine }),
        queryClient.invalidateQueries({ queryKey: tripKeys.one(variables.tripId) }),
        // Changing the city or dates changes who matches.
        queryClient.invalidateQueries({ queryKey: ['matches', variables.tripId] }),
      ])
    },
  })
}

/**
 * Cancelling never deletes: Milestone 4's reviews hang off the stay a trip
 * produced, so the history has to survive.
 */
export function useCancelTrip() {
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: async (tripId: string) => {
      const { error } = await supabase
        .from('trips')
        .update({ status: 'cancelled' })
        .eq('id', tripId)
      if (error) throw error
    },
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: tripKeys.mine })
    },
  })
}
