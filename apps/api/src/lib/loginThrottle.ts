/**
 * In-memory login throttle — slows credential-stuffing / brute force without a
 * new dependency. Keyed by client IP + subdomain + email. Failures accumulate
 * within a rolling window; past the threshold the caller is locked out until the
 * window elapses. A successful login clears the counter.
 *
 * Single-process only (fine for one API node). A multi-node deployment should
 * move this to Redis, but the interface stays the same.
 */

const WINDOW_MS = 15 * 60 * 1000; // 15 minutes
const MAX_FAILURES = 8;

interface Bucket {
  failures: number;
  firstAt: number;
}

const buckets = new Map<string, Bucket>();

function keyFor(ip: string, subdomain: string, email: string): string {
  return `${ip}|${subdomain.toLowerCase()}|${email.toLowerCase()}`;
}

export interface ThrottleState {
  limited: boolean;
  retryAfterSeconds: number;
}

/** Check (without mutating) whether this identity is currently locked out. */
export function checkLogin(ip: string, subdomain: string, email: string): ThrottleState {
  const b = buckets.get(keyFor(ip, subdomain, email));
  if (!b) return { limited: false, retryAfterSeconds: 0 };
  const age = Date.now() - b.firstAt;
  if (age > WINDOW_MS) return { limited: false, retryAfterSeconds: 0 };
  if (b.failures >= MAX_FAILURES) {
    return { limited: true, retryAfterSeconds: Math.ceil((WINDOW_MS - age) / 1000) };
  }
  return { limited: false, retryAfterSeconds: 0 };
}

/** Record a failed attempt; starts a fresh window if the last one expired. */
export function recordFailure(ip: string, subdomain: string, email: string): void {
  const key = keyFor(ip, subdomain, email);
  const b = buckets.get(key);
  const now = Date.now();
  if (!b || now - b.firstAt > WINDOW_MS) {
    buckets.set(key, { failures: 1, firstAt: now });
  } else {
    b.failures += 1;
  }
}

/** Clear the counter after a successful login. */
export function recordSuccess(ip: string, subdomain: string, email: string): void {
  buckets.delete(keyFor(ip, subdomain, email));
}
