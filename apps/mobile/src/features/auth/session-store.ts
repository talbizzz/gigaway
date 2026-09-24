import type { Session } from '@supabase/supabase-js'
import { create } from 'zustand'

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
  setSession: (session: Session | null) => void
  setRecovering: (isRecovering: boolean) => void
}

export const useSessionStore = create<SessionState>((set) => ({
  session: null,
  initialised: false,
  isRecovering: false,
  setSession: (session) => set({ session, initialised: true }),
  setRecovering: (isRecovering) => set({ isRecovering }),
}))

/**
 * Wires Supabase auth into the store. Call once, from the root layout.
 * Returns an unsubscribe function.
 */
export function initialiseSessionListener(): () => void {
  void supabase.auth.getSession().then(({ data }) => {
    useSessionStore.getState().setSession(data.session)
  })

  const {
    data: { subscription },
  } = supabase.auth.onAuthStateChange((event, session) => {
    // Fired specifically when the deep-link handler exchanges a recovery
    // code — distinct from the SIGNED_IN a confirmation link produces.
    if (event === 'PASSWORD_RECOVERY') useSessionStore.getState().setRecovering(true)
    useSessionStore.getState().setSession(session)
  })

  return () => subscription.unsubscribe()
}

export const useSession = () => useSessionStore((state) => state.session)
export const useIsAuthenticated = () => useSessionStore((state) => state.session !== null)
export const useIsRecovering = () => useSessionStore((state) => state.isRecovering)
