import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { useEffect, useState } from 'react'

import { useSessionStore } from '@/features/auth/session-store'
import { supabase } from '@/lib/supabase'

export type Relationship = 'none' | 'connected' | 'requested' | 'incoming'

/** What a connections list or a result row needs to show about a person. */
export type ConnectionProfile = {
  id: string
  display_name: string
  username: string | null
  discipline: string
  specialisation: string | null
  photo_path: string | null
}

export type ConnectionRow = {
  id: string
  status: 'pending' | 'accepted'
  requester_id: string
  addressee_id: string
  created_at: string
  requester: ConnectionProfile | null
  addressee: ConnectionProfile | null
}

export const connectionKeys = {
  all: ['connections'] as const,
  mine: (userId: string | undefined) => ['connections', 'mine', userId] as const,
  search: (term: string) => ['connections', 'search', term] as const,
}

const PROFILE_FIELDS = 'id, display_name, username, discipline, specialisation, photo_path'

/**
 * Every connection and connection request the signed-in member is part of.
 *
 * RLS returns only rows they are a party to, and the lists are small, so one
 * query feeds the Connections screen, the relationship on a member's page, and the
 * badge counts. Other people's profiles come embedded: connections and people who
 * asked are approved members, so the profile policy lets them through.
 */
export function useConnections() {
  const session = useSessionStore((state) => state.session)
  const userId = session?.user.id

  return useQuery({
    queryKey: connectionKeys.mine(userId),
    enabled: Boolean(userId),
    queryFn: async (): Promise<ConnectionRow[]> => {
      const { data, error } = await supabase
        .from('connections')
        .select(
          `id, status, requester_id, addressee_id, created_at,
           requester:profiles!connections_requester_id_fkey(${PROFILE_FIELDS}),
           addressee:profiles!connections_addressee_id_fkey(${PROFILE_FIELDS})`,
        )
        .order('created_at', { ascending: false })
      if (error) throw error
      return (data ?? []) as unknown as ConnectionRow[]
    },
  })
}

export type SplitConnections = {
  connected: { connectionId: string; profile: ConnectionProfile }[]
  incoming: { connectionId: string; profile: ConnectionProfile }[]
  outgoing: { connectionId: string; profile: ConnectionProfile }[]
}

/** The other person in a row, from the signed-in member's point of view. */
function otherParty(row: ConnectionRow, me: string | undefined): ConnectionProfile | null {
  return row.requester_id === me ? row.addressee : row.requester
}

export function splitConnections(rows: ConnectionRow[], me: string | undefined): SplitConnections {
  const out: SplitConnections = { connected: [], incoming: [], outgoing: [] }

  for (const row of rows) {
    const profile = otherParty(row, me)
    if (!profile) continue
    const entry = { connectionId: row.id, profile }

    if (row.status === 'accepted') out.connected.push(entry)
    else if (row.addressee_id === me) out.incoming.push(entry)
    else out.outgoing.push(entry)
  }

  out.connected.sort((a, b) => a.profile.display_name.localeCompare(b.profile.display_name))
  return out
}

export function useSplitConnections() {
  const session = useSessionStore((state) => state.session)
  const query = useConnections()
  return {
    ...query,
    split: splitConnections(query.data ?? [], session?.user.id),
  }
}

/** How the signed-in member stands with one other member. */
export function useRelationshipWith(profileId: string | undefined): {
  relationship: Relationship
  connectionId: string | null
  isPending: boolean
} {
  const { split, isPending } = useSplitConnections()

  const lookup = (entries: SplitConnections['connected']) =>
    entries.find((entry) => entry.profile.id === profileId)

  const connected = lookup(split.connected)
  if (connected) return { relationship: 'connected', connectionId: connected.connectionId, isPending }

  const incoming = lookup(split.incoming)
  if (incoming) return { relationship: 'incoming', connectionId: incoming.connectionId, isPending }

  const outgoing = lookup(split.outgoing)
  if (outgoing) return { relationship: 'requested', connectionId: outgoing.connectionId, isPending }

  return { relationship: 'none', connectionId: null, isPending }
}

export type SendConnectionRequestResult =
  | { ok: true; status: 'requested' | 'connected' }
  | { ok: false; error: string }

export const CONNECTION_REQUEST_ERRORS: Record<string, string> = {
  not_approved: 'You can connect with colleagues once your verification is approved.',
  user_not_found: 'That member is not available.',
  too_many_pending: 'You have a lot of requests waiting for an answer. Try again once some are answered.',
  self: 'That is you.',
}

export function useSendConnectionRequest() {
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: async (profileId: string) => {
      const { data, error } = await supabase.rpc('send_connection_request', { p_user: profileId })
      if (error) throw error
      const result = data as SendConnectionRequestResult
      if (!result.ok) {
        throw new Error(CONNECTION_REQUEST_ERRORS[result.error] ?? 'Could not send the request.')
      }
      return result
    },
    onSuccess: () => queryClient.invalidateQueries({ queryKey: connectionKeys.all }),
  })
}

export function useAcceptConnectionRequest() {
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: async (connectionId: string) => {
      const { error } = await supabase
        .from('connections')
        .update({ status: 'accepted' })
        .eq('id', connectionId)
      if (error) throw error
    },
    onSuccess: () => queryClient.invalidateQueries({ queryKey: connectionKeys.all }),
  })
}

/** Decline a request, cancel one you sent, or remove a connection: all delete the row. */
export function useRemoveConnection() {
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: async (connectionId: string) => {
      const { error } = await supabase.from('connections').delete().eq('id', connectionId)
      if (error) throw error
    },
    onSuccess: () => queryClient.invalidateQueries({ queryKey: connectionKeys.all }),
  })
}

export type MemberSearchResult = {
  profile_id: string
  display_name: string
  username: string | null
  discipline: string
  specialisation: string | null
  photo_path: string | null
  home_city: string | null
  relationship: Relationship
}

/** Find members by username or name. Waits for a pause in typing. */
export function useSearchMembers(term: string) {
  const [settled, setSettled] = useState(term.trim())

  useEffect(() => {
    const timer = setTimeout(() => setSettled(term.trim()), 300)
    return () => clearTimeout(timer)
  }, [term])

  const enough = settled.replace(/^@/, '').length >= 2

  return useQuery({
    queryKey: connectionKeys.search(settled),
    enabled: enough,
    staleTime: 15_000,
    queryFn: async (): Promise<MemberSearchResult[]> => {
      const { data, error } = await supabase.rpc('search_members', {
        p_query: settled,
        p_limit: 20,
      })
      if (error) throw error
      return (data ?? []) as MemberSearchResult[]
    },
  })
}

/** How many requests are waiting on the signed-in member's answer. */
export function useIncomingConnectionRequestCount(): number {
  const { split } = useSplitConnections()
  return split.incoming.length
}
