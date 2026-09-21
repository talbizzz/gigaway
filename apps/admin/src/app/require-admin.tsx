import type { ReactNode } from 'react'
import { Navigate } from 'react-router-dom'

import { useAuth } from '@/features/auth/auth-context'

/**
 * Route guard. `status` never passes through 'admin' for a session that
 * failed is_admin() — see auth-context.tsx — so this only has three real
 * states to render: still checking, not signed in, or signed in as an admin.
 */
export function RequireAdmin({ children }: { children: ReactNode }) {
  const { status } = useAuth()

  if (status === 'loading') return null
  if (status !== 'admin') return <Navigate to="/login" replace />

  return <>{children}</>
}
