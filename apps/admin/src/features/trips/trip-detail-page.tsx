import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { Link, useNavigate, useParams } from 'react-router-dom'

import { DeletePanel } from '@/app/delete-panel'
import { StatusPill } from '@/app/status-pill'
import { formatDate } from '@/lib/format'
import { supabase } from '@/lib/supabase'

export function TripDetailPage() {
  const { tripId } = useParams<{ tripId: string }>()
  const queryClient = useQueryClient()
  const navigate = useNavigate()

  const { data, isLoading, error } = useQuery({
    queryKey: ['admin_get_trip_detail', tripId],
    queryFn: async () => {
      const { data, error } = await supabase.rpc('admin_get_trip_detail', {
        p_trip_id: tripId!,
      })
      if (error) throw error
      return data?.[0] ?? null
    },
    enabled: !!tripId,
  })

  const deleteTrip = useMutation({
    mutationFn: async () => {
      const { error } = await supabase.rpc('admin_delete_trip', { p_trip_id: tripId! })
      if (error) throw error
    },
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ['admin_search_trips'] })
      navigate('/trips')
    },
  })

  return (
    <div>
      <Link to="/trips" className="back-link">
        ← Back to trips
      </Link>

      {error && <p className="field-error">Couldn't load this trip: {error.message}</p>}
      {isLoading && <p className="empty-state">Loading…</p>}
      {!isLoading && !error && !data && <p className="empty-state">No trip found with that id.</p>}

      {data && (
        <>
          <div
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: 'var(--space-md)',
              marginBottom: 'var(--space-xl)',
            }}
          >
            <h1 style={{ fontSize: 22 }}>
              {data.owner_name} — {data.city}
            </h1>
            <StatusPill status={data.status} />
          </div>

          <div className="card" style={{ marginBottom: 'var(--space-lg)' }}>
            <h2 style={{ fontSize: 15, marginBottom: 'var(--space-lg)' }}>Trip</h2>
            <dl className="detail-grid">
              <div className="detail-item">
                <dt>Owner</dt>
                <dd>
                  <Link to={`/users/${data.profile_id}`}>{data.owner_name}</Link>
                </dd>
              </div>
              <div className="detail-item">
                <dt>Dates</dt>
                <dd>
                  {formatDate(data.start_date)} – {formatDate(data.end_date)}
                </dd>
              </div>
              <div className="detail-item">
                <dt>Needs</dt>
                <dd>{data.needs?.join(', ') ?? '—'}</dd>
              </div>
              <div className="detail-item">
                <dt>Posted</dt>
                <dd>{formatDate(data.created_at)}</dd>
              </div>
              <div className="detail-item">
                <dt>Note</dt>
                <dd>{data.note ?? '—'}</dd>
              </div>
            </dl>
          </div>

          <div className="card">
            <h2 style={{ fontSize: 15, marginBottom: 'var(--space-lg)' }}>Activity</h2>
            <dl className="detail-grid">
              <div className="detail-item">
                <dt>Requests</dt>
                <dd>{data.requests_count}</dd>
              </div>
              <div className="detail-item">
                <dt>Offers</dt>
                <dd>{data.offers_count}</dd>
              </div>
              <div className="detail-item">
                <dt>Stays</dt>
                <dd>{data.stays_count}</dd>
              </div>
            </dl>
          </div>

          <div style={{ marginTop: 'var(--space-lg)' }}>
            {data.stays_count && data.stays_count > 0 ? (
              <p className="empty-state">
                This trip produced a stay and can't be deleted here — doing so would erase the
                other member's review history. There is no admin action for this case.
              </p>
            ) : (
              <DeletePanel
                expected={data.owner_name ?? ''}
                expectedLabel={data.owner_name ?? ''}
                isDeleting={deleteTrip.isPending}
                error={deleteTrip.error ? (deleteTrip.error as Error).message : null}
                onDelete={() => deleteTrip.mutate()}
              />
            )}
          </div>
        </>
      )}
    </div>
  )
}
