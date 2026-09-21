import { RecentSignupsCard } from './recent-signups-card'
import { ScheduledJobsCard } from './scheduled-jobs-card'
import { StuckNotificationsCard } from './stuck-notifications-card'

/** The operational checks from MODERATION.md's "Operational checks" section, in one place. */
export function DashboardPage() {
  return (
    <div>
      <h1 style={{ fontSize: 22, marginBottom: 'var(--space-lg)' }}>Dashboard</h1>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-lg)' }}>
        <StuckNotificationsCard />
        <ScheduledJobsCard />
        <RecentSignupsCard />
      </div>
    </div>
  )
}
