import type { DateRange } from '@gigaway/shared'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'

import { useSessionStore } from '@/features/auth/session-store'
import { track } from '@/lib/analytics'
import { callFunction } from '@/lib/functions'
import { supabase } from '@/lib/supabase'

export const offerKeys = {
  received: ['offers', 'received'] as const,
  sent: ['offers', 'sent'] as const,
  forTrip: (tripId: string) => ['offers', 'trip', tripId] as const,
}

export type OfferStatus = 'pending' | 'accepted' | 'declined' | 'withdrawn' | 'expired'

export type OfferPerson = {
  id: string
  display_name: string
  discipline: string
  specialisation: string | null
  photo_path: string | null
  home_district: string | null
}

export type Offer = {
  id: string
  request_id: string | null
  trip_id: string
  from_profile: string
  to_profile: string
  city_id: string | null
  start_date: string
  end_date: string
  message: string | null
  status: OfferStatus
  auto_declined: boolean
  created_at: string
  trips: { id: string; start_date: string; end_date: string; cities: { name: string } | null } | null
  cities: { name: string } | null
  host: OfferPerson | null
  traveller: OfferPerson | null
}

const OFFER_SELECT = `
  id, request_id, trip_id, from_profile, to_profile, city_id,
  start_date, end_date, message, status, auto_declined, created_at,
  trips(id, start_date, end_date, cities(name)),
  cities(name),
  host:profiles!offers_from_profile_fkey(id, display_name, discipline, specialisation, photo_path, home_district),
  traveller:profiles!offers_to_profile_fkey(id, display_name, discipline, specialisation, photo_path, home_district)
`

/** Offers made to me. The traveller's side — this is what gets accepted. */
export function useReceivedOffers() {
  const session = useSessionStore((state) => state.session)

  return useQuery({
    queryKey: offerKeys.received,
    enabled: Boolean(session),
    queryFn: async (): Promise<Offer[]> => {
      const { data, error } = await supabase
        .from('offers')
        .select(OFFER_SELECT)
        .eq('to_profile', session!.user.id)
        .order('created_at', { ascending: false })
      if (error) throw error
      return data as unknown as Offer[]
    },
  })
}

/** Offers I have made, so a host can see what they are waiting on. */
export function useSentOffers() {
  const session = useSessionStore((state) => state.session)

  return useQuery({
    queryKey: offerKeys.sent,
    enabled: Boolean(session),
    queryFn: async (): Promise<Offer[]> => {
      const { data, error } = await supabase
        .from('offers')
        .select(OFFER_SELECT)
        .eq('from_profile', session!.user.id)
        .order('created_at', { ascending: false })
      if (error) throw error
      return data as unknown as Offer[]
    },
  })
}

/** Offers on one trip, shown on the match screen above the search results. */
export function useOffersForTrip(tripId: string | undefined) {
  const session = useSessionStore((state) => state.session)

  return useQuery({
    queryKey: offerKeys.forTrip(tripId ?? ''),
    enabled: Boolean(tripId && session),
    queryFn: async (): Promise<Offer[]> => {
      const { data, error } = await supabase
        .from('offers')
        .select(OFFER_SELECT)
        .eq('trip_id', tripId!)
        .order('created_at', { ascending: false })
      if (error) throw error
      return data as unknown as Offer[]
    },
  })
}

/**
 * Creates an offer.
 *
 * The range is validated by a database trigger against trip ∩ availability, so
 * this does not re-check it. A client-side check would only ever be a
 * courtesy, and duplicating the rule is how the two drift apart.
 */
export function useCreateOffer() {
  const queryClient = useQueryClient()
  const session = useSessionStore((state) => state.session)

  return useMutation({
    mutationFn: async (input: {
      tripId: string
      toProfile: string
      range: DateRange
      requestId?: string | null
      message?: string
    }) => {
      const { error } = await supabase.from('offers').insert({
        trip_id: input.tripId,
        request_id: input.requestId ?? null,
        from_profile: session!.user.id,
        to_profile: input.toProfile,
        start_date: input.range.start,
        end_date: input.range.end,
        message: input.message?.trim() || null,
      })
      if (error) throw error
    },
    onSuccess: async (_data, variables) => {
      track('offer_sent', { proactive: variables.requestId ? 0 : 1 })
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: offerKeys.sent }),
        queryClient.invalidateQueries({ queryKey: offerKeys.forTrip(variables.tripId) }),
        queryClient.invalidateQueries({ queryKey: ['requests'] }),
      ])
    },
  })
}

/** One offer of mine, for the revise form. */
export function useOffer(offerId: string | undefined) {
  return useQuery({
    queryKey: ['offer', offerId ?? ''],
    enabled: Boolean(offerId),
    queryFn: async (): Promise<Offer | null> => {
      const { data, error } = await supabase
        .from('offers')
        .select(OFFER_SELECT)
        .eq('id', offerId!)
        .maybeSingle()
      if (error) throw error
      return data as unknown as Offer | null
    },
  })
}

/**
 * Revises an offer that has not been answered yet.
 *
 * Replaces making a second one. A host used to be able to answer the same
 * request twice, which left the traveller holding two overlapping offers from
 * one person; a partial unique index now makes that impossible, and this is
 * what the host does instead.
 *
 * As with creation, the range is validated by the database trigger against
 * trip ∩ availability rather than re-checked here.
 */
export function useUpdateOffer() {
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: async (input: {
      offerId: string
      tripId: string
      range: DateRange
      message?: string
    }) => {
      const { error } = await supabase
        .from('offers')
        .update({
          start_date: input.range.start,
          end_date: input.range.end,
          message: input.message?.trim() || null,
        })
        .eq('id', input.offerId)
      if (error) throw error
    },
    onSuccess: async (_data, variables) => {
      track('offer_revised')
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: ['offer', variables.offerId] }),
        queryClient.invalidateQueries({ queryKey: offerKeys.sent }),
        queryClient.invalidateQueries({ queryKey: offerKeys.forTrip(variables.tripId) }),
        queryClient.invalidateQueries({ queryKey: ['requests'] }),
      ])
    },
  })
}

/**
 * The payoff. Reveals contact, creates the stay, and closes every competing
 * offer — all inside one database transaction.
 *
 * Safe to call twice: the function is idempotent, so a double tap on a bad
 * connection returns the same stay rather than an error.
 */
export function useAcceptOffer() {
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: async (offerId: string) =>
      callFunction<{
        ok: true
        stayId: string
        range: DateRange
        nights: number
        autoDeclinedCount: number
      }>('accept-offer', { offerId }),
    onSuccess: async (result) => {
      track('offer_accepted', { nights: result.nights, autoDeclined: result.autoDeclinedCount })
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: ['offers'] }),
        queryClient.invalidateQueries({ queryKey: ['requests'] }),
        queryClient.invalidateQueries({ queryKey: ['contacts'] }),
        queryClient.invalidateQueries({ queryKey: ['stays'] }),
      ])
    },
  })
}

export function useDeclineOffer() {
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: async (offerId: string) => {
      const { error } = await supabase
        .from('offers')
        .update({ status: 'declined' })
        .eq('id', offerId)
      if (error) throw error
    },
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: ['offers'] })
    },
  })
}

export function useWithdrawOffer() {
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: async (offerId: string) => {
      const { error } = await supabase
        .from('offers')
        .update({ status: 'withdrawn' })
        .eq('id', offerId)
      if (error) throw error
    },
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: ['offers'] })
    },
  })
}

export type OfferableWindow = {
  availability_id: string
  city_id: string
  city_name: string
  distance_km: number
  window_start: string
  window_end: string
  max_nights: number | null
}

/**
 * The nights this host could legally offer against a trip.
 *
 * Computed in SQL by the same rule the containment trigger enforces, including
 * the nearby-city allowance, so the form and the database cannot disagree
 * about what is offerable.
 */
export function useOfferableWindows(tripId: string | undefined) {
  const session = useSessionStore((state) => state.session)

  return useQuery({
    queryKey: ['offerable-windows', tripId ?? ''],
    enabled: Boolean(tripId && session),
    queryFn: async (): Promise<OfferableWindow[]> => {
      const { data, error } = await supabase.rpc('offerable_windows', { p_trip_id: tripId! })
      if (error) throw error
      return (data ?? []) as unknown as OfferableWindow[]
    },
  })
}

export type OfferTripContext = {
  id: string
  profile_id: string
  start_date: string
  end_date: string
  needs: string[]
  note: string | null
  cities: { name: string } | null
  traveller: OfferPerson | null
}

/** The trip an offer is being written against, with the traveller attached. */
export function useOfferTrip(tripId: string | undefined) {
  return useQuery({
    queryKey: ['offer-trip', tripId ?? ''],
    enabled: Boolean(tripId),
    queryFn: async (): Promise<OfferTripContext> => {
      const { data, error } = await supabase
        .from('trips')
        .select(
          'id, profile_id, start_date, end_date, needs, note, cities(name), traveller:profiles!trips_profile_id_fkey(id, display_name, discipline, specialisation, photo_path, home_district)',
        )
        .eq('id', tripId!)
        .single()
      if (error) throw error
      return data as unknown as OfferTripContext
    },
  })
}

export type OpenTrip = {
  trip_id: string
  profile_id: string
  display_name: string
  discipline: string
  specialisation: string | null
  photo_path: string | null
  city_id: string
  city_name: string
  distance_km: number
  trip_start: string
  trip_end: string
  needs: string[]
  note: string | null
  overlap_start: string
  overlap_end: string
  overlap_nights: number
  already_offered: boolean
  already_asked: boolean
}

/**
 * Travellers coming to a city this member has a couch in.
 *
 * The mirror of search_matches, and the only route to a proactive offer: a
 * host who has to wait to be asked can only ever be half of this marketplace.
 */
export function useOpenTrips() {
  const session = useSessionStore((state) => state.session)

  return useQuery({
    queryKey: ['open-trips'],
    enabled: Boolean(session),
    queryFn: async (): Promise<OpenTrip[]> => {
      const { data, error } = await supabase.rpc('search_open_trips')
      if (error) throw error
      return (data ?? []) as unknown as OpenTrip[]
    },
  })
}
