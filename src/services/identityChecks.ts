/**
 * Platform-free checks for the identity step of Admin / Barangay Official sign-up: is this
 * a usable ID photo, did each selfie challenge actually happen, does the name on the ID
 * match. Kept free of React Native imports so it can be tested in Node.
 *
 * These checks guide the applicant (retake a blurry photo) and give the reviewer hints.
 * They are NOT a security boundary: a modified app could lie about them. The Super Admin
 * looks at the actual photos and decides.
 */
import { IdType, SelfieStep } from '../types';

export const ID_TYPES: Array<{ id: IdType; label: string }> = [
  { id: 'philsys', label: 'PhilSys National ID' },
  { id: 'umid', label: 'UMID' },
  { id: 'passport', label: 'Passport' },
  { id: 'drivers_license', label: "Driver's License" },
  { id: 'prc', label: 'PRC ID' },
  { id: 'postal', label: 'Postal ID' },
  { id: 'voters', label: "Voter's ID" },
  { id: 'sss', label: 'SSS ID' },
  { id: 'gsis', label: 'GSIS ID' },
  { id: 'govt_employee', label: 'Government employee ID' },
  { id: 'other_govt', label: 'Other government-issued ID' },
];

export const idTypeLabel = (id: IdType): string => ID_TYPES.find((t) => t.id === id)?.label ?? id;

/** One detected face, normalised from whatever the detector returned. */
export interface FaceReading {
  /** Face area as a share of the whole image (0..1). */
  areaRatio: number;
  /** Head turn left/right in degrees (sign depends on camera mirroring, so use the magnitude). */
  yaw: number;
  smile: number | null;
  eyesOpen: number | null;
}

export interface StepResult { ok: boolean; message: string }

// ─── Thresholds ──────────────────────────────────────────────────────────────

export const SELFIE_MIN_FACE_AREA = 0.05;
export const SELFIE_MAX_FACE_AREA = 0.9;
export const NEUTRAL_MAX_YAW = 15;
export const SMILE_MIN_PROBABILITY = 0.7;
export const SMILE_MAX_YAW = 20;
export const TURN_MIN_YAW = 18;
export const TURN_MAX_YAW = 65;
export const EYES_OPEN_MIN = 0.4;
// An ID portrait is a small part of the card photo.
export const ID_MIN_FACE_AREA = 0.002;
export const ID_MAX_FACE_AREA = 0.4;
export const ID_MIN_TEXT_CHARS = 25;

export const SELFIE_PROMPTS: Record<SelfieStep, { title: string; instruction: string }> = {
  neutral: { title: 'Look straight at the camera', instruction: 'Face the camera, eyes open, in good light. Remove sunglasses, caps and masks.' },
  smile: { title: 'Now smile', instruction: 'Give a clear smile while looking at the camera.' },
  turn: { title: 'Turn your head to the side', instruction: 'Slowly turn your head left or right, about a quarter turn, then take the photo.' },
};

// ─── Selfie challenge ────────────────────────────────────────────────────────

export function evaluateSelfie(step: SelfieStep, faces: FaceReading[]): StepResult {
  if (faces.length === 0) return { ok: false, message: "We couldn't see a face. Face the camera in good light and try again." };
  if (faces.length > 1) return { ok: false, message: 'Only you should be in the photo. Try again.' };
  const f = faces[0];
  if (f.areaRatio < SELFIE_MIN_FACE_AREA) return { ok: false, message: 'Your face is too small. Move closer so it fills more of the photo.' };
  if (f.areaRatio > SELFIE_MAX_FACE_AREA) return { ok: false, message: 'Too close. Move the camera back a little so your whole face is visible.' };
  const yaw = Math.abs(f.yaw);

  switch (step) {
    case 'neutral':
      if (f.eyesOpen !== null && f.eyesOpen < EYES_OPEN_MIN) return { ok: false, message: 'Keep your eyes open and look at the camera.' };
      if (yaw > NEUTRAL_MAX_YAW) return { ok: false, message: 'Look straight at the camera, not to the side.' };
      return { ok: true, message: 'Looks good.' };
    case 'smile':
      if (f.smile === null) return { ok: false, message: "We couldn't read your expression. Try again in better light." };
      if (f.smile < SMILE_MIN_PROBABILITY) return { ok: false, message: 'We need a clear smile. Smile wider and try again.' };
      if (yaw > SMILE_MAX_YAW) return { ok: false, message: 'Face the camera while you smile.' };
      return { ok: true, message: 'Nice smile.' };
    case 'turn':
      if (yaw < TURN_MIN_YAW) return { ok: false, message: 'Turn your head further to the side, then take the photo.' };
      if (yaw > TURN_MAX_YAW) return { ok: false, message: "You've turned too far. Turn about a quarter turn and keep your face visible." };
      return { ok: true, message: 'Good turn.' };
  }
}

// ─── ID photo ────────────────────────────────────────────────────────────────

export interface IdPhotoResult {
  faceOnId: boolean;
  textReadable: boolean;
  /** Why the photo can't be used, or null if it can. */
  problem: string | null;
}

const wordCount = (text: string): number => text.split(/\s+/).filter((w) => w.length >= 2).length;

export const looksLikeIdText = (text: string): boolean =>
  text.replace(/\s+/g, '').length >= ID_MIN_TEXT_CHARS && wordCount(text) >= 4;

export function evaluateIdPhoto(faces: FaceReading[], text: string): IdPhotoResult {
  const usable = faces.filter((f) => f.areaRatio >= ID_MIN_FACE_AREA && f.areaRatio <= ID_MAX_FACE_AREA);
  const faceOnId = usable.length > 0;
  const textReadable = looksLikeIdText(text);
  let problem: string | null = null;
  if (!faceOnId) {
    problem = faces.length === 0
      ? "We couldn't find your photo on the ID. Lay the ID flat in good light and fill the frame with the card."
      : 'The photo on the ID is too small or too large in the picture. Fill the frame with the card.';
  }
  return { faceOnId, textReadable, problem };
}

// ─── Name on the ID ──────────────────────────────────────────────────────────

const normalise = (s: string): string =>
  s.normalize('NFD').replace(/[̀-ͯ]/g, '').toUpperCase().replace(/[^A-Z]+/g, ' ').trim();

const editDistance = (a: string, b: string): number => {
  if (a === b) return 0;
  if (Math.abs(a.length - b.length) > 1) return 2;
  let prev = Array.from({ length: b.length + 1 }, (_, j) => j);
  for (let i = 1; i <= a.length; i++) {
    const cur = [i];
    for (let j = 1; j <= b.length; j++) {
      cur[j] = Math.min(prev[j] + 1, cur[j - 1] + 1, prev[j - 1] + (a[i - 1] === b[j - 1] ? 0 : 1));
    }
    prev = cur;
  }
  return prev[b.length];
};

/**
 * True if every part of `name` (ignoring tiny words like "de") appears in the ID text.
 * One OCR slip is tolerated in longer words. Returns null when there is nothing to compare.
 */
export function nameOnId(text: string, name: string): boolean | null {
  const parts = normalise(name).split(' ').filter((p) => p.length >= 3);
  if (parts.length === 0) return null;
  const tokens = normalise(text).split(' ').filter(Boolean);
  if (tokens.length === 0) return false;
  return parts.every((p) => tokens.some((t) => t === p || (p.length >= 5 && editDistance(t, p) <= 1)));
}

// ─── Image size limits (a Firestore document is at most 1 MiB) ───────────────

export const ID_IMAGE_MAX_SIDE = 1280;
export const SELFIE_MAX_SIDE = 640;
/** Limits on the base64 string length, chosen so all four images plus metadata stay under 1 MiB. */
export const ID_IMAGE_MAX_CHARS = 340_000;
export const SELFIE_MAX_CHARS = 150_000;
