/**
 * Admin / office shell.
 *
 * Persistent chrome: left sidebar nav + top bar with the OPT logo and an
 * organisation switcher. The active page renders into <Outlet />.
 *
 * The org switcher writes to the mock store (setCurrentOrg) and bumps a version
 * counter that is broadcast via context, so every nested page re-scopes its data
 * to the newly selected organisation.
 */

import { createContext, useContext, useEffect, useMemo, useState } from 'react';
import type { ReactNode } from 'react';
import { NavLink, Outlet, useNavigate, Navigate } from 'react-router-dom';
import { Logo, Button } from '@opt/ui';
import { getCurrentOrg } from './adminStore';
import { changeOwnPassword, clearSession, getSession } from '../api';
import type { ApiUser, ApiUserRole } from '../api';
import { Modal, TierBadge } from './components';
import { ToastProvider, useToast } from './toast';
import {
  DashboardIcon,
  OrgIcon,
  UsersIcon,
  ClientsIcon,
  JobsIcon,
  ActivityIcon,
  ClipboardIcon,
  ReportsIcon,
  ScheduleIcon,
  TasksIcon,
  WorkshopIcon,
  KioskIcon,
} from './adminIcons';
import './admin.css';

// ── Org context: lets pages re-render when the current org changes ──────────

interface OrgContextValue {
  /**
   * Identifies the active tenant. The API is single-tenant per JWT, so this is
   * fixed for the session; pages still read it as an effect dependency so they
   * reload their data once the shell has confirmed a session.
   */
  version: number;
  orgId: string;
}

const OrgContext = createContext<OrgContextValue>({ version: 0, orgId: '' });

/** Pages call this to key their data loads to the active tenant. */
export function useOrgScope(): OrgContextValue {
  return useContext(OrgContext);
}

/**
 * Guards a production-only route. Clock-in-only tenants that reach one of these
 * URLs directly are bounced to the dashboard — the feature simply isn't part of
 * their plan.
 */
export function RequireProduction({ children }: { children: ReactNode }) {
  if (getCurrentOrg().tier !== 'production') {
    return <Navigate to="/admin/dashboard" replace />;
  }
  return <>{children}</>;
}

// ── Role-based access ────────────────────────────────────────────────────────
//
// Mirrors the API's route guards so the console only offers what a user can
// actually do. The server remains the source of truth; this is purely UX.
//   staff   — jobs and clients only
//   officer — the above plus staff (users), manual log and reports
//   admin   — everything within the business (config, activity)
//   owner   — top business role; cross-org "Organisations" needs platform admin
export const OFFICER_UP: ApiUserRole[] = ['owner', 'admin', 'officer'];
export const ADMIN_UP: ApiUserRole[] = ['owner', 'admin'];

interface AccessRule {
  roles?: ApiUserRole[];
  platformAdmin?: boolean;
}

function hasAccess(user: Pick<ApiUser, 'role' | 'isPlatformAdmin'>, rule: AccessRule): boolean {
  if (rule.platformAdmin && !user.isPlatformAdmin) return false;
  if (rule.roles && !rule.roles.includes(user.role)) return false;
  return true;
}

/**
 * Guards a route to specific roles and/or platform admins. Runs inside the admin
 * shell, so a signed-in user who lacks the role is bounced to their dashboard
 * rather than the login page. The API enforces the same rules server-side.
 */
export function RequireRole({
  roles,
  platformAdmin,
  children,
}: AccessRule & { children: ReactNode }) {
  const session = getSession();
  if (!session) return <Navigate to="/login" replace />;
  if (!hasAccess(session.user, { roles, platformAdmin })) {
    return <Navigate to="/admin/dashboard" replace />;
  }
  return <>{children}</>;
}

// ── Nav config ───────────────────────────────────────────────────────────────

// `pro: true` marks a feature that only the full "production" tier can see.
// Clock-in-only tenants get the kiosk, staff and time log; jobs/clients/reports
// are reserved for the full version (see tier gating).
type NavItem = { to: string; label: string; icon: ReactNode; end?: boolean; pro?: boolean } & AccessRule;

const NAV: NavItem[] = [
  { to: '/admin/dashboard', label: 'Dashboard', icon: <DashboardIcon /> },
  { to: '/admin/orgs', label: 'Organisations', icon: <OrgIcon />, platformAdmin: true },
  { to: '/admin/users', label: 'Users', icon: <UsersIcon />, roles: OFFICER_UP },
  { to: '/admin/clients', label: 'Clients', icon: <ClientsIcon />, pro: true },
  { to: '/admin/jobs', label: 'Jobs', icon: <JobsIcon />, pro: true },
  { to: '/admin/workshops', label: 'Workshops', icon: <WorkshopIcon />, pro: true, roles: ADMIN_UP },
  { to: '/admin/screens', label: 'Screens', icon: <KioskIcon />, pro: true, roles: ADMIN_UP },
  { to: '/admin/schedules', label: 'Schedules', icon: <ScheduleIcon />, pro: true, roles: ADMIN_UP },
  { to: '/admin/tasks', label: 'Tasks', icon: <TasksIcon />, pro: true, roles: ADMIN_UP },
  { to: '/admin/reports', label: 'Reports', icon: <ReportsIcon />, roles: OFFICER_UP },
  { to: '/admin/manual-log', label: 'Manual log', icon: <ClipboardIcon />, roles: OFFICER_UP },
  { to: '/admin/activity', label: 'Activity log', icon: <ActivityIcon />, roles: ADMIN_UP },
];

export function AdminLayout() {
  const navigate = useNavigate();
  const session = getSession();
  const current = getCurrentOrg();

  // No session (never signed in, or token expired) — back to login.
  useEffect(() => {
    if (!session) navigate('/login', { replace: true });
  }, [session, navigate]);

  const ctx = useMemo<OrgContextValue>(
    () => ({ version: 0, orgId: current.id }),
    [current.id],
  );

  function handleSignOut() {
    clearSession();
    navigate('/login', { replace: true });
  }

  if (!session) return null;

  return (
    <OrgContext.Provider value={ctx}>
      <ToastProvider>
      <div className="admin">
        {/* Sidebar */}
        <aside className="admin__side">
          <div className="admin__side-brand">Office</div>
          <nav className="admin__nav">
            {NAV.filter(
              (item) =>
                (!item.pro || current.tier === 'production') &&
                hasAccess(session.user, item),
            ).map((item) => (
              <NavLink
                key={item.to}
                to={item.to}
                end={item.end}
                className={({ isActive }) =>
                  `admin__nav-link${isActive ? ' is-active' : ''}`
                }
              >
                {item.icon}
                {item.label}
              </NavLink>
            ))}
          </nav>
          <div className="admin__side-spacer" />
          <div className="admin__side-foot">
            <Button
              variant="ghost"
              fullWidth
              onClick={() => navigate('/kiosk')}
              style={{ height: 46, justifyContent: 'flex-start', gap: 12 }}
            >
              <KioskIcon />
              Open kiosk
            </Button>
            <ChangePasswordControl />
            <Button
              variant="ghost"
              fullWidth
              onClick={handleSignOut}
              style={{ height: 46, justifyContent: 'flex-start', gap: 12 }}
            >
              Sign out
            </Button>
          </div>
        </aside>

        {/* Top bar */}
        <header className="admin__top">
          <div className="admin__top-left">
            <Logo color="var(--flora)" height={28} />
            <span className="admin__top-title">Admin console</span>
          </div>
          <div className="admin__orgswitch">
            <span className="admin__sub" style={{ fontWeight: 600 }}>
              Organisation
            </span>
            <span className="admin__strong">{current.org}</span>
            <TierBadge tier={current.tier} />
          </div>
        </header>

        {/* Active page */}
        <main className="admin__content">
          <Outlet />
        </main>
      </div>
      </ToastProvider>
    </OrgContext.Provider>
  );
}

/**
 * Sidebar control letting the signed-in user change their OWN password. Lives
 * here (rather than the Users page) because the /users edit path blocks a user
 * from touching an account at or above their own rank — including themselves —
 * so an admin/owner has no other way to rotate their password.
 */
function ChangePasswordControl() {
  const [open, setOpen] = useState(false);
  return (
    <>
      <Button
        variant="ghost"
        fullWidth
        onClick={() => setOpen(true)}
        style={{ height: 46, justifyContent: 'flex-start', gap: 12 }}
      >
        Change password
      </Button>
      {open && <ChangePasswordModal onClose={() => setOpen(false)} />}
    </>
  );
}

function ChangePasswordModal({ onClose }: { onClose: () => void }) {
  const toast = useToast();
  const [current, setCurrent] = useState('');
  const [next, setNext] = useState('');
  const [confirm, setConfirm] = useState('');
  const [error, setError] = useState('');
  const [saving, setSaving] = useState(false);

  async function handleSave() {
    if (!current) { setError('Enter your current password.'); return; }
    if (next.length < 8) { setError('Set a new password of at least 8 characters.'); return; }
    if (next !== confirm) { setError('The two new passwords do not match.'); return; }
    if (next === current) { setError('The new password must be different from the current one.'); return; }
    setSaving(true);
    try {
      await changeOwnPassword(current, next);
      toast.success('Your password has been changed.');
      onClose();
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Could not change your password.');
      setSaving(false);
    }
  }

  return (
    <Modal
      title="Change password"
      description="Update the password you use to sign in."
      onClose={onClose}
    >
      <div className="admin__field">
        <label className="admin__field-label" htmlFor="cp-current">Current password</label>
        <input
          id="cp-current"
          className="admin__input"
          type="password"
          value={current}
          onChange={(e) => setCurrent(e.target.value)}
          autoComplete="current-password"
          autoFocus
        />
      </div>
      <div className="admin__field">
        <label className="admin__field-label" htmlFor="cp-new">New password</label>
        <input
          id="cp-new"
          className="admin__input"
          type="password"
          value={next}
          onChange={(e) => setNext(e.target.value)}
          placeholder="At least 8 characters"
          autoComplete="new-password"
        />
      </div>
      <div className="admin__field">
        <label className="admin__field-label" htmlFor="cp-confirm">Confirm new password</label>
        <input
          id="cp-confirm"
          className="admin__input"
          type="password"
          value={confirm}
          onChange={(e) => setConfirm(e.target.value)}
          placeholder="Re-enter the new password"
          autoComplete="new-password"
        />
      </div>

      {error ? <div className="admin__form-error">{error}</div> : null}

      <div className="admin__modal-actions">
        <Button variant="ghost" fullWidth onClick={onClose} disabled={saving}>Cancel</Button>
        <Button variant="primary" fullWidth onClick={handleSave} disabled={saving}>
          {saving ? 'Saving…' : 'Change password'}
        </Button>
      </div>
    </Modal>
  );
}
