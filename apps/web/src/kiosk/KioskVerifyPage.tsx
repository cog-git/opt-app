/**
 * Verify screen — identifies who is at the kiosk by face recognition only.
 *
 * No PIN, no QR: any shared or transferable credential lets one person clock in
 * another, which is exactly what face recognition exists to prevent. Face is the
 * single source of identity. The webcam runs on-device; we compute a live
 * descriptor a few times a second and match it against enrolled staff. On a match
 * we register the person and move to the confirm screen.
 */

import { useState, useEffect, useRef, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import { Logo } from '@opt/ui';
import { useIdleTimeout } from './useIdleTimeout';
import {
  loadFaceModels,
  computeDescriptor,
  findBestMatch,
  startCamera,
  stopCamera,
} from './faceEngine';
import { getEnrolmentsForMatch, getEnrolmentById } from './faceStore';
import { registerUser } from './store';

function FaceIcon() {
  return (
    <svg width="38" height="38" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round">
      <circle cx="12" cy="8" r="4" />
      <path d="M9 11.5c0 0 .8 1.5 3 1.5s3-1.5 3-1.5" />
      <path d="M4 20c0-4 3.6-7 8-7s8 3 8 7" />
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

type Status = 'starting' | 'scanning' | 'matched' | 'no-enrolments' | 'camera-error';

export function KioskVerifyPage() {
  const navigate = useNavigate();
  const videoRef = useRef<HTMLVideoElement>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const busyRef = useRef(false);
  const doneRef = useRef(false);

  const [status, setStatus] = useState<Status>('starting');
  const [cameraError, setCameraError] = useState('');
  const [matchedName, setMatchedName] = useState('');
  // Only offer the manager override once the face route has clearly struggled —
  // so it stays out of the way on a normal, instant match.
  const [offerOverride, setOfferOverride] = useState(false);

  // Return a walked-away kiosk to the safe home screen after 15 min idle.
  useIdleTimeout(() => navigate('/kiosk'));

  // Surface the manager override when the camera cannot help (error / nobody
  // enrolled) at once, or after ~10s of scanning without a match.
  useEffect(() => {
    if (status === 'camera-error' || status === 'no-enrolments') {
      setOfferOverride(true);
      return;
    }
    if (status === 'scanning') {
      const t = window.setTimeout(() => setOfferOverride(true), 10000);
      return () => window.clearTimeout(t);
    }
  }, [status]);

  const onMatch = useCallback((enrolmentId: string) => {
    const enrol = getEnrolmentById(enrolmentId);
    const name = enrol?.name ?? 'there';
    registerUser(enrolmentId, name);
    setMatchedName(name);
    setStatus('matched');
    sessionStorage.setItem('kiosk-userId', enrolmentId);
    stopCamera(streamRef.current);
    streamRef.current = null;
    setTimeout(() => navigate('/kiosk/confirm'), 1100);
  }, [navigate]);

  useEffect(() => {
    if (getEnrolmentsForMatch().length === 0) {
      setStatus('no-enrolments');
      return;
    }

    let cancelled = false;
    let timer: number | undefined;

    const tick = async () => {
      if (cancelled || doneRef.current || busyRef.current || !videoRef.current) return;
      busyRef.current = true;
      try {
        const live = await computeDescriptor(videoRef.current);
        if (live && !doneRef.current) {
          const match = findBestMatch(live, getEnrolmentsForMatch());
          if (match) {
            doneRef.current = true;
            onMatch(match.id);
            return;
          }
        }
      } catch {
        // Ignore a single failed frame; the loop will try again.
      } finally {
        busyRef.current = false;
      }
    };

    (async () => {
      try {
        const [stream] = await Promise.all([startCamera(), loadFaceModels()]);
        if (cancelled) {
          stopCamera(stream);
          return;
        }
        streamRef.current = stream;
        if (videoRef.current) {
          videoRef.current.srcObject = stream;
          await videoRef.current.play().catch(() => {});
        }
        setStatus('scanning');
        timer = window.setInterval(tick, 700);
      } catch (err) {
        if (cancelled) return;
        const name = err instanceof Error ? err.name : '';
        setCameraError(
          name === 'NotAllowedError'
            ? 'Camera access was blocked. Allow the camera to clock in by face.'
            : 'No camera is available on this device.',
        );
        setStatus('camera-error');
      }
    })();

    return () => {
      cancelled = true;
      if (timer) window.clearInterval(timer);
      stopCamera(streamRef.current);
      streamRef.current = null;
    };
  }, [onMatch]);

  return (
    <div style={{ minHeight: '100vh', background: 'var(--porcelain)', display: 'flex', flexDirection: 'column' }}>
      <header style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '26px 40px' }}>
        <Logo color="var(--sky)" height={32} />
        <button
          onClick={() => navigate('/kiosk')}
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

      <div style={{ flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: 34, padding: '20px 40px 60px' }}>
        <div style={{ textAlign: 'center', maxWidth: 460 }}>
          <h1 style={{ fontSize: 38, fontWeight: 800, letterSpacing: '-.5px', marginBottom: 10 }}>
            {status === 'matched'
              ? `Hi, ${matchedName.split(' ')[0]}`
              : status === 'no-enrolments'
                ? 'No faces enrolled yet'
                : 'Look at the camera'}
          </h1>
          <p style={{ fontSize: 17, color: 'var(--muted)', fontWeight: 500 }}>
            {status === 'matched'
              ? 'Found you. One moment…'
              : status === 'no-enrolments'
                ? 'Register a face first, then look at the screen to clock in.'
                : status === 'camera-error'
                  ? 'We could not start the camera.'
                  : status === 'starting'
                    ? 'Starting camera…'
                    : 'Face recognition will clock you in automatically. No touch needed.'}
          </p>
        </div>

        {status === 'camera-error' ? (
          <div style={{
            width: 340, padding: '28px 24px', borderRadius: 20,
            background: 'var(--rose-soft)', color: 'var(--rose-deeper)',
            textAlign: 'center', fontSize: 15, fontWeight: 600, lineHeight: 1.5,
          }}>
            {cameraError}
          </div>
        ) : status === 'no-enrolments' ? (
          <div style={{
            width: 260, height: 260, borderRadius: 32,
            background: 'var(--porcelain)', border: '3px dashed var(--line)',
            display: 'flex', alignItems: 'center', justifyContent: 'center', color: 'var(--muted)',
          }}>
            <div style={{ transform: 'scale(3.2)' }}><FaceIcon /></div>
          </div>
        ) : (
          <div style={{
            position: 'relative', width: 260, height: 260, borderRadius: 32,
            overflow: 'hidden', background: 'var(--ink)',
            border: `3px solid ${status === 'matched' ? 'var(--flora-deep)' : 'var(--sky)'}`,
            boxShadow: `0 0 0 8px ${status === 'matched' ? 'var(--flora)' : 'var(--sky-soft)'}`,
            transition: 'border-color 200ms ease, box-shadow 200ms ease',
          }}>
            <video
              ref={videoRef}
              autoPlay
              playsInline
              muted
              style={{ width: '100%', height: '100%', objectFit: 'cover', transform: 'scaleX(-1)' }}
            />
          </div>
        )}

        {status === 'scanning' && (
          <div style={{ color: 'var(--muted)', fontSize: 13, fontWeight: 500 }}>
            Scanning… hold still and face the camera.
          </div>
        )}

        <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 14, marginTop: 6 }}>
          <button
            onClick={() => navigate('/kiosk/enrol')}
            style={{
              background: 'transparent', border: 0, cursor: 'pointer',
              color: 'var(--sky)', fontFamily: 'inherit', fontSize: 15, fontWeight: 600,
              textDecoration: 'underline', textUnderlineOffset: 4,
            }}
          >
            New here? Register your face
          </button>

          {offerOverride && status !== 'matched' && (
            <button
              onClick={() => navigate('/kiosk/override')}
              style={{
                background: 'transparent', border: 0, cursor: 'pointer',
                color: 'var(--muted)', fontFamily: 'inherit', fontSize: 14, fontWeight: 600,
                textDecoration: 'underline', textUnderlineOffset: 4,
              }}
            >
              Face won't scan? Manager sign-in
            </button>
          )}
        </div>
      </div>
    </div>
  );
}
