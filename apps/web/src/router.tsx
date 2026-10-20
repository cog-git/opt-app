import { Suspense, lazy } from 'react';
import { createBrowserRouter, Navigate } from 'react-router-dom';
import { LoginPage } from './pages/LoginPage';
import { KioskPage } from './pages/KioskPage';
import { KioskConfirmPage } from './kiosk/KioskConfirmPage';
import { KioskJobsPage } from './kiosk/KioskJobsPage';
import { KioskManagerOverridePage } from './kiosk/KioskManagerOverridePage';

// The face pages pull in the on-device recognition runtime (~1.5MB). Load them
// only when someone actually opens verify/enrol, keeping every other route light.
const KioskVerifyPage = lazy(() =>
  import('./kiosk/KioskVerifyPage').then((m) => ({ default: m.KioskVerifyPage })),
);
const KioskEnrolPage = lazy(() =>
  import('./kiosk/KioskEnrolPage').then((m) => ({ default: m.KioskEnrolPage })),
);

function FaceRouteFallback() {
  return (
    <div style={{
      minHeight: '100vh', background: 'var(--porcelain)',
      display: 'flex', alignItems: 'center', justifyContent: 'center',
      color: 'var(--muted)', fontSize: 16, fontWeight: 600,
    }}>
      Loading camera…
    </div>
  );
}

function lazyFace(node: React.ReactNode) {
  return <Suspense fallback={<FaceRouteFallback />}>{node}</Suspense>;
}
import { AdminLayout, RequireProduction, RequireRole, OFFICER_UP, ADMIN_UP } from './admin/AdminLayout';
import { DashboardPage } from './admin/DashboardPage';
import { OrganisationsPage } from './admin/OrganisationsPage';
import { UsersPage } from './admin/UsersPage';
import { ClientsPage } from './admin/ClientsPage';
import { JobsPage } from './admin/JobsPage';
import { WorkshopsPage } from './admin/WorkshopsPage';
import { ScreensPage } from './admin/ScreensPage';
import { SchedulesPage } from './admin/SchedulesPage';
import { TasksPage } from './admin/TasksPage';
import { ActivityLogPage } from './admin/ActivityLogPage';
import { ManualLogPage } from './admin/ManualLogPage';
import { ReportsPage } from './admin/ReportsPage';

const basename = import.meta.env.BASE_URL.replace(/\/$/, '');

export const router = createBrowserRouter(
  [
    { path: '/', element: <Navigate to="/login" replace /> },
    { path: '/login', element: <LoginPage /> },
    { path: '/kiosk', element: <KioskPage /> },
    { path: '/kiosk/verify', element: lazyFace(<KioskVerifyPage />) },
    { path: '/kiosk/enrol', element: lazyFace(<KioskEnrolPage />) },
    { path: '/kiosk/override', element: <KioskManagerOverridePage /> },
    { path: '/kiosk/confirm', element: <KioskConfirmPage /> },
    { path: '/kiosk/jobs', element: <KioskJobsPage /> },
    {
      path: '/admin',
      element: <AdminLayout />,
      children: [
        { index: true, element: <Navigate to="/admin/dashboard" replace /> },
        { path: 'dashboard', element: <DashboardPage /> },
        { path: 'orgs', element: <RequireRole platformAdmin><OrganisationsPage /></RequireRole> },
        { path: 'users', element: <RequireRole roles={OFFICER_UP}><UsersPage /></RequireRole> },
        { path: 'clients', element: <RequireProduction><ClientsPage /></RequireProduction> },
        { path: 'jobs', element: <RequireProduction><JobsPage /></RequireProduction> },
        { path: 'workshops', element: <RequireProduction><RequireRole roles={ADMIN_UP}><WorkshopsPage /></RequireRole></RequireProduction> },
        { path: 'screens', element: <RequireProduction><RequireRole roles={ADMIN_UP}><ScreensPage /></RequireRole></RequireProduction> },
        { path: 'schedules', element: <RequireProduction><RequireRole roles={ADMIN_UP}><SchedulesPage /></RequireRole></RequireProduction> },
        { path: 'tasks', element: <RequireProduction><RequireRole roles={ADMIN_UP}><TasksPage /></RequireRole></RequireProduction> },
        { path: 'reports', element: <RequireRole roles={OFFICER_UP}><ReportsPage /></RequireRole> },
        { path: 'manual-log', element: <RequireRole roles={OFFICER_UP}><ManualLogPage /></RequireRole> },
        { path: 'activity', element: <RequireRole roles={ADMIN_UP}><ActivityLogPage /></RequireRole> },
      ],
    },
    { path: '*', element: <Navigate to="/login" replace /> },
  ],
  { basename: basename || undefined },
);
