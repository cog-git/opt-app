/**
 * HTTP client for the OPT API.
 *
 * Wraps fetch with the bearer token from the stored session, camelCase JSON in
 * and out. The API is single-tenant per JWT: every jobs/users/time/activity
 * call is implicitly scoped to the logged-in tenant. /orgs is the one
 * platform-wide view (lists and creates tenants).
 *
 * The session (token + user + tenant) is persisted in localStorage so a page
 * refresh keeps the operator signed in. A 401 from any authed call clears the
 * session and bounces to /login.
 */

const BASE_URL: string =
  (import.meta.env.VITE_API_URL as string | undefined) ?? 'http://localhost:4000';

const SESSION_KEY = 'opt.session';

// ── API wire types (camelCase, straight off the mappers) ─────────────────────

export type TenantTier = 'clockin' | 'production';
export type TenantStatus = 'active' | 'paused' | 'locked';
export type ApiUserRole = 'owner' | 'admin' | 'officer' | 'staff';
export type ApiJobStatus = 'active' | 'complete';
export type ApiScheduleStatus = 'active' | 'inactive';
export type ApiWeekday = 'mon' | 'tue' | 'wed' | 'thu' | 'fri' | 'sat' | 'sun';

export interface ApiTenant {
  id: string;
  org: string;
  subdomain: string;
  tier: TenantTier;
  status: TenantStatus;
  archivedAt: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface ApiUser {
  id: string;
  tenantId: string;
  email: string;
  displayName: string;
  role: ApiUserRole;
  isPlatformAdmin?: boolean;
  archivedAt: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface ApiClient {
  id: string;
  tenantId: string;
  name: string;
  reference: string | null;
  archivedAt: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface ApiJob {
  id: string;
  tenantId: string;
  clientId: string | null;
  workshopId: string | null;
  jobNumber: string;
  title: string;
  status: ApiJobStatus;
  allocatedMinutes: number;
  archivedAt: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface ApiJobTimeSummary {
  loggedMinutes: number;
  staff: { userId: string; displayName: string; minutes: number }[];
  timeline: { userId: string; day: string; minutes: number }[];
}

export interface ApiWorkshop {
  id: string;
  tenantId: string;
  name: string;
  archivedAt: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface ApiScreen {
  id: string;
  tenantId: string;
  workshopId: string | null;
  name: string;
  deviceToken: string;
  lastSeenAt: string | null;
  archivedAt: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface ApiScheduleDay {
  start: string;
  end: string;
  breakMinutes: number;
}

export interface ApiSchedule {
  id: string;
  tenantId: string;
  name: string;
  status: ApiScheduleStatus;
  days: Partial<Record<ApiWeekday, ApiScheduleDay>>;
  archivedAt: string | null;
  createdAt: string;
  updatedAt: string;
}

export type ApiTaskStatus = 'active' | 'inactive';

export interface ApiTask {
  id: string;
  tenantId: string;
  name: string;
  status: ApiTaskStatus;
  archivedAt: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface ApiTimeEntry {
  id: string;
  tenantId: string;
  userId: string;
  jobId: string | null;
  workshopId: string | null;
  clockIn: string;
  clockOut: string | null;
  manual: boolean;
  createdBy: string | null;
  archivedAt: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface ApiActivityEntry {
  id: string;
  tenantId: string;
  actorId: string | null;
  actorRole: ApiUserRole | null;
  action: string;
  entityType: string | null;
  entityId: string | null;
  detail: unknown;
  createdAt: string;
}

export interface Session {
  token: string;
  user: ApiUser;
  tenant: ApiTenant;
}

// ── Session persistence ──────────────────────────────────────────────────────

let session: Session | null = readStoredSession();

function readStoredSession(): Session | null {
  try {
    const raw = localStorage.getItem(SESSION_KEY) ?? sessionStorage.getItem(SESSION_KEY);
    return raw ? (JSON.parse(raw) as Session) : null;
  } catch {
    return null;
  }
}

export function getSession(): Session | null {
  return session;
}

// remember=true persists across browser restarts (localStorage); false clears
// the session when the browser/tab closes (sessionStorage).
function setSession(next: Session, remember: boolean): void {
  session = next;
  const store = remember ? localStorage : sessionStorage;
  const other = remember ? sessionStorage : localStorage;
  store.setItem(SESSION_KEY, JSON.stringify(next));
  other.removeItem(SESSION_KEY);
}

export function clearSession(): void {
  session = null;
  localStorage.removeItem(SESSION_KEY);
  sessionStorage.removeItem(SESSION_KEY);
}

/** Thrown for any non-2xx response; message is the API's error string. */
export class ApiError extends Error {
  constructor(
    public status: number,
    message: string,
  ) {
    super(message);
    this.name = 'ApiError';
  }
}

// ── Core request helper ──────────────────────────────────────────────────────

async function request<T>(
  method: string,
  path: string,
  body?: unknown,
): Promise<T> {
  const headers: Record<string, string> = { Accept: 'application/json' };
  if (body !== undefined) headers['Content-Type'] = 'application/json';
  if (session) headers.Authorization = `Bearer ${session.token}`;

  const res = await fetch(`${BASE_URL}${path}`, {
    method,
    headers,
    body: body === undefined ? undefined : JSON.stringify(body),
  });

  if (res.status === 401) {
    // Token missing/expired/invalid — drop the session so the shell redirects.
    clearSession();
    throw new ApiError(401, 'Your session has expired. Please sign in again.');
  }

  const text = await res.text();
  const data = text ? JSON.parse(text) : {};
  if (!res.ok) {
    throw new ApiError(res.status, (data as { error?: string }).error ?? res.statusText);
  }
  return data as T;
}

// ── Auth ─────────────────────────────────────────────────────────────────────

export async function login(
  subdomain: string,
  email: string,
  password: string,
  remember = true,
): Promise<Session> {
  const data = await request<{ token: string; user: ApiUser; tenant: ApiTenant }>(
    'POST',
    '/auth/login',
    { subdomain, email, password, remember },
  );
  const next: Session = { token: data.token, user: data.user, tenant: data.tenant };
  setSession(next, remember);
  return next;
}

/** Change the signed-in user's own password (requires their current one). */
export async function changeOwnPassword(
  currentPassword: string,
  newPassword: string,
): Promise<void> {
  await request('POST', '/auth/change-password', { currentPassword, newPassword });
}

// ── Organisations (platform-wide) ────────────────────────────────────────────

export async function listOrgs(includeArchived = false): Promise<ApiTenant[]> {
  const path = includeArchived ? '/orgs?archived=1' : '/orgs';
  return (await request<{ orgs: ApiTenant[] }>('GET', path)).orgs;
}

export async function createOrg(input: {
  org: string;
  subdomain: string;
  tier: TenantTier;
}): Promise<ApiTenant> {
  return (await request<{ org: ApiTenant }>('POST', '/orgs', input)).org;
}

export async function updateOrgTier(id: string, tier: TenantTier): Promise<ApiTenant> {
  return (await request<{ org: ApiTenant }>('PATCH', `/orgs/${id}`, { tier })).org;
}

export async function updateOrgStatus(id: string, status: TenantStatus): Promise<ApiTenant> {
  return (await request<{ org: ApiTenant }>('PATCH', `/orgs/${id}`, { status })).org;
}

export async function deleteOrg(id: string): Promise<ApiTenant> {
  return (await request<{ org: ApiTenant }>('DELETE', `/orgs/${id}`)).org;
}

export async function restoreOrg(id: string): Promise<ApiTenant> {
  return (await request<{ org: ApiTenant }>('POST', `/orgs/${id}/restore`)).org;
}

// ── Users (current tenant) ───────────────────────────────────────────────────

export async function listUsers(includeArchived = false): Promise<ApiUser[]> {
  const q = includeArchived ? '?archived=1' : '';
  return (await request<{ users: ApiUser[] }>('GET', `/users${q}`)).users;
}

export async function createUser(input: {
  email: string;
  displayName: string;
  role: ApiUserRole;
  password: string;
}): Promise<ApiUser> {
  return (await request<{ user: ApiUser }>('POST', '/users', input)).user;
}

export async function updateUser(
  id: string,
  input: { displayName?: string; role?: ApiUserRole; password?: string },
): Promise<ApiUser> {
  return (await request<{ user: ApiUser }>('PATCH', `/users/${id}`, input)).user;
}

export async function archiveUser(id: string): Promise<ApiUser> {
  return (await request<{ user: ApiUser }>('DELETE', `/users/${id}`)).user;
}

export async function restoreUser(id: string): Promise<ApiUser> {
  return (await request<{ user: ApiUser }>('POST', `/users/${id}/restore`)).user;
}

// ── Clients (current tenant) ─────────────────────────────────────────────────

export async function listClients(includeArchived = false): Promise<ApiClient[]> {
  const q = includeArchived ? '?archived=1' : '';
  return (await request<{ clients: ApiClient[] }>('GET', `/clients${q}`)).clients;
}

export async function createClient(input: {
  name: string;
  reference?: string | null;
}): Promise<ApiClient> {
  return (await request<{ client: ApiClient }>('POST', '/clients', input)).client;
}

export async function updateClient(
  id: string,
  input: { name?: string; reference?: string | null },
): Promise<ApiClient> {
  return (await request<{ client: ApiClient }>('PATCH', `/clients/${id}`, input)).client;
}

export async function archiveClient(id: string): Promise<ApiClient> {
  return (await request<{ client: ApiClient }>('DELETE', `/clients/${id}`)).client;
}

export async function restoreClient(id: string): Promise<ApiClient> {
  return (await request<{ client: ApiClient }>('POST', `/clients/${id}/restore`)).client;
}

// ── Jobs (current tenant) ────────────────────────────────────────────────────

export async function listJobs(includeArchived = false): Promise<ApiJob[]> {
  const q = includeArchived ? '?archived=1' : '';
  return (await request<{ jobs: ApiJob[] }>('GET', `/jobs${q}`)).jobs;
}

export async function createJob(input: {
  jobNumber: string;
  title: string;
  clientId?: string | null;
  workshopId?: string | null;
  allocatedMinutes?: number;
}): Promise<ApiJob> {
  return (await request<{ job: ApiJob }>('POST', '/jobs', input)).job;
}

export async function updateJob(
  id: string,
  input: {
    title?: string;
    status?: ApiJobStatus;
    workshopId?: string | null;
    allocatedMinutes?: number;
  },
): Promise<ApiJob> {
  return (await request<{ job: ApiJob }>('PATCH', `/jobs/${id}`, input)).job;
}

export async function getJobTimeSummary(id: string): Promise<ApiJobTimeSummary> {
  return (await request<{ summary: ApiJobTimeSummary }>('GET', `/jobs/${id}/time-summary`)).summary;
}

export async function archiveJob(id: string): Promise<ApiJob> {
  return (await request<{ job: ApiJob }>('DELETE', `/jobs/${id}`)).job;
}

export async function restoreJob(id: string): Promise<ApiJob> {
  return (await request<{ job: ApiJob }>('POST', `/jobs/${id}/restore`)).job;
}

// ── Workshops (current tenant) ───────────────────────────────────────────────

export async function listWorkshops(includeArchived = false): Promise<ApiWorkshop[]> {
  const q = includeArchived ? '?archived=1' : '';
  return (await request<{ workshops: ApiWorkshop[] }>('GET', `/workshops${q}`)).workshops;
}

export async function createWorkshop(input: { name: string }): Promise<ApiWorkshop> {
  return (await request<{ workshop: ApiWorkshop }>('POST', '/workshops', input)).workshop;
}

export async function updateWorkshop(
  id: string,
  input: { name?: string },
): Promise<ApiWorkshop> {
  return (await request<{ workshop: ApiWorkshop }>('PATCH', `/workshops/${id}`, input)).workshop;
}

export async function archiveWorkshop(id: string): Promise<ApiWorkshop> {
  return (await request<{ workshop: ApiWorkshop }>('DELETE', `/workshops/${id}`)).workshop;
}

export async function restoreWorkshop(id: string): Promise<ApiWorkshop> {
  return (await request<{ workshop: ApiWorkshop }>('POST', `/workshops/${id}/restore`)).workshop;
}

// ── Screens / kiosk devices (current tenant) ─────────────────────────────────

export async function listScreens(includeArchived = false): Promise<ApiScreen[]> {
  const q = includeArchived ? '?archived=1' : '';
  return (await request<{ screens: ApiScreen[] }>('GET', `/screens${q}`)).screens;
}

export async function createScreen(input: {
  name: string;
  workshopId?: string | null;
}): Promise<ApiScreen> {
  return (await request<{ screen: ApiScreen }>('POST', '/screens', input)).screen;
}

export async function updateScreen(
  id: string,
  input: { name?: string; workshopId?: string | null },
): Promise<ApiScreen> {
  return (await request<{ screen: ApiScreen }>('PATCH', `/screens/${id}`, input)).screen;
}

export async function archiveScreen(id: string): Promise<ApiScreen> {
  return (await request<{ screen: ApiScreen }>('DELETE', `/screens/${id}`)).screen;
}

export async function restoreScreen(id: string): Promise<ApiScreen> {
  return (await request<{ screen: ApiScreen }>('POST', `/screens/${id}/restore`)).screen;
}

// ── Schedules (current tenant) ───────────────────────────────────────────────

export async function listSchedules(includeArchived = false): Promise<ApiSchedule[]> {
  const q = includeArchived ? '?archived=1' : '';
  return (await request<{ schedules: ApiSchedule[] }>('GET', `/schedules${q}`)).schedules;
}

export async function createSchedule(input: {
  name: string;
  status?: ApiScheduleStatus;
  days: Partial<Record<ApiWeekday, ApiScheduleDay>>;
}): Promise<ApiSchedule> {
  return (await request<{ schedule: ApiSchedule }>('POST', '/schedules', input)).schedule;
}

export async function updateSchedule(
  id: string,
  input: {
    name?: string;
    status?: ApiScheduleStatus;
    days?: Partial<Record<ApiWeekday, ApiScheduleDay>>;
  },
): Promise<ApiSchedule> {
  return (await request<{ schedule: ApiSchedule }>('PATCH', `/schedules/${id}`, input)).schedule;
}

export async function archiveSchedule(id: string): Promise<ApiSchedule> {
  return (await request<{ schedule: ApiSchedule }>('DELETE', `/schedules/${id}`)).schedule;
}

export async function restoreSchedule(id: string): Promise<ApiSchedule> {
  return (await request<{ schedule: ApiSchedule }>('POST', `/schedules/${id}/restore`)).schedule;
}

// ── Tasks (current tenant) ───────────────────────────────────────────────────

export async function listTasks(includeArchived = false): Promise<ApiTask[]> {
  const q = includeArchived ? '?archived=1' : '';
  return (await request<{ tasks: ApiTask[] }>('GET', `/tasks${q}`)).tasks;
}

export async function createTask(input: {
  name: string;
  status?: ApiTaskStatus;
}): Promise<ApiTask> {
  return (await request<{ task: ApiTask }>('POST', '/tasks', input)).task;
}

export async function updateTask(
  id: string,
  input: { name?: string; status?: ApiTaskStatus },
): Promise<ApiTask> {
  return (await request<{ task: ApiTask }>('PATCH', `/tasks/${id}`, input)).task;
}

export async function archiveTask(id: string): Promise<ApiTask> {
  return (await request<{ task: ApiTask }>('DELETE', `/tasks/${id}`)).task;
}

export async function restoreTask(id: string): Promise<ApiTask> {
  return (await request<{ task: ApiTask }>('POST', `/tasks/${id}/restore`)).task;
}

// ── Time entries (current tenant) ────────────────────────────────────────────

export async function listTimeEntries(): Promise<ApiTimeEntry[]> {
  return (await request<{ entries: ApiTimeEntry[] }>('GET', '/time-entries')).entries;
}

export async function createManualEntry(input: {
  userId: string;
  jobId: string | null;
  workshopId: string | null;
  clockIn: string;
  clockOut: string;
}): Promise<ApiTimeEntry> {
  return (await request<{ entry: ApiTimeEntry }>('POST', '/time-entries', input)).entry;
}

export async function updateTimeEntry(
  id: string,
  input: { jobId: string | null; workshopId: string | null; clockIn: string; clockOut: string | null },
): Promise<ApiTimeEntry> {
  return (await request<{ entry: ApiTimeEntry }>('PATCH', `/time-entries/${id}`, input)).entry;
}

export async function archiveTimeEntry(id: string): Promise<ApiTimeEntry> {
  return (await request<{ entry: ApiTimeEntry }>('DELETE', `/time-entries/${id}`)).entry;
}

// ── Activity (current tenant) ────────────────────────────────────────────────

export async function listActivity(): Promise<ApiActivityEntry[]> {
  return (await request<{ activity: ApiActivityEntry[] }>('GET', '/activity')).activity;
}
