import { Routes, Route } from 'react-router'
import Login from './pages/Login'
import NotFound from './pages/NotFound'
import DashboardLayout from './components/layout/DashboardLayout'
import { HomeGate, RequireAuth, RequireEmployeePortal, RequireRole } from './components/RequireAuth'
import ExecutiveDashboard from './pages/dashboard/ExecutiveDashboard'
import DepartmentDashboard from './pages/dashboard/DepartmentDashboard'
import EmployeeDashboard from './pages/dashboard/EmployeeDashboard'
import RecruitmentDashboard from './pages/dashboard/RecruitmentDashboard'
import WorkforceDashboard from './pages/dashboard/WorkforceDashboard'
import KpiManagement from './pages/dashboard/KpiManagement'
import ScorecardSystem from './pages/dashboard/ScorecardSystem'
import RewardsPenalties from './pages/dashboard/RewardsPenalties'
import Reports from './pages/dashboard/Reports'
import TodayPage from './pages/attendance/TodayPage'
import MyMonthPage from './pages/attendance/MyMonthPage'
import RequestsPage from './pages/attendance/RequestsPage'
import NotificationsPage from './pages/attendance/NotificationsPage'
import AdminAttendancePage from './pages/attendance/AdminAttendancePage'
import OwnerPage from './pages/attendance/OwnerPage'

function Shell({ children }: { children: React.ReactNode }) {
  return (
    <RequireAuth>
      <DashboardLayout>{children}</DashboardLayout>
    </RequireAuth>
  )
}

function AdminShell({ children }: { children: React.ReactNode }) {
  return (
    <Shell>
      <RequireRole roles={["owner", "hr"]}>{children}</RequireRole>
    </Shell>
  )
}

function EmployeeShell({ children }: { children: React.ReactNode }) {
  return (
    <Shell>
      <RequireEmployeePortal>{children}</RequireEmployeePortal>
    </Shell>
  )
}

export default function App() {
  return (
    <Routes>
      <Route path="/login" element={<Login />} />

      {/* Home: executive dashboard for admins, Today for employees */}
      <Route
        path="/"
        element={
          <Shell>
            <HomeGate>
              <ExecutiveDashboard />
            </HomeGate>
          </Shell>
        }
      />

      {/* Management dashboards (owner/hr) */}
      <Route path="/departments" element={<AdminShell><DepartmentDashboard /></AdminShell>} />
      <Route path="/employees" element={<AdminShell><EmployeeDashboard /></AdminShell>} />
      <Route path="/recruitment" element={<AdminShell><RecruitmentDashboard /></AdminShell>} />
      <Route path="/workforce" element={<AdminShell><WorkforceDashboard /></AdminShell>} />
      <Route path="/kpi" element={<AdminShell><KpiManagement /></AdminShell>} />
      <Route path="/scorecard" element={<AdminShell><ScorecardSystem /></AdminShell>} />
      <Route path="/rewards" element={<AdminShell><RewardsPenalties /></AdminShell>} />
      <Route path="/reports" element={<AdminShell><Reports /></AdminShell>} />

      {/* Attendance (employee portal) */}
      <Route path="/attendance/today" element={<EmployeeShell><TodayPage /></EmployeeShell>} />
      <Route path="/attendance/month" element={<EmployeeShell><MyMonthPage /></EmployeeShell>} />
      <Route path="/attendance/requests" element={<EmployeeShell><RequestsPage /></EmployeeShell>} />

      {/* Shared */}
      <Route path="/notifications" element={<Shell><NotificationsPage /></Shell>} />

      {/* Attendance administration */}
      <Route path="/attendance/admin" element={<AdminShell><AdminAttendancePage /></AdminShell>} />
      <Route path="/owner" element={<Shell><RequireRole roles={["owner"]}><OwnerPage /></RequireRole></Shell>} />

      <Route path="*" element={<NotFound />} />
    </Routes>
  )
}
