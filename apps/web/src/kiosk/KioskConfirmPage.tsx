/**
 * Clock-in / clock-out confirm screen.
 * Reads the identified userId from sessionStorage, shows the user's current
 * clocked state, and lets them confirm or cancel.
 */

import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { Button, Logo } from '@opt/ui';
import { getUsers, clockIn, clockOut, isClockOnly } from './store';
import { playClockInTone, playClockOutTone } from './tones';
import { useIdleTimeout } from './useIdleTimeout';
import type { MockUser } from './mockData';

function formatTime(iso: string): string {
  return new Date(iso).toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit' });
}

function CheckIcon() {
  return (
    <svg width="52" height="52" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
      <circle cx="12" cy="12" r="10" />
      <path d="m7 12 3.5 3.5 6.5-7" />
    </svg>
  );
}

function BackIcon() {
  return (
    <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M19 12H5M12 5l-7 7 7 7" />
    </svg>
  );
}

type Phase = 'confirm' | 'done';

export function KioskConfirmPage() {
  const navigate = useNavigate();
  const [user, setUser] = useState<MockUser | null>(null);
  const [phase, setPhase] = useState<Phase>('confirm');
  const [actionTime, setActionTime] = useState('');
  const [busy, setBusy] = useState(false);

  // Return a walked-away kiosk to the safe home screen after 15 min idle.
  useIdleTimeout(() => navigate('/kiosk'));

  useEffect(() => {
    const id = sessionStorage.getItem('kiosk-userId');
    if (!id) { navigate('/kiosk'); return; }
    const found = getUsers().find((u) => u.id === id);
    if (!found) { navigate('/kiosk'); return; }
    setUser({ ...found }); // snapshot — so we see state at the moment of arrival
  }, [navigate]);

  async function handleAction() {
    if (!user || busy) return;
    setBusy(true);
    const now = new Date().toISOString();

    if (user.clockedIn) {
      // Clock OUT
      await clockOut(user.id);
      playClockOutTone();
    } else {
      // Clock IN
      await clockIn(user.id);
      playClockInTone();
    }

    setActionTime(formatTime(now));
    setPhase('done');
    setBusy(false);
  }

  function handleAfterClockIn() {
    // After clocking in, take them to the job list
    navigate('/kiosk/jobs');
  }

  function handleAfterClockOut() {
    // After clocking out, return to kiosk home
    sessionStorage.removeItem('kiosk-userId');
    navigate('/kiosk');
  }

  if (!user) return null;

  const willClockIn = !user.clockedIn;
  const clockOnly = isClockOnly();
  const greeting = getGreeting(user.firstName);

  return (
    <div style={{
      minHeight: '100vh',
      background: 'var(--porcelain)',
      display: 'flex',
      flexDirection: 'column',
    }}>
      <header style={{
        display: 'flex', alignItems: 'center', justifyContent: 'space-between',
        padding: '26px 40px',
      }}>
        <Logo color="var(--sky)" height={32} />
        {phase === 'confirm' && (
          <button
            onClick={() => navigate('/kiosk/verify')}
            style={{
              background: 'transparent', border: 0, cursor: 'pointer',
              color: 'var(--ink)', display: 'flex', alignItems: 'center',
              gap: 8, fontFamily: 'inherit', fontSize: 15, fontWeight: 600,
              padding: '8px 16px', borderRadius: 12,
            }}
          >
            <BackIcon />
            Back
          </button>
        )}
      </header>

      <div style={{
        flex: 1,
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        justifyContent: 'center',
        gap: 32,
        padding: '20px 40px 80px',
      }}>

        {phase === 'confirm' && (
          <>
            {/* Avatar */}
            <div style={{
              width: 120, height: 120, borderRadius: '50%',
              background: willClockIn ? 'var(--flora)' : 'var(--rose)',
              display: 'flex', alignItems: 'center', justifyContent: 'center',
              fontSize: 44, fontWeight: 800,
              color: willClockIn ? 'var(--ink)' : '#fff',
            }}>
              {user.initials}
            </div>

            <div style={{ textAlign: 'center' }}>
              <h1 style={{ fontSize: 38, fontWeight: 800, letterSpacing: '-.5px', marginBottom: 10 }}>
                {user.name}
              </h1>
              <p style={{ fontSize: 18, color: 'var(--muted)', fontWeight: 500 }}>
                {willClockIn
                  ? 'Not yet clocked in today'
                  : `Clocked in at ${user.clockedInAt ? formatTime(user.clockedInAt) : '?'}`}
              </p>
            </div>

            <div style={{ display: 'flex', flexDirection: 'column', gap: 14, width: '100%', maxWidth: 380 }}>
              <Button
                variant="primary"
                fullWidth
                disabled={busy}
                onClick={handleAction}
                style={{ height: 68, fontSize: 20 }}
              >
                {willClockIn ? 'Clock In' : 'Clock Out'}
              </Button>
              <Button
                variant="ghost"
                fullWidth
                onClick={() => navigate('/kiosk')}
                style={{ height: 54 }}
              >
                Cancel — not me
              </Button>
            </div>
          </>
        )}

        {phase === 'done' && (
          <>
            <div style={{
              width: 120, height: 120, borderRadius: '50%',
              background: willClockIn ? 'var(--flora)' : 'var(--sky)',
              display: 'flex', alignItems: 'center', justifyContent: 'center',
              color: willClockIn ? 'var(--ink)' : '#fff',
            }}>
              <CheckIcon />
            </div>

            <div style={{ textAlign: 'center' }}>
              <h1 style={{ fontSize: 36, fontWeight: 800, letterSpacing: '-.5px', marginBottom: 10 }}>
                {willClockIn
                  ? `${greeting}, ${user.firstName}!`
                  : `See you, ${user.firstName}!`}
              </h1>
              <p style={{ fontSize: 18, color: 'var(--muted)', fontWeight: 500 }}>
                {willClockIn
                  ? `Clocked in at ${actionTime}`
                  : `Clocked out at ${actionTime}`}
              </p>
            </div>

            {willClockIn && !clockOnly ? (
              <div style={{ display: 'flex', flexDirection: 'column', gap: 14, width: '100%', maxWidth: 380 }}>
                <Button variant="primary" fullWidth onClick={handleAfterClockIn} style={{ height: 68, fontSize: 20 }}>
                  Choose a job →
                </Button>
                <Button variant="ghost" fullWidth onClick={() => { sessionStorage.removeItem('kiosk-userId'); navigate('/kiosk'); }}>
                  Back to home
                </Button>
              </div>
            ) : willClockIn ? (
              <Button variant="primary" fullWidth onClick={handleAfterClockOut} style={{ height: 68, fontSize: 20, maxWidth: 380 }}>
                Done
              </Button>
            ) : (
              <Button variant="primary" fullWidth onClick={handleAfterClockOut} style={{ height: 68, fontSize: 20, maxWidth: 380 }}>
                Done
              </Button>
            )}
          </>
        )}
      </div>
    </div>
  );
}

function getGreeting(name: string): string {
  const h = new Date().getHours();
  void name;
  if (h < 12) return 'Good morning';
  if (h < 17) return 'Good afternoon';
  return 'Good evening';
}
