/**
 * Tasks page — non-job tasks staff can clock onto (housekeeping, admin, etc).
 * A task is just a name + status; archive/restore is soft (no hard delete),
 * and every action writes to the activity log via the store.
 */

import { useEffect, useState } from 'react';
import { Button } from '@opt/ui';
import {
  getTasks,
  loadTasks,
  addTask,
  updateTask,
  archiveTask,
  restoreTask,
} from './adminStore';
import type { Task, TaskStatus } from './adminStore';
import { Badge, Modal, ConfirmDialog, SelectField } from './components';
import { PlusIcon } from './adminIcons';
import { useOrgScope } from './AdminLayout';
import { useToast } from './toast';

export function TasksPage() {
  const { version } = useOrgScope();
  const toast = useToast();
  const [addOpen, setAddOpen] = useState(false);
  const [editing, setEditing] = useState<Task | null>(null);
  const [query, setQuery] = useState('');
  const [statusFilter, setStatusFilter] = useState<'all' | TaskStatus>('all');
  const [showArchived, setShowArchived] = useState(false);
  const [pendingArchive, setPendingArchive] = useState<Task | null>(null);
  const [archiving, setArchiving] = useState(false);
  const [tick, setTick] = useState(0);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  const refresh = () => setTick((n) => n + 1);

  useEffect(() => {
    let active = true;
    setLoading(true);
    loadTasks()
      .then(() => active && (setError(''), setLoading(false), refresh()))
      .catch((e) => active && (setError(String(e.message ?? e)), setLoading(false)));
    return () => {
      active = false;
    };
  }, [version]);

  void tick;
  const all = getTasks();
  const q = query.trim().toLowerCase();
  const visible = all
    .filter((t) => (showArchived ? true : t.archivedAt === null))
    .filter((t) => statusFilter === 'all' || t.status === statusFilter)
    .filter((t) => !q || t.name.toLowerCase().includes(q));

  async function confirmArchive() {
    if (!pendingArchive) return;
    setArchiving(true);
    try {
      await archiveTask(pendingArchive.id);
      toast.success(`Archived ${pendingArchive.name}.`);
      setPendingArchive(null);
      refresh();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Could not archive the task.');
    } finally {
      setArchiving(false);
    }
  }

  async function handleRestore(t: Task) {
    try {
      await restoreTask(t.id);
      toast.success(`Restored ${t.name}.`);
      refresh();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Could not restore the task.');
    }
  }

  return (
    <div>
      <div className="admin__page-head">
        <div>
          <h1>Tasks</h1>
        </div>
        <Button variant="primary" onClick={() => setAddOpen(true)} style={{ gap: 8 }}>
          <PlusIcon stroke="#fff" />
          Create task
        </Button>
      </div>

      <div className="admin__toolbar">
        <input
          className="admin__search"
          type="search"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="Search tasks"
          aria-label="Search tasks"
        />
        <select
          className="admin__select"
          style={{ width: 'auto' }}
          value={statusFilter}
          onChange={(e) => setStatusFilter(e.target.value as 'all' | TaskStatus)}
          aria-label="Filter by status"
        >
          <option value="all">Status: All</option>
          <option value="active">Active</option>
          <option value="inactive">Inactive</option>
        </select>
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
                      ? 'Loading tasks…'
                      : error
                        ? error
                        : q || statusFilter !== 'all'
                          ? 'No tasks match your filters.'
                          : 'No tasks yet.'}
                  </div>
                </td>
              </tr>
            )}
            {visible.map((t) => {
              const archived = t.archivedAt !== null;
              return (
                <tr key={t.id} className={archived ? 'is-archived' : undefined}>
                  <td><span className="admin__strong">{t.name}</span></td>
                  <td>
                    {archived ? (
                      <Badge tone="rose">Archived</Badge>
                    ) : t.status === 'active' ? (
                      <Badge tone="flora">Active</Badge>
                    ) : (
                      <Badge tone="grey">Inactive</Badge>
                    )}
                  </td>
                  <td>
                    <div className="admin__actions">
                      {archived ? (
                        <button
                          className="admin__link-btn admin__link-btn--sky"
                          onClick={() => handleRestore(t)}
                        >
                          Restore
                        </button>
                      ) : (
                        <>
                          <button
                            className="admin__link-btn admin__link-btn--sky"
                            onClick={() => setEditing(t)}
                          >
                            Edit
                          </button>
                          <button
                            className="admin__link-btn admin__link-btn--rose"
                            onClick={() => setPendingArchive(t)}
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
        <TaskModal
          onClose={() => setAddOpen(false)}
          onSaved={(name) => {
            setAddOpen(false);
            toast.success(`Created ${name}.`);
            refresh();
          }}
        />
      )}

      {editing && (
        <TaskModal
          task={editing}
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
          title="Archive task?"
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

function TaskModal({
  task,
  onClose,
  onSaved,
}: {
  task?: Task;
  onClose: () => void;
  onSaved: (name: string) => void;
}) {
  const editing = Boolean(task);
  const [name, setName] = useState(task?.name ?? '');
  const [status, setStatus] = useState<TaskStatus>(task?.status ?? 'active');
  const [error, setError] = useState('');
  const [saving, setSaving] = useState(false);

  async function handleSave() {
    const n = name.trim();
    if (!n) {
      setError('Give the task a name.');
      return;
    }
    setSaving(true);
    try {
      if (task) {
        await updateTask(task.id, { name: n, status });
      } else {
        await addTask({ name: n, status });
      }
      onSaved(n);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Could not save the task.');
      setSaving(false);
    }
  }

  return (
    <Modal
      title={editing ? 'Edit task' : 'Create task'}
      description="Name the task and set whether it's available for staff to clock onto."
      onClose={onClose}
    >
      <div className="admin__field">
        <label className="admin__field-label" htmlFor="task-name">Task name</label>
        <input
          id="task-name"
          className="admin__input"
          value={name}
          onChange={(e) => setName(e.target.value)}
          placeholder="e.g. House Keeping"
          autoFocus
        />
      </div>

      <SelectField
        id="task-status"
        label="Status"
        value={status}
        onChange={(e) => setStatus(e.target.value as TaskStatus)}
      >
        <option value="active">Active</option>
        <option value="inactive">Inactive</option>
      </SelectField>

      {error ? <div className="admin__form-error">{error}</div> : null}

      <div className="admin__modal-actions">
        <Button variant="ghost" fullWidth onClick={onClose} disabled={saving}>Cancel</Button>
        <Button variant="primary" fullWidth onClick={handleSave} disabled={saving}>
          {saving ? 'Saving…' : editing ? 'Save changes' : 'Create task'}
        </Button>
      </div>
    </Modal>
  );
}
