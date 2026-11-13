import { beforeEach, describe, expect, it, vi } from 'vitest';

// ─── Phone and backend stand-ins ─────────────────────────────────────────────
const store = new Map<string, string>();
const firestoreDocs = new Map<string, Record<string, unknown>>();
let refuseMissingReads = true; // how the rules deployed before this fix behave

vi.mock('@react-native-async-storage/async-storage', () => ({
  default: {
    getItem: async (k: string) => store.get(k) ?? null,
    setItem: async (k: string, v: string) => { store.set(k, v); },
  },
}));
vi.mock('expo-file-system', () => {
  class File {
    uri: string; exists = true; modificationTime = Date.now();
    constructor(...parts: unknown[]) { this.uri = parts.map((p) => (typeof p === 'string' ? p : (p as { uri: string }).uri)).join('/'); }
    async copy() {} delete() {}
  }
  class Directory { uri: string; exists = true; constructor(...p: unknown[]) { this.uri = p.map(String).join('/'); } create() {} list() { return []; } }
  return { File, Directory, Paths: { document: 'docs' } };
});
vi.mock('../firebase', () => ({ db: {} }));
vi.mock('../cloudinaryService', () => ({ uploadToCloudinary: async (_u: string, folder: string) => `https://img/${folder}/photo.jpg` }));
vi.mock('../reportSubmission', () => ({ analyzeAndSaveReport: vi.fn(async () => ({})) }));
vi.mock('firebase/firestore', () => {
  let n = 0;
  const doc = (_db: unknown, coll?: string, id?: string) => ({ path: `${coll ?? 'reports'}/${id ?? `auto${++n}`}`, id: id ?? `auto${n}` });
  return {
    doc,
    collection: (_db: unknown, name: string) => name,
    getDoc: async (ref: { path: string }) => {
      const data = firestoreDocs.get(ref.path);
      if (!data && refuseMissingReads) throw Object.assign(new Error('Missing or insufficient permissions.'), { code: 'permission-denied' });
      return { exists: () => !!data, data: () => data };
    },
    setDoc: async (ref: { path: string }, data: Record<string, unknown>) => { firestoreDocs.set(ref.path, data); },
    updateDoc: async () => {},
    serverTimestamp: () => 'now',
    arrayUnion: (...a: unknown[]) => a,
    GeoPoint: class { constructor(public latitude: number, public longitude: number) {} },
  };
});

const fetchMock = vi.fn(async () => ({ status: 204, ok: true }));
vi.stubGlobal('fetch', fetchMock);
vi.stubGlobal('__DEV__', false);

import { dueForRetry, enqueueReport, loadQueue, queuedItems, syncOfflineReports } from '../offlineQueue';

const queueReport = () => enqueueReport({
  userId: 'ct', userRole: 'citizen', userName: 'Juan Dela Cruz', photoUri: 'cache/cam.jpg',
  location: { latitude: 10.35, longitude: 123.91, address: 'Talamban', barangay: 'Talamban', barangayId: 'talamban' },
  notes: 'Clogged drain', waterContext: 'drainage' as never,
});

beforeEach(async () => {
  store.clear(); firestoreDocs.clear(); refuseMissingReads = true;
  fetchMock.mockImplementation(async () => ({ status: 204, ok: true }));
  await loadQueue();
});

describe('reports saved without a connection', () => {
  it('upload once the connection returns, even where the rules refuse reading a report that does not exist yet', async () => {
    const entry = await queueReport();
    expect(await syncOfflineReports('ct')).toBe(1);
    const saved = firestoreDocs.get(`reports/${entry.id}`);
    expect(saved).toMatchObject({ userId: 'ct', status: 'pending', barangayId: 'talamban', photoURL: `https://img/reports/${entry.id}/photo.jpg` });
    expect(queuedItems()).toHaveLength(0);
  });

  it('upload with the updated rules too', async () => {
    refuseMissingReads = false;
    const entry = await queueReport();
    expect(await syncOfflineReports('ct')).toBe(1);
    expect(firestoreDocs.has(`reports/${entry.id}`)).toBe(true);
  });

  it('stay on the phone while there is still no internet', async () => {
    fetchMock.mockImplementation(async () => { throw new Error('Network request failed'); });
    await queueReport();
    expect(await syncOfflineReports('ct')).toBe(0);
    expect(queuedItems()).toHaveLength(1);
  });

  it('are not uploaded twice when a retry follows an upload that already went through', async () => {
    const entry = await queueReport();
    firestoreDocs.set(`reports/${entry.id}`, { reportNumber: 'RPT-JUAN-2026-111111', userId: 'ct' });
    expect(await syncOfflineReports('ct')).toBe(1);
    expect(firestoreDocs.get(`reports/${entry.id}`)).toEqual({ reportNumber: 'RPT-JUAN-2026-111111', userId: 'ct' });
  });
});

describe('retrying', () => {
  const now = Date.parse('2026-11-13T08:00:00Z');
  it('tries every sync for the first 8 failures', () => {
    expect(dueForRetry({ attempts: 7, lastTriedAt: new Date(now - 1000).toISOString() }, now)).toBe(true);
  });
  it('then slows down to every 5 minutes instead of giving up', () => {
    expect(dueForRetry({ attempts: 8, lastTriedAt: new Date(now - 60_000).toISOString() }, now)).toBe(false);
    expect(dueForRetry({ attempts: 30, lastTriedAt: new Date(now - 5 * 60_000).toISOString() }, now)).toBe(true);
  });
  it('picks up reports that an older version of the app had stopped retrying', () => {
    expect(dueForRetry({ attempts: 8 }, now)).toBe(true);
  });
});
