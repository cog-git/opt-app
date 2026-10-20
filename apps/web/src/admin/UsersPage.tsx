/**
 * Users page — team members in the CURRENT organisation.
 * Add user, change role, archive (soft-delete) and restore. Never a hard delete;
 * every action writes to the activity log via the store.
 */

import { useEffect, useState } from 'react';
import { Button } from '@opt/ui';
import {
  getUsers,
  loadUsers,
  addUser,
  archiveUser,
  restoreUser,
  changeUserRole,
  setUserPassword,
} from './adminStore';
import type { UserRole, AdminUser } from './adminStore';
import { roleLabel } from './adminStore';
import { RoleBadge, Badge, Modal, SelectField, ConfirmDialog } from './components';
import { PlusIcon } from './adminIcons';
import { useOrgScope } from './AdminLayout';
import { useToast } from './toast';
import { toCsv, downloadCsv, todayStamp } from './csv';

const ROLES: UserRole[] = ['owner', 'admin', 'officer', 'staff'];

function initials(name: string): string {
  return name
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((p) => p[0]?.toUpperCase() ?? '')
    .join('');
}

export function UsersPage() {
  const { version } = useOrgScope();
  const toast = useToast();
  const [showArchived, setShowArchived] = useState(false);
  const [addOpen, setAddOpen] = useState(false);
  const [query, setQuery] = useState('');
  const [pendingArchive, setPendingArchive] = useState<AdminUser | null>(null);
  const [pendingPassword, setPendingPassword] = useState<AdminUser | null>(null);
  const [archiving, setArchiving] = useState(false);
  const [tick, setTick] = useState(0);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  const refresh = () => setTick((n) => n + 1);

  useEffect(() => {
    let active = true;
    setLoading(true);
    loadUsers()
      .then(() => active && (setError(''), setLoading(false), refresh()))
      .catch((e) => active && (setError(String(e.message ?? e)), setLoading(false)));
    return () => {
      active = false;
    };
  }, [version]);

  void tick;
  const all = getUsers();
  const q = query.trim().toLowerCase();
  const visible = all
    .filter((u) => (showArchived ? true : u.archivedAt === null))
    .filter((u) => !q || u.name.toLowerCase().includes(q) || u.email.toLowerCase().includes(q));

  async function confirmArchive() {
    if (!pendingArchive) return;
    setArchiving(true);
    try {
      await archiveUser(pendingArchive.id);
      toast.success(`Archived ${pendingArchive.name}.`);
      setPendingArchive(null);
      refresh();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Could not archive the user.');
    } finally {
      setArchiving(false);
    }
  }

  async function handleRestore(u: AdminUser) {
    try {
      await restoreUser(u.id);
      toast.success(`Restored ${u.name}.`);
      refresh();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Could not restore the user.');
    }
  }

  async function handleRoleChange(u: AdminUser, role: UserRole) {
    try {
      await changeUserRole(u.id, role);
      toast.success(`${u.name} is now ${roleLabel(role)}.`);
      refresh();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Could not change the role.');
      refresh();
    }
  }

  function handleExport() {
    if (visible.length === 0) {
      toast.error('Nothing to export.');
      return;
    }
    const csv = toCsv<AdminUser>(
      [
        { header: 'Name', value: (u) => u.name },
        { header: 'Email', value: (u) => u.email },
        { header: 'Role', value: (u) => roleLabel(u.role) },
        { header: 'Status', value: (u) => (u.archivedAt ? 'Archived' : 'Active') },
      ],
      visible,
    );
    downloadCsv(`users-${todayStamp()}.csv`, csv);
    toast.success(`Exported ${visible.length} ${visible.length === 1 ? 'user' : 'users'}.`);
  }

  return (
    <div>
      <div className="admin__page-head">
        <div>
          <h1>Users</h1>
        </div>
        <Button variant="primary" onClick={() => setAddOpen(true)} style={{ gap: 8 }}>
          <PlusIcon stroke="#fff" />
          Add user
        </Button>
      </div>

      <div className="admin__toolbar">
        <input
          className="admin__search"
          type="search"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="Search by name or email"
          aria-label="Search users"
        />
        <label className="admin__toggle">
          <input
            type="checkbox"
            checked={showArchived}
            onChange={(e) => setShowArchived(e.target.checked)}
          />
          Show archived
        </label>
        <Button variant="ghost" onClick={handleExport} style={{ marginLeft: 'auto' }}>
          Export CSV
        </Button>
      </div>

      <div className="admin__card">
        <table className="admin__table">
          <thead>
            <tr>
              <th>Name</th>
              <th>Email</th>
              <th>Role</th>
              <th>Status</th>
              <th style={{ textAlign: 'right' }}>Actions</th>
            </tr>
          </thead>
          <tbody>
            {visible.length === 0 && (
              <tr>
                <td colSpan={5}>
                  <div className="admin__empty">
                    {loading
                      ? 'Loading users…'
                      : error
                        ? error
                        : q
                          ? 'No users match your search.'
                          : 'No users to show.'}
                  </div>
                </td>
              </tr>
            )}
            {visible.map((u) => {
              const archived = u.archivedAt !== null;
              return (
                <tr key={u.id} className={archived ? 'is-archived' : undefined}>
                  <td>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
                      <div className="admin__feed-av">{initials(u.name)}</div>
                      <span className="admin__strong">{u.name}</span>
                    </div>
                  </td>
                  <td><span className="admin__sub">{u.email}</span></td>
                  <td>
                    {archived ? (
                      <RoleBadge role={u.role} />
                    ) : (
                      <select
                        className="admin__orgswitch-select"
                        style={{ height: 36, fontSize: 13, fontWeight: 700, textTransform: 'capitalize' }}
                        value={u.role}
                        onChange={(e) => handleRoleChange(u, e.target.value as UserRole)}
                      >
                        {ROLES.map((r) => (
                          <option key={r} value={r}>{roleLabel(r)}</option>
                        ))}
                      </select>
                    )}
                  </td>
                  <td>
                    {archived ? <Badge tone="rose">Archived</Badge> : <Badge tone="flora">Active</Badge>}
                  </td>
                  <td>
                    <div className="admin__actions">
                      {archived ? (
                        <button
                          className="admin__link-btn admin__link-btn--sky"
                          onClick={() => handleRestore(u)}
                        >
                          Restore
                        </button>
                      ) : (
                        <>
                          <button
                            className="admin__link-btn admin__link-btn--sky"
                            onClick={() => setPendingPassword(u)}
                          >
                            Set password
                          </button>
                          <button
                            className="admin__link-btn admin__link-btn--rose"
                            onClick={() => setPendingArchive(u)}
                          >
                            Archive
                          </button>
                        </>
                      )}
                    </div>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      {addOpen && (
        <AddUserModal
          onClose={() => setAddOpen(false)}
          onAdded={(name) => {
            setAddOpen(false);
            toast.success(`Added ${name}.`);
            refresh();
          }}
        />
      )}

      {pendingArchive && (
        <ConfirmDialog
          title="Archive user?"
          message={`Archive ${pendingArchive.name}? They keep all their history and can be restored later.`}
          confirmLabel="Archive"
          busy={archiving}
          onConfirm={confirmArchive}
          onCancel={() => setPendingArchive(null)}
        />
      )}

      {pendingPassword && (
        <SetPasswordModal
          user={pendingPassword}
          onClose={() => setPendingPassword(null)}
          onSaved={(name) => {
            setPendingPassword(null);
            toast.success(`Password updated for ${name}.`);
          }}
        />
      )}
    </div>
  );
}

function SetPasswordModal({
  user,
  onClose,
  onSaved,
}: {
  user: AdminUser;
  onClose: () => void;
  onSaved: (name: string) => void;
}) {
  const [password, setPassword] = useState('');
  const [confirm, setConfirm] = useState('');
  const [error, setError] = useState('');
  const [saving, setSaving] = useState(false);

  async function handleSave() {
    if (password.length < 8) { setError('Set a password of at least 8 characters.'); return; }
    if (password !== confirm) { setError('The two passwords do not match.'); return; }
    setSaving(true);
    try {
      await setUserPassword(user.id, password);
      onSaved(user.name);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Could not update the password.');
      setSaving(false);
    }
  }

  return (
    <Modal
      title="Set password"
      description={`Set a new password for ${user.name}.`}
      onClose={onClose}
    >
      <div className="admin__field">
        <label className="admin__field-label" htmlFor="set-user-password">New password</label>
        <input
          id="set-user-password"
          className="admin__input"
          type="password"
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          placeholder="At least 8 characters"
          autoComplete="new-password"
          autoFocus
        />
      </div>
      <div className="admin__field">
        <label className="admin__field-label" htmlFor="set-user-password-confirm">Confirm password</label>
        <input
          id="set-user-password-confirm"
          className="admin__input"
          type="password"
          value={confirm}
          onChange={(e) => setConfirm(e.target.value)}
          placeholder="Re-enter the password"
          autoComplete="new-password"
        />
      </div>

      {error ? <div className="admin__form-error">{error}</div> : null}

      <div className="admin__modal-actions">
        <Button variant="ghost" fullWidth onClick={onClose} disabled={saving}>Cancel</Button>
        <Button variant="primary" fullWidth onClick={handleSave} disabled={saving}>
          {saving ? 'Saving…' : 'Set password'}
        </Button>
      </div>
    </Modal>
  );
}

function AddUserModal({
  onClose,
  onAdded,
}: {
  onClose: () => void;
  onAdded: (name: string) => void;
}) {
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [role, setRole] = useState<UserRole>('staff');
  const [error, setError] = useState('');
  const [saving, setSaving] = useState(false);

  async function handleSave() {
    const n = name.trim();
    const em = email.trim();
    if (!n) { setError('Enter a name.'); return; }
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(em)) { setError('Enter a valid email address.'); return; }
    if (password.length < 8) { setError('Set a temporary password of at least 8 characters.'); return; }
    if (getUsers().some((u) => u.email.toLowerCase() === em.toLowerCase() && u.archivedAt === null)) {
      setError('Someone with that email already exists in this organisation.');
      return;
    }
    setSaving(true);
    try {
      await addUser({ name: n, email: em, role, password });
      onAdded(n);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Could not add the user.');
      setSaving(false);
    }
  }

  return (
    <Modal
      title="Add user"
      description="Invite a team member to this organisation."
      onClose={onClose}
    >
      <div className="admin__field">
        <label className="admin__field-label" htmlFor="new-user-name">Full name</label>
        <input
          id="new-user-name"
          className="admin__input"
          value={name}
          onChange={(e) => setName(e.target.value)}
          placeholder="e.g. Niamh O'Reilly"
          autoFocus
        />
      </div>
      <div className="admin__field">
        <label className="admin__field-label" htmlFor="new-user-email">Email address</label>
        <input
          id="new-user-email"
          className="admin__input"
          type="email"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          placeholder="name@organisation.example"
        />
      </div>
      <div className="admin__field">
        <label className="admin__field-label" htmlFor="new-user-password">Temporary password</label>
        <input
          id="new-user-password"
          className="admin__input"
          type="password"
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          placeholder="At least 8 characters"
          autoComplete="new-password"
        />
      </div>
      <SelectField
        id="new-user-role"
        label="Role"
        value={role}
        onChange={(e) => setRole(e.target.value as UserRole)}
        style={{ textTransform: 'capitalize' }}
      >
        {ROLES.map((r) => (
          <option key={r} value={r}>{roleLabel(r)}</option>
        ))}
      </SelectField>

      {error ? <div className="admin__form-error">{error}</div> : null}

      <div className="admin__modal-actions">
        <Button variant="ghost" fullWidth onClick={onClose} disabled={saving}>Cancel</Button>
        <Button variant="primary" fullWidth onClick={handleSave} disabled={saving}>
          {saving ? 'Adding…' : 'Add user'}
        </Button>
      </div>
    </Modal>
  );
}
