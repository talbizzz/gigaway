import type { DateRange } from '@gigaway/shared'
import { useQuery } from '@tanstack/react-query'

import { supabase } from '@/lib/supabase'

export type MatchProfile = {
  id: string
  displayName: string
  discipline: string
  specialisation: string | null
  photoPath: string | null
  homeDistrict: string | null
}

export type HostMatch = {
  availabilityId: string
  profile: MatchProfile
  cityId: string
  /** Only present on nearby hosts, where the city differs from the destination. */
  cityName?: string
  offers: string[]
  constraints: string[]
  overlap: DateRange
  overlapNights: number
  maxNights: number | null
  distanceKm: number
}

export type TravellerMatch = {
  tripId: string
  profile: MatchProfile
  overlap: DateRange
  overlapNights: number
  needs: string[]
}

export type Matches = {
  hosts: HostMatch[]
  travellers: TravellerMatch[]
  nearbyHosts: HostMatch[]
}

export const matchKeys = {
  forTrip: (tripId: string) => ['matches', tripId] as const,
}

/**
 * Everything the match screen shows, in one round trip. The database does the
 * ranking and the overlap arithmetic so the client never disagrees with it.
 */
export function useMatches(tripId: string | undefined) {
  return useQuery({
    queryKey: matchKeys.forTrip(tripId ?? ''),
    enabled: Boolean(tripId),
    queryFn: async (): Promise<Matches> => {
      const { data, error } = await supabase.rpc('search_matches', { p_trip_id: tripId! })
      if (error) throw error
      return data as unknown as Matches
    },
  })
}

/** True when the destination itself turned up nothing at all. */
export function isCompletelyEmpty(matches: Matches | undefined): boolean {
  if (!matches) return false
  return (
    matches.hosts.length === 0 &&
    matches.travellers.length === 0 &&
    matches.nearbyHosts.length === 0
  )
}
