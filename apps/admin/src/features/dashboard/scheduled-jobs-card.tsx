import { useQuery } from '@tanstack/react-query'

import { formatDateTime } from '@/lib/format'
import { supabase } from '@/lib/supabase'

export function ScheduledJobsCard() {
  const { data, isLoading, error } = useQuery({
    queryKey: ['admin_cron_status'],
    queryFn: async () => {
      const { data, error } = await supabase.rpc('admin_cron_status')
      if (error) throw error
      return data
    },
  })

  return (
    <div className="card">
      <h2 style={{ fontSize: 15, marginBottom: 'var(--space-lg)' }}>Scheduled jobs</h2>
      {error && <p className="field-error">Couldn't load job status: {error.message}</p>}
      {isLoading && <p className="empty-state">Loading…</p>}
      {!isLoading && data && data.length === 0 && (
        <p className="empty-state">No scheduled jobs found.</p>
      )}
      {!isLoading && data && data.length > 0 && (
        <table className="data-table">
          <thead>
            <tr>
              <th>Job</th>
              <th>Schedule</th>
              <th>Active</th>
              <th>Last run</th>
              <th>Last status</th>
            </tr>
          </thead>
          <tbody>
            {data.map((job) => (
              <tr key={job.jobname} style={{ cursor: 'default' }}>
                <td>{job.jobname}</td>
                <td>{job.schedule}</td>
                <td>{job.active ? 'yes' : 'no'}</td>
                <td>{formatDateTime(job.last_run)}</td>
                <td style={{ color: job.last_status === 'failed' ? 'var(--danger)' : undefined }}>
                  {job.last_status ?? '—'}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </div>
  )
}
