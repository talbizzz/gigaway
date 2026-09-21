import { useQuery } from '@tanstack/react-query'
import { useState } from 'react'
import { useNavigate } from 'react-router-dom'

import { StatusPill } from '@/app/status-pill'
import { formatDate } from '@/lib/format'
import { supabase } from '@/lib/supabase'
import { useDebouncedValue } from '@/lib/use-debounced-value'

export function UsersPage() {
  const [query, setQuery] = useState('')
  const debouncedQuery = useDebouncedValue(query)
  const navigate = useNavigate()

  const { data, isLoading, error } = useQuery({
    queryKey: ['admin_search_profiles', debouncedQuery],
    queryFn: async () => {
      const { data, error } = await supabase.rpc('admin_search_profiles', {
        p_query: debouncedQuery || undefined,
      })
      if (error) throw error
      return data
    },
  })

  return (
    <div>
      <h1 style={{ fontSize: 22, marginBottom: 'var(--space-lg)' }}>Users</h1>

      <div className="field" style={{ maxWidth: 360, marginBottom: 'var(--space-lg)' }}>
        <input
          type="search"
          placeholder="Name, email or phone…"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          autoFocus
        />
      </div>

      {error && <p className="field-error">Couldn't load users: {error.message}</p>}
      {isLoading && <p className="empty-state">Loading…</p>}
      {!isLoading && data && data.length === 0 && (
        <p className="empty-state">
          {query ? 'No one matches that search.' : 'No profiles yet.'}
        </p>
      )}

      {!isLoading && data && data.length > 0 && (
        <table className="data-table">
          <thead>
            <tr>
              <th>Name</th>
              <th>Status</th>
              <th>Discipline</th>
              <th>Home city</th>
              <th>Email</th>
              <th>Joined</th>
            </tr>
          </thead>
          <tbody>
            {data.map((profile) => (
              <tr
                key={profile.profile_id}
                onClick={() => navigate(`/users/${profile.profile_id}`)}
              >
                <td>{profile.display_name}</td>
                <td>
                  <StatusPill status={profile.status} />
                </td>
                <td>{profile.discipline}</td>
                <td>{profile.home_city ?? '—'}</td>
                <td>{profile.email ?? '—'}</td>
                <td>{formatDate(profile.joined_at)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </div>
  )
}
