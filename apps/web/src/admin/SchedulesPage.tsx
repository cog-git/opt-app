/**
 * Schedules page — reusable weekly shift templates for the current organisation.
 * Define a named shift with a time band + break allowance for each weekday;
 * weekly and break-hour totals are derived. Archive/restore is soft (no hard
 * delete); every action writes to the activity log via the store.
 */

import { useEffect, useState } from 'react';
import { Button } from '@opt/ui';
import {
  getSchedules,
  loadSchedules,
  addSchedule,
  updateSchedule,
  archiveSchedule,
  restoreSchedule,
  scheduleTotals,
  WEEKDAYS,
} from './adminStore';
import type { Schedule, ScheduleStatus, ScheduleDay, Weekday } from './adminStore';
import { Badge, Modal, ConfirmDialog, SelectField } from './components';
import { PlusIcon } from './adminIcons';
import { useOrgScope } from './AdminLayout';
import { useToast } from './toast';

const DAY_LABELS: Record<Weekday, string> = {
  mon: 'Mon',
  tue: 'Tue',
  wed: 'Wed',
  thu: 'Thu',
  fri: 'Fri',
  sat: 'Sat',
  sun: 'Sun',
};

function fmtHours(h: number): string {
  return `${h.toFixed(2)} hrs`;
}

/** Worked hours for a single day (band minus break), or 0 if the day is off. */
function dayWorkedHours(d: ScheduleDay | undefined): number {
  if (!d) return 0;
  const [sh, sm] = d.start.split(':').map(Number);
  const [eh, em] = d.end.split(':').map(Number);
  const band = eh * 60 + em - (sh * 60 + sm);
  if (band <= 0) return 0;
  return (band - d.breakMinutes) / 60;
}

export function SchedulesPage() {
  const { version } = useOrgScope();
  const toast = useToast();
  const [addOpen, setAddOpen] = useState(false);
  const [editing, setEditing] = useState<Schedule | null>(null);
  const [query, setQuery] = useState('');
  const [statusFilter, setStatusFilter] = useState<'all' | ScheduleStatus>('all');
  const [showArchived, setShowArchived] = useState(false);
  const [pendingArchive, setPendingArchive] = useState<Schedule | null>(null);
  const [archiving, setArchiving] = useState(false);
  const [tick, setTick] = useState(0);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  const refresh = () => setTick((n) => n + 1);

  useEffect(() => {
    let active = true;
    setLoading(true);
    loadSchedules()
      .then(() => active && (setError(''), setLoading(false), refresh()))
      .catch((e) => active && (setError(String(e.message ?? e)), setLoading(false)));
    return () => {
      active = false;
    };
  }, [version]);

  void tick;
  const all = getSchedules();
  const q = query.trim().toLowerCase();
  const visible = all
    .filter((s) => (showArchived ? true : s.archivedAt === null))
    .filter((s) => statusFilter === 'all' || s.status === statusFilter)
    .filter((s) => !q || s.name.toLowerCase().includes(q));

  async function confirmArchive() {
    if (!pendingArchive) return;
    setArchiving(true);
    try {
      await archiveSchedule(pendingArchive.id);
      toast.success(`Archived ${pendingArchive.name}.`);
      setPendingArchive(null);
      refresh();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Could not archive the schedule.');
    } finally {
      setArchiving(false);
    }
  }

  async function handleRestore(s: Schedule) {
    try {
      await restoreSchedule(s.id);
      toast.success(`Restored ${s.name}.`);
      refresh();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Could not restore the schedule.');
    }
  }

  return (
    <div>
      <div className="admin__page-head">
        <div>
          <h1>Schedules</h1>
        </div>
        <Button variant="primary" onClick={() => setAddOpen(true)} style={{ gap: 8 }}>
          <PlusIcon stroke="#fff" />
          Create schedule
        </Button>
      </div>

      <div className="admin__toolbar">
        <input
          className="admin__search"
          type="search"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="Search schedules"
          aria-label="Search schedules"
        />
        <select
          className="admin__select"
          style={{ width: 'auto' }}
          value={statusFilter}
          onChange={(e) => setStatusFilter(e.target.value as 'all' | ScheduleStatus)}
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
              <th>Weekly hours</th>
              <th>Break hours</th>
              {WEEKDAYS.map((d) => (
                <th key={d}>{DAY_LABELS[d]}</th>
              ))}
              <th style={{ textAlign: 'right' }}>Actions</th>
            </tr>
          </thead>
          <tbody>
            {visible.length === 0 && (
              <tr>
                <td colSpan={5 + WEEKDAYS.length}>
                  <div className="admin__empty">
                    {loading
                      ? 'Loading schedules…'
                      : error
                        ? error
                        : q || statusFilter !== 'all'
                          ? 'No schedules match your filters.'
                          : 'No schedules yet.'}
                  </div>
                </td>
              </tr>
            )}
            {visible.map((s) => {
              const archived = s.archivedAt !== null;
              const totals = scheduleTotals(s);
              return (
                <tr key={s.id} className={archived ? 'is-archived' : undefined}>
                  <td><span className="admin__strong">{s.name}</span></td>
                  <td>
                    {archived ? (
                      <Badge tone="rose">Archived</Badge>
                    ) : s.status === 'active' ? (
                      <Badge tone="flora">Active</Badge>
                    ) : (
                      <Badge tone="grey">Inactive</Badge>
                    )}
                  </td>
                  <td><span className="admin__sub">{fmtHours(totals.weeklyHours)}</span></td>
                  <td><span className="admin__sub">{fmtHours(totals.breakHours)}</span></td>
                  {WEEKDAYS.map((d) => {
                    const day = s.days[d];
                    return (
                      <td key={d}>
                        {day ? (
                          <span className="admin__sub" style={{ whiteSpace: 'nowrap' }}>
                            {day.start}–{day.end}
                            <br />
                            {dayWorkedHours(day).toFixed(2)}h
                          </span>
                        ) : (
                          <span className="admin__sub">—</span>
                        )}
                      </td>
                    );
                  })}
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
        <ScheduleModal
          onClose={() => setAddOpen(false)}
          onSaved={(name) => {
            setAddOpen(false);
            toast.success(`Created ${name}.`);
            refresh();
          }}
        />
      )}

      {editing && (
        <ScheduleModal
          schedule={editing}
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
          title="Archive schedule?"
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

interface DayForm {
  on: boolean;
  start: string;
  end: string;
  breakMinutes: string;
}

function blankDay(on: boolean): DayForm {
  return { on, start: '09:00', end: '17:00', breakMinutes: '30' };
}

function initialDays(schedule?: Schedule): Record<Weekday, DayForm> {
  const out = {} as Record<Weekday, DayForm>;
  for (const d of WEEKDAYS) {
    const existing = schedule?.days[d];
    if (existing) {
      out[d] = {
        on: true,
        start: existing.start,
        end: existing.end,
        breakMinutes: String(existing.breakMinutes),
      };
    } else {
      // New schedules default to Mon–Fri on; weekends off.
      out[d] = blankDay(!schedule && d !== 'sat' && d !== 'sun');
    }
  }
  return out;
}

const DAY_FULL: Record<Weekday, string> = {
  mon: 'Monday',
  tue: 'Tuesday',
  wed: 'Wednesday',
  thu: 'Thursday',
  fri: 'Friday',
  sat: 'Saturday',
  sun: 'Sunday',
};

function ScheduleModal({
  schedule,
  onClose,
  onSaved,
}: {
  schedule?: Schedule;
  onClose: () => void;
  onSaved: (name: string) => void;
}) {
  const editing = Boolean(schedule);
  const [name, setName] = useState(schedule?.name ?? '');
  const [status, setStatus] = useState<ScheduleStatus>(schedule?.status ?? 'active');
  const [days, setDays] = useState<Record<Weekday, DayForm>>(() => initialDays(schedule));
  const [error, setError] = useState('');
  const [saving, setSaving] = useState(false);

  function setDay(d: Weekday, patch: Partial<DayForm>) {
    setDays((prev) => ({ ...prev, [d]: { ...prev[d], ...patch } }));
  }

  function buildDays(): Partial<Record<Weekday, ScheduleDay>> | string {
    const out: Partial<Record<Weekday, ScheduleDay>> = {};
    for (const d of WEEKDAYS) {
      const f = days[d];
      if (!f.on) continue;
      const start = f.start;
      const end = f.end;
      if (!start || !end) return `${DAY_FULL[d]} needs a start and end time.`;
      const startMin = toMin(start);
      const endMin = toMin(end);
      if (endMin <= startMin) return `${DAY_FULL[d]}: end must be after start.`;
      const brk = Number(f.breakMinutes || '0');
      if (!Number.isFinite(brk) || brk < 0) return `${DAY_FULL[d]}: break is invalid.`;
      if (brk >= endMin - startMin) return `${DAY_FULL[d]}: break is longer than the shift.`;
      out[d] = { start, end, breakMinutes: brk };
    }
    return out;
  }

  async function handleSave() {
    const n = name.trim();
    if (!n) {
      setError('Give the schedule a name.');
      return;
    }
    const built = buildDays();
    if (typeof built === 'string') {
      setError(built);
      return;
    }
    if (Object.keys(built).length === 0) {
      setError('Turn on at least one day.');
      return;
    }
    setSaving(true);
    try {
      if (schedule) {
        await updateSchedule(schedule.id, { name: n, status, days: built });
      } else {
        await addSchedule({ name: n, status, days: built });
      }
      onSaved(n);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Could not save the schedule.');
      setSaving(false);
    }
  }

  return (
    <Modal
      title={editing ? 'Edit schedule' : 'Create schedule'}
      description="Set the hours for each day this shift runs. Turn a day off to leave it clear."
      onClose={onClose}
      wide
    >
      <div className="admin__field">
        <label className="admin__field-label" htmlFor="sched-name">Schedule name</label>
        <input
          id="sched-name"
          className="admin__input"
          value={name}
          onChange={(e) => setName(e.target.value)}
          placeholder="e.g. Weekdays 9–5"
          autoFocus
        />
      </div>

      <SelectField
        id="sched-status"
        label="Status"
        value={status}
        onChange={(e) => setStatus(e.target.value as ScheduleStatus)}
      >
        <option value="active">Active</option>
        <option value="inactive">Inactive</option>
      </SelectField>

      <div className="admin__field">
        <label className="admin__field-label">Days</label>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
          {WEEKDAYS.map((d) => {
            const f = days[d];
            return (
              <div
                key={d}
                className="admin__sched-day"
              >
                <label
                  className="admin__toggle admin__daytoggle"
                  style={{ margin: 0, color: f.on ? undefined : 'var(--muted)' }}
                >
                  <input
                    type="checkbox"
                    className="admin__daybox"
                    checked={f.on}
                    onChange={(e) => setDay(d, { on: e.target.checked })}
                  />
                  {DAY_FULL[d]}
                </label>
                <input
                  className="admin__input"
                  type="time"
                  value={f.start}
                  disabled={!f.on}
                  onChange={(e) => setDay(d, { start: e.target.value })}
                  aria-label={`${DAY_FULL[d]} start`}
                  style={{ minWidth: 0 }}
                />
                <input
                  className="admin__input"
                  type="time"
                  value={f.end}
                  disabled={!f.on}
                  onChange={(e) => setDay(d, { end: e.target.value })}
                  aria-label={`${DAY_FULL[d]} end`}
                  style={{ minWidth: 0 }}
                />
                <input
                  className="admin__input"
                  type="number"
                  min={0}
                  step={5}
                  value={f.breakMinutes}
                  disabled={!f.on}
                  onChange={(e) => setDay(d, { breakMinutes: e.target.value })}
                  aria-label={`${DAY_FULL[d]} break minutes`}
                  placeholder="Break min"
                  style={{ minWidth: 0 }}
                />
              </div>
            );
          })}
          <span className="admin__sub">Break is in minutes and is taken off that day's hours.</span>
        </div>
      </div>

      {error ? <div className="admin__form-error">{error}</div> : null}

      <div className="admin__modal-actions">
        <Button variant="ghost" fullWidth onClick={onClose} disabled={saving}>Cancel</Button>
        <Button variant="primary" fullWidth onClick={handleSave} disabled={saving}>
          {saving ? 'Saving…' : editing ? 'Save changes' : 'Create schedule'}
        </Button>
      </div>
    </Modal>
  );
}

function toMin(hhmm: string): number {
  const [h, m] = hhmm.split(':').map(Number);
  return h * 60 + m;
}
