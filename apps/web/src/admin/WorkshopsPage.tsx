/**
 * Workshops page — the shop floors within a tenant. Jobs and kiosk screens
 * belong to a workshop. A workshop is just a name; archive/restore is soft (no
 * hard delete), and every action writes to the activity log via the store.
 */

import { useEffect, useState } from 'react';
import { Button } from '@opt/ui';
import {
  getWorkshops,
  loadWorkshops,
  addWorkshop,
  updateWorkshop,
  archiveWorkshop,
  restoreWorkshop,
} from './adminStore';
import type { Workshop } from './adminStore';
import { Badge, Modal, ConfirmDialog } from './components';
import { PlusIcon } from './adminIcons';
import { useOrgScope } from './AdminLayout';
import { useToast } from './toast';

export function WorkshopsPage() {
  const { version } = useOrgScope();
  const toast = useToast();
  const [addOpen, setAddOpen] = useState(false);
  const [editing, setEditing] = useState<Workshop | null>(null);
  const [query, setQuery] = useState('');
  const [showArchived, setShowArchived] = useState(false);
  const [pendingArchive, setPendingArchive] = useState<Workshop | null>(null);
  const [archiving, setArchiving] = useState(false);
  const [tick, setTick] = useState(0);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  const refresh = () => setTick((n) => n + 1);

  useEffect(() => {
    let active = true;
    setLoading(true);
    loadWorkshops()
      .then(() => active && (setError(''), setLoading(false), refresh()))
      .catch((e) => active && (setError(String(e.message ?? e)), setLoading(false)));
    return () => {
      active = false;
    };
  }, [version]);

  void tick;
  const all = getWorkshops();
  const q = query.trim().toLowerCase();
  const visible = all
    .filter((w) => (showArchived ? true : w.archivedAt === null))
    .filter((w) => !q || w.name.toLowerCase().includes(q));

  async function confirmArchive() {
    if (!pendingArchive) return;
    setArchiving(true);
    try {
      await archiveWorkshop(pendingArchive.id);
      toast.success(`Archived ${pendingArchive.name}.`);
      setPendingArchive(null);
      refresh();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Could not archive the workshop.');
    } finally {
      setArchiving(false);
    }
  }

  async function handleRestore(w: Workshop) {
    try {
      await restoreWorkshop(w.id);
      toast.success(`Restored ${w.name}.`);
      refresh();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Could not restore the workshop.');
    }
  }

  return (
    <div>
      <div className="admin__page-head">
        <div>
          <h1>Workshops</h1>
        </div>
        <Button variant="primary" onClick={() => setAddOpen(true)} style={{ gap: 8 }}>
          <PlusIcon stroke="#fff" />
          Add workshop
        </Button>
      </div>

      <div className="admin__toolbar">
        <input
          className="admin__search"
          type="search"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="Search workshops"
          aria-label="Search workshops"
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
              <th>Status</th>
              <th style={{ textAlign: 'right' }}>Actions</th>
            </tr>
          </thead>
          <tbody>
            {visible.length === 0 && (
              <tr>
                <td colSpan={3}>
                  <div className="admin__empty">
                    {loading
                      ? 'Loading workshops…'
                      : error
                        ? error
                        : q
                          ? 'No workshops match your search.'
                          : 'No workshops yet.'}
                  </div>
                </td>
              </tr>
            )}
            {visible.map((w) => {
              const archived = w.archivedAt !== null;
              return (
                <tr key={w.id} className={archived ? 'is-archived' : undefined}>
                  <td><span className="admin__strong">{w.name}</span></td>
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
                          onClick={() => handleRestore(w)}
                        >
                          Restore
                        </button>
                      ) : (
                        <>
                          <button
                            className="admin__link-btn admin__link-btn--sky"
                            onClick={() => setEditing(w)}
                          >
                            Edit
                          </button>
                          <button
                            className="admin__link-btn admin__link-btn--rose"
                            onClick={() => setPendingArchive(w)}
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
        <WorkshopModal
          onClose={() => setAddOpen(false)}
          onSaved={(name) => {
            setAddOpen(false);
            toast.success(`Added ${name}.`);
            refresh();
          }}
        />
      )}

      {editing && (
        <WorkshopModal
          workshop={editing}
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
          title="Archive workshop?"
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

function WorkshopModal({
  workshop,
  onClose,
  onSaved,
}: {
  workshop?: Workshop;
  onClose: () => void;
  onSaved: (name: string) => void;
}) {
  const editing = Boolean(workshop);
  const [name, setName] = useState(workshop?.name ?? '');
  const [error, setError] = useState('');
  const [saving, setSaving] = useState(false);

  async function handleSave() {
    const n = name.trim();
    if (!n) {
      setError('Give the workshop a name.');
      return;
    }
    setSaving(true);
    try {
      if (workshop) {
        await updateWorkshop(workshop.id, { name: n });
      } else {
        await addWorkshop({ name: n });
      }
      onSaved(n);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Could not save the workshop.');
      setSaving(false);
    }
  }

  return (
    <Modal
      title={editing ? 'Edit workshop' : 'Add workshop'}
      description="Name the shop floor. Jobs and kiosk screens can then be assigned to it."
      onClose={onClose}
    >
      <div className="admin__field">
        <label className="admin__field-label" htmlFor="workshop-name">Workshop name</label>
        <input
          id="workshop-name"
          className="admin__input"
          value={name}
          onChange={(e) => setName(e.target.value)}
          placeholder="e.g. Fabrication Bay"
          autoFocus
        />
      </div>

      {error ? <div className="admin__form-error">{error}</div> : null}

      <div className="admin__modal-actions">
        <Button variant="ghost" fullWidth onClick={onClose} disabled={saving}>Cancel</Button>
        <Button variant="primary" fullWidth onClick={handleSave} disabled={saving}>
          {saving ? 'Saving…' : editing ? 'Save changes' : 'Add workshop'}
        </Button>
      </div>
    </Modal>
  );
}
