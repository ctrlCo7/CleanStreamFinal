/**
 * Offline reporting. When the phone has no connection, a waste report is kept on the
 * phone (details in AsyncStorage, photo copied into the app's permanent documents
 * folder) and uploaded later by syncOfflineReports, which runs when the app opens,
 * comes back to the foreground, and every couple of minutes while it's open.
 *
 * Each queued report gets its Firestore ID up front, and createReport skips creating a
 * document that already exists, so a retry after a half-finished upload can never
 * produce a second copy of the same report.
 */
import AsyncStorage from '@react-native-async-storage/async-storage';
import { Directory, File, Paths } from 'expo-file-system';
import { ConcernType, GeoLocation, UserRole, WaterContext } from '../types';
import { createReport, newReportId } from './reportsService';
import { analyzeAndSaveReport } from './reportSubmission';

const STORAGE_KEY = 'cleanstream_offline_reports_v1';
const PHOTO_DIR = 'offline-reports';
// Give up on an entry after this many failed uploads; it stays visible so it can be retried by hand.
const MAX_AUTO_ATTEMPTS = 8;

export interface QueuedReport {
  id: string;
  userId: string;
  userRole: UserRole;
  userName: string;
  photoUri: string;
  location: GeoLocation;
  notes: string;
  waterContext: WaterContext;
  concernType?: ConcernType;
  incidentDate?: string;
  capturedAt: string;
  attempts: number;
  lastError?: string;
}

// ─── Small observable store for the UI ───────────────────────────────────────

export interface QueueState { items: QueuedReport[]; syncing: boolean }
let state: QueueState = { items: [], syncing: false };
const listeners = new Set<(s: QueueState) => void>();
const emit = (patch: Partial<QueueState>) => {
  state = { ...state, ...patch };
  listeners.forEach((l) => l(state));
};
export const subscribeQueue = (fn: (s: QueueState) => void) => {
  listeners.add(fn);
  fn(state);
  return () => { listeners.delete(fn); };
};

const read = async (): Promise<QueuedReport[]> => {
  try {
    const raw = await AsyncStorage.getItem(STORAGE_KEY);
    const list = raw ? (JSON.parse(raw) as QueuedReport[]) : [];
    return Array.isArray(list) ? list : [];
  } catch {
    return [];
  }
};
const write = async (items: QueuedReport[]) => {
  await AsyncStorage.setItem(STORAGE_KEY, JSON.stringify(items));
  emit({ items });
};

export const loadQueue = async () => emit({ items: await read() });

// ─── Connectivity ────────────────────────────────────────────────────────────

/** True when the internet is actually reachable (not just Wi-Fi connected to nothing). */
export async function isOnline(timeoutMs = 4000): Promise<boolean> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const res = await fetch('https://www.gstatic.com/generate_204', { method: 'GET', signal: controller.signal, cache: 'no-store' });
    return res.status === 204 || res.ok;
  } catch {
    return false;
  } finally {
    clearTimeout(timer);
  }
}

// ─── Queueing ────────────────────────────────────────────────────────────────

export async function enqueueReport(input: Omit<QueuedReport, 'id' | 'photoUri' | 'attempts' | 'capturedAt'> & { photoUri: string }): Promise<QueuedReport> {
  const id = newReportId();
  // The camera's cache folder can be cleared by the system; the documents folder can't.
  const dir = new Directory(Paths.document, PHOTO_DIR);
  dir.create({ intermediates: true, idempotent: true });
  const dest = new File(dir, `${id}.jpg`);
  await new File(input.photoUri).copy(dest);

  const entry: QueuedReport = { ...input, id, photoUri: dest.uri, attempts: 0, capturedAt: new Date().toISOString() };
  await write([...(await read()), entry]);
  return entry;
}

export async function discardQueued(id: string): Promise<void> {
  const items = await read();
  const entry = items.find((i) => i.id === id);
  if (entry) deletePhoto(entry.photoUri);
  await write(items.filter((i) => i.id !== id));
}

const deletePhoto = (uri: string) => {
  try {
    const f = new File(uri);
    if (f.exists) f.delete();
  } catch (e) {
    console.warn('[Offline] Could not delete queued photo:', e);
  }
};

// ─── Uploading ───────────────────────────────────────────────────────────────

let running: Promise<number> | null = null;

/**
 * Uploads queued reports that belong to the signed-in user. Returns how many went up.
 * `force` retries entries that already hit the automatic attempt limit.
 */
export function syncOfflineReports(userId: string, force = false): Promise<number> {
  if (running) return running;
  running = (async () => {
    const queued = (await read()).filter((i) => i.userId === userId && (force || i.attempts < MAX_AUTO_ATTEMPTS));
    if (queued.length === 0 || !(await isOnline())) return 0;
    emit({ syncing: true });
    let sent = 0;
    for (const item of queued) {
      try {
        const { reportId, reportNumber } = await createReport(
          item.userId, item.userRole, item.userName, item.photoUri, item.location, item.notes,
          undefined, item.location.barangayId, item.location.barangay,
          { reportId: item.id, capturedAt: item.capturedAt, concernType: item.concernType, incidentDate: item.incidentDate },
        );
        // The photo must stay until createReport's background upload has read it, so it is
        // removed on a later sync (cleanupOrphanPhotos), not here.
        await write((await read()).filter((i) => i.id !== item.id));
        sent++;
        await analyzeAndSaveReport({
          reportId, reportNumber, userId: item.userId, location: item.location,
          photoUri: item.photoUri, waterContext: item.waterContext,
        });
      } catch (e) {
        console.warn('[Offline] Upload failed, will retry:', e);
        const items = await read();
        await write(items.map((i) => i.id === item.id
          ? { ...i, attempts: i.attempts + 1, lastError: e instanceof Error ? e.message : String(e) }
          : i));
      }
    }
    cleanupOrphanPhotos().catch(() => undefined);
    return sent;
  })().finally(() => {
    running = null;
    emit({ syncing: false });
  });
  return running;
}

/** Deletes saved photos whose report has been uploaded, once they're a day old. */
async function cleanupOrphanPhotos(): Promise<void> {
  const dir = new Directory(Paths.document, PHOTO_DIR);
  if (!dir.exists) return;
  const keep = new Set((await read()).map((i) => i.photoUri));
  const dayAgo = Date.now() - 86400_000;
  for (const entry of dir.list()) {
    if (!(entry instanceof File) || keep.has(entry.uri)) continue;
    const modified = entry.modificationTime ?? 0;
    if (modified && modified < dayAgo) {
      try { entry.delete(); } catch { /* best effort */ }
    }
  }
}
