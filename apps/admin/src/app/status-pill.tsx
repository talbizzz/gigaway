/** Renders any status enum (profile_status, trip_status, verification_status, report_status). */
export function StatusPill({ status }: { status: string | null }) {
  if (!status) return null
  return <span className={`status-pill status-pill-${status}`}>{status}</span>
}
