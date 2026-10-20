/**
 * Offline-first event store for OPT kiosk.
 *
 * Every clock event is written to IndexedDB FIRST, then marked synced when
 * navigator.onLine is true. Events carry a UUID so server-side upsert is
 * idempotent (no double-logging if retried). The queue survives reload.
 *
 * DB name: opt-kiosk  |  object store: events
 */

import { openDB, type IDBPDatabase } from 'idb';
import { MOCK_USERS, MOCK_JOBS } from './mockData';
import type { MockUser, MockJob } from './mockData';
import * as api from '../api';

// ── Event types ─────────────────────────────────────────────────────────────

export type EventKind =
  | 'clock-in'
  | 'clock-out'
  | 'job-on'
  | 'job-off'
  | 'manager-override';

export interface ClockEvent {
  id: string;           // crypto.randomUUID()
  kind: EventKind;
  userId: string;
  jobId: string | null; // null for clock-in / clock-out
  timestamp: string;    // ISO-8601
  synced: boolean;      // false until sent to server (simulated here)
  /** Manager id who authorised this action (manager-override only). */
  overrideBy?: string;
  /** Reason a manager gave for the override (manager-override only). */
  reason?: string;
}

// ── DB schema ────────────────────────────────────────────────────────────────

interface OptDB {
  events: ClockEvent;
}

const DB_NAME = 'opt-kiosk';
const DB_VERSION = 1;

let _db: IDBPDatabase<OptDB> | null = null;

async function getDB(): Promise<IDBPDatabase<OptDB>> {
  if (_db) return _db;
  _db = await openDB<OptDB>(DB_NAME, DB_VERSION, {
    upgrade(db) {
      const store = db.createObjectStore('events', { keyPath: 'id' });
      store.createIndex('synced', 'synced');
    },
  });
  return _db;
}

// ── In-memory user state (mutations persist only for the session) ─────────────
// We keep a mutable copy so UI reads are synchronous.

const users: MockUser[] = MOCK_USERS.map((u) => ({ ...u }));

// Jobs default to the offline mock list, but are replaced with the live jobs
// from the API when the kiosk is opened alongside a signed-in admin session (see
// loadJobs). That way a job created in the admin console shows up on the kiosk.
let jobs: MockJob[] = [...MOCK_JOBS];

export function getUsers(): readonly MockUser[] {
  return users;
}

export function getJobs(): readonly MockJob[] {
  return jobs;
}

/**
 * Refresh the kiosk job list from the live API. Only runs when there's a
 * signed-in session (the demo opens the kiosk from the admin console, so the
 * token is present); with no session it keeps the offline mock jobs. Any error
 * (offline, expired token) falls back to whatever list we already hold.
 */
export async function loadJobs(): Promise<readonly MockJob[]> {
  if (!api.getSession()) return jobs;
  try {
    const live = (await api.listJobs(false))
      .filter((j) => j.status === 'active')
      .map((j) => ({ id: j.id, title: j.title, ref: j.jobNumber ? `#${j.jobNumber}` : '' }));
    jobs = live;
  } catch {
    // keep the current list
  }
  return jobs;
}

// Non-job activities (House Keeping, Training, etc.) created in the admin
// console. Workers can clock onto one the same way as a job. Empty until a
// signed-in session loads them; offline kiosks simply show no tasks.
let tasks: MockJob[] = [];

export function getTasks(): readonly MockJob[] {
  return tasks;
}

/**
 * Refresh the kiosk task list from the live API, mirroring loadJobs. Only runs
 * with a signed-in session; falls back to whatever list we already hold on any
 * error (offline, expired token).
 */
export async function loadTasks(): Promise<readonly MockJob[]> {
  if (!api.getSession()) return tasks;
  try {
    tasks = (await api.listTasks(false))
      .filter((t) => t.status === 'active')
      .map((t) => ({ id: t.id, title: t.name, ref: '' }));
  } catch {
    // keep the current list
  }
  return tasks;
}

/**
 * Clock-only mode: a `clockin`-tier tenant runs the kiosk as a simple clock
 * in/out terminal with no job picking. Production tenants get the full job flow.
 * Defaults to the full flow when there's no session (offline kiosk).
 */
export function isClockOnly(): boolean {
  return api.getSession()?.tenant.tier === 'clockin';
}

function findUser(id: string): MockUser | undefined {
  return users.find((u) => u.id === id);
}

export function getUserByPin(pin: string): MockUser | undefined {
  return users.find((u) => u.pin === pin);
}

/** A manager who can authorise a kiosk override, looked up by their PIN. */
export function getManagerByPin(pin: string): MockUser | undefined {
  return users.find((u) => u.role === 'manager' && u.pin === pin);
}

function deriveInitials(name: string): string {
  const parts = name.trim().split(/\s+/).filter(Boolean);
  const letters = parts.slice(0, 2).map((p) => p[0]?.toUpperCase() ?? '');
  return letters.join('') || '?';
}

/**
 * Ensure a kiosk user exists for a face-enrolled person. Idempotent by id, so a
 * face matched after a reload (when the in-memory list has reset) re-registers
 * the person from their stored enrolment. Returns the live user record.
 */
export function registerUser(id: string, name: string): MockUser {
  const existing = findUser(id);
  if (existing) return existing;
  const firstName = name.trim().split(/\s+/)[0] ?? name.trim();
  const user: MockUser = {
    id,
    name: name.trim(),
    firstName,
    initials: deriveInitials(name),
    pin: '',
    role: 'staff',
    clockedIn: false,
    clockedInAt: null,
    currentJobId: null,
  };
  users.push(user);
  return user;
}

// ── Event helpers ─────────────────────────────────────────────────────────────

function makeEvent(kind: EventKind, userId: string, jobId: string | null = null): ClockEvent {
  return {
    id: crypto.randomUUID(),
    kind,
    userId,
    jobId,
    timestamp: new Date().toISOString(),
    synced: false,
  };
}

async function persist(evt: ClockEvent): Promise<void> {
  const db = await getDB();
  await db.put('events', evt);
}

export async function getAllEvents(): Promise<ClockEvent[]> {
  const db = await getDB();
  return db.getAll('events');
}

export async function getQueueLength(): Promise<number> {
  const db = await getDB();
  const all = await db.getAll('events');
  return all.filter((e) => !e.synced).length;
}

/**
 * Simulate sync: when online mark all un-synced events as synced after a
 * short delay. Since there's no backend, this is a demo stub.
 */
export async function simulateSync(): Promise<number> {
  const db = await getDB();
  const all = await db.getAll('events');
  const unsynced = all.filter((e) => !e.synced);
  if (unsynced.length === 0) return 0;

  await new Promise<void>((r) => setTimeout(r, 800)); // fake network latency

  for (const evt of unsynced) {
    await db.put('events', { ...evt, synced: true });
  }
  return unsynced.length;
}

// ── Domain actions ────────────────────────────────────────────────────────────

/** Clock a user in for the day. Returns the event. */
export async function clockIn(userId: string): Promise<ClockEvent> {
  const user = findUser(userId);
  if (!user) throw new Error(`Unknown user ${userId}`);

  const evt = makeEvent('clock-in', userId);
  await persist(evt);

  user.clockedIn = true;
  user.clockedInAt = evt.timestamp;

  return evt;
}

/** Clock a user out for the day (also ends any active job). Returns events. */
export async function clockOut(userId: string): Promise<ClockEvent[]> {
  const user = findUser(userId);
  if (!user) throw new Error(`Unknown user ${userId}`);

  const events: ClockEvent[] = [];

  if (user.currentJobId) {
    const jobOff = makeEvent('job-off', userId, user.currentJobId);
    await persist(jobOff);
    events.push(jobOff);
    user.currentJobId = null;
  }

  const evt = makeEvent('clock-out', userId);
  await persist(evt);
  events.push(evt);

  user.clockedIn = false;
  user.clockedInAt = null;

  return events;
}

/**
 * Assign a user to a job. If already on a job, emits job-off first.
 * Returns the new job-on event.
 */
export async function assignJob(userId: string, jobId: string): Promise<ClockEvent> {
  const user = findUser(userId);
  if (!user) throw new Error(`Unknown user ${userId}`);

  if (user.currentJobId && user.currentJobId !== jobId) {
    const off = makeEvent('job-off', userId, user.currentJobId);
    await persist(off);
  }

  const evt = makeEvent('job-on', userId, jobId);
  await persist(evt);
  user.currentJobId = jobId;

  return evt;
}

/**
 * Record that a manager authorised a clock action for a staff member whose face
 * would not scan. This is an attestation, not a login: it names the manager, the
 * staff member, the time and the reason, and is written to the same offline queue
 * that syncs to the server, so every override leaves an audit trail. It does NOT
 * clock the person in on its own — the confirm screen still does that — so the
 * override and the resulting clock event are logged separately.
 */
export async function logManagerOverride(
  managerId: string,
  staffId: string,
  reason: string,
): Promise<ClockEvent> {
  const evt: ClockEvent = {
    id: crypto.randomUUID(),
    kind: 'manager-override',
    userId: staffId,
    jobId: null,
    timestamp: new Date().toISOString(),
    synced: false,
    overrideBy: managerId,
    reason: reason.trim() || 'Not given',
  };
  await persist(evt);
  return evt;
}

/** End the current job without clocking out of the day. */
export async function endJob(userId: string): Promise<ClockEvent | null> {
  const user = findUser(userId);
  if (!user || !user.currentJobId) return null;

  const evt = makeEvent('job-off', userId, user.currentJobId);
  await persist(evt);
  user.currentJobId = null;

  return evt;
}
