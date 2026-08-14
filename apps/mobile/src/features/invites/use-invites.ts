import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'

import { useSessionStore } from '@/features/auth/session-store'
import { supabase } from '@/lib/supabase'

export const inviteKeys = {
  mine: ['invites', 'mine'] as const,
  quota: ['invites', 'quota'] as const,
}

export type Invite = {
  id: string
  code: string
  uses: number
  max_uses: number
  expires_at: string
  revoked_at: string | null
  created_at: string
}

/** Live invites this member has created, newest first. */
export function useMyInvites() {
  const session = useSessionStore((state) => state.session)

  return useQuery({
    queryKey: inviteKeys.mine,
    enabled: Boolean(session),
    queryFn: async (): Promise<Invite[]> => {
      const { data, error } = await supabase
        .from('invites')
        .select('id, code, uses, max_uses, expires_at, revoked_at, created_at')
        .order('created_at', { ascending: false })
      if (error) throw error
      return data
    },
  })
}

/**
 * How many more invites may be created. Computed in the database so the number
 * shown always matches what the insert policy will actually allow.
 */
export function useRemainingQuota() {
  const session = useSessionStore((state) => state.session)

  return useQuery({
    queryKey: inviteKeys.quota,
    enabled: Boolean(session),
    queryFn: async (): Promise<number> => {
      const { data, error } = await supabase.rpc('remaining_invite_quota')
      if (error) throw error
      return data ?? 0
    },
  })
}

export function useCreateInvite() {
  const queryClient = useQueryClient()
  const session = useSessionStore((state) => state.session)

  return useMutation({
    mutationFn: async (): Promise<Invite> => {
      const { data, error } = await supabase
        .from('invites')
        .insert({ created_by: session!.user.id })
        .select('id, code, uses, max_uses, expires_at, revoked_at, created_at')
        .single()
      if (error) throw error
      return data
    },
    onSuccess: async () => {
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: inviteKeys.mine }),
        queryClient.invalidateQueries({ queryKey: inviteKeys.quota }),
      ])
    },
  })
}

export function useRevokeInvite() {
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: async (inviteId: string) => {
      const { error } = await supabase
        .from('invites')
        .update({ revoked_at: new Date().toISOString() })
        .eq('id', inviteId)
      if (error) throw error
    },
    onSuccess: async () => {
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: inviteKeys.mine }),
        queryClient.invalidateQueries({ queryKey: inviteKeys.quota }),
      ])
    },
  })
}
