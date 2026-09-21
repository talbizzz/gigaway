import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { useState } from 'react'
import { Link } from 'react-router-dom'

import { formatDate } from '@/lib/format'
import { supabase } from '@/lib/supabase'

import { VerificationEvidence } from './verification-evidence'

export function VerificationsPage() {
  const [openId, setOpenId] = useState<string | null>(null)
  const [reason, setReason] = useState('')
  const queryClient = useQueryClient()

  const { data, isLoading, error } = useQuery({
    queryKey: ['admin_pending_verifications'],
    queryFn: async () => {
      const { data, error } = await supabase.rpc('admin_pending_verifications')
      if (error) throw error
      return data
    },
  })

  const decide = useMutation({
    mutationFn: async ({
      applicationId,
      decision,
    }: {
      applicationId: string
      decision: 'approved' | 'rejected'
    }) => {
      const { error } = await supabase.rpc('admin_decide_verification', {
        p_application_id: applicationId,
        p_decision: decision,
        p_reason: reason || undefined,
      })
      if (error) throw error
    },
    onSuccess: () => {
      setOpenId(null)
      setReason('')
      void queryClient.invalidateQueries({ queryKey: ['admin_pending_verifications'] })
    },
  })

  return (
    <div>
      <h1 style={{ fontSize: 22, marginBottom: 'var(--space-lg)' }}>Verifications</h1>

      {error && <p className="field-error">Couldn't load the queue: {error.message}</p>}
      {isLoading && <p className="empty-state">Loading…</p>}
      {!isLoading && data && data.length === 0 && (
        <p className="empty-state">No applications waiting.</p>
      )}

      <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-lg)' }}>
        {data?.map((app) => {
          const isOpen = openId === app.application_id
          return (
            <div key={app.application_id} className="card">
              <div
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: 'var(--space-md)',
                  cursor: 'pointer',
                }}
                onClick={() => {
                  setOpenId(isOpen ? null : app.application_id)
                  setReason('')
                }}
              >
                <div style={{ flex: 1 }}>
                  <strong>{app.display_name}</strong> — {app.discipline}
                  {app.specialisation ? ` (${app.specialisation})` : ''}
                </div>
                <span style={{ color: 'var(--text-muted)', fontSize: 13 }}>
                  waiting {app.days_waiting} {app.days_waiting === 1 ? 'day' : 'days'}
                </span>
              </div>

              {isOpen && (
                <div style={{ marginTop: 'var(--space-lg)' }}>
                  <dl className="detail-grid" style={{ marginBottom: 'var(--space-lg)' }}>
                    <div className="detail-item">
                      <dt>Legal name</dt>
                      <dd>{app.full_legal_name}</dd>
                    </div>
                    <div className="detail-item">
                      <dt>Email</dt>
                      <dd>{app.email}</dd>
                    </div>
                    <div className="detail-item">
                      <dt>Submitted</dt>
                      <dd>{formatDate(app.submitted_at)}</dd>
                    </div>
                    <div className="detail-item">
                      <dt>Selfie prompt</dt>
                      <dd>{app.selfie_prompt}</dd>
                    </div>
                  </dl>

                  {app.note && (
                    <p>
                      <strong>Note:</strong> {app.note}
                    </p>
                  )}

                  {Array.isArray(app.links) && app.links.length > 0 && (
                    <p>
                      <strong>Links:</strong>{' '}
                      {(app.links as string[]).map((link) => (
                        <a key={link} href={link} target="_blank" rel="noreferrer">
                          {link}{' '}
                        </a>
                      ))}
                    </p>
                  )}

                  <div style={{ margin: 'var(--space-lg) 0' }}>
                    <VerificationEvidence selfiePath={app.selfie_path} cvPath={app.cv_path} />
                  </div>

                  <div className="field" style={{ marginBottom: 'var(--space-lg)' }}>
                    <label htmlFor="reason">Decision reason (shown to the applicant)</label>
                    <input
                      id="reason"
                      value={reason}
                      onChange={(e) => setReason(e.target.value)}
                    />
                  </div>

                  {decide.error && (
                    <p className="field-error">{(decide.error as Error).message}</p>
                  )}

                  <div style={{ display: 'flex', gap: 'var(--space-md)' }}>
                    <button
                      type="button"
                      className="btn btn-primary"
                      disabled={decide.isPending}
                      onClick={() =>
                        decide.mutate({ applicationId: app.application_id!, decision: 'approved' })
                      }
                    >
                      Approve
                    </button>
                    <button
                      type="button"
                      className="btn btn-danger"
                      disabled={decide.isPending}
                      onClick={() =>
                        decide.mutate({ applicationId: app.application_id!, decision: 'rejected' })
                      }
                    >
                      Reject
                    </button>
                    <Link to={`/users/${app.profile_id}`} className="btn btn-secondary">
                      View profile
                    </Link>
                  </div>
                </div>
              )}
            </div>
          )
        })}
      </div>
    </div>
  )
}
