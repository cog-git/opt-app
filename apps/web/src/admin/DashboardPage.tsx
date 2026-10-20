/**
 * Dashboard — the office admin landing page. A read-only, at-a-glance view of
 * the current organisation: live operational counts, this week's hours, and a
 * couple of trend charts. Never mutates data.
 */

import { useEffect, useMemo, useState } from 'react';
import { NavLink } from 'react-router-dom';
import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
} from 'recharts';
import {
  getJobs,
  getClients,
  getUsers,
  getTimeEntries,
  getJobById,
  getCurrentOrg,
  loadJobs,
  loadClients,
  loadUsers,
  loadTimeEntries,
} from './adminStore';
import { useOrgScope } from './AdminLayout';

const WEEK_MS = 7 * 86_400_000;

function hoursBetween(clockIn: string, clockOut: string): number {
  return (new Date(clockOut).getTime() - new Date(clockIn).getTime()) / 3_600_000;
}

export function DashboardPage() {
  const { version } = useOrgScope();
  const clockOnly = getCurrentOrg().tier === 'clockin';
  const [tick, setTick] = useState(0);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  useEffect(() => {
    let active = true;
    setLoading(true);
    Promise.all([loadJobs(), loadClients(), loadUsers(), loadTimeEntries()])
      .then(() => active && (setError(''), setLoading(false), setTick((n) => n + 1)))
      .catch((e) => active && (setError(String(e.message ?? e)), setLoading(false)));
    return () => {
      active = false;
    };
  }, [version]);

  void tick;

  const stats = useMemo(() => {
    const cutoff = Date.now() - WEEK_MS;
    const jobs = getJobs();
    const clients = getClients();
    const users = getUsers();
    const entries = getTimeEntries();

    const liveJobs = jobs.filter((j) => j.archivedAt === null);
    const activeJobs = liveJobs.filter((j) => j.status === 'active');
    const liveClients = clients.filter((c) => c.archivedAt === null);
    const liveUsers = users.filter((u) => u.archivedAt === null);

    const onTheClock = entries
      .filter((t) => t.clockOut === null)
      .sort((a, b) => a.clockIn.localeCompare(b.clockIn));

    const weekEntries = entries.filter(
      (t) => t.clockOut !== null && new Date(t.clockIn).getTime() >= cutoff,
    );
    const weekHours = weekEntries.reduce(
      (sum, t) => sum + hoursBetween(t.clockIn, t.clockOut as string),
      0,
    );
    const jobsCompletedThisWeek = liveJobs.filter(
      (j) => j.status === 'complete' && new Date(j.createdAt).getTime() >= cutoff,
    ).length;
    const newClientsThisWeek = liveClients.filter(
      (c) => new Date(c.createdAt).getTime() >= cutoff,
    ).length;

    return {
      activeJobs: activeJobs.length,
      liveClients: liveClients.length,
      liveUsers: liveUsers.length,
      onTheClock,
      weekHours,
      weekShifts: weekEntries.length,
      jobsCompletedThisWeek,
      newClientsThisWeek,
    };
  }, [tick]);

  // Trend charts: hours logged per day across the last 7 days, and hours by job
  // this week — both read straight off completed time entries.
  const charts = useMemo(() => {
    const completed = getTimeEntries().filter((t) => t.clockOut !== null);

    const byDay = new Map<string, number>();
    const days: { key: string; name: string; hours: number }[] = [];
    for (let i = 6; i >= 0; i--) {
      const d = new Date();
      d.setHours(0, 0, 0, 0);
      d.setDate(d.getDate() - i);
      const key = d.toISOString().slice(0, 10);
      byDay.set(key, 0);
      days.push({ key, name: d.toLocaleDateString('en-GB', { weekday: 'short' }), hours: 0 });
    }
    for (const t of completed) {
      const d = new Date(t.clockIn);
      d.setHours(0, 0, 0, 0);
      const key = d.toISOString().slice(0, 10);
      if (byDay.has(key)) {
        byDay.set(key, (byDay.get(key) ?? 0) + hoursBetween(t.clockIn, t.clockOut as string));
      }
    }
    for (const day of days) day.hours = Math.round((byDay.get(day.key) ?? 0) * 10) / 10;

    const cutoff = Date.now() - WEEK_MS;
    const jobMap = new Map<string, { name: string; hours: number }>();
    for (const t of completed) {
      if (new Date(t.clockIn).getTime() < cutoff) continue;
      const job = t.jobId ? getJobById(t.jobId) : null;
      const name = job ? `#${job.jobNumber}` : 'Other';
      const row = jobMap.get(name) ?? { name, hours: 0 };
      row.hours += hoursBetween(t.clockIn, t.clockOut as string);
      jobMap.set(name, row);
    }
    const byJob = [...jobMap.values()]
      .map((j) => ({ name: j.name, hours: Math.round(j.hours * 10) / 10 }))
      .sort((a, b) => b.hours - a.hours)
      .slice(0, 6);

    return { days, byJob };
  }, [tick]);

  return (
    <div>
      <div className="admin__page-head">
        <div>
          <h1>Dashboard</h1>
        </div>
      </div>

      {error && !loading ? (
        <div className="admin__card">
          <div className="admin__empty">{error}</div>
        </div>
      ) : (
        <>
          {/* Operational now */}
          <div className="admin__stat-row">
            {!clockOnly && (
              <NavLink to="/admin/jobs" className="admin__stat" style={{ textDecoration: 'none' }}>
                <div className="admin__stat-num">{loading ? '—' : stats.activeJobs}</div>
                <div className="admin__stat-label">Active jobs</div>
              </NavLink>
            )}
            {!clockOnly && (
              <NavLink to="/admin/clients" className="admin__stat" style={{ textDecoration: 'none' }}>
                <div className="admin__stat-num">{loading ? '—' : stats.liveClients}</div>
                <div className="admin__stat-label">Clients</div>
              </NavLink>
            )}
            <NavLink to="/admin/users" className="admin__stat" style={{ textDecoration: 'none' }}>
              <div className="admin__stat-num">{loading ? '—' : stats.liveUsers}</div>
              <div className="admin__stat-label">Team members</div>
            </NavLink>
            <NavLink to="/admin/manual-log" className="admin__stat" style={{ textDecoration: 'none' }}>
              <div className="admin__stat-num">{loading ? '—' : stats.onTheClock.length}</div>
              <div className="admin__stat-label">On the clock now</div>
            </NavLink>
          </div>

          {/* This week */}
          <div className="admin__card-title" style={{ padding: '0 2px 10px' }}>This week</div>
          <div className="admin__stat-row">
            <div className="admin__stat">
              <div className="admin__stat-num">{loading ? '—' : `${stats.weekHours.toFixed(1)}h`}</div>
              <div className="admin__stat-label">Hours logged</div>
            </div>
            <div className="admin__stat">
              <div className="admin__stat-num">{loading ? '—' : stats.weekShifts}</div>
              <div className="admin__stat-label">Shifts worked</div>
            </div>
            {!clockOnly && (
              <div className="admin__stat">
                <div className="admin__stat-num">{loading ? '—' : stats.jobsCompletedThisWeek}</div>
                <div className="admin__stat-label">Jobs completed</div>
              </div>
            )}
            {!clockOnly && (
              <div className="admin__stat">
                <div className="admin__stat-num">{loading ? '—' : stats.newClientsThisWeek}</div>
                <div className="admin__stat-label">New clients</div>
              </div>
            )}
          </div>

          {/* Trends */}
          {!loading && (
            <>
              <div className="admin__card-title" style={{ padding: '0 2px 10px' }}>Trends</div>
              <div className="admin__report-charts">
                <div className={`admin__card${clockOnly ? ' admin__chart-span2' : ''}`}>
                  <div className="admin__card-title">Hours logged per day</div>
                  <div className="admin__chart-wrap">
                    <ResponsiveContainer width="100%" height={240}>
                      <BarChart data={charts.days} margin={{ top: 8, right: 16, bottom: 8, left: 8 }}>
                        <CartesianGrid strokeDasharray="3 3" stroke="var(--line)" vertical={false} />
                        <XAxis dataKey="name" tick={{ fontSize: 12 }} stroke="var(--muted)" />
                        <YAxis tick={{ fontSize: 12 }} stroke="var(--muted)" unit="h" />
                        <Tooltip formatter={(v: number) => [`${v}h`, 'Hours']} cursor={{ fill: 'rgba(47,128,237,0.06)' }} />
                        <Bar dataKey="hours" fill="#2f80ed" radius={[6, 6, 0, 0]} />
                      </BarChart>
                    </ResponsiveContainer>
                  </div>
                </div>

                {!clockOnly && (
                  <div className="admin__card">
                    <div className="admin__card-title">Hours by job (this week)</div>
                    <div className="admin__chart-wrap">
                      <ResponsiveContainer width="100%" height={240}>
                        <BarChart
                          data={charts.byJob}
                          layout="vertical"
                          margin={{ top: 8, right: 16, bottom: 8, left: 8 }}
                        >
                          <CartesianGrid strokeDasharray="3 3" stroke="var(--line)" horizontal={false} />
                          <XAxis type="number" tick={{ fontSize: 12 }} stroke="var(--muted)" unit="h" />
                          <YAxis type="category" dataKey="name" width={70} tick={{ fontSize: 12 }} stroke="var(--muted)" />
                          <Tooltip formatter={(v: number) => [`${v}h`, 'Hours']} cursor={{ fill: 'rgba(75,212,99,0.08)' }} />
                          <Bar dataKey="hours" fill="#4bd463" radius={[0, 6, 6, 0]} />
                        </BarChart>
                      </ResponsiveContainer>
                    </div>
                  </div>
                )}
              </div>
            </>
          )}
        </>
      )}
    </div>
  );
}
