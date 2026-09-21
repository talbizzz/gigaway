import { useQuery } from '@tanstack/react-query'

import { formatDateTime } from '@/lib/format'
import { supabase } from '@/lib/supabase'

/** Per MODERATION.md: empty is the healthy state here, not a loading artifact. */
export function StuckNotificationsCard() {
  const { data, isLoading, error } = useQuery({
    queryKey: ['admin_stuck_notifications'],
    queryFn: async () => {
      const { data, error } = await supabase.rpc('admin_stuck_notifications')
      if (error) throw error
      return data
    },
  })

  return (
    <div className="card">
      <h2 style={{ fontSize: 15, marginBottom: 'var(--space-lg)' }}>Stuck notifications</h2>
      {error && <p className="field-error">Couldn't load: {error.message}</p>}
      {isLoading && <p className="empty-state">Loading…</p>}
      {!isLoading && data && data.length === 0 && (
        <p className="empty-state">
          None — this is the healthy state. Rows here mean dispatch-notifications is failing.
        </p>
      )}
      {!isLoading && data && data.length > 0 && (
        <table className="data-table">
          <thead>
            <tr>
              <th>Member</th>
              <th>Type</th>
              <th>Attempts</th>
              <th>Last error</th>
              <th>Waiting since</th>
            </tr>
          </thead>
          <tbody>
            {data.map((n) => (
              <tr key={n.id} style={{ cursor: 'default' }}>
                <td>{n.display_name}</td>
                <td>{n.type}</td>
                <td>{n.attempts}</td>
                <td>{n.last_error ?? '—'}</td>
                <td>{formatDateTime(n.created_at)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </div>
  )
}
