import type { NotificationPayload, NotificationType } from '@gigaway/shared'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'

import { useSessionStore } from '@/features/auth/session-store'
import { supabase } from '@/lib/supabase'

export const notificationKeys = {
  feed: ['notifications'] as const,
}

export type AppNotification = {
  id: string
  type: NotificationType
  payload: NotificationPayload
  created_at: string
  read_at: string | null
}

/**
 * The Activity list: one reverse-chronological list over the user's own
 * notifications.
 *
 * This is what makes a missed push recoverable, which is the whole reason it
 * exists. Deliberately unfiltered and ungrouped — the volume here is a handful
 * of rows per trip, and every control added to it is a control the user has to
 * understand before they can find the thing they came for.
 */
export function useNotifications() {
  const session = useSessionStore((state) => state.session)

  return useQuery({
    queryKey: notificationKeys.feed,
    enabled: Boolean(session),
    queryFn: async (): Promise<AppNotification[]> => {
      const { data, error } = await supabase
        .from('notifications')
        .select('id, type, payload, created_at, read_at')
        .order('created_at', { ascending: false })
        .limit(100)
      if (error) throw error
      return data as unknown as AppNotification[]
    },
  })
}

/** Drives the badge. Derived from the feed so there is only one query. */
export function useUnreadCount(): number {
  const { data } = useNotifications()
  return (data ?? []).filter((row) => row.read_at === null).length
}

export function useMarkNotificationRead() {
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: async (notificationId: string) => {
      const { error } = await supabase
        .from('notifications')
        .update({ read_at: new Date().toISOString() })
        .eq('id', notificationId)
        .is('read_at', null)
      if (error) throw error
    },
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: notificationKeys.feed })
    },
  })
}

/** Clears the badge in one tap when the user opens Activity. */
export function useMarkAllRead() {
  const queryClient = useQueryClient()
  const session = useSessionStore((state) => state.session)

  return useMutation({
    mutationFn: async () => {
      const { error } = await supabase
        .from('notifications')
        .update({ read_at: new Date().toISOString() })
        .eq('profile_id', session!.user.id)
        .is('read_at', null)
      if (error) throw error
    },
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: notificationKeys.feed })
    },
  })
}
