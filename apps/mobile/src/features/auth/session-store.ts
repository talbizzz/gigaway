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
  setSession: (session: Session | null) => void
}

export const useSessionStore = create<SessionState>((set) => ({
  session: null,
  initialised: false,
  setSession: (session) => set({ session, initialised: true }),
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
  } = supabase.auth.onAuthStateChange((_event, session) => {
    useSessionStore.getState().setSession(session)
  })

  return () => subscription.unsubscribe()
}

export const useSession = () => useSessionStore((state) => state.session)
export const useIsAuthenticated = () => useSessionStore((state) => state.session !== null)
