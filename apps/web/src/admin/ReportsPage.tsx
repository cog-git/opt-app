/**
 * Reports — hours worked, summarised by person, job and workshop for the current
 * organisation, over a selectable period and optional workshop/person filters.
 * Charts give an at-a-glance read; the tables and CSV export back it for payroll
 * or client billing. Read-only: reports never mutate data.
 */

import { useEffect, useMemo, useState } from 'react';
import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
  PieChart,
  Pie,
  Cell,
  Legend,
} from 'recharts';
import { Button } from '@opt/ui';
import {
  getTimeEntriesInPeriod,
  getTimeEntries,
  getUserById,
  getUsers,
  getJobById,
  getWorkshops,
  getWorkshopById,
  getCurrentOrg,
  loadUsers,
  loadJobs,
  loadWorkshops,
  loadTimeEntries,
  roleLabel,
} from './adminStore';
import type { ReportPeriod, TimeEntry } from './adminStore';
import { Badge, SelectField, LabelledInput } from './components';
import { DownloadIcon } from './adminIcons';
import { useOrgScope } from './AdminLayout';

/** Report period, plus a "custom" mode driven by explicit from/to dates. */
type Period = ReportPeriod | 'custom';

const PERIODS: { value: Period; label: string }[] = [
  { value: 'week', label: 'Last 7 days' },
  { value: 'month', label: 'Last 30 days' },
  { value: 'all', label: 'All time' },
  { value: 'custom', label: 'Custom range' },
];

/** Local yyyy-mm-dd for a date input, N days before today (0 = today). */
function daysAgoDateInput(n: number): string {
  const d = new Date();
  d.setDate(d.getDate() - n);
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}

// Chart palette — sky lead, flora/rose supporting, then a few distinct tints so
// pie slices stay legible when a tenant has many workshops.
const CHART_COLORS = [
  '#2f80ed', '#70f181', '#ce8888', '#f2c14e',
  '#9b8cff', '#4bd463', '#1f63c4', '#e07a5f',
];

/** Shorten long job/workshop labels so axis ticks and legends don't wrap. */
function truncate(label: string, max = 18): string {
  return label.length > max ? `${label.slice(0, max - 1)}…` : label;
}

function hoursBetween(clockIn: string, clockOut: string): number {
  return (new Date(clockOut).getTime() - new Date(clockIn).getTime()) / 3_600_000;
}

function formatHours(h: number): string {
  return `${h.toFixed(1)}h`;
}

function formatDate(iso: string): string {
  return new Date(iso).toLocaleDateString('en-GB', {
    day: '2-digit',
    month: 'short',
    year: 'numeric',
  });
}

function formatTime(iso: string): string {
  return new Date(iso).toLocaleTimeString('en-GB', {
    hour: '2-digit',
    minute: '2-digit',
  });
}

interface PersonRow {
  userId: string;
  name: string;
  role: string;
  shifts: number;
  hours: number;
}

interface JobRow {
  key: string;
  label: string;
  shifts: number;
  hours: number;
}

interface WorkshopRow {
  key: string;
  label: string;
  shifts: number;
  hours: number;
}

/**
 * Resolve a time entry to its workshop: an explicit workshop set on the entry
 * (e.g. from the manual log) wins, otherwise fall back to the job's workshop.
 * Null if neither is set.
 */
function workshopFor(t: TimeEntry): { id: string; name: string } | null {
  if (t.workshopId) {
    const explicit = getWorkshopById(t.workshopId);
    if (explicit) return { id: explicit.id, name: explicit.name };
  }
  if (!t.jobId) return null;
  const job = getJobById(t.jobId);
  if (!job?.workshopId) return null;
  const workshop = getWorkshopById(job.workshopId);
  return workshop ? { id: workshop.id, name: workshop.name } : null;
}

export function ReportsPage() {
  const { version } = useOrgScope();
  const [period, setPeriod] = useState<Period>('week');
  const [fromDate, setFromDate] = useState(() => daysAgoDateInput(7));
  const [toDate, setToDate] = useState(() => daysAgoDateInput(0));
  const [workshopFilter, setWorkshopFilter] = useState('all');
  const [userFilter, setUserFilter] = useState('all');
  const [tick, setTick] = useState(0);
  const [loading, setLoading] = useState(true);

  // Clock-in-only tenants have no jobs/workshops, so hide those cuts and just
  // report employee hours by name over the chosen range.
  const clockOnly = getCurrentOrg().tier === 'clockin';

  useEffect(() => {
    let active = true;
    setLoading(true);
    Promise.all([loadUsers(), loadJobs(), loadWorkshops(), loadTimeEntries()])
      .then(() => active && (setLoading(false), setTick((n) => n + 1)))
      .catch(() => active && setLoading(false));
    return () => {
      active = false;
    };
  }, [version]);

  void tick;

  const workshopOptions = getWorkshops().filter((w) => w.archivedAt === null);
  const userOptions = getUsers();
  const filtersActive = workshopFilter !== 'all' || userFilter !== 'all';

  // Completed entries for the chosen window: named period, or an explicit
  // [fromDate, toDate] range (inclusive of the whole end day).
  const baseEntries = (() => {
    if (period !== 'custom') return getTimeEntriesInPeriod(period);
    const from = fromDate ? new Date(`${fromDate}T00:00:00`).getTime() : 0;
    const to = toDate ? new Date(`${toDate}T23:59:59`).getTime() : Infinity;
    return getTimeEntries().filter((t) => {
      if (t.clockOut === null) return false;
      const at = new Date(t.clockIn).getTime();
      return at >= from && at <= to;
    });
  })();

  const entries = baseEntries.filter((t) => {
    if (userFilter !== 'all' && t.userId !== userFilter) return false;
    if (!clockOnly && workshopFilter !== 'all') {
      const ws = workshopFor(t);
      if ((ws?.id ?? 'none') !== workshopFilter) return false;
    }
    return true;
  });

  const { byPerson, byJob, byWorkshop, totalHours } = useMemo(() => {
    const people = new Map<string, PersonRow>();
    const jobsMap = new Map<string, JobRow>();
    const workshopsMap = new Map<string, WorkshopRow>();
    let total = 0;

    for (const t of entries) {
      const h = hoursBetween(t.clockIn, t.clockOut as string);
      total += h;

      const user = getUserById(t.userId);
      const person = people.get(t.userId) ?? {
        userId: t.userId,
        name: user?.name ?? 'Unknown',
        role: user ? roleLabel(user.role) : '—',
        shifts: 0,
        hours: 0,
      };
      person.shifts += 1;
      person.hours += h;
      people.set(t.userId, person);

      const jobKey = t.jobId ?? 'other';
      const job = t.jobId ? getJobById(t.jobId) : null;
      const label = job ? `#${job.jobNumber} ${job.title}` : 'Other / no job';
      const jobRow = jobsMap.get(jobKey) ?? { key: jobKey, label, shifts: 0, hours: 0 };
      jobRow.shifts += 1;
      jobRow.hours += h;
      jobsMap.set(jobKey, jobRow);

      const workshop = workshopFor(t);
      const wsKey = workshop?.id ?? 'none';
      const wsLabel = workshop?.name ?? 'No workshop';
      const wsRow = workshopsMap.get(wsKey) ?? { key: wsKey, label: wsLabel, shifts: 0, hours: 0 };
      wsRow.shifts += 1;
      wsRow.hours += h;
      workshopsMap.set(wsKey, wsRow);
    }

    const byPerson = [...people.values()].sort((a, b) => b.hours - a.hours);
    const byJob = [...jobsMap.values()].sort((a, b) => b.hours - a.hours);
    const byWorkshop = [...workshopsMap.values()].sort((a, b) => b.hours - a.hours);
    return { byPerson, byJob, byWorkshop, totalHours: total };
  }, [entries]);

  const round1 = (h: number) => Math.round(h * 10) / 10;
  const personChart = byPerson.map((p) => ({ name: truncate(p.name), hours: round1(p.hours) }));
  const workshopChart = byWorkshop.map((w) => ({ name: truncate(w.label), hours: round1(w.hours) }));
  const jobChart = byJob.map((j) => ({ name: truncate(j.label), hours: round1(j.hours) }));

  function handleExport() {
    const header = clockOnly
      ? ['Shift date', 'Person', 'Role', 'Clock in', 'Clock out', 'Hours', 'Manual']
      : ['Shift date', 'Person', 'Role', 'Job', 'Workshop', 'Clock in', 'Clock out', 'Hours', 'Manual'];
    const rows = entries.map((t: TimeEntry) => {
      const user = getUserById(t.userId);
      const job = t.jobId ? getJobById(t.jobId) : null;
      const workshop = workshopFor(t);
      const jobCols = clockOnly
        ? []
        : [job ? `#${job.jobNumber} ${job.title}` : 'Other', workshop?.name ?? 'No workshop'];
      return [
        formatDate(t.clockIn),
        user?.name ?? 'Unknown',
        user ? roleLabel(user.role) : '',
        ...jobCols,
        formatTime(t.clockIn),
        t.clockOut ? formatTime(t.clockOut) : '',
        hoursBetween(t.clockIn, t.clockOut as string).toFixed(2),
        t.manual ? 'yes' : 'no',
      ];
    });
    const csv = [header, ...rows]
      .map((r) => r.map((cell) => `"${String(cell).replace(/"/g, '""')}"`).join(','))
      .join('\r\n');

    const org = getCurrentOrg();
    const periodTag = period === 'custom' ? `${fromDate}_to_${toDate}` : period;
    const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `opt-hours-${org.subdomain}-${periodTag}.csv`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  }

  return (
    <div>
      <div className="admin__page-head">
        <div>
          <h1>Reports</h1>
        </div>
        <Button
          variant="primary"
          onClick={handleExport}
          disabled={entries.length === 0}
          style={{ gap: 8 }}
        >
          <DownloadIcon stroke="#fff" />
          Export CSV
        </Button>
      </div>

      {/* Filter bar: period + workshop + person */}
      <div className="admin__filter-bar">
        <div className="admin__seg" style={{ marginBottom: 0 }}>
          {PERIODS.map((p) => (
            <button
              key={p.value}
              className={`admin__seg-btn${period === p.value ? ' is-active' : ''}`}
              onClick={() => setPeriod(p.value)}
            >
              {p.label}
            </button>
          ))}
        </div>

        {period === 'custom' && (
          <>
            <LabelledInput
              id="report-from"
              label="From"
              type="date"
              value={fromDate}
              max={toDate || undefined}
              onChange={(e) => setFromDate(e.target.value)}
            />
            <LabelledInput
              id="report-to"
              label="To"
              type="date"
              value={toDate}
              min={fromDate || undefined}
              onChange={(e) => setToDate(e.target.value)}
            />
          </>
        )}

        {!clockOnly && (
          <SelectField
            label="Workshop"
            id="report-workshop"
            value={workshopFilter}
            onChange={(e) => setWorkshopFilter(e.target.value)}
          >
            <option value="all">All workshops</option>
            {workshopOptions.map((w) => (
              <option key={w.id} value={w.id}>{w.name}</option>
            ))}
          </SelectField>
        )}

        <SelectField
          label="Person"
          id="report-person"
          value={userFilter}
          onChange={(e) => setUserFilter(e.target.value)}
        >
          <option value="all">All people</option>
          {userOptions.map((u) => (
            <option key={u.id} value={u.id}>{u.name}</option>
          ))}
        </SelectField>

        {filtersActive && (
          <Button
            variant="ghost"
            onClick={() => {
              setWorkshopFilter('all');
              setUserFilter('all');
            }}
          >
            Clear filters
          </Button>
        )}
      </div>

      {/* Summary tiles */}
      <div className="admin__stat-row">
        <div className="admin__stat">
          <div className="admin__stat-num">{formatHours(totalHours)}</div>
          <div className="admin__stat-label">Total hours</div>
        </div>
        <div className="admin__stat">
          <div className="admin__stat-num">{byPerson.length}</div>
          <div className="admin__stat-label">People worked</div>
        </div>
        {!clockOnly && (
          <div className="admin__stat">
            <div className="admin__stat-num">{byJob.length}</div>
            <div className="admin__stat-label">Jobs touched</div>
          </div>
        )}
        <div className="admin__stat">
          <div className="admin__stat-num">{entries.length}</div>
          <div className="admin__stat-label">Shifts</div>
        </div>
      </div>

      {entries.length === 0 ? (
        <div className="admin__card">
          <div className="admin__empty">
            {loading
              ? 'Loading…'
              : filtersActive
                ? 'No completed shifts match these filters.'
                : 'No completed shifts in this period.'}
          </div>
        </div>
      ) : (
        <>
        {/* Charts */}
        <div className="admin__report-charts">
          {/* Hours by person — bar. Spans full width on clock-in tenants, who
              have no workshop/job charts alongside it. */}
          <div className={`admin__card${clockOnly ? ' admin__chart-span2' : ''}`}>
            <div className="admin__card-title">Hours by person</div>
            <div className="admin__chart-wrap">
              <ResponsiveContainer width="100%" height={260}>
                <BarChart
                  data={personChart}
                  layout="vertical"
                  margin={{ top: 8, right: 16, bottom: 8, left: 8 }}
                >
                  <CartesianGrid strokeDasharray="3 3" stroke="var(--line)" horizontal={false} />
                  <XAxis type="number" tick={{ fontSize: 12 }} stroke="var(--muted)" unit="h" />
                  <YAxis
                    type="category"
                    dataKey="name"
                    width={110}
                    tick={{ fontSize: 12 }}
                    stroke="var(--muted)"
                  />
                  <Tooltip formatter={(v: number) => [`${v}h`, 'Hours']} cursor={{ fill: 'rgba(47,128,237,0.06)' }} />
                  <Bar dataKey="hours" fill="#2f80ed" radius={[0, 6, 6, 0]} />
                </BarChart>
              </ResponsiveContainer>
            </div>
          </div>

          {!clockOnly && (
            <>
              {/* Hours by workshop — donut */}
              <div className="admin__card">
                <div className="admin__card-title">Hours by workshop</div>
                <div className="admin__chart-wrap">
                  <ResponsiveContainer width="100%" height={260}>
                    <PieChart>
                      <Pie
                        data={workshopChart}
                        dataKey="hours"
                        nameKey="name"
                        cx="50%"
                        cy="50%"
                        innerRadius={58}
                        outerRadius={96}
                        paddingAngle={2}
                      >
                        {workshopChart.map((_, i) => (
                          <Cell key={i} fill={CHART_COLORS[i % CHART_COLORS.length]} />
                        ))}
                      </Pie>
                      <Tooltip formatter={(v: number, n) => [`${v}h`, n as string]} />
                      <Legend wrapperStyle={{ fontSize: 12 }} />
                    </PieChart>
                  </ResponsiveContainer>
                </div>
              </div>

              {/* Hours by job — bar, full width */}
              <div className="admin__card admin__chart-span2">
                <div className="admin__card-title">Hours by job</div>
                <div className="admin__chart-wrap">
                  <ResponsiveContainer width="100%" height={280}>
                    <BarChart data={jobChart} margin={{ top: 8, right: 16, bottom: 40, left: 8 }}>
                      <CartesianGrid strokeDasharray="3 3" stroke="var(--line)" vertical={false} />
                      <XAxis
                        dataKey="name"
                        tick={{ fontSize: 12 }}
                        stroke="var(--muted)"
                        angle={-20}
                        textAnchor="end"
                        interval={0}
                        height={50}
                      />
                      <YAxis tick={{ fontSize: 12 }} stroke="var(--muted)" unit="h" />
                      <Tooltip formatter={(v: number) => [`${v}h`, 'Hours']} cursor={{ fill: 'rgba(75,212,99,0.08)' }} />
                      <Bar dataKey="hours" fill="#4bd463" radius={[6, 6, 0, 0]} />
                    </BarChart>
                  </ResponsiveContainer>
                </div>
              </div>
            </>
          )}
        </div>

        <div className="admin__report-grid">
          {/* Hours by person */}
          <div className="admin__card">
            <div className="admin__card-title">Hours by person</div>
            <table className="admin__table">
              <thead>
                <tr>
                  <th>Person</th>
                  <th>Role</th>
                  <th>Shifts</th>
                  <th>Hours</th>
                </tr>
              </thead>
              <tbody>
                {byPerson.map((p) => (
                  <tr key={p.userId}>
                    <td><span className="admin__strong">{p.name}</span></td>
                    <td><span className="admin__sub">{p.role}</span></td>
                    <td><span className="opt-mono">{p.shifts}</span></td>
                    <td><span className="opt-mono admin__strong">{formatHours(p.hours)}</span></td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          {!clockOnly && (
            <>
              {/* Hours by job */}
              <div className="admin__card">
                <div className="admin__card-title">Hours by job</div>
                <table className="admin__table">
                  <thead>
                    <tr>
                      <th>Job</th>
                      <th>Shifts</th>
                      <th>Hours</th>
                    </tr>
                  </thead>
                  <tbody>
                    {byJob.map((j) => (
                      <tr key={j.key}>
                        <td>
                          {j.key === 'other' ? (
                            <Badge tone="grey">{j.label}</Badge>
                          ) : (
                            <span className="admin__strong">{j.label}</span>
                          )}
                        </td>
                        <td><span className="opt-mono">{j.shifts}</span></td>
                        <td><span className="opt-mono admin__strong">{formatHours(j.hours)}</span></td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>

              {/* Hours by workshop */}
              <div className="admin__card">
                <div className="admin__card-title">Hours by workshop</div>
                <table className="admin__table">
                  <thead>
                    <tr>
                      <th>Workshop</th>
                      <th>Shifts</th>
                      <th>Hours</th>
                    </tr>
                  </thead>
                  <tbody>
                    {byWorkshop.map((w) => (
                      <tr key={w.key}>
                        <td>
                          {w.key === 'none' ? (
                            <Badge tone="grey">{w.label}</Badge>
                          ) : (
                            <span className="admin__strong">{w.label}</span>
                          )}
                        </td>
                        <td><span className="opt-mono">{w.shifts}</span></td>
                        <td><span className="opt-mono admin__strong">{formatHours(w.hours)}</span></td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </>
          )}
        </div>
        </>
      )}
    </div>
  );
}
