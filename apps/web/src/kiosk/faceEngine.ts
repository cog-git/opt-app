/**
 * On-device face recognition engine.
 *
 * Wraps @vladmandic/face-api (TensorFlow.js). Everything runs in the browser:
 * the camera stream never leaves the device, and we only ever keep the 128-number
 * descriptor (the maths vector), never a photo. That is what the GDPR consent on
 * the enrol screen promises.
 *
 * Models are served from `${BASE_URL}models/` and cached by the service worker.
 */

import * as faceapi from '@vladmandic/face-api';

/** Distance below which two descriptors are treated as the same person. */
export const MATCH_THRESHOLD = 0.5;

const MODEL_URL = `${import.meta.env.BASE_URL}models`;

let loadPromise: Promise<void> | null = null;

/** Load the detector, landmark and recognition models once. Idempotent. */
export function loadFaceModels(): Promise<void> {
  if (!loadPromise) {
    loadPromise = (async () => {
      await faceapi.nets.tinyFaceDetector.loadFromUri(MODEL_URL);
      await faceapi.nets.faceLandmark68Net.loadFromUri(MODEL_URL);
      await faceapi.nets.faceRecognitionNet.loadFromUri(MODEL_URL);
    })().catch((err) => {
      // Reset so a later attempt can retry after a transient failure.
      loadPromise = null;
      throw err;
    });
  }
  return loadPromise;
}

const detectorOptions = new faceapi.TinyFaceDetectorOptions({
  inputSize: 320,
  scoreThreshold: 0.5,
});

/**
 * Compute a single face descriptor from a video (or image) element. Returns null
 * when no single clear face is visible so callers can prompt the user to retry.
 */
export async function computeDescriptor(
  source: HTMLVideoElement | HTMLImageElement | HTMLCanvasElement,
): Promise<Float32Array | null> {
  const result = await faceapi
    .detectSingleFace(source, detectorOptions)
    .withFaceLandmarks()
    .withFaceDescriptor();
  return result?.descriptor ?? null;
}

/** Euclidean distance between two descriptors. Lower means more similar. */
export function descriptorDistance(a: Float32Array, b: Float32Array): number {
  return faceapi.euclideanDistance(a, b);
}

export interface MatchResult {
  id: string;
  distance: number;
}

/**
 * Find the closest enrolled person to a live descriptor. Each enrolled person may
 * have several descriptors (captured from different angles); we score against the
 * best of them. Returns null when nobody is within the threshold.
 */
export function findBestMatch(
  live: Float32Array,
  enrolled: { id: string; descriptors: Float32Array[] }[],
): MatchResult | null {
  let best: MatchResult | null = null;
  for (const person of enrolled) {
    for (const d of person.descriptors) {
      const distance = descriptorDistance(live, d);
      if (best === null || distance < best.distance) {
        best = { id: person.id, distance };
      }
    }
  }
  if (best && best.distance <= MATCH_THRESHOLD) return best;
  return null;
}

/**
 * Ask for the camera and return the stream. Throws on denial or no device so the
 * UI can fall back gracefully.
 */
export async function startCamera(): Promise<MediaStream> {
  return navigator.mediaDevices.getUserMedia({
    video: { facingMode: 'user', width: { ideal: 640 }, height: { ideal: 480 } },
    audio: false,
  });
}

/** Stop every track on a stream. Safe to call with null. */
export function stopCamera(stream: MediaStream | null): void {
  stream?.getTracks().forEach((t) => t.stop());
}
