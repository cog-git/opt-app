/**
 * useIdleTimeout — fire a callback after N minutes of no user activity.
 *
 * Listens for pointerdown / keydown / touchstart / mousemove and resets a timer
 * on any of them (mousemove is debounced so it doesn't thrash the timer). When
 * the timeout elapses with no activity, the callback runs once. Listeners and
 * timers are cleaned up on unmount.
 *
 * Used by the kiosk sub-flow to return a walked-away session to the safe home
 * screen after ~15 minutes idle.
 */

import { useEffect, useRef } from 'react';

const ACTIVITY_EVENTS: (keyof WindowEventMap)[] = [
  'pointerdown',
  'keydown',
  'touchstart',
  'mousemove',
];

export function useIdleTimeout(onIdle: () => void, minutes = 15): void {
  // Keep the latest callback without re-subscribing listeners each render.
  const onIdleRef = useRef(onIdle);
  onIdleRef.current = onIdle;

  useEffect(() => {
    const timeoutMs = minutes * 60_000;
    let idleTimer: ReturnType<typeof setTimeout>;
    // Coalesce high-frequency mousemove into at most one reset per second.
    let lastReset = 0;

    function resetTimer() {
      clearTimeout(idleTimer);
      idleTimer = setTimeout(() => onIdleRef.current(), timeoutMs);
    }

    function onActivity() {
      const nowTs = Date.now();
      if (nowTs - lastReset < 1000) return; // debounce
      lastReset = nowTs;
      resetTimer();
    }

    for (const evt of ACTIVITY_EVENTS) {
      window.addEventListener(evt, onActivity, { passive: true });
    }
    resetTimer(); // arm on mount

    return () => {
      clearTimeout(idleTimer);
      for (const evt of ACTIVITY_EVENTS) {
        window.removeEventListener(evt, onActivity);
      }
    };
  }, [minutes]);
}
