/**
 * Job selection screen — shown after clock-in.
 * Lets the worker pick a job (records job-on), shows a live timer,
 * and provides Clock Off Job / End Day actions.
 */

import { useState, useEffect, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import { Button, Logo } from '@opt/ui';
import { getUsers, getJobs, loadJobs, getTasks, loadTasks, assignJob, endJob, clockOut, isClockOnly } from './store';
import { playJobTone, playClockOutTone } from './tones';
import { useIdleTimeout } from './useIdleTimeout';
import { JobDetailModal } from './JobDetailModal';
import {
  loadJobs as loadAdminJobs,
  loadClients as loadAdminClients,
  loadWorkshops as loadAdminWorkshops,
} from '../admin/adminStore';
import type { MockUser, MockJob } from './mockData';

function BackIcon() {
  return (
    <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M19 12H5M12 5l-7 7 7 7" />
    </svg>
  );
}

function CheckIcon() {
  return (
    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
      <path d="m5 12 4 4 9-9" />
    </svg>
  );
}

function InfoIcon() {
  return (
    <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <circle cx="12" cy="12" r="10" />
      <path d="M12 16v-4M12 8h.01" />
    </svg>
  );
}

function formatElapsed(ms: number): string {
  const totalSecs = Math.floor(ms / 1000);
  const h = Math.floor(totalSecs / 3600);
  const m = Math.floor((totalSecs % 3600) / 60);
  const s = totalSecs % 60;
  if (h > 0) return `${h}:${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`;
  return `${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`;
}

export function KioskJobsPage() {
  const navigate = useNavigate();
  const [user, setUser] = useState<MockUser | null>(null);
  const [jobs, setJobs] = useState<readonly MockJob[]>(getJobs());
  const [tasks, setTasks] = useState<readonly MockJob[]>(getTasks());
  const [selectedJobId, setSelectedJobId] = useState<string | null>(null);
  const [jobStartedAt, setJobStartedAt] = useState<number | null>(null);
  const [elapsed, setElapsed] = useState(0);
  const [busy, setBusy] = useState(false);
  // Job the worker tapped "info" on — opens the read-only detail sheet.
  const [detailJobId, setDetailJobId] = useState<string | null>(null);

  // Return a walked-away kiosk to the safe home screen after 15 min idle.
  useIdleTimeout(() => navigate('/kiosk'));

  // Pull the live job list (jobs created in the admin console) when a session
  // is present; otherwise this keeps the offline mock jobs.
  useEffect(() => {
    let active = true;
    loadJobs().then((live) => active && setJobs([...live])).catch(() => {});
    loadTasks().then((live) => active && setTasks([...live])).catch(() => {});
    // Warm the admin caches so the job detail sheet can resolve a job's client,
    // workshop and attachments. No-ops without a signed-in session.
    void loadAdminJobs();
    void loadAdminClients();
    void loadAdminWorkshops();
    return () => {
      active = false;
    };
  }, []);

  // Load user
  useEffect(() => {
    // Clock-only tenants have no job picking — never land here.
    if (isClockOnly()) { navigate('/kiosk'); return; }
    const id = sessionStorage.getItem('kiosk-userId');
    if (!id) { navigate('/kiosk'); return; }
    const found = getUsers().find((u) => u.id === id);
    if (!found) { navigate('/kiosk'); return; }
    // If already on a job from before, restore it
    setUser({ ...found });
    if (found.currentJobId) {
      setSelectedJobId(found.currentJobId);
      setJobStartedAt(Date.now());
    }
  }, [navigate]);

  // Live timer
  useEffect(() => {
    if (!jobStartedAt) return;
    const id = setInterval(() => {
      setElapsed(Date.now() - jobStartedAt);
    }, 1000);
    return () => clearInterval(id);
  }, [jobStartedAt]);

  const handleSelectJob = useCallback(async (job: MockJob) => {
    if (!user || busy || selectedJobId === job.id) return;
    setBusy(true);
    await assignJob(user.id, job.id);
    playJobTone();
    setSelectedJobId(job.id);
    setJobStartedAt(Date.now());
    setElapsed(0);
    setBusy(false);

    // Refresh user state
    const updated = getUsers().find((u) => u.id === user.id);
    if (updated) setUser({ ...updated });
  }, [user, busy, selectedJobId]);

  const handleEndJob = useCallback(async () => {
    if (!user || busy) return;
    setBusy(true);
    await endJob(user.id);
    setSelectedJobId(null);
    setJobStartedAt(null);
    setElapsed(0);
    setBusy(false);
    const updated = getUsers().find((u) => u.id === user.id);
    if (updated) setUser({ ...updated });
  }, [user, busy]);

  const handleEndDay = useCallback(async () => {
    if (!user || busy) return;
    setBusy(true);
    await clockOut(user.id);
    playClockOutTone();
    sessionStorage.removeItem('kiosk-userId');
    navigate('/kiosk');
  }, [user, busy, navigate]);

  if (!user) return null;

  const activeJob = selectedJobId
    ? [...jobs, ...tasks].find((j) => j.id === selectedJobId)
    : null;

  const renderRow = (job: MockJob, showInfo = false) => {
    const isActive = job.id === selectedJobId;
    return (
      <div
        key={job.id}
        style={{
          display: 'flex',
          alignItems: 'stretch',
          gap: 10,
        }}
      >
        <button
          onClick={() => handleSelectJob(job)}
          disabled={busy}
          style={{
            flex: 1,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            padding: '22px 28px',
            borderRadius: 18,
            border: isActive ? '2.5px solid var(--sky)' : '1.5px solid var(--line)',
            background: isActive ? '#edf4fe' : 'var(--paper)',
            cursor: 'pointer',
            fontFamily: 'inherit',
            transition: 'all 120ms ease',
            textAlign: 'left',
          }}
        >
          <div>
            <div style={{
              fontSize: 20,
              fontWeight: 700,
              color: isActive ? 'var(--sky)' : 'var(--ink)',
            }}>
              {job.title}
              {job.ref && (
                <span style={{
                  marginLeft: 10,
                  fontSize: 14,
                  fontWeight: 500,
                  color: isActive ? 'var(--sky)' : 'var(--muted)',
                }}>
                  {job.ref}
                </span>
              )}
            </div>
          </div>
          {isActive && (
            <div style={{
              width: 36, height: 36,
              borderRadius: '50%',
              background: 'var(--sky)',
              display: 'flex', alignItems: 'center', justifyContent: 'center',
              color: '#fff',
              flexShrink: 0,
            }}>
              <CheckIcon />
            </div>
          )}
        </button>
        {showInfo && (
          <button
            onClick={() => setDetailJobId(job.id)}
            aria-label={`Details for ${job.title}`}
            style={{
              width: 64,
              borderRadius: 18,
              border: '1.5px solid var(--line)',
              background: 'var(--paper)',
              cursor: 'pointer',
              color: 'var(--sky)',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              flexShrink: 0,
              transition: 'all 120ms ease',
            }}
          >
            <InfoIcon />
          </button>
        )}
      </div>
    );
  };

  return (
    <div style={{
      minHeight: '100vh',
      background: 'var(--porcelain)',
      display: 'flex',
      flexDirection: 'column',
    }}>
      {/* Header */}
      <header style={{
        display: 'flex', alignItems: 'center', justifyContent: 'space-between',
        padding: '26px 40px',
      }}>
        <Logo color="var(--flora)" height={32} />
        <button
          onClick={() => navigate('/kiosk')}
          style={{
            background: 'transparent', border: 0, cursor: 'pointer',
            color: 'var(--ink)', display: 'flex', alignItems: 'center',
            gap: 8, fontFamily: 'inherit', fontSize: 15, fontWeight: 600,
            padding: '8px 16px', borderRadius: 12,
          }}
        >
          <BackIcon />
          Back to kiosk
        </button>
      </header>

      <div style={{ padding: '0 40px 60px', maxWidth: 900, margin: '0 auto', width: '100%' }}>

        {/* Active job banner */}
        {activeJob ? (
          <div style={{
            background: 'var(--sky)',
            borderRadius: 22,
            padding: '28px 34px',
            marginBottom: 32,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            flexWrap: 'wrap',
            gap: 20,
          }}>
            <div>
              <div style={{ color: '#dbe9fd', fontSize: 13, fontWeight: 600, marginBottom: 4 }}>
                ON JOB
              </div>
              <div style={{ color: '#fff', fontSize: 26, fontWeight: 800 }}>
                {activeJob.title} {activeJob.ref}
              </div>
            </div>
            <div style={{ display: 'flex', alignItems: 'center', gap: 20 }}>
              <div style={{
                fontVariantNumeric: 'tabular-nums',
                fontSize: 40,
                fontWeight: 800,
                color: '#fff',
                letterSpacing: 1,
                fontFamily: 'var(--mono, monospace)',
              }}>
                {formatElapsed(elapsed)}
              </div>
              <Button
                variant="ghost"
                onClick={handleEndJob}
                disabled={busy}
                style={{ background: 'rgba(255,255,255,.15)', color: '#fff', border: '1.5px solid rgba(255,255,255,.3)' }}
              >
                Clock off job
              </Button>
            </div>
          </div>
        ) : (
          <div style={{
            background: 'var(--paper)',
            border: '2px dashed var(--line)',
            borderRadius: 22,
            padding: '24px 34px',
            marginBottom: 32,
            color: 'var(--muted)',
            fontWeight: 600,
            fontSize: 16,
          }}>
            No active job — select one below
          </div>
        )}

        {/* User greeting */}
        <div style={{ marginBottom: 28 }}>
          <h1 style={{ fontSize: 32, fontWeight: 800, letterSpacing: '-.5px', marginBottom: 4 }}>
            Hi {user.firstName}, pick a job
          </h1>
          <p style={{ color: 'var(--muted)', fontSize: 16, fontWeight: 500 }}>
            Tap a job to start the timer. Switching jobs ends the previous one.
          </p>
        </div>

        {/* Job list */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: 12, marginBottom: 32 }}>
          {jobs.map((j) => renderRow(j, true))}
        </div>

        {/* Task list — non-job activities (housekeeping, training, etc.) */}
        {tasks.length > 0 && (
          <div style={{ marginBottom: 32 }}>
            <h2 style={{ fontSize: 22, fontWeight: 800, letterSpacing: '-.3px', marginBottom: 4 }}>
              Tasks
            </h2>
            <p style={{ color: 'var(--muted)', fontSize: 15, fontWeight: 500, marginBottom: 14 }}>
              Not on a job? Clock onto a task instead.
            </p>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
              {tasks.map((t) => renderRow(t))}
            </div>
          </div>
        )}

        {/* End day */}
        <div style={{
          borderTop: '1px solid var(--line)',
          paddingTop: 28,
          display: 'flex',
          gap: 14,
          justifyContent: 'flex-end',
        }}>
          <Button variant="ghost" onClick={handleEndJob} disabled={busy || !selectedJobId}>
            Clock off job
          </Button>
          <Button
            variant="ghost"
            onClick={handleEndDay}
            disabled={busy}
            style={{ color: 'var(--rose-deep)', borderColor: 'var(--rose)' }}
          >
            End day — clock out
          </Button>
        </div>
      </div>

      {detailJobId && (
        <JobDetailModal jobId={detailJobId} onClose={() => setDetailJobId(null)} />
      )}
    </div>
  );
}
