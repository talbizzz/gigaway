import type { Session } from '@supabase/supabase-js'
import { create } from 'zustand'

import { useOnboardingDraft } from '@/features/onboarding/draft-store'
import { queryClient } from '@/lib/query'
import { supabase } from '@/lib/supabase'

/**
 * Deliberately thin. Almost all state in this app is server state and belongs
 * to TanStack Query; this store holds only the auth session and whether the
 * initial session restore has finished, which routing depends on.
 */
type SessionState = {
  session: Session | null
  /** False until the persisted session has been read from SecureStore. */
  initialised: boolean
  /**
   * True from the moment a password-recovery deep link establishes a session
   * until the new password is actually set. A recovery session is a real
   * session as far as Supabase is concerned, so without this the auth gate
   * would read it as an ordinary sign-in and route straight into the app —
   * see use-auth-gate.ts.
   */
  isRecovering: boolean
  /**
   * True when the signed-in account was removed (by the member, or by an admin)
   * and the app signed the device out. Shown once on the welcome screen, and
   * cleared when someone signs in again.
   */
  accountRemoved: boolean
  setSession: (session: Session | null) => void
  setRecovering: (isRecovering: boolean) => void
  markAccountRemoved: () => void
}

export const useSessionStore = create<SessionState>((set) => ({
  session: null,
  initialised: false,
  isRecovering: false,
  accountRemoved: false,
  setSession: (session) =>
    set(session ? { session, initialised: true, accountRemoved: false } : { session, initialised: true }),
  setRecovering: (isRecovering) => set({ isRecovering }),
  markAccountRemoved: () => set({ accountRemoved: true }),
}))

/**
 * Wires Supabase auth into the store. Call once, from the root layout.
 * Returns an unsubscribe function.
 */
export function initialiseSessionListener(): () => void {
  void supabase.auth.getSession().then(({ data }) => {
    useSessionStore.getState().setSession(data.session)
  })

  // Whose data the query cache is holding. `undefined` until a session has been
  // seen, so the first one restored from storage does not wipe a cache that is
  // still empty anyway.
  let cachedFor: string | null | undefined

  const {
    data: { subscription },
  } = supabase.auth.onAuthStateChange((event, session) => {
    // Everything cached belongs to the person who fetched it. Left alone it is
    // shown to whoever signs in next — and as fresh, for up to the stale time —
    // until a refetch happens to replace it. So empty it whenever the person
    // changes: on sign-out, and on a different account signing in. A token refresh
    // keeps the same id and keeps the cache.
    const userId = session?.user.id ?? null
    if (cachedFor !== undefined && cachedFor !== userId) queryClient.clear()
    cachedFor = userId

    // Fired specifically when the deep-link handler exchanges a recovery
    // code — distinct from the SIGNED_IN a confirmation link produces.
    if (event === 'PASSWORD_RECOVERY') useSessionStore.getState().setRecovering(true)
    // Half-finished answers belong to the person who typed them. Clear them when
    // the session ends, so the next person on a shared phone starts from nothing.
    if (!session) {
      useOnboardingDraft.getState().resetProfile()
      useOnboardingDraft.getState().resetVerification()
    }
    useSessionStore.getState().setSession(session)
  })

  return () => subscription.unsubscribe()
}

export const useSession = () => useSessionStore((state) => state.session)
export const useIsAuthenticated = () => useSessionStore((state) => state.session !== null)
export const useIsRecovering = () => useSessionStore((state) => state.isRecovering)
