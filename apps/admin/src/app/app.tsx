import { Navigate, Route, BrowserRouter, Routes } from 'react-router-dom'

import { AuditLogPage } from '@/features/audit-log/audit-log-page'
import { AuthProvider, useAuth } from '@/features/auth/auth-context'
import { LoginPage } from '@/features/auth/login-page'
import { DashboardPage } from '@/features/dashboard/dashboard-page'
import { ReportsPage } from '@/features/reports/reports-page'
import { TripDetailPage } from '@/features/trips/trip-detail-page'
import { TripsPage } from '@/features/trips/trips-page'
import { UserDetailPage } from '@/features/users/user-detail-page'
import { UsersPage } from '@/features/users/users-page'
import { VerificationsPage } from '@/features/verifications/verifications-page'

import { Layout } from './layout'
import { RequireAdmin } from './require-admin'

function LoginRoute() {
  const { status } = useAuth()
  if (status === 'admin') return <Navigate to="/" replace />
  return <LoginPage />
}

export function App() {
  return (
    <BrowserRouter>
      <AuthProvider>
        <Routes>
          <Route path="/login" element={<LoginRoute />} />
          <Route
            element={
              <RequireAdmin>
                <Layout />
              </RequireAdmin>
            }
          >
            <Route path="/" element={<DashboardPage />} />
            <Route path="/users" element={<UsersPage />} />
            <Route path="/users/:profileId" element={<UserDetailPage />} />
            <Route path="/trips" element={<TripsPage />} />
            <Route path="/trips/:tripId" element={<TripDetailPage />} />
            <Route path="/verifications" element={<VerificationsPage />} />
            <Route path="/reports" element={<ReportsPage />} />
            <Route path="/audit-log" element={<AuditLogPage />} />
          </Route>
        </Routes>
      </AuthProvider>
    </BrowserRouter>
  )
}
