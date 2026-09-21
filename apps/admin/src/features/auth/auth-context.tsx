import type { Session } from '@supabase/supabase-js'
import { createContext, useContext, useEffect, useState, type ReactNode } from 'react'

import { supabase } from '@/lib/supabase'

type AuthStatus = 'loading' | 'signed-out' | 'not-admin' | 'admin'

type AuthContextValue = {
  status: AuthStatus
  session: Session | null
  signOut: () => Promise<void>
}

const AuthContext = createContext<AuthContextValue | null>(null)

/**
 * The one place is_admin() gets checked on the client. A session that
 * authenticates but fails the check is signed out immediately, in the same
 * effect that discovers it — there is no intermediate render where a
 * not-actually-admin session could see a route meant for admins, because
 * `status` never passes through 'admin' for that session at all.
 */
export function AuthProvider({ children }: { children: ReactNode }) {
  const [status, setStatus] = useState<AuthStatus>('loading')
  const [session, setSession] = useState<Session | null>(null)

  useEffect(() => {
    let cancelled = false

    async function evaluate(nextSession: Session | null) {
      if (!nextSession) {
        if (!cancelled) {
          setSession(null)
          setStatus('signed-out')
        }
        return
      }

      const { data, error } = await supabase.rpc('is_admin')

      if (cancelled) return

      if (error || !data) {
        await supabase.auth.signOut()
        if (!cancelled) {
          setSession(null)
          setStatus('not-admin')
        }
        return
      }

      setSession(nextSession)
      setStatus('admin')
    }

    supabase.auth.getSession().then(({ data }) => evaluate(data.session))

    const { data: subscription } = supabase.auth.onAuthStateChange((_event, nextSession) => {
      void evaluate(nextSession)
    })

    return () => {
      cancelled = true
      subscription.subscription.unsubscribe()
    }
  }, [])

  async function signOut() {
    await supabase.auth.signOut()
    setSession(null)
    setStatus('signed-out')
  }

  return (
    <AuthContext.Provider value={{ status, session, signOut }}>{children}</AuthContext.Provider>
  )
}

export function useAuth() {
  const value = useContext(AuthContext)
  if (!value) throw new Error('useAuth must be used within AuthProvider')
  return value
}
