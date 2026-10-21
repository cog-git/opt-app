/**
 * Face enrolment — registers a new user's face on this kiosk.
 *
 * Three steps: (1) details + explicit GDPR consent, (2) real on-device capture of
 * a few poses via the webcam, (3) confirmation. We compute a 128-number face
 * descriptor per pose (@vladmandic/face-api, running locally) and store only those
 * vectors, never a photo. Face is the only way to clock in, so nobody can clock in
 * on another's behalf. If no camera is available the capture step says so plainly.
 */

import { useState, useEffect, useRef, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import { Button, Field, Logo } from '@opt/ui';
import {
  loadFaceModels,
  computeDescriptor,
  startCamera,
  stopCamera,
} from './faceEngine';
import { addEnrolment } from './faceStore';
import { registerUser } from './store';

function BackIcon() {
  return (
    <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M19 12H5M12 5l-7 7 7 7" />
    </svg>
  );
}

const CAPTURE_STEPS = ['Look straight ahead', 'Turn slightly left', 'Turn slightly right'];

export function KioskEnrolPage() {
  const navigate = useNavigate();
  const [step, setStep] = useState<'details' | 'capture' | 'done'>('details');
  const [name, setName] = useState('');
  const [consent, setConsent] = useState(false);

  const videoRef = useRef<HTMLVideoElement>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const descriptorsRef = useRef<Float32Array[]>([]);

  const [captureIndex, setCaptureIndex] = useState(0);
  const [modelsReady, setModelsReady] = useState(false);
  const [cameraReady, setCameraReady] = useState(false);
  const [cameraError, setCameraError] = useState('');
  const [busy, setBusy] = useState(false);
  const [hint, setHint] = useState('');

  const detailsValid = name.trim().length > 1 && consent;

  // Bring up camera + models when we enter the capture step; tear down on leave.
  useEffect(() => {
    if (step !== 'capture') return;
    let cancelled = false;

    (async () => {
      try {
        const [stream] = await Promise.all([startCamera(), loadFaceModels()]);
        if (cancelled) {
          stopCamera(stream);
          return;
        }
        streamRef.current = stream;
        setModelsReady(true);
        if (videoRef.current) {
          videoRef.current.srcObject = stream;
          await videoRef.current.play().catch(() => {});
        }
        setCameraReady(true);
      } catch (err) {
        if (cancelled) return;
        const name = err instanceof Error ? err.name : '';
        setCameraError(
          name === 'NotAllowedError'
            ? 'Camera access was blocked. Allow the camera and try again.'
            : 'No camera is available on this device.',
        );
      }
    })();

    return () => {
      cancelled = true;
      stopCamera(streamRef.current);
      streamRef.current = null;
    };
  }, [step]);

  const handleCapture = useCallback(async () => {
    if (!videoRef.current || busy) return;
    setBusy(true);
    setHint('');
    try {
      const descriptor = await computeDescriptor(videoRef.current);
      if (!descriptor) {
        setHint('No clear face detected. Centre your face in the frame and try again.');
        return;
      }
      descriptorsRef.current.push(descriptor);
      const next = captureIndex + 1;
      if (next >= CAPTURE_STEPS.length) {
        const entry = addEnrolment(name, descriptorsRef.current);
        registerUser(entry.id, entry.name);
        stopCamera(streamRef.current);
        streamRef.current = null;
        setStep('done');
      } else {
        setCaptureIndex(next);
      }
    } finally {
      setBusy(false);
    }
  }, [busy, captureIndex, name]);

  return (
    <div style={{ minHeight: '100vh', background: 'var(--porcelain)', display: 'flex', flexDirection: 'column' }}>
      <header style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '26px 40px' }}>
        <Logo color="var(--flora)" height={32} />
        <button
          onClick={() => navigate('/kiosk/verify')}
          style={{
            background: 'transparent', border: 0, cursor: 'pointer', color: 'var(--ink)',
            display: 'flex', alignItems: 'center', gap: 8, fontFamily: 'inherit',
            fontSize: 15, fontWeight: 600, padding: '8px 16px', borderRadius: 12,
          }}
        >
          <BackIcon />
          Back
        </button>
      </header>

      <div style={{ flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: 30, padding: '20px 40px 60px' }}>
        {step === 'details' && (
          <div style={{ width: '100%', maxWidth: 420 }}>
            <div style={{ textAlign: 'center', marginBottom: 8 }}>
              <h1 style={{ fontSize: 34, fontWeight: 800, letterSpacing: '-.5px', marginBottom: 10 }}>
                Register your face
              </h1>
              <p style={{ fontSize: 16, color: 'var(--muted)', fontWeight: 500 }}>
                Set up once, then just look at the screen to clock in.
              </p>
            </div>

            <Field
              label="Your name"
              placeholder="e.g. Sarah Mitchell"
              value={name}
              onChange={(e) => setName(e.target.value)}
            />

            <label style={{
              display: 'flex', gap: 12, alignItems: 'flex-start', marginTop: 22,
              cursor: 'pointer', fontSize: 14, color: 'var(--ink)', lineHeight: 1.5,
            }}>
              <input
                type="checkbox"
                checked={consent}
                onChange={(e) => setConsent(e.target.checked)}
                style={{ width: 20, height: 20, marginTop: 2, accentColor: 'var(--sky)', flexShrink: 0 }}
              />
              <span>
                I consent to OPT storing an encrypted face template to identify me at clock-in.
                No photo is kept, and I can withdraw and have it deleted at any time.
              </span>
            </label>

            <div style={{ marginTop: 26 }}>
              <Button
                variant="primary"
                fullWidth
                disabled={!detailsValid}
                style={detailsValid ? undefined : { opacity: 0.5, cursor: 'not-allowed' }}
                onClick={() => detailsValid && setStep('capture')}
              >
                Continue to camera
              </Button>
            </div>
          </div>
        )}

        {step === 'capture' && (
          <>
            <div style={{ textAlign: 'center', maxWidth: 460 }}>
              <h1 style={{ fontSize: 32, fontWeight: 800, letterSpacing: '-.5px', marginBottom: 10 }}>
                {CAPTURE_STEPS[captureIndex]}
              </h1>
              <p style={{ fontSize: 16, color: 'var(--muted)', fontWeight: 500 }}>
                {cameraError
                  ? 'We could not start the camera.'
                  : !cameraReady
                    ? 'Starting camera…'
                    : 'Hold still, then tap capture.'}
              </p>
            </div>

            {cameraError ? (
              <div style={{
                width: 320, padding: '28px 24px', borderRadius: 20,
                background: 'var(--rose-soft)', color: 'var(--rose-deeper)',
                textAlign: 'center', fontSize: 15, fontWeight: 600, lineHeight: 1.5,
              }}>
                {cameraError}
              </div>
            ) : (
              <div style={{
                position: 'relative', width: 260, height: 260, borderRadius: 32,
                overflow: 'hidden', background: 'var(--ink)',
                border: '3px solid var(--sky)', boxShadow: '0 0 0 8px var(--sky-soft)',
              }}>
                <video
                  ref={videoRef}
                  autoPlay
                  playsInline
                  muted
                  style={{
                    width: '100%', height: '100%', objectFit: 'cover',
                    transform: 'scaleX(-1)',
                  }}
                />
              </div>
            )}

            <div style={{ display: 'flex', gap: 12 }}>
              {CAPTURE_STEPS.map((_, i) => (
                <div key={i} style={{
                  width: 44, height: 8, borderRadius: 4,
                  background: i < captureIndex ? 'var(--flora)' : 'var(--line)',
                  transition: 'background 200ms ease',
                }} />
              ))}
            </div>

            {hint && (
              <div style={{ color: 'var(--rose-deeper)', fontSize: 14, fontWeight: 600, maxWidth: 360, textAlign: 'center' }}>
                {hint}
              </div>
            )}

            {cameraError ? (
              <Button variant="ghost" onClick={() => navigate('/kiosk')}>Back to kiosk</Button>
            ) : (
              <Button
                variant="primary"
                disabled={!cameraReady || !modelsReady || busy}
                style={!cameraReady || !modelsReady || busy ? { opacity: 0.5, cursor: 'not-allowed' } : undefined}
                onClick={handleCapture}
              >
                {busy ? 'Capturing…' : `Capture (${captureIndex + 1} of ${CAPTURE_STEPS.length})`}
              </Button>
            )}
          </>
        )}

        {step === 'done' && (
          <>
            <div style={{
              width: 110, height: 110, borderRadius: '50%', background: 'var(--flora)',
              display: 'flex', alignItems: 'center', justifyContent: 'center', color: 'var(--ink)',
            }}>
              <svg width="54" height="54" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round">
                <path d="M20 6L9 17l-5-5" />
              </svg>
            </div>
            <div style={{ textAlign: 'center', maxWidth: 440 }}>
              <h1 style={{ fontSize: 32, fontWeight: 800, letterSpacing: '-.5px', marginBottom: 10 }}>
                You're all set{name.trim() ? `, ${name.trim().split(' ')[0]}` : ''}
              </h1>
              <p style={{ fontSize: 16, color: 'var(--muted)', fontWeight: 500 }}>
                Your face is registered. Next time, just look at the screen to clock in.
              </p>
            </div>
            <div style={{ display: 'flex', gap: 14 }}>
              <Button variant="primary" onClick={() => navigate('/kiosk/verify')}>
                Try clocking in
              </Button>
              <Button variant="ghost" onClick={() => navigate('/kiosk')}>
                Back to kiosk
              </Button>
            </div>
          </>
        )}
      </div>
    </div>
  );
}
