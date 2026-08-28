import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'

import { useSessionStore } from '@/features/auth/session-store'
import { track } from '@/lib/analytics'
import { supabase } from '@/lib/supabase'

export const blockKeys = {
  mine: ['blocks'] as const,
}

export type Block = {
  blocked_id: string
  created_at: string
}

/**
 * People this member has blocked.
 *
 * Only blocks they created — RLS hides the row from the blocked party
 * entirely, because a block that can be detected is not really a block.
 */
export function useMyBlocks() {
  const session = useSessionStore((state) => state.session)

  return useQuery({
    queryKey: blockKeys.mine,
    enabled: Boolean(session),
    queryFn: async (): Promise<Block[]> => {
      const { data, error } = await supabase
        .from('blocks')
        .select('blocked_id, created_at')
        .order('created_at', { ascending: false })
      if (error) throw error
      return data as Block[]
    },
  })
}

/** True when the signed-in member has blocked this person. */
export function useHasBlocked(profileId: string | undefined): boolean {
  const { data } = useMyBlocks()
  if (!profileId) return false
  return (data ?? []).some((row) => row.blocked_id === profileId)
}

/**
 * Blocks someone.
 *
 * A database trigger withdraws any pending request or offer between the pair,
 * silently — the notification that would normally follow a withdrawal is
 * suppressed, because it would announce the block to the person blocked.
 *
 * Almost every cached query changes shape afterwards, so this invalidates
 * broadly rather than trying to enumerate them.
 */
export function useBlockMember() {
  const queryClient = useQueryClient()
  const session = useSessionStore((state) => state.session)

  return useMutation({
    mutationFn: async (profileId: string) => {
      const { error } = await supabase
        .from('blocks')
        .insert({ blocker_id: session!.user.id, blocked_id: profileId })
      if (error) throw error
    },
    onSuccess: async () => {
      track('user_blocked')
      await queryClient.invalidateQueries()
    },
  })
}

/**
 * Unblocks someone.
 *
 * Restores visibility but not anything the block withdrew. That was a real
 * decision at the time, and silently resurrecting a request the other person
 * believed was gone would be worse than asking them to send it again.
 */
export function useUnblockMember() {
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: async (profileId: string) => {
      const { error } = await supabase.from('blocks').delete().eq('blocked_id', profileId)
      if (error) throw error
    },
    onSuccess: async () => {
      await queryClient.invalidateQueries()
    },
  })
}
