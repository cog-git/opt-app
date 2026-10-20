/**
 * Manual log — retrospective time entry.
 *
 * Pick a staff member, a date, time-on and time-off (24h HH:MM), and a job
 * (with "Other" as the last option). On save, addManualTimeEntry writes a
 * manual:true entry (and logs to activity). Recent manual entries are listed
 * below, each badged "Manually logged" so it's obvious in the record — this
 * mirrors the report requirement that manual entries are flagged.
 *
 * Validation: time-off must be after time-on.
 */

import { useEffect, useMemo, useState } from 'react';
import { Button } from '@opt/ui';
import {
  getUsers,
  getJobs,
  getWorkshops,
  getUserById,
  getJobById,
  getWorkshopById,
  getManualTimeEntries,
  addManualTimeEntry,
  updateTimeEntry,
  archiveTimeEntry,
  loadUsers,
  loadJobs,
  loadWorkshops,
  loadTimeEntries,
} from './adminStore';
import type { TimeEntry } from './adminStore';
import { Badge, SelectField, LabelledInput, Modal, ConfirmDialog } from './components';
import { useOrgScope } from './AdminLayout';
import { useToast } from './toast';

const OTHER = '__other__';

function todayISODate(): string {
  const d = new Date();
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}

/** Combine a yyyy-mm-dd date and a HH:MM time into a local ISO timestamp. */
function combine(date: string, time: string): string {
  return new Date(`${date}T${time}:00`).toISOString();
}

function formatDate(iso: string): string {
  return new Date(iso).toLocaleDateString('en-GB', {
    day: '2-digit',
    month: 'short',
    year: 'numeric',
  });
}

function formatTime(iso: string): string {
  return new Date(iso).toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit' });
}

/** Local yyyy-mm-dd for a <input type="date">, from an ISO timestamp. */
function isoToDateInput(iso: string): string {
  const d = new Date(iso);
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}

/** Local HH:MM for a <input type="time">, from an ISO timestamp. */
function isoToTimeInput(iso: string): string {
  const d = new Date(iso);
  return `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`;
}

export function ManualLogPage() {
  const { version } = useOrgScope();
  const toast = useToast();
  const [tick, setTick] = useState(0);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState('');
  const [editing, setEditing] = useState<TimeEntry | null>(null);
  const [pendingDelete, setPendingDelete] = useState<TimeEntry | null>(null);
  const [deleting, setDeleting] = useState(false);
  const refresh = () => setTick((n) => n + 1);

  useEffect(() => {
    let active = true;
    setLoading(true);
    Promise.all([loadUsers(), loadJobs(), loadWorkshops(), loadTimeEntries()])
      .then(() => active && (setLoadError(''), setLoading(false), refresh()))
      .catch((e) => active && (setLoadError(String(e.message ?? e)), setLoading(false)));
    return () => {
      active = false;
    };
  }, [version]);

  const staff = useMemo(
    () => getUsers().filter((u) => u.archivedAt === null),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [version, tick],
  );
  const jobs = useMemo(
    () => getJobs().filter((j) => j.archivedAt === null),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [version, tick],
  );
  const workshops = useMemo(
    () => getWorkshops().filter((w) => w.archivedAt === null),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [version, tick],
  );

  const [userId, setUserId] = useState('');
  const [date, setDate] = useState(todayISODate());
  const [timeOn, setTimeOn] = useState('08:00');
  const [timeOff, setTimeOff] = useState('16:30');
  const [jobId, setJobId] = useState(OTHER);
  const [workshopId, setWorkshopId] = useState('');
  const [error, setError] = useState('');
  const [saving, setSaving] = useState(false);

  const recent = getManualTimeEntries();

  async function handleSave() {
    setError('');
    if (!userId) { setError('Choose who this shift is for.'); return; }
    if (!date) { setError('Choose a date.'); return; }
    if (!timeOn || !timeOff) { setError('Enter both time on and time off.'); return; }
    const clockIn = combine(date, timeOn);
    const clockOut = combine(date, timeOff);
    if (new Date(clockOut).getTime() <= new Date(clockIn).getTime()) {
      setError('Time off must be after time on.');
      return;
    }
    setSaving(true);
    try {
      await addManualTimeEntry({
        userId,
        jobId: jobId === OTHER ? null : jobId,
        workshopId: workshopId || null,
        clockIn,
        clockOut,
      });
      refresh();
      // Reset the person so consecutive entries are deliberate.
      setUserId('');
      setError('');
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Could not save the manual entry.');
    } finally {
      setSaving(false);
    }
  }

  async function confirmDelete() {
    if (!pendingDelete) return;
    setDeleting(true);
    try {
      await archiveTimeEntry(pendingDelete.id);
      toast.success('Manual entry removed.');
      setPendingDelete(null);
      refresh();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Could not remove the entry.');
    } finally {
      setDeleting(false);
    }
  }

  return (
    <div>
      <div className="admin__page-head">
        <div>
          <h1>Manual log</h1>
        </div>
      </div>

      <div className="admin__card" style={{ padding: '6px 26px 30px', maxWidth: 620 }}>
        <SelectField
          id="ml-user"
          label="Staff member"
          value={userId}
          onChange={(e) => setUserId(e.target.value)}
        >
          <option value="">Choose a person…</option>
          {staff.map((u) => (
            <option key={u.id} value={u.id}>{u.name}</option>
          ))}
        </SelectField>

        <LabelledInput
          id="ml-date"
          label="Date"
          type="date"
          value={date}
          onChange={(e) => setDate(e.target.value)}
        />

        <div className="admin__form-row">
          <LabelledInput
            id="ml-on"
            label="Time on (HH:MM)"
            type="time"
            value={timeOn}
            onChange={(e) => setTimeOn(e.target.value)}
          />
          <LabelledInput
            id="ml-off"
            label="Time off (HH:MM)"
            type="time"
            value={timeOff}
            onChange={(e) => setTimeOff(e.target.value)}
          />
        </div>

        <SelectField
          id="ml-job"
          label="Job"
          value={jobId}
          onChange={(e) => setJobId(e.target.value)}
        >
          {jobs.map((j) => (
            <option key={j.id} value={j.id}>#{j.jobNumber} {j.title}</option>
          ))}
          <option value={OTHER}>Other</option>
        </SelectField>

        {workshops.length > 0 && (
          <SelectField
            id="ml-workshop"
            label="Workshop"
            value={workshopId}
            onChange={(e) => setWorkshopId(e.target.value)}
          >
            <option value="">No workshop</option>
            {workshops.map((w) => (
              <option key={w.id} value={w.id}>{w.name}</option>
            ))}
          </SelectField>
        )}

        {error ? <div className="admin__form-error">{error}</div> : null}

        <div style={{ marginTop: 26 }}>
          <Button variant="primary" onClick={handleSave} disabled={saving}>
            {saving ? 'Saving…' : 'Save manual entry'}
          </Button>
        </div>
      </div>

      <div className="admin__card">
        <table className="admin__table">
          <thead>
            <tr>
              <th>Staff</th>
              <th>Date</th>
              <th>On</th>
              <th>Off</th>
              <th>Job</th>
              <th>Workshop</th>
              <th>Flag</th>
              <th style={{ textAlign: 'right' }}>Actions</th>
            </tr>
          </thead>
          <tbody>
            {recent.length === 0 && (
              <tr>
                <td colSpan={8}>
                  <div className="admin__empty">
                    {loading ? 'Loading…' : loadError ? loadError : 'No manual entries logged yet.'}
                  </div>
                </td>
              </tr>
            )}
            {recent.map((t) => {
              const person = getUserById(t.userId);
              const job = t.jobId ? getJobById(t.jobId) : null;
              const workshop = t.workshopId ? getWorkshopById(t.workshopId) : null;
              return (
                <tr key={t.id}>
                  <td><span className="admin__strong">{person?.name ?? 'Unknown'}</span></td>
                  <td><span className="admin__sub">{formatDate(t.clockIn)}</span></td>
                  <td><span className="opt-mono">{formatTime(t.clockIn)}</span></td>
                  <td><span className="opt-mono">{t.clockOut ? formatTime(t.clockOut) : '-'}</span></td>
                  <td>
                    <span className="admin__sub">
                      {job ? `#${job.jobNumber} ${job.title}` : 'Other'}
                    </span>
                  </td>
                  <td><span className="admin__sub">{workshop?.name ?? '-'}</span></td>
                  <td><Badge tone="rose">Manually logged</Badge></td>
                  <td>
                    <div className="admin__actions">
                      <button
                        className="admin__link-btn admin__link-btn--sky"
                        onClick={() => setEditing(t)}
                      >
                        Edit
                      </button>
                      <button
                        className="admin__link-btn admin__link-btn--rose"
                        onClick={() => setPendingDelete(t)}
                      >
                        Delete
                      </button>
                    </div>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      {editing && (
        <EditEntryModal
          entry={editing}
          onClose={() => setEditing(null)}
          onSaved={() => {
            setEditing(null);
            toast.success('Manual entry updated.');
            refresh();
          }}
        />
      )}

      {pendingDelete && (
        <ConfirmDialog
          title="Remove manual entry?"
          message={`Remove the ${formatDate(pendingDelete.clockIn)} entry for ${getUserById(pendingDelete.userId)?.name ?? 'this person'}? It stays in the audit trail but no longer counts towards hours.`}
          confirmLabel="Remove"
          busy={deleting}
          onConfirm={confirmDelete}
          onCancel={() => setPendingDelete(null)}
        />
      )}
    </div>
  );
}

function EditEntryModal({
  entry,
  onClose,
  onSaved,
}: {
  entry: TimeEntry;
  onClose: () => void;
  onSaved: () => void;
}) {
  const jobs = useMemo(() => getJobs().filter((j) => j.archivedAt === null), []);
  const workshops = useMemo(() => getWorkshops().filter((w) => w.archivedAt === null), []);
  const [date, setDate] = useState(isoToDateInput(entry.clockIn));
  const [timeOn, setTimeOn] = useState(isoToTimeInput(entry.clockIn));
  const [timeOff, setTimeOff] = useState(
    entry.clockOut ? isoToTimeInput(entry.clockOut) : '',
  );
  const [jobId, setJobId] = useState(entry.jobId ?? OTHER);
  const [workshopId, setWorkshopId] = useState(entry.workshopId ?? '');
  const [error, setError] = useState('');
  const [saving, setSaving] = useState(false);

  const person = getUserById(entry.userId);

  async function handleSave() {
    setError('');
    if (!date) { setError('Choose a date.'); return; }
    if (!timeOn) { setError('Enter a time on.'); return; }
    const clockIn = combine(date, timeOn);
    const clockOut = timeOff ? combine(date, timeOff) : null;
    if (clockOut && new Date(clockOut).getTime() <= new Date(clockIn).getTime()) {
      setError('Time off must be after time on.');
      return;
    }
    setSaving(true);
    try {
      await updateTimeEntry(entry.id, {
        jobId: jobId === OTHER ? null : jobId,
        workshopId: workshopId || null,
        clockIn,
        clockOut,
      });
      onSaved();
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Could not update the entry.');
      setSaving(false);
    }
  }

  return (
    <Modal
      title="Edit manual entry"
      description={person ? `Shift for ${person.name}.` : undefined}
      onClose={onClose}
    >
      <LabelledInput
        id="edit-date"
        label="Date"
        type="date"
        value={date}
        onChange={(e) => setDate(e.target.value)}
      />
      <div className="admin__form-row">
        <LabelledInput
          id="edit-on"
          label="Time on (HH:MM)"
          type="time"
          value={timeOn}
          onChange={(e) => setTimeOn(e.target.value)}
        />
        <LabelledInput
          id="edit-off"
          label="Time off (HH:MM)"
          type="time"
          value={timeOff}
          onChange={(e) => setTimeOff(e.target.value)}
        />
      </div>
      <SelectField
        id="edit-job"
        label="Job"
        value={jobId}
        onChange={(e) => setJobId(e.target.value)}
      >
        {jobs.map((j) => (
          <option key={j.id} value={j.id}>#{j.jobNumber} {j.title}</option>
        ))}
        <option value={OTHER}>Other</option>
      </SelectField>

      {workshops.length > 0 && (
        <SelectField
          id="edit-workshop"
          label="Workshop"
          value={workshopId}
          onChange={(e) => setWorkshopId(e.target.value)}
        >
          <option value="">No workshop</option>
          {workshops.map((w) => (
            <option key={w.id} value={w.id}>{w.name}</option>
          ))}
        </SelectField>
      )}

      {error ? <div className="admin__form-error">{error}</div> : null}

      <div className="admin__modal-actions">
        <Button variant="ghost" fullWidth onClick={onClose} disabled={saving}>Cancel</Button>
        <Button variant="primary" fullWidth onClick={handleSave} disabled={saving}>
          {saving ? 'Saving…' : 'Save changes'}
        </Button>
      </div>
    </Modal>
  );
}
