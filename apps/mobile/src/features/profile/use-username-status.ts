import { normaliseUsername, usernameProblemMessage } from '@gigaway/shared'
import { useQuery } from '@tanstack/react-query'
import { useEffect, useState } from 'react'

import { supabase } from '@/lib/supabase'

export type UsernameStatus =
  /** Nothing typed yet. */
  | { state: 'empty' }
  /** The member's own current username: fine, and nothing to check. */
  | { state: 'unchanged' }
  /** Breaks a format rule; `message` says which. */
  | { state: 'invalid'; message: string }
  | { state: 'checking' }
  | { state: 'ok' }
  | { state: 'taken' }

/**
 * Whether a username can be used, as the member types it.
 *
 * Format problems are explained straight from the shared rules with no network
 * call. Only a well-formed name is checked against the database, after a short
 * pause so each keystroke is not a request. The database still has the last
 * word: this is what lets the field say so before the form is sent.
 */
export function useUsernameStatus(value: string, currentUsername?: string | null): UsernameStatus {
  const normalised = normaliseUsername(value)
  const [settled, setSettled] = useState(normalised)

  useEffect(() => {
    const timer = setTimeout(() => setSettled(normalised), 400)
    return () => clearTimeout(timer)
  }, [normalised])

  const message = normalised ? usernameProblemMessage(normalised) : null
  const unchanged = Boolean(currentUsername) && normalised === currentUsername
  const checkable = Boolean(normalised) && !message && !unchanged

  const check = useQuery({
    queryKey: ['username-check', settled],
    enabled: checkable && settled === normalised,
    staleTime: 30_000,
    queryFn: async (): Promise<'ok' | 'taken' | 'invalid'> => {
      const { data, error } = await supabase.rpc('check_username', { p_username: settled })
      if (error) throw error
      return (data as 'ok' | 'taken' | 'invalid') ?? 'invalid'
    },
  })

  if (!normalised) return { state: 'empty' }
  if (unchanged) return { state: 'unchanged' }
  if (message) return { state: 'invalid', message }
  if (settled !== normalised || check.isPending || check.isFetching) return { state: 'checking' }
  if (check.data === 'taken') return { state: 'taken' }
  if (check.data === 'invalid') return { state: 'invalid', message: 'That name cannot be used.' }
  // A failed check does not block: the database refuses a taken name anyway.
  return { state: 'ok' }
}

/** True while the name is known to be unusable, or not yet known. */
export function usernameBlocksSubmit(status: UsernameStatus): boolean {
  return status.state === 'invalid' || status.state === 'taken' || status.state === 'checking' || status.state === 'empty'
}
