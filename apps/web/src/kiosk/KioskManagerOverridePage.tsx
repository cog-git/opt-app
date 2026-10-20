/**
 * Manager override — the one sanctioned way to clock someone in when their face
 * will not scan (bad light, a big change in appearance, a camera fault).
 *
 * This is deliberately NOT a per-staff PIN. A credential each person carries can
 * be shared or handed over, which is exactly the buddy-punching face recognition
 * exists to stop. Instead a *manager* authorises the action: they enter their own
 * PIN, choose who is clocking in, and give a reason. We write a manager-override
 * record to the same offline queue that syncs to the server, so every override is
 * attributable — which manager, for whom, when and why. The staff member is then
 * taken to the normal confirm screen to clock in as themselves.
 */

import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Button, Logo } from '@opt/ui';
import { useIdleTimeout } from './useIdleTimeout';
import { getManagerByPin, registerUser, logManagerOverride } from './store';
import { getEnrolmentsForMatch } from './faceStore';
import type { MockUser } from './mockData';

function BackIcon() {
  return (
    <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M19 12H5M12 5l-7 7 7 7" />
    </svg>
  );
}

const REASONS = ['Camera or lighting', 'Appearance changed', 'Camera fault', 'Other'];

type Step = 'pin' | 'who' | 'reason';

export function KioskManagerOverridePage() {
  const navigate = useNavigate();
  useIdleTimeout(() => navigate('/kiosk'));

  const [step, setStep] = useState<Step>('pin');
  const [pin, setPin] = useState('');
  const [pinError, setPinError] = useState('');
  const [manager, setManager] = useState<MockUser | null>(null);
  const [staff, setStaff] = useState<{ id: string; name: string } | null>(null);
  const [reason, setReason] = useState('');
  const [busy, setBusy] = useState(false);

  const enrolments = getEnrolmentsForMatch();

  function pressDigit(d: string) {
    if (pin.length >= 8) return;
    setPinError('');
    setPin((p) => p + d);
  }

  function delDigit() {
    setPinError('');
    setPin((p) => p.slice(0, -1));
  }

  function submitPin() {
    const found = getManagerByPin(pin);
    if (!found) {
      setPinError('That PIN was not recognised. Ask a manager to sign in.');
      setPin('');
      return;
    }
    setManager(found);
    setStep('who');
  }

  function pickStaff(person: { id: string; name: string }) {
    setStaff(person);
    setStep('reason');
  }

  async function confirmOverride() {
    if (!manager || !staff || busy) return;
    setBusy(true);
    await logManagerOverride(manager.id, staff.id, reason || 'Not given');
    registerUser(staff.id, staff.name);
    sessionStorage.setItem('kiosk-userId', staff.id);
    navigate('/kiosk/confirm');
  }

  return (
    <div style={{ minHeight: '100vh', background: 'var(--porcelain)', display: 'flex', flexDirection: 'column' }}>
      <header style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '26px 40px' }}>
        <Logo color="var(--sky)" height={32} />
        <button
          onClick={() => navigate('/kiosk/verify')}
          style={{
            background: 'transparent', border: 0, cursor: 'pointer', color: 'var(--ink)',
            display: 'flex', alignItems: 'center', gap: 8, fontFamily: 'inherit',
            fontSize: 15, fontWeight: 600, padding: '8px 16px', borderRadius: 12,
          }}
        >
          <BackIcon />
          Back to camera
        </button>
      </header>

      <div style={{ flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: 30, padding: '20px 40px 60px' }}>

        {step === 'pin' && (
          <>
            <div style={{ textAlign: 'center', maxWidth: 460 }}>
              <h1 style={{ fontSize: 34, fontWeight: 800, letterSpacing: '-.5px', marginBottom: 10 }}>
                Manager sign-in
              </h1>
              <p style={{ fontSize: 16, color: 'var(--muted)', fontWeight: 500 }}>
                A manager can clock someone in when their face will not scan. Enter your manager PIN.
              </p>
            </div>

            <div style={{ display: 'flex', gap: 12, height: 22, alignItems: 'center' }}>
              {Array.from({ length: Math.max(pin.length, 4) }).map((_, i) => (
                <span key={i} style={{
                  width: 14, height: 14, borderRadius: '50%',
                  background: i < pin.length ? 'var(--sky)' : 'var(--line)',
                }} />
              ))}
            </div>

            {pinError && (
              <div style={{ color: 'var(--rose-deeper)', fontSize: 14, fontWeight: 600, textAlign: 'center', maxWidth: 320 }}>
                {pinError}
              </div>
            )}

            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 84px)', gap: 14 }}>
              {['1', '2', '3', '4', '5', '6', '7', '8', '9'].map((d) => (
                <button
                  key={d}
                  onClick={() => pressDigit(d)}
                  style={keyStyle}
                >
                  {d}
                </button>
              ))}
              <button onClick={delDigit} style={{ ...keyStyle, fontSize: 18, color: 'var(--muted)' }}>Del</button>
              <button onClick={() => pressDigit('0')} style={keyStyle}>0</button>
              <button
                onClick={submitPin}
                disabled={pin.length < 4}
                style={{
                  ...keyStyle,
                  background: pin.length < 4 ? 'var(--line)' : 'var(--sky)',
                  color: pin.length < 4 ? 'var(--muted)' : '#fff',
                  cursor: pin.length < 4 ? 'default' : 'pointer',
                  fontSize: 16,
                }}
              >
                Enter
              </button>
            </div>
          </>
        )}

        {step === 'who' && (
          <>
            <div style={{ textAlign: 'center', maxWidth: 460 }}>
              <h1 style={{ fontSize: 34, fontWeight: 800, letterSpacing: '-.5px', marginBottom: 10 }}>
                Who is clocking in?
              </h1>
              <p style={{ fontSize: 16, color: 'var(--muted)', fontWeight: 500 }}>
                Authorised by {manager?.name}. Choose the person in front of you.
              </p>
            </div>

            {enrolments.length === 0 ? (
              <div style={{
                width: 360, padding: '24px', borderRadius: 18, textAlign: 'center',
                background: 'var(--rose-soft)', color: 'var(--rose-deeper)', fontSize: 15, fontWeight: 600, lineHeight: 1.5,
              }}>
                No faces are enrolled on this kiosk yet. Ask the person to register their face first.
              </div>
            ) : (
              <div style={{ display: 'flex', flexDirection: 'column', gap: 10, width: '100%', maxWidth: 380 }}>
                {enrolments.map((e) => (
                  <button
                    key={e.id}
                    onClick={() => pickStaff({ id: e.id, name: e.name })}
                    style={{
                      display: 'flex', alignItems: 'center', gap: 14, width: '100%',
                      padding: '14px 18px', borderRadius: 16, border: '1px solid var(--line)',
                      background: '#fff', cursor: 'pointer', fontFamily: 'inherit', textAlign: 'left',
                    }}
                  >
                    <span style={{
                      width: 44, height: 44, borderRadius: '50%', background: 'var(--sky-soft)',
                      color: 'var(--sky)', display: 'flex', alignItems: 'center', justifyContent: 'center',
                      fontWeight: 800, fontSize: 16, flexShrink: 0,
                    }}>
                      {e.name.split(/\s+/).slice(0, 2).map((p) => p[0]?.toUpperCase() ?? '').join('')}
                    </span>
                    <span style={{ fontSize: 18, fontWeight: 700, color: 'var(--ink)' }}>{e.name}</span>
                  </button>
                ))}
              </div>
            )}

            <p style={{ fontSize: 13, color: 'var(--muted)', fontWeight: 500, textAlign: 'center', maxWidth: 340 }}>
              Not listed? Ask them to register their face first — an override cannot enrol a new person.
            </p>
          </>
        )}

        {step === 'reason' && (
          <>
            <div style={{ textAlign: 'center', maxWidth: 460 }}>
              <h1 style={{ fontSize: 32, fontWeight: 800, letterSpacing: '-.5px', marginBottom: 10 }}>
                Why the override?
              </h1>
              <p style={{ fontSize: 16, color: 'var(--muted)', fontWeight: 500 }}>
                {manager?.name} is clocking in {staff?.name}. This is recorded for the manager and the office.
              </p>
            </div>

            <div style={{ display: 'flex', flexWrap: 'wrap', gap: 10, justifyContent: 'center', maxWidth: 420 }}>
              {REASONS.map((r) => {
                const active = reason === r;
                return (
                  <button
                    key={r}
                    onClick={() => setReason(r)}
                    style={{
                      padding: '12px 18px', borderRadius: 999, cursor: 'pointer', fontFamily: 'inherit',
                      fontSize: 15, fontWeight: 600,
                      border: `1px solid ${active ? 'var(--sky)' : 'var(--line)'}`,
                      background: active ? 'var(--sky)' : '#fff',
                      color: active ? '#fff' : 'var(--ink)',
                    }}
                  >
                    {r}
                  </button>
                );
              })}
            </div>

            <div style={{ display: 'flex', flexDirection: 'column', gap: 12, width: '100%', maxWidth: 380 }}>
              <Button
                variant="primary"
                fullWidth
                disabled={busy}
                onClick={confirmOverride}
                style={{ height: 64, fontSize: 19 }}
              >
                Authorise and continue
              </Button>
              <Button variant="ghost" fullWidth onClick={() => navigate('/kiosk/verify')} style={{ height: 50 }}>
                Cancel
              </Button>
            </div>
          </>
        )}
      </div>
    </div>
  );
}

const keyStyle: React.CSSProperties = {
  width: 84, height: 72, borderRadius: 18, border: '1px solid var(--line)',
  background: '#fff', cursor: 'pointer', fontFamily: 'inherit',
  fontSize: 26, fontWeight: 700, color: 'var(--ink)',
  display: 'flex', alignItems: 'center', justifyContent: 'center',
};
