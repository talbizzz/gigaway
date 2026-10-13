import { useQuery } from '@tanstack/react-query'

import { supabase } from '@/lib/supabase'

export type MemberStats = {
  connections: number
  trips: number
  services: number
}

export type MemberTrip = {
  id: string
  city_id: string
  city_name: string
  start_date: string
  end_date: string
  needs: string[]
  note: string | null
  visibility: 'public' | 'connections' | 'private'
}

export type MemberConnection = {
  profile_id: string
  display_name: string
  username: string | null
  discipline: string
  specialisation: string | null
  photo_path: string | null
  /** How the member stands with the one looking: self, connected, requested, incoming or none. */
  relationship: 'self' | 'connected' | 'requested' | 'incoming' | 'none'
}

export type ServiceKind = 'couch' | 'tips' | 'coffee'

export type MemberService = {
  kind: ServiceKind
  /** Null when the recipient has been blocked by the one looking. */
  recipient_id: string | null
  recipient_name: string | null
  username: string | null
  discipline: string | null
  photo_path: string | null
  /** Null when it was for a private trip, unless the one looking is the member. */
  city_name: string | null
  completed_on: string
}

export const memberKeys = {
  stats: (profileId: string) => ['member', 'stats', profileId] as const,
  trips: (profileId: string) => ['member', 'trips', profileId] as const,
  connections: (profileId: string) => ['member', 'connections', profileId] as const,
  services: (profileId: string) => ['member', 'services', profileId] as const,
}

/**
 * The three numbers on a profile. The database decides who may see them (anyone
 * who can see the member) and what counts toward each; this only asks.
 */
export function useMemberStats(profileId: string | undefined) {
  return useQuery({
    queryKey: memberKeys.stats(profileId ?? ''),
    enabled: Boolean(profileId),
    queryFn: async (): Promise<MemberStats | null> => {
      const { data, error } = await supabase.rpc('member_stats', { p_profile: profileId! })
      if (error) throw error
      return (data?.[0] as MemberStats | undefined) ?? null
    },
  })
}

/**
 * The details behind a number. Each returns nothing unless the one asking is the
 * member or their connection, so the screen that shows them performs no check of
 * its own: an empty list is the whole answer.
 */
export function useMemberTrips(profileId: string | undefined, enabled = true) {
  return useQuery({
    queryKey: memberKeys.trips(profileId ?? ''),
    enabled: Boolean(profileId) && enabled,
    queryFn: async (): Promise<MemberTrip[]> => {
      const { data, error } = await supabase.rpc('member_trips', { p_profile: profileId! })
      if (error) throw error
      return (data ?? []) as MemberTrip[]
    },
  })
}

export function useMemberConnections(profileId: string | undefined, enabled = true) {
  return useQuery({
    queryKey: memberKeys.connections(profileId ?? ''),
    enabled: Boolean(profileId) && enabled,
    queryFn: async (): Promise<MemberConnection[]> => {
      const { data, error } = await supabase.rpc('member_connections', { p_profile: profileId! })
      if (error) throw error
      return (data ?? []) as MemberConnection[]
    },
  })
}

export function useMemberServices(profileId: string | undefined, enabled = true) {
  return useQuery({
    queryKey: memberKeys.services(profileId ?? ''),
    enabled: Boolean(profileId) && enabled,
    queryFn: async (): Promise<MemberService[]> => {
      const { data, error } = await supabase.rpc('member_services', { p_profile: profileId! })
      if (error) throw error
      return (data ?? []) as MemberService[]
    },
  })
}
