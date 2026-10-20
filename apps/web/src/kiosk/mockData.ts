/** Mock users and jobs — purely local, no backend. */

export type UserRole = 'staff' | 'manager';

export interface MockUser {
  id: string;
  name: string;
  firstName: string;
  initials: string;
  pin: string;
  /** Managers can authorise a face-recognition override at the kiosk. */
  role: UserRole;
  /** Whether the user started their shift today. Mutated in-memory by the store. */
  clockedIn: boolean;
  /** ISO timestamp of when they clocked in today, if clockedIn */
  clockedInAt: string | null;
  /** Current job id they're working on, or null */
  currentJobId: string | null;
}

export interface MockJob {
  id: string;
  title: string;
  ref: string;
}

export const MOCK_USERS: MockUser[] = [
  {
    id: 'user-sm',
    name: 'Sarah Mitchell',
    firstName: 'Sarah',
    initials: 'SM',
    pin: '1234',
    role: 'manager',
    clockedIn: true,
    clockedInAt: new Date(Date.now() - 6 * 60 * 60 * 1000).toISOString(),
    currentJobId: 'job-frame',
  },
  {
    id: 'user-lk',
    name: 'Liam Kelly',
    firstName: 'Liam',
    initials: 'LK',
    pin: '2222',
    role: 'staff',
    clockedIn: true,
    clockedInAt: new Date(Date.now() - 5 * 60 * 60 * 1000).toISOString(),
    currentJobId: 'job-unload',
  },
  {
    id: 'user-ps',
    name: 'Priya Sharma',
    firstName: 'Priya',
    initials: 'PS',
    pin: '3333',
    role: 'manager',
    clockedIn: false,
    clockedInAt: null,
    currentJobId: null,
  },
  {
    id: 'user-tb',
    name: 'Tom Barker',
    firstName: 'Tom',
    initials: 'TB',
    pin: '4444',
    role: 'staff',
    clockedIn: false,
    clockedInAt: null,
    currentJobId: null,
  },
  {
    id: 'user-jw',
    name: 'Jasmine Wong',
    firstName: 'Jasmine',
    initials: 'JW',
    pin: '5678',
    role: 'staff',
    clockedIn: false,
    clockedInAt: null,
    currentJobId: null,
  },
];

export const MOCK_JOBS: MockJob[] = [
  { id: 'job-frame', title: 'Frame Assembly', ref: '#1042' },
  { id: 'job-weld', title: 'Welding, Bay 2', ref: '#1047' },
  { id: 'job-paint', title: 'Paint Prep', ref: '#1051' },
  { id: 'job-unload', title: 'Unloading Lorry', ref: '' },
  { id: 'job-house', title: 'Housekeeping', ref: '' },
  { id: 'job-other', title: 'Other', ref: '' },
];
