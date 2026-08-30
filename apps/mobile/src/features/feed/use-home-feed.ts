import { useQuery } from '@tanstack/react-query'

import { useSessionStore } from '@/features/auth/session-store'
import { supabase } from '@/lib/supabase'

export type FeedProfile = {
  id: string
  displayName: string
  discipline: string
  specialisation: string | null
  photoPath: string | null
  homeDistrict: string | null
}

/** Somebody whose own trip brings them into the member's home city. */
export type FeedVisitor = {
  tripId: string
  profile: FeedProfile
  start: string
  end: string
  needs: string[]
}

/**
 * What a person will be doing in a city the member is travelling to. `host` has
 * posted nights covering the trip, `local` lives there with nothing taking them
 * away, `traveller` will be visiting at the same time.
 */
export type FeedPersonKind = 'host' | 'local' | 'traveller'

export type FeedPerson = {
  kind: FeedPersonKind
  availabilityId: string | null
  tripId: string | null
  profile: FeedProfile
}

export type FeedDestination = {
  tripId: string
  cityId: string
  cityName: string
  start: string
  end: string
  /** Everyone who matched, of whom `people` is only the first few. */
  total: number
  people: FeedPerson[]
}

export type HomeFeed = {
  /** Null until the member has set a home city, which the first two bands need. */
  homeCityName: string | null
  inYourCity: FeedVisitor[]
  comingToYourCity: FeedVisitor[]
  destinations: FeedDestination[]
}

export const feedKeys = {
  home: ['feed', 'home'] as const,
}

/**
 * The three bands of the home feed, in one round trip.
 *
 * The database does the date arithmetic and the ranking, as it does for
 * search_matches — the client never re-derives who counts as being in a city,
 * because two implementations of that question will eventually disagree.
 */
export function useHomeFeed() {
  const session = useSessionStore((state) => state.session)

  return useQuery({
    queryKey: feedKeys.home,
    enabled: Boolean(session),
    queryFn: async (): Promise<HomeFeed> => {
      const { data, error } = await supabase.rpc('home_feed')
      if (error) throw error
      return data as unknown as HomeFeed
    },
  })
}
