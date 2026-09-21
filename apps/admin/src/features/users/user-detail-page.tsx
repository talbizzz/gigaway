import type { AdminDeleteUserResponse } from '@gigaway/shared'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import type { ReactNode } from 'react'
import { useState } from 'react'
import { Link, useNavigate, useParams } from 'react-router-dom'

import { ConfirmButton } from '@/app/confirm-button'
import { DeletePanel } from '@/app/delete-panel'
import { StatusPill } from '@/app/status-pill'
import { formatDate } from '@/lib/format'
import { ApiCallError, callFunction } from '@/lib/functions'
import { supabase } from '@/lib/supabase'

function DetailItem({ label, value }: { label: string; value: ReactNode }) {
  return (
    <div className="detail-item">
      <dt>{label}</dt>
      <dd>{value ?? '—'}</dd>
    </div>
  )
}

export function UserDetailPage() {
  const { profileId } = useParams<{ profileId: string }>()
  const queryClient = useQueryClient()
  const navigate = useNavigate()
  const [deleteError, setDeleteError] = useState<string | null>(null)

  const { data, isLoading, error } = useQuery({
    queryKey: ['admin_get_user_detail', profileId],
    queryFn: async () => {
      const { data, error } = await supabase.rpc('admin_get_user_detail', {
        p_profile_id: profileId!,
      })
      if (error) throw error
      return data?.[0] ?? null
    },
    enabled: !!profileId,
  })

  const setStatus = useMutation({
    mutationFn: async (status: 'approved' | 'suspended') => {
      const { error } = await supabase.rpc('admin_set_user_status', {
        p_profile_id: profileId!,
        p_status: status,
      })
      if (error) throw error
    },
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ['admin_get_user_detail', profileId] })
    },
  })

  const deleteUser = useMutation({
    mutationFn: async (confirm: string) => {
      return callFunction<AdminDeleteUserResponse>('admin-delete-user', { profileId, confirm })
    },
    onSuccess: () => navigate('/users'),
    onError: (err) => {
      setDeleteError(err instanceof ApiCallError ? err.message : 'Something went wrong.')
    },
  })

  return (
    <div>
      <Link to="/users" className="back-link">
        ← Back to users
      </Link>

      {error && <p className="field-error">Couldn't load this profile: {error.message}</p>}
      {isLoading && <p className="empty-state">Loading…</p>}
      {!isLoading && !error && !data && (
        <p className="empty-state">No profile found with that id.</p>
      )}

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
            <h1 style={{ fontSize: 22 }}>{data.display_name}</h1>
            <StatusPill status={data.status} />
            <div style={{ marginLeft: 'auto' }}>
              {data.status === 'suspended' ? (
                <ConfirmButton
                  label="Reinstate"
                  confirmLabel="Confirm reinstate"
                  onConfirm={() => setStatus.mutate('approved')}
                  disabled={setStatus.isPending}
                />
              ) : (
                <ConfirmButton
                  label="Suspend"
                  confirmLabel="Confirm suspend"
                  variant="danger"
                  onConfirm={() => setStatus.mutate('suspended')}
                  disabled={setStatus.isPending}
                />
              )}
            </div>
          </div>

          {setStatus.error && (
            <p className="field-error" style={{ marginBottom: 'var(--space-lg)' }}>
              Couldn't update status: {(setStatus.error as Error).message}
            </p>
          )}

          <div className="card" style={{ marginBottom: 'var(--space-lg)' }}>
            <h2 style={{ fontSize: 15, marginBottom: 'var(--space-lg)' }}>Profile</h2>
            <dl className="detail-grid">
              <DetailItem label="Discipline" value={data.discipline} />
              <DetailItem label="Home city" value={data.home_city} />
              <DetailItem label="Joined" value={formatDate(data.joined_at)} />
              <DetailItem label="Email" value={data.email} />
              <DetailItem label="Phone" value={data.phone} />
              <DetailItem label="WhatsApp" value={data.whatsapp} />
              <DetailItem
                label="Verification"
                value={data.verification_status && <StatusPill status={data.verification_status} />}
              />
              <DetailItem
                label="Verification decision reason"
                value={data.verification_decision_reason}
              />
            </dl>
          </div>

          <div className="card">
            <h2 style={{ fontSize: 15, marginBottom: 'var(--space-lg)' }}>Activity</h2>
            <dl className="detail-grid">
              <DetailItem label="Trips posted" value={data.trips} />
              <DetailItem label="Availability posted" value={data.availability} />
              <DetailItem label="Stays hosted" value={data.stays_hosted} />
              <DetailItem label="Stays as guest" value={data.stays_as_guest} />
              <DetailItem label="Reviews written" value={data.reviews_written} />
              <DetailItem label="Reviews received" value={data.reviews_received} />
              <DetailItem
                label="Would-again %"
                value={data.would_again_pct !== null ? `${data.would_again_pct}%` : null}
              />
              <DetailItem label="Reports filed" value={data.reports_filed} />
              <DetailItem label="Reports received" value={data.reports_received} />
              <DetailItem
                label="Distinct reporters"
                value={data.distinct_reporters}
              />
              <DetailItem label="Blocks made" value={data.blocks_made} />
              <DetailItem label="Blocks received" value={data.blocks_received} />
            </dl>
          </div>

          <div style={{ marginTop: 'var(--space-lg)' }}>
            <DeletePanel
              expected={data.email ?? data.display_name ?? ''}
              expectedLabel={data.email ?? data.display_name ?? ''}
              isDeleting={deleteUser.isPending}
              error={deleteError}
              onDelete={() => {
                setDeleteError(null)
                deleteUser.mutate(data.email ?? data.display_name ?? '')
              }}
            />
          </div>
        </>
      )}
    </div>
  )
}
