import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { useState } from 'react'
import { Link } from 'react-router-dom'

import { formatDate } from '@/lib/format'
import { supabase } from '@/lib/supabase'

const CATEGORY_LABEL: Record<string, string> = {
  safety: 'Safety',
  harassment: 'Harassment',
  no_show: 'No-show',
  misrepresentation: 'Misrepresentation',
  spam: 'Spam',
  other: 'Other',
}

export function ReportsPage() {
  const [openId, setOpenId] = useState<string | null>(null)
  const [note, setNote] = useState('')
  const queryClient = useQueryClient()

  const { data, isLoading, error } = useQuery({
    queryKey: ['admin_open_reports'],
    queryFn: async () => {
      const { data, error } = await supabase.rpc('admin_open_reports')
      if (error) throw error
      return data
    },
  })

  const decide = useMutation({
    mutationFn: async ({
      reportId,
      decision,
    }: {
      reportId: string
      decision: 'actioned' | 'dismissed' | 'reviewing'
    }) => {
      const { error } = await supabase.rpc('admin_decide_report', {
        p_report_id: reportId,
        p_decision: decision,
        p_note: note || undefined,
      })
      if (error) throw error
    },
    onSuccess: () => {
      setOpenId(null)
      setNote('')
      void queryClient.invalidateQueries({ queryKey: ['admin_open_reports'] })
    },
  })

  return (
    <div>
      <h1 style={{ fontSize: 22, marginBottom: 'var(--space-lg)' }}>Reports</h1>

      {error && <p className="field-error">Couldn't load the queue: {error.message}</p>}
      {isLoading && <p className="empty-state">Loading…</p>}
      {!isLoading && data && data.length === 0 && <p className="empty-state">Nothing open.</p>}

      <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-lg)' }}>
        {data?.map((report) => {
          const isOpen = openId === report.report_id
          return (
            <div key={report.report_id} className="card">
              <div
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: 'var(--space-md)',
                  cursor: 'pointer',
                }}
                onClick={() => {
                  setOpenId(isOpen ? null : report.report_id)
                  setNote('')
                }}
              >
                <span className="status-pill status-pill-suspended">
                  {CATEGORY_LABEL[report.category ?? ''] ?? report.category}
                </span>
                <div style={{ flex: 1 }}>
                  <strong>{report.subject_name}</strong> reported by {report.reporter_name}
                </div>
                <span style={{ color: 'var(--text-muted)', fontSize: 13 }}>
                  {report.days_open} {report.days_open === 1 ? 'day' : 'days'} open
                </span>
              </div>

              {isOpen && (
                <div style={{ marginTop: 'var(--space-lg)' }}>
                  <p>{report.body}</p>

                  <dl className="detail-grid" style={{ marginBottom: 'var(--space-lg)' }}>
                    <div className="detail-item">
                      <dt>Filed</dt>
                      <dd>{formatDate(report.created_at)}</dd>
                    </div>
                    <div className="detail-item">
                      <dt>Prior reports against subject</dt>
                      <dd>{report.subject_prior_reports}</dd>
                    </div>
                    <div className="detail-item">
                      <dt>From distinct reporters</dt>
                      <dd>{report.subject_prior_reporters}</dd>
                    </div>
                  </dl>

                  <p style={{ color: 'var(--text-muted)', fontSize: 13 }}>
                    One report is a disagreement; several from different people is a pattern —
                    check the count above, not just this one.
                  </p>

                  <div className="field" style={{ margin: 'var(--space-lg) 0' }}>
                    <label htmlFor="note">Moderator note</label>
                    <input id="note" value={note} onChange={(e) => setNote(e.target.value)} />
                  </div>

                  {decide.error && (
                    <p className="field-error">{(decide.error as Error).message}</p>
                  )}

                  <div style={{ display: 'flex', gap: 'var(--space-md)', flexWrap: 'wrap' }}>
                    <button
                      type="button"
                      className="btn btn-danger"
                      disabled={decide.isPending}
                      onClick={() =>
                        decide.mutate({ reportId: report.report_id!, decision: 'actioned' })
                      }
                    >
                      Action
                    </button>
                    <button
                      type="button"
                      className="btn btn-secondary"
                      disabled={decide.isPending}
                      onClick={() =>
                        decide.mutate({ reportId: report.report_id!, decision: 'dismissed' })
                      }
                    >
                      Dismiss
                    </button>
                    <button
                      type="button"
                      className="btn btn-secondary"
                      disabled={decide.isPending}
                      onClick={() =>
                        decide.mutate({ reportId: report.report_id!, decision: 'reviewing' })
                      }
                    >
                      Mark reviewing
                    </button>
                    <Link to={`/users/${report.subject_id}`} className="btn btn-secondary">
                      View subject
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
