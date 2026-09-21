import { useQuery } from '@tanstack/react-query'
import { useNavigate } from 'react-router-dom'

import { StatusPill } from '@/app/status-pill'
import { formatDate } from '@/lib/format'
import { supabase } from '@/lib/supabase'

const SHOWN = 20

export function RecentSignupsCard() {
  const navigate = useNavigate()
  const { data, isLoading, error } = useQuery({
    queryKey: ['admin_recent_signups'],
    queryFn: async () => {
      const { data, error } = await supabase.rpc('admin_recent_signups')
      if (error) throw error
      return data
    },
  })

  const shown = data?.slice(0, SHOWN)

  return (
    <div className="card">
      <h2 style={{ fontSize: 15, marginBottom: 'var(--space-lg)' }}>Recent signups</h2>
      {error && <p className="field-error">Couldn't load: {error.message}</p>}
      {isLoading && <p className="empty-state">Loading…</p>}
      {!isLoading && shown && shown.length === 0 && (
        <p className="empty-state">No signups yet.</p>
      )}
      {!isLoading && shown && shown.length > 0 && (
        <>
          <table className="data-table">
            <thead>
              <tr>
                <th>Name</th>
                <th>Status</th>
                <th>Discipline</th>
                <th>Home city</th>
                <th>Joined</th>
              </tr>
            </thead>
            <tbody>
              {shown.map((p) => (
                <tr key={p.id} onClick={() => p.id && navigate(`/users/${p.id}`)}>
                  <td>{p.display_name}</td>
                  <td>
                    <StatusPill status={p.status} />
                  </td>
                  <td>{p.discipline}</td>
                  <td>{p.home_city ?? '—'}</td>
                  <td>{formatDate(p.created_at)}</td>
                </tr>
              ))}
            </tbody>
          </table>
          {data && data.length > SHOWN && (
            <p style={{ color: 'var(--text-muted)', fontSize: 13, marginTop: 'var(--space-md)' }}>
              Showing the {SHOWN} most recent of {data.length}.
            </p>
          )}
        </>
      )}
    </div>
  )
}
