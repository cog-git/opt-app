/**
 * Screens page — kiosk devices registered to a tenant. Each screen carries a
 * server-generated device token (never chosen by the operator) and can be tied
 * to a workshop. Archive/restore is soft; every action writes to the activity
 * log via the store.
 */

import { useEffect, useState } from 'react';
import { Button } from '@opt/ui';
import {
  getScreens,
  loadScreens,
  addScreen,
  updateScreen,
  archiveScreen,
  restoreScreen,
  getWorkshops,
  loadWorkshops,
  getWorkshopById,
} from './adminStore';
import type { Screen } from './adminStore';
import { Badge, Modal, ConfirmDialog, SelectField } from './components';
import { PlusIcon } from './adminIcons';
import { useOrgScope } from './AdminLayout';
import { useToast } from './toast';

function formatDateTime(iso: string): string {
  return new Date(iso).toLocaleString('en-GB', {
    day: '2-digit',
    month: 'short',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  });
}

export function ScreensPage() {
  const { version } = useOrgScope();
  const toast = useToast();
  const [addOpen, setAddOpen] = useState(false);
  const [editing, setEditing] = useState<Screen | null>(null);
  const [query, setQuery] = useState('');
  const [showArchived, setShowArchived] = useState(false);
  const [pendingArchive, setPendingArchive] = useState<Screen | null>(null);
  const [archiving, setArchiving] = useState(false);
  const [tick, setTick] = useState(0);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  const refresh = () => setTick((n) => n + 1);

  useEffect(() => {
    let active = true;
    setLoading(true);
    Promise.all([loadScreens(), loadWorkshops()])
      .then(() => active && (setError(''), setLoading(false), refresh()))
      .catch((e) => active && (setError(String(e.message ?? e)), setLoading(false)));
    return () => {
      active = false;
    };
  }, [version]);

  void tick;
  const all = getScreens();
  const q = query.trim().toLowerCase();
  const visible = all
    .filter((s) => (showArchived ? true : s.archivedAt === null))
    .filter((s) => !q || s.name.toLowerCase().includes(q));

  async function confirmArchive() {
    if (!pendingArchive) return;
    setArchiving(true);
    try {
      await archiveScreen(pendingArchive.id);
      toast.success(`Archived ${pendingArchive.name}.`);
      setPendingArchive(null);
      refresh();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Could not archive the screen.');
    } finally {
      setArchiving(false);
    }
  }

  async function handleRestore(s: Screen) {
    try {
      await restoreScreen(s.id);
      toast.success(`Restored ${s.name}.`);
      refresh();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Could not restore the screen.');
    }
  }

  return (
    <div>
      <div className="admin__page-head">
        <div>
          <h1>Screens</h1>
        </div>
        <Button variant="primary" onClick={() => setAddOpen(true)} style={{ gap: 8 }}>
          <PlusIcon stroke="#fff" />
          Register screen
        </Button>
      </div>

      <div className="admin__toolbar">
        <input
          className="admin__search"
          type="search"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="Search screens"
          aria-label="Search screens"
        />
        <label className="admin__toggle">
          <input
            type="checkbox"
            checked={showArchived}
            onChange={(e) => setShowArchived(e.target.checked)}
          />
          Show archived
        </label>
      </div>

      <div className="admin__card">
        <table className="admin__table">
          <thead>
            <tr>
              <th>Name</th>
              <th>Workshop</th>
              <th>Device token</th>
              <th>Last seen</th>
              <th>Status</th>
              <th style={{ textAlign: 'right' }}>Actions</th>
            </tr>
          </thead>
          <tbody>
            {visible.length === 0 && (
              <tr>
                <td colSpan={6}>
                  <div className="admin__empty">
                    {loading
                      ? 'Loading screens…'
                      : error
                        ? error
                        : q
                          ? 'No screens match your search.'
                          : 'No screens registered yet.'}
                  </div>
                </td>
              </tr>
            )}
            {visible.map((s) => {
              const archived = s.archivedAt !== null;
              const workshop = s.workshopId ? getWorkshopById(s.workshopId) : undefined;
              return (
                <tr key={s.id} className={archived ? 'is-archived' : undefined}>
                  <td><span className="admin__strong">{s.name}</span></td>
                  <td><span className="admin__sub">{workshop?.name ?? '—'}</span></td>
                  <td><span className="opt-mono admin__sub">{s.deviceToken}</span></td>
                  <td><span className="admin__sub">{s.lastSeenAt ? formatDateTime(s.lastSeenAt) : 'Never'}</span></td>
                  <td>
                    {archived ? (
                      <Badge tone="rose">Archived</Badge>
                    ) : (
                      <Badge tone="flora">Active</Badge>
                    )}
                  </td>
                  <td>
                    <div className="admin__actions">
                      {archived ? (
                        <button
                          className="admin__link-btn admin__link-btn--sky"
                          onClick={() => handleRestore(s)}
                        >
                          Restore
                        </button>
                      ) : (
                        <>
                          <button
                            className="admin__link-btn admin__link-btn--sky"
                            onClick={() => setEditing(s)}
                          >
                            Edit
                          </button>
                          <button
                            className="admin__link-btn admin__link-btn--rose"
                            onClick={() => setPendingArchive(s)}
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
        <ScreenModal
          onClose={() => setAddOpen(false)}
          onSaved={(name) => {
            setAddOpen(false);
            toast.success(`Registered ${name}.`);
            refresh();
          }}
        />
      )}

      {editing && (
        <ScreenModal
          screen={editing}
          onClose={() => setEditing(null)}
          onSaved={(name) => {
            setEditing(null);
            toast.success(`Updated ${name}.`);
            refresh();
          }}
        />
      )}

      {pendingArchive && (
        <ConfirmDialog
          title="Archive screen?"
          message={`Archive ${pendingArchive.name}? It can be restored later.`}
          confirmLabel="Archive"
          busy={archiving}
          onConfirm={confirmArchive}
          onCancel={() => setPendingArchive(null)}
        />
      )}
    </div>
  );
}

// ── Modal ────────────────────────────────────────────────────────────────────

function ScreenModal({
  screen,
  onClose,
  onSaved,
}: {
  screen?: Screen;
  onClose: () => void;
  onSaved: (name: string) => void;
}) {
  const editing = Boolean(screen);
  const [name, setName] = useState(screen?.name ?? '');
  const [workshopId, setWorkshopId] = useState(screen?.workshopId ?? '');
  const [error, setError] = useState('');
  const [saving, setSaving] = useState(false);

  const workshopOptions = getWorkshops().filter((w) => w.archivedAt === null);

  async function handleSave() {
    const n = name.trim();
    if (!n) {
      setError('Give the screen a name.');
      return;
    }
    setSaving(true);
    try {
      if (screen) {
        await updateScreen(screen.id, { name: n, workshopId: workshopId || null });
      } else {
        await addScreen({ name: n, workshopId: workshopId || null });
      }
      onSaved(n);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Could not save the screen.');
      setSaving(false);
    }
  }

  return (
    <Modal
      title={editing ? 'Edit screen' : 'Register screen'}
      description="Name the kiosk device and optionally tie it to a workshop. The device token is generated automatically."
      onClose={onClose}
    >
      <div className="admin__field">
        <label className="admin__field-label" htmlFor="screen-name">Screen name</label>
        <input
          id="screen-name"
          className="admin__input"
          value={name}
          onChange={(e) => setName(e.target.value)}
          placeholder="e.g. Fabrication Kiosk"
          autoFocus
        />
      </div>

      <SelectField
        label="Workshop (optional)"
        id="screen-workshop"
        value={workshopId}
        onChange={(e) => setWorkshopId(e.target.value)}
      >
        <option value="">No workshop</option>
        {workshopOptions.map((w) => (
          <option key={w.id} value={w.id}>{w.name}</option>
        ))}
      </SelectField>

      {editing && screen ? (
        <div className="admin__field">
          <label className="admin__field-label">Device token</label>
          <div className="opt-mono admin__sub">{screen.deviceToken}</div>
        </div>
      ) : null}

      {error ? <div className="admin__form-error">{error}</div> : null}

      <div className="admin__modal-actions">
        <Button variant="ghost" fullWidth onClick={onClose} disabled={saving}>Cancel</Button>
        <Button variant="primary" fullWidth onClick={handleSave} disabled={saving}>
          {saving ? 'Saving…' : editing ? 'Save changes' : 'Register screen'}
        </Button>
      </div>
    </Modal>
  );
}
