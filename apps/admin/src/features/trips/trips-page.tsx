import { useQuery } from '@tanstack/react-query'
import { useState } from 'react'
import { useNavigate } from 'react-router-dom'

import { StatusPill } from '@/app/status-pill'
import { formatDate } from '@/lib/format'
import { supabase } from '@/lib/supabase'
import { useDebouncedValue } from '@/lib/use-debounced-value'

export function TripsPage() {
  const [query, setQuery] = useState('')
  const debouncedQuery = useDebouncedValue(query)
  const navigate = useNavigate()

  const { data, isLoading, error } = useQuery({
    queryKey: ['admin_search_trips', debouncedQuery],
    queryFn: async () => {
      const { data, error } = await supabase.rpc('admin_search_trips', {
        p_query: debouncedQuery || undefined,
      })
      if (error) throw error
      return data
    },
  })

  return (
    <div>
      <h1 style={{ fontSize: 22, marginBottom: 'var(--space-lg)' }}>Trips</h1>

      <div className="field" style={{ maxWidth: 360, marginBottom: 'var(--space-lg)' }}>
        <input
          type="search"
          placeholder="City or member name…"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          autoFocus
        />
      </div>

      {error && <p className="field-error">Couldn't load trips: {error.message}</p>}
      {isLoading && <p className="empty-state">Loading…</p>}
      {!isLoading && data && data.length === 0 && (
        <p className="empty-state">{query ? 'No trips match that search.' : 'No trips yet.'}</p>
      )}

      {!isLoading && data && data.length > 0 && (
        <table className="data-table">
          <thead>
            <tr>
              <th>Member</th>
              <th>City</th>
              <th>Dates</th>
              <th>Needs</th>
              <th>Status</th>
              <th>Posted</th>
            </tr>
          </thead>
          <tbody>
            {data.map((trip) => (
              <tr key={trip.trip_id} onClick={() => navigate(`/trips/${trip.trip_id}`)}>
                <td>{trip.owner_name}</td>
                <td>{trip.city}</td>
                <td>
                  {formatDate(trip.start_date)} – {formatDate(trip.end_date)}
                </td>
                <td>{trip.needs?.join(', ')}</td>
                <td>
                  <StatusPill status={trip.status} />
                </td>
                <td>{formatDate(trip.created_at)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </div>
  )
}
