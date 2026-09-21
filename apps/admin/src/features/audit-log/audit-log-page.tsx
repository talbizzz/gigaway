import { useInfiniteQuery } from '@tanstack/react-query'

import { formatDateTime } from '@/lib/format'
import { supabase } from '@/lib/supabase'

const PAGE_SIZE = 50

const ACTION_LABEL: Record<string, string> = {
  set_user_status: 'Set user status',
  delete_trip: 'Delete trip',
  delete_user: 'Delete user',
  decide_verification: 'Decide verification',
  decide_report: 'Decide report',
}

export function AuditLogPage() {
  const { data, isLoading, error, fetchNextPage, hasNextPage, isFetchingNextPage } =
    useInfiniteQuery({
      queryKey: ['admin_audit_log'],
      queryFn: async ({ pageParam }: { pageParam: string | null }) => {
        const { data, error } = await supabase.rpc('admin_audit_log', {
          p_limit: PAGE_SIZE,
          p_before: pageParam ?? undefined,
        })
        if (error) throw error
        return data ?? []
      },
      initialPageParam: null as string | null,
      getNextPageParam: (lastPage) =>
        lastPage.length === PAGE_SIZE ? lastPage[lastPage.length - 1]!.created_at : undefined,
    })

  const rows = data?.pages.flat() ?? []

  return (
    <div>
      <h1 style={{ fontSize: 22, marginBottom: 'var(--space-lg)' }}>Audit log</h1>

      {error && <p className="field-error">Couldn't load the audit log: {error.message}</p>}
      {isLoading && <p className="empty-state">Loading…</p>}
      {!isLoading && rows.length === 0 && <p className="empty-state">No admin actions yet.</p>}

      {rows.length > 0 && (
        <>
          <table className="data-table">
            <thead>
              <tr>
                <th>When</th>
                <th>Admin</th>
                <th>Action</th>
                <th>Target</th>
                <th>Detail</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((row) => (
                <tr key={row.id} style={{ cursor: 'default' }}>
                  <td>{formatDateTime(row.created_at)}</td>
                  <td>{row.admin_display_name}</td>
                  <td>{ACTION_LABEL[row.action] ?? row.action}</td>
                  <td>
                    {row.target_table}
                    {row.target_id ? ` · ${row.target_id}` : ''}
                  </td>
                  <td>
                    <code style={{ fontSize: 12, color: 'var(--text-muted)' }}>
                      {JSON.stringify(row.detail)}
                    </code>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>

          {hasNextPage && (
            <button
              type="button"
              className="btn btn-secondary"
              style={{ marginTop: 'var(--space-lg)' }}
              disabled={isFetchingNextPage}
              onClick={() => void fetchNextPage()}
            >
              {isFetchingNextPage ? 'Loading…' : 'Load more'}
            </button>
          )}
        </>
      )}
    </div>
  )
}
