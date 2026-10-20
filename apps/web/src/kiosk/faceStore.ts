/**
 * Local, persistent store of enrolled face templates for this kiosk.
 *
 * We keep only the 128-number descriptors (never a photo), in localStorage, so
 * enrolment survives reloads and the demo works end to end with no backend. When
 * the platform goes full-stack these move to the encrypted per-tenant
 * face_templates table already defined in migration 002.
 */

const STORAGE_KEY = 'opt-face-enrolments';

export interface FaceEnrolment {
  id: string;
  name: string;
  /** One descriptor per captured pose. Stored as plain arrays for JSON. */
  descriptors: number[][];
  enrolledAt: string;
}

function readAll(): FaceEnrolment[] {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

function writeAll(list: FaceEnrolment[]): void {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(list));
}

export function getEnrolments(): FaceEnrolment[] {
  return readAll();
}

/** Enrolments shaped for the matcher: descriptors as Float32Array. */
export function getEnrolmentsForMatch(): { id: string; name: string; descriptors: Float32Array[] }[] {
  return readAll().map((e) => ({
    id: e.id,
    name: e.name,
    descriptors: e.descriptors.map((d) => Float32Array.from(d)),
  }));
}

export function getEnrolmentById(id: string): FaceEnrolment | undefined {
  return readAll().find((e) => e.id === id);
}

export function addEnrolment(name: string, descriptors: Float32Array[]): FaceEnrolment {
  const list = readAll();
  const entry: FaceEnrolment = {
    id: `face-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 7)}`,
    name: name.trim(),
    descriptors: descriptors.map((d) => Array.from(d)),
    enrolledAt: new Date().toISOString(),
  };
  list.push(entry);
  writeAll(list);
  return entry;
}

export function removeEnrolment(id: string): void {
  writeAll(readAll().filter((e) => e.id !== id));
}
