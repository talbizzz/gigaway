import { NavLink, Outlet } from 'react-router-dom'

import { useAuth } from '@/features/auth/auth-context'
import { env } from '@/lib/env'

const links = [
  { to: '/', label: 'Dashboard' },
  { to: '/users', label: 'Users' },
  { to: '/trips', label: 'Trips' },
  { to: '/verifications', label: 'Verifications' },
  { to: '/reports', label: 'Reports' },
  { to: '/audit-log', label: 'Audit log' },
]

/**
 * The environment banner is load-bearing, not decoration: two Supabase
 * projects exist, and an admin who forgets which one they're pointed at can
 * suspend or delete a real person while thinking they're testing. It's
 * driven by VITE_ENV_LABEL, unset in the production build.
 */
export function Layout() {
  const { session, signOut } = useAuth()

  return (
    <div style={{ minHeight: '100%', display: 'flex', flexDirection: 'column' }}>
      {env.envLabel && (
        <div className="banner banner-dev">
          {env.envLabel.toUpperCase()} — acting against the development database
        </div>
      )}

      <header
        style={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          padding: 'var(--space-md) var(--space-xl)',
          borderBottom: '1px solid var(--border)',
        }}
      >
        <nav style={{ display: 'flex', gap: 'var(--space-lg)' }}>
          {links.map((link) => (
            <NavLink
              key={link.to}
              to={link.to}
              end={link.to === '/'}
              style={({ isActive }) => ({
                color: isActive ? 'var(--text)' : 'var(--text-muted)',
                fontWeight: isActive ? 600 : 400,
                textDecoration: 'none',
              })}
            >
              {link.label}
            </NavLink>
          ))}
        </nav>
        <div style={{ display: 'flex', alignItems: 'center', gap: 'var(--space-lg)' }}>
          <span style={{ color: 'var(--text-muted)', fontSize: 13 }}>{session?.user.email}</span>
          <button type="button" className="btn btn-secondary" onClick={() => void signOut()}>
            Sign out
          </button>
        </div>
      </header>

      <main style={{ flex: 1, padding: 'var(--space-xl)' }}>
        <Outlet />
      </main>
    </div>
  )
}
