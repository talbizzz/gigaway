import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'

import { useSessionStore } from '@/features/auth/session-store'
import { track } from '@/lib/analytics'
import { supabase } from '@/lib/supabase'

/** The two services that are offered without nights; a bed goes through offers. */
export type ServiceOfferKind = 'coffee' | 'tips'
export type ServiceOfferStatus = 'pending' | 'accepted' | 'declined' | 'withdrawn' | 'expired'

export type ServiceOfferPerson = {
  id: string
  display_name: string
  discipline: string
  specialisation: string | null
  photo_path: string | null
}

export type ServiceOffer = {
  id: string
  kind: ServiceOfferKind
  trip_id: string
  from_profile: string
  to_profile: string
  message: string | null
  status: ServiceOfferStatus
  created_at: string
  trips: { id: string; start_date: string; end_date: string; cities: { name: string } | null } | null
  giver: ServiceOfferPerson | null
  recipient: ServiceOfferPerson | null
}

export const serviceOfferKeys = {
  received: ['service-offers', 'received'] as const,
  sent: ['service-offers', 'sent'] as const,
}

const SELECT = `
  id, kind, trip_id, from_profile, to_profile, message, status, created_at,
  trips(id, start_date, end_date, cities(name)),
  giver:profiles!service_offers_from_profile_fkey(id, display_name, discipline, specialisation, photo_path),
  recipient:profiles!service_offers_to_profile_fkey(id, display_name, discipline, specialisation, photo_path)
`

/** Offers made to me, unprompted. */
export function useReceivedServiceOffers() {
  const session = useSessionStore((state) => state.session)

  return useQuery({
    queryKey: serviceOfferKeys.received,
    enabled: Boolean(session),
    queryFn: async (): Promise<ServiceOffer[]> => {
      const { data, error } = await supabase
        .from('service_offers')
        .select(SELECT)
        .eq('to_profile', session!.user.id)
        .order('created_at', { ascending: false })
      if (error) throw error
      return (data ?? []) as unknown as ServiceOffer[]
    },
  })
}

/** Offers I have made. */
export function useSentServiceOffers() {
  const session = useSessionStore((state) => state.session)

  return useQuery({
    queryKey: serviceOfferKeys.sent,
    enabled: Boolean(session),
    queryFn: async (): Promise<ServiceOffer[]> => {
      const { data, error } = await supabase
        .from('service_offers')
        .select(SELECT)
        .eq('from_profile', session!.user.id)
        .order('created_at', { ascending: false })
      if (error) throw error
      return (data ?? []) as unknown as ServiceOffer[]
    },
  })
}

function invalidateAll(queryClient: ReturnType<typeof useQueryClient>) {
  return Promise.all([
    queryClient.invalidateQueries({ queryKey: serviceOfferKeys.received }),
    queryClient.invalidateQueries({ queryKey: serviceOfferKeys.sent }),
  ])
}

/**
 * Offer a coffee or local tips on somebody's trip, unprompted.
 *
 * The database decides whether it may: the trip must be one the member can see,
 * they must have posted that service in its city, and the dates must fit. Its
 * error messages are written to be shown as they are.
 */
export function useSendServiceOffer() {
  const queryClient = useQueryClient()
  const session = useSessionStore((state) => state.session)

  return useMutation({
    mutationFn: async (input: {
      kind: ServiceOfferKind
      tripId: string
      toProfile: string
      message?: string
    }) => {
      const { error } = await supabase.from('service_offers').insert({
        kind: input.kind,
        trip_id: input.tripId,
        from_profile: session!.user.id,
        to_profile: input.toProfile,
        message: input.message?.trim() || null,
      })
      if (error) throw error
    },
    onSuccess: async (_data, variables) => {
      track('service_offer_sent', { kind: variables.kind })
      await invalidateAll(queryClient)
    },
  })
}

const ACCEPT_ERRORS: Record<string, string> = {
  offer_not_found: 'That offer is no longer there.',
  offer_not_pending: 'That offer has already been answered.',
  offer_expired: 'That trip is over, so the offer has lapsed.',
  trip_cancelled: 'That trip was cancelled.',
  not_approved: 'Both of you need to be verified members.',
}

/** Accepting shares both members' contact details. */
export function useAcceptServiceOffer() {
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: async (offerId: string): Promise<{ grantedWith: string }> => {
      const { data, error } = await supabase.rpc('accept_service_offer', { p_offer_id: offerId })
      if (error) throw error
      const result = data as { ok: true; grantedWith: string } | { ok: false; error: string }
      if (!result.ok) {
        throw new Error(ACCEPT_ERRORS[result.error] ?? 'That offer could not be accepted.')
      }
      return { grantedWith: result.grantedWith }
    },
    onSuccess: () => invalidateAll(queryClient),
  })
}

/** Decline (as the one offered to) or withdraw (as the one offering). */
export function useAnswerServiceOffer() {
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: async (input: { id: string; status: 'declined' | 'withdrawn' }) => {
      const { error } = await supabase
        .from('service_offers')
        .update({ status: input.status })
        .eq('id', input.id)
      if (error) throw error
    },
    onSuccess: () => invalidateAll(queryClient),
  })
}

/** A trip somebody else posted that this member is allowed to see. */
export type VisibleTrip = {
  id: string
  profile_id: string
  city_id: string
  start_date: string
  end_date: string
  needs: string[]
  note: string | null
  status: 'active' | 'cancelled' | 'completed'
  cities: { name: string } | null
  traveller: {
    id: string
    display_name: string
    discipline: string
    specialisation: string | null
    photo_path: string | null
    home_district: string | null
  } | null
}

/**
 * One trip, as the signed-in member may see it. Row-level security decides: a
 * trip that is not visible to them comes back as nothing, never as an error
 * about visibility, so the screen cannot reveal that it exists.
 */
export function useVisibleTrip(tripId: string | undefined) {
  return useQuery({
    queryKey: ['visible-trip', tripId ?? ''],
    enabled: Boolean(tripId),
    queryFn: async (): Promise<VisibleTrip | null> => {
      const { data, error } = await supabase
        .from('trips')
        .select(
          'id, profile_id, city_id, start_date, end_date, needs, note, status, cities(name), traveller:profiles!trips_profile_id_fkey(id, display_name, discipline, specialisation, photo_path, home_district)',
        )
        .eq('id', tripId!)
        .maybeSingle()
      if (error) throw error
      return data as unknown as VisibleTrip | null
    },
  })
}
