import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'

import { useSessionStore } from '@/features/auth/session-store'
import { supabase } from '@/lib/supabase'

export const inviteKeys = {
  mine: ['invites', 'mine'] as const,
  overview: ['invites', 'overview'] as const,
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
      await queryClient.invalidateQueries({ queryKey: inviteKeys.mine })
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
      await queryClient.invalidateQueries({ queryKey: inviteKeys.mine })
    },
  })
}

export type InvitedMember = {
  redeemedBy: string
  redeemedAt: string
}

/**
 * Everyone who has ever redeemed one of this member's invite codes — the
 * traceable chain from their side, rather than the moderator's.
 *
 * One round trip: invites embeds invite_redemptions through the foreign key,
 * so Postgrest returns each invite with its redemptions nested rather than
 * needing a second query keyed off the first result. RLS still applies inside
 * the embed — invite_redemptions_select_involved already covers "an invite I
 * created", which is exactly this query's shape.
 *
 * Whether a redeemed member is still visible by name depends on the ordinary
 * profile policy (approved, not blocking each other) — this hook only says
 * who redeemed and when, not who they are. The screen resolves each one
 * through useMemberProfile, same as a blocked member's row does, and treats a
 * null result as "not visible right now" rather than an error.
 */
export function useMyInvitedMembers() {
  const session = useSessionStore((state) => state.session)

  return useQuery({
    queryKey: inviteKeys.overview,
    enabled: Boolean(session),
    queryFn: async (): Promise<InvitedMember[]> => {
      const { data, error } = await supabase
        .from('invites')
        .select('invite_redemptions(redeemed_by, redeemed_at)')
      if (error) throw error

      return data
        .flatMap((invite) => invite.invite_redemptions)
        .map((redemption) => ({
          redeemedBy: redemption.redeemed_by,
          redeemedAt: redemption.redeemed_at,
        }))
        .sort((a, b) => b.redeemedAt.localeCompare(a.redeemedAt))
    },
  })
}
