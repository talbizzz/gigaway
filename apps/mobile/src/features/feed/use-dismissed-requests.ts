import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'

import { secureStorage } from '@/lib/secure-storage'

const STORAGE_KEY = 'feed.dismissed.requests'

// Enough that a member never sees a card twice in practice, small enough that
// the list cannot grow without bound on a device that is never signed out of.
const MAX_REMEMBERED = 100

export const dismissedKeys = {
  requests: ['feed', 'dismissed', 'requests'] as const,
}

async function read(): Promise<string[]> {
  const raw = await secureStorage.getItem(STORAGE_KEY)
  if (!raw) return []

  try {
    const parsed: unknown = JSON.parse(raw)
    return Array.isArray(parsed) ? parsed.filter((id): id is string => typeof id === 'string') : []
  } catch {
    // A corrupted value is not worth surfacing: the cost of getting this wrong
    // is one card reappearing.
    return []
  }
}

/**
 * Request cards the member has swept off the feed on this device.
 *
 * Deliberately local. Dismissing an activity card marks the notification read,
 * because that is what "read" means — but a pending request has not been
 * answered just because its card was pushed aside, and it stays waiting under
 * Requests with the header count untouched.
 */
export function useDismissedRequests() {
  return useQuery({
    queryKey: dismissedKeys.requests,
    queryFn: read,
    // Device-local and only written through the mutation below, so there is
    // nothing to go stale against.
    staleTime: Infinity,
  })
}

export function useDismissRequest() {
  const queryClient = useQueryClient()

  return useMutation({
    /**
     * @param liveIds ids still worth remembering — anything answered or expired
     *   is dropped on write, so the list tracks the pending set rather than
     *   growing forever.
     */
    mutationFn: async ({ id, liveIds }: { id: string; liveIds: string[] }) => {
      const existing = await read()
      const live = new Set([...liveIds, id])
      const next = [...existing.filter((row) => live.has(row)), id]
        .filter((row, index, all) => all.indexOf(row) === index)
        .slice(-MAX_REMEMBERED)

      await secureStorage.setItem(STORAGE_KEY, JSON.stringify(next))
      return next
    },
    onSuccess: (next) => {
      queryClient.setQueryData(dismissedKeys.requests, next)
    },
  })
}
