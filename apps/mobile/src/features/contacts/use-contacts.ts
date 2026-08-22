import { useQuery } from '@tanstack/react-query'

import { useSessionStore } from '@/features/auth/session-store'
import { supabase } from '@/lib/supabase'

export const contactKeys = {
  all: ['contacts'] as const,
  one: (profileId: string) => ['contact', profileId] as const,
  stays: ['stays'] as const,
}

export type ContactDetails = {
  profile_id: string
  email: string | null
  phone: string | null
  whatsapp: string | null
  preferred_channel: 'whatsapp' | 'phone' | 'email' | null
}

export type Stay = {
  id: string
  offer_id: string
  host_id: string
  guest_id: string
  start_date: string
  end_date: string
  cities: { name: string } | null
}

/**
 * The contact card.
 *
 * THE CLIENT PERFORMS NO VISIBILITY CHECK. RLS returns the row once a contact
 * grant exists and returns nothing before that, so an empty result IS the
 * answer. Never gate the reveal in client code — a screen that decides for
 * itself whether to show a phone number is a screen that can get it wrong.
 */
export function useContact(profileId: string | undefined) {
  return useQuery({
    queryKey: contactKeys.one(profileId ?? ''),
    enabled: Boolean(profileId),
    queryFn: async (): Promise<ContactDetails | null> => {
      const { data, error } = await supabase
        .from('contact_details')
        .select('profile_id, email, phone, whatsapp, preferred_channel')
        .eq('profile_id', profileId!)
        .maybeSingle()
      if (error) throw error
      return data as ContactDetails | null
    },
  })
}

/** Everyone the signed-in member may now contact, newest grant first. */
export function useMyContacts() {
  const session = useSessionStore((state) => state.session)

  return useQuery({
    queryKey: contactKeys.all,
    enabled: Boolean(session),
    queryFn: async () => {
      const { data, error } = await supabase
        .from('contact_grants')
        .select('id, profile_a, profile_b, source, created_at')
        .order('created_at', { ascending: false })
      if (error) throw error

      const userId = session!.user.id
      // The pair is stored canonically (a < b), so "the other person" is
      // whichever end is not me.
      const others = (data ?? []).map((grant) => ({
        profileId: grant.profile_a === userId ? grant.profile_b : grant.profile_a,
        source: grant.source as 'offer' | 'co_request',
        createdAt: grant.created_at as string,
      }))

      // A pair can hold more than one grant — a co-accommodation this spring
      // and a couch next autumn. Show the person once.
      const seen = new Set<string>()
      return others.filter((entry) => {
        if (seen.has(entry.profileId)) return false
        seen.add(entry.profileId)
        return true
      })
    },
  })
}

/** Stays involving me, as host or guest. Milestone 4 reviews hang off these. */
export function useMyStays() {
  const session = useSessionStore((state) => state.session)

  return useQuery({
    queryKey: contactKeys.stays,
    enabled: Boolean(session),
    queryFn: async (): Promise<Stay[]> => {
      const { data, error } = await supabase
        .from('stays')
        .select('id, offer_id, host_id, guest_id, start_date, end_date, cities(name)')
        .order('start_date', { ascending: true })
      if (error) throw error
      return data as unknown as Stay[]
    },
  })
}

/** The stay shared with one other member, if there is one. */
export function useStayWith(profileId: string | undefined) {
  const stays = useMyStays()
  const session = useSessionStore((state) => state.session)
  const userId = session?.user.id

  const stay = stays.data?.find(
    (row) =>
      (row.host_id === profileId && row.guest_id === userId) ||
      (row.guest_id === profileId && row.host_id === userId),
  )

  return { stay, isPending: stays.isPending }
}
