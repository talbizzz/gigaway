import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'

import { useSessionStore } from '@/features/auth/session-store'
import { track } from '@/lib/analytics'
import { callFunction } from '@/lib/functions'
import { supabase } from '@/lib/supabase'

export const requestKeys = {
  incoming: ['requests', 'incoming'] as const,
  outgoing: ['requests', 'outgoing'] as const,
  forTrip: (tripId: string) => ['requests', 'trip', tripId] as const,
}

export type RequestKind = 'host_stay' | 'co_accommodation'
export type RequestStatus = 'pending' | 'accepted' | 'declined' | 'withdrawn' | 'expired'

export type RequestPerson = {
  id: string
  display_name: string
  discipline: string
  specialisation: string | null
  photo_path: string | null
}

export type StayRequest = {
  id: string
  kind: RequestKind
  status: RequestStatus
  message: string | null
  created_at: string
  trip_id: string
  from_profile: string
  to_profile: string
  trips: {
    id: string
    start_date: string
    end_date: string
    needs: string[]
    cities: { name: string } | null
  } | null
  sender: RequestPerson | null
  recipient: RequestPerson | null
}

// Both profile joins have to be disambiguated by constraint name — PostgREST
// cannot guess which of the two foreign keys to profiles is meant.
const REQUEST_SELECT = `
  id, kind, status, message, created_at, trip_id, from_profile, to_profile,
  trips(id, start_date, end_date, needs, cities(name)),
  sender:profiles!requests_from_profile_fkey(id, display_name, discipline, specialisation, photo_path),
  recipient:profiles!requests_to_profile_fkey(id, display_name, discipline, specialisation, photo_path)
`

/** Requests addressed to me — the host's side of the loop. */
export function useIncomingRequests() {
  const session = useSessionStore((state) => state.session)

  return useQuery({
    queryKey: requestKeys.incoming,
    enabled: Boolean(session),
    queryFn: async (): Promise<StayRequest[]> => {
      const { data, error } = await supabase
        .from('requests')
        .select(REQUEST_SELECT)
        .eq('to_profile', session!.user.id)
        .order('created_at', { ascending: false })
      if (error) throw error
      return data as unknown as StayRequest[]
    },
  })
}

/** Requests I have sent, so a traveller can see what they are waiting on. */
export function useOutgoingRequests() {
  const session = useSessionStore((state) => state.session)

  return useQuery({
    queryKey: requestKeys.outgoing,
    enabled: Boolean(session),
    queryFn: async (): Promise<StayRequest[]> => {
      const { data, error } = await supabase
        .from('requests')
        .select(REQUEST_SELECT)
        .eq('from_profile', session!.user.id)
        .order('created_at', { ascending: false })
      if (error) throw error
      return data as unknown as StayRequest[]
    },
  })
}

/**
 * Who on this trip has already been asked.
 *
 * The match screen uses it to turn a host's button into "Asked" rather than
 * letting the user tap into a unique-constraint violation.
 */
export function useRequestsForTrip(tripId: string | undefined) {
  const session = useSessionStore((state) => state.session)

  return useQuery({
    queryKey: requestKeys.forTrip(tripId ?? ''),
    enabled: Boolean(tripId && session),
    queryFn: async (): Promise<StayRequest[]> => {
      const { data, error } = await supabase
        .from('requests')
        .select(REQUEST_SELECT)
        .eq('trip_id', tripId!)
        .eq('from_profile', session!.user.id)
      if (error) throw error
      return data as unknown as StayRequest[]
    },
  })
}

/**
 * One tap from the match screen.
 *
 * The message is optional on purpose: making it mandatory turns a one-tap ask
 * into a small piece of writing, and the request is what the product needs to
 * happen most often.
 */
export function useSendRequest() {
  const queryClient = useQueryClient()
  const session = useSessionStore((state) => state.session)

  return useMutation({
    mutationFn: async (input: {
      kind: RequestKind
      tripId: string
      toProfile: string
      message?: string
    }) => {
      const { error } = await supabase.from('requests').insert({
        kind: input.kind,
        trip_id: input.tripId,
        from_profile: session!.user.id,
        to_profile: input.toProfile,
        message: input.message?.trim() || null,
      })
      if (error) throw error
    },
    onSuccess: async (_data, variables) => {
      track('request_sent', { kind: variables.kind })
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: requestKeys.outgoing }),
        queryClient.invalidateQueries({ queryKey: requestKeys.forTrip(variables.tripId) }),
      ])
    },
  })
}

export function useWithdrawRequest() {
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: async (requestId: string) => {
      const { error } = await supabase
        .from('requests')
        .update({ status: 'withdrawn' })
        .eq('id', requestId)
      if (error) throw error
    },
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: ['requests'] })
    },
  })
}

export function useDeclineRequest() {
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: async (requestId: string) => {
      const { error } = await supabase
        .from('requests')
        .update({ status: 'declined' })
        .eq('id', requestId)
      if (error) throw error
    },
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: ['requests'] })
    },
  })
}

/**
 * Accepts a co-accommodation request. There is no offer step — accepting is
 * the whole interaction, and it reveals contact immediately.
 */
export function useAcceptCoRequest() {
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: async (requestId: string) =>
      callFunction<{ ok: true; grantedWith: string }>('accept-co-request', { requestId }),
    onSuccess: async (result) => {
      track('contact_revealed', { source: 'co_request' })
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: ['requests'] }),
        queryClient.invalidateQueries({ queryKey: ['contacts'] }),
        queryClient.invalidateQueries({ queryKey: ['contact', result.grantedWith] }),
      ])
    },
  })
}
