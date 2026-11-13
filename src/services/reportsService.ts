import {
  collection,
  setDoc,
  updateDoc,
  doc,
  getDocs,
  getDoc,
  query,
  where,
  orderBy,
  limit,
  onSnapshot,
  serverTimestamp,
  arrayUnion,
  GeoPoint,
} from 'firebase/firestore';
import { db } from './firebase';
import { withTimeout } from '../utils/async';
import { uploadToCloudinary } from './cloudinaryService';
import { NearbyCandidate, ProximityResult, findProximity, isApproximateAddress } from './reportProximity';
import { reportSeverity } from '../utils/mapUtils';
import { queuePhotoRetry } from './photoRetry';
import {
  WasteReport,
  ConcernType,
  GeoLocation,
  AIAnalysisResult,
  UserRole,
  ReportStatus,
  StatusHistoryEntry,
  SeverityLevel,
  AIWasteType,
} from '../types';

// ─── Firestore document normalization ────────────────────────────────────────

// createdAt/updatedAt/verifiedAt/assignedAt/resolvedAt are written with
// serverTimestamp() and come back from Firestore as Timestamp objects, not
// the ISO strings WasteReport declares -- new Date(timestampObject) produces
// "Invalid Date" wherever a screen renders them. Converting every Timestamp
// field to a real ISO string here, once, means every reader (ReportDetail,
// History, Map, Home) just gets a plain string like the type promises.
const TIMESTAMP_FIELDS = ['createdAt', 'updatedAt', 'verifiedAt', 'assignedAt', 'resolvedAt'] as const;

const toISOIfTimestamp = (value: unknown): unknown => {
  if (value && typeof value === 'object' && 'toDate' in value && typeof (value as { toDate: unknown }).toDate === 'function') {
    return (value as { toDate: () => Date }).toDate().toISOString();
  }
  return value;
};

const normalizeReport = (id: string, data: Record<string, unknown>): WasteReport => {
  const normalized: Record<string, unknown> = { ...data };
  for (const field of TIMESTAMP_FIELDS) {
    if (field in normalized) normalized[field] = toISOIfTimestamp(normalized[field]);
  }
  // One clean severity for every screen (map pins, dashboard counts, alerts): "High",
  // a missing value, or only an AI score all become a proper level.
  normalized.severity = reportSeverity(normalized as Parameters<typeof reportSeverity>[0]);
  return { id, ...normalized } as WasteReport;
};

// ─── Report number generation ─────────────────────────────────────────────────

const generateReportNumber = (userName: string): string => {
  const year = new Date().getFullYear();
  const random = Math.floor(100000 + Math.random() * 900000);
  // First name only, alpha chars, uppercase, max 10 chars
  const namePart = (userName.split(' ')[0] ?? 'USER')
    .replace(/[^a-zA-Z]/g, '')
    .toUpperCase()
    .slice(0, 10);
  return `RPT-${namePart}-${year}-${random}`;
};

// ─── Storage helpers ──────────────────────────────────────────────────────────

export const uploadReportPhoto = async (uri: string, reportId: string): Promise<string> =>
  uploadToCloudinary(uri, `reports/${reportId}`, 'photo.jpg');

export const uploadReportThumbnail = async (uri: string, reportId: string): Promise<string> =>
  uploadToCloudinary(uri, `reports/${reportId}`, 'thumbnail.jpg');

// ─── Create ───────────────────────────────────────────────────────────────────

export const createReport = async (
  userId: string,
  userRole: UserRole,
  userName: string,
  photoUri: string,
  location: GeoLocation,
  notes?: string,
  checkpoint?: string,
  barangayId?: string,
  barangay?: string,
  // From the offline queue: a fixed ID (so a retry can never create a second report)
  // and the time the photo was really taken.
  opts?: {
    reportId?: string; capturedAt?: string; concernType?: ConcernType; incidentDate?: string; fromCheckpointId?: string;
    /** Already uploaded (offline queue): saved with the report, no background upload. */
    photoURL?: string;
  },
): Promise<{ reportId: string; reportNumber: string }> => {
  if (opts?.reportId) {
    // A retry of an upload that already went through must not make a second report. When the
    // report doesn't exist yet, rules deployed before the `resource == null` read rule refuse
    // this read (they check the report's owner, and there is no report): that also means "not
    // created yet", so carry on and create it. Before, that refusal failed every offline upload.
    const existing = await getDoc(doc(db, 'reports', opts.reportId)).catch((e: { code?: string }) => {
      if (e?.code === 'permission-denied') return null;
      throw e;
    });
    if (existing?.exists()) {
      return { reportId: opts.reportId, reportNumber: String(existing.data().reportNumber ?? opts.reportId) };
    }
  }
  const reportNumber = generateReportNumber(userName);
  const initialStatus: ReportStatus = 'pending';

  const firstEntry: Omit<StatusHistoryEntry, 'changedAt'> = {
    status: initialStatus,
    changedBy: userId,
    changedByName: userName,
  };

  // ── CRITICAL: create the Firestore document ───────────────────────────────
  if (__DEV__) console.log('[Report] Creating Firestore document...');
  // Client-generated ID + setDoc (instead of addDoc) so a stalled server ack
  // can't block us from knowing the report's ID.
  const docRef = opts?.reportId ? doc(db, 'reports', opts.reportId) : doc(collection(db, 'reports'));
  const writePromise = setDoc(docRef, {
    reportNumber,
    userId,
    userRole,
    userName,
    barangayId: barangayId ?? null,
    barangay: barangay ?? null,
    location: {
      ...location,
      geoPoint: new GeoPoint(location.latitude, location.longitude),
    },
    notes: notes ?? '',
    checkpoint: checkpoint ?? null,
    status: initialStatus,
    severity: 'moderate',
    wasteTypes: [],
    statusHistory: [{ ...firstEntry, changedAt: new Date().toISOString() }],
    ...(opts?.capturedAt ? { capturedAt: opts.capturedAt } : {}),
    ...(opts?.concernType ? { concernType: opts.concernType } : {}),
    ...(opts?.incidentDate ? { incidentDate: opts.incidentDate } : {}),
    ...(opts?.fromCheckpointId ? { fromCheckpointId: opts.fromCheckpointId } : {}),
    ...(opts?.photoURL ? { photoURL: opts.photoURL } : {}),
    createdAt: serverTimestamp(),
    updatedAt: serverTimestamp(),
  });
  try {
    // Firestore only resolves once the server acks; offline or on a flaky
    // connection that can take forever. The write stays queued and syncs when
    // the connection returns, so after a grace period just carry on.
    await withTimeout(writePromise, 15000, 'Report write');
    if (__DEV__) console.log('[Report] Firestore document created:', docRef.id);
  } catch (e) {
    if (!(e instanceof Error) || !e.message.includes('timed out')) throw e;
    console.warn('[Report] Server ack slow, continuing with queued write:', docRef.id);
    writePromise.catch((err) => console.error('[Report] Queued write ultimately failed:', err));
  }

  // The offline queue uploads the photo first and passes its URL: nothing more to do.
  if (opts?.photoURL) return { reportId: docRef.id, reportNumber };

  // ── NON-CRITICAL: upload photo (runs in the background so AI analysis and
  // navigation don't wait on the network round trip) ─────────────────────────
  uploadReportPhoto(photoUri, docRef.id)
    .then(async (photoURL) => {
      await updateDoc(docRef, { photoURL });
      if (__DEV__) console.log('[Report] Photo uploaded successfully:', photoURL);
    })
    .catch(async (uploadErr) => {
      console.error('[Report] Photo upload failed, keeping it to retry:', uploadErr);
      // Never point the report at a file on this phone (no one else could see it, and it
      // can be cleared): keep a safe copy, upload it again on the next sync, and mark the
      // report so officials see "photo uploading".
      await queuePhotoRetry(docRef.id, photoUri).catch((e) => console.error('[Report] Could not keep the photo for retry:', e));
      await updateDoc(docRef, { photoPending: true }).catch((e) =>
        console.warn('[Report] Could not mark the photo as pending:', e),
      );
    });

  return { reportId: docRef.id, reportNumber };
};

// ─── Update with AI ───────────────────────────────────────────────────────────

export const updateReportWithAI = async (
  reportId: string,
  aiAnalysis: AIAnalysisResult,
): Promise<void> => {
  await updateDoc(doc(db, 'reports', reportId), {
    aiAnalysis,
    severity: aiAnalysis.severityLevel,
    wasteTypes: aiAnalysis.wasteTypes.map((w) => w.type),
    updatedAt: serverTimestamp(),
  });
};

// ─── Status workflow ──────────────────────────────────────────────────────────

export const updateReportStatus = async (
  reportId: string,
  status: ReportStatus,
  changedByUserId: string,
  changedByName: string,
  options?: {
    assignedTeamId?: string;
    assignedTeamName?: string;
    assignedBarangayId?: string;
    cleanupTaskId?: string;
    verifiedBy?: string;
    verifiedByName?: string;
    rejectionReason?: string;
    note?: string;
    groundTruthSeverity?: SeverityLevel;
    groundTruthWasteType?: AIWasteType;
  },
): Promise<void> => {
  const historyEntry: StatusHistoryEntry = {
    status,
    changedBy: changedByUserId,
    changedByName,
    changedAt: new Date().toISOString(),
    note: options?.note,
  };

  const updates: Record<string, unknown> = {
    status,
    updatedAt: serverTimestamp(),
    statusHistory: arrayUnion(historyEntry),
  };

  if (options?.assignedTeamId) updates.assignedTeamId = options.assignedTeamId;
  if (options?.assignedTeamName) updates.assignedTeamName = options.assignedTeamName;
  if (options?.assignedBarangayId) updates.assignedBarangayId = options.assignedBarangayId;
  if (options?.cleanupTaskId) updates.cleanupTaskId = options.cleanupTaskId;
  if (options?.rejectionReason) updates.rejectionReason = options.rejectionReason;
  if (options?.groundTruthSeverity) updates.groundTruthSeverity = options.groundTruthSeverity;
  if (options?.groundTruthWasteType) updates.groundTruthWasteType = options.groundTruthWasteType;

  if (status === 'verified') {
    updates.verifiedBy = options?.verifiedBy ?? changedByUserId;
    updates.verifiedByName = options?.verifiedByName ?? changedByName;
    updates.verifiedAt = serverTimestamp();
  }
  if (status === 'assigned') updates.assignedAt = serverTimestamp();
  if (status === 'completed') updates.resolvedAt = serverTimestamp();

  await updateDoc(doc(db, 'reports', reportId), updates);
};

export const verifyReport = (
  reportId: string,
  barangayUserId: string,
  barangayUserName: string,
  groundTruth?: { severity?: SeverityLevel; wasteType?: AIWasteType },
) =>
  updateReportStatus(reportId, 'verified', barangayUserId, barangayUserName, {
    verifiedBy: barangayUserId,
    verifiedByName: barangayUserName,
    groundTruthSeverity: groundTruth?.severity,
    groundTruthWasteType: groundTruth?.wasteType,
  });

export const assignReport = (
  reportId: string,
  assignerUserId: string,
  assignerName: string,
  teamId: string,
  teamName: string,
  cleanupTaskId?: string,
) =>
  updateReportStatus(reportId, 'assigned', assignerUserId, assignerName, {
    assignedTeamId: teamId,
    assignedTeamName: teamName,
    cleanupTaskId,
  });

export const completeReport = (
  reportId: string,
  completedByUserId: string,
  completedByName: string,
  note?: string,
) =>
  updateReportStatus(reportId, 'completed', completedByUserId, completedByName, { note });

export const rejectReport = (
  reportId: string,
  rejectedByUserId: string,
  rejectedByName: string,
  reason: string,
) =>
  updateReportStatus(reportId, 'rejected', rejectedByUserId, rejectedByName, {
    rejectionReason: reason,
  });

// ─── Read ─────────────────────────────────────────────────────────────────────

export const getReportById = async (reportId: string): Promise<WasteReport | null> => {
  const snap = await getDoc(doc(db, 'reports', reportId));
  if (!snap.exists()) return null;
  return normalizeReport(snap.id, snap.data());
};

export const getReportsByUser = async (userId: string): Promise<WasteReport[]> => {
  try {
    const q = query(
      collection(db, 'reports'),
      where('userId', '==', userId),
      orderBy('createdAt', 'desc'),
    );
    const snap = await getDocs(q);
    return snap.docs.map((d) => (normalizeReport(d.id, d.data())));
  } catch {
    // Composite index may not exist yet — fall back to unordered query and sort client-side
    console.warn('[Reports] Ordered query failed, using unordered fallback');
    const q = query(collection(db, 'reports'), where('userId', '==', userId));
    const snap = await getDocs(q);
    const docs = snap.docs.map((d) => (normalizeReport(d.id, d.data())));
    return docs.sort((a, b) => {
      const ta = typeof a.createdAt === 'string' ? new Date(a.createdAt).getTime()
               : (a.createdAt as { seconds?: number })?.seconds ?? 0;
      const tb = typeof b.createdAt === 'string' ? new Date(b.createdAt).getTime()
               : (b.createdAt as { seconds?: number })?.seconds ?? 0;
      return tb - ta;
    });
  }
};

export const getReportsByBarangay = async (
  barangayId: string,
  limitCount = 50,
): Promise<WasteReport[]> => {
  const q = query(
    collection(db, 'reports'),
    where('barangayId', '==', barangayId),
    orderBy('createdAt', 'desc'),
    limit(limitCount),
  );
  const snap = await getDocs(q);
  return snap.docs.map((d) => (normalizeReport(d.id, d.data())));
};

export const getReportsByStatus = async (
  status: ReportStatus,
  limitCount = 50,
): Promise<WasteReport[]> => {
  const q = query(
    collection(db, 'reports'),
    where('status', '==', status),
    orderBy('createdAt', 'desc'),
    limit(limitCount),
  );
  const snap = await getDocs(q);
  return snap.docs.map((d) => (normalizeReport(d.id, d.data())));
};

export const getAllReports = async (limitCount = 50): Promise<WasteReport[]> => {
  const q = query(
    collection(db, 'reports'),
    orderBy('createdAt', 'desc'),
    limit(limitCount),
  );
  const snap = await getDocs(q);
  return snap.docs.map((d) => (normalizeReport(d.id, d.data())));
};

export const getCriticalReports = async (): Promise<WasteReport[]> => {
  const q = query(
    collection(db, 'reports'),
    where('severity', 'in', ['critical', 'high']),
    where('status', 'in', ['pending', 'verified', 'in_progress']),
    orderBy('createdAt', 'desc'),
  );
  const snap = await getDocs(q);
  return snap.docs.map((d) => (normalizeReport(d.id, d.data())));
};

export const getPendingVerificationReports = async (
  barangayId: string,
): Promise<WasteReport[]> => {
  const q = query(
    collection(db, 'reports'),
    where('barangayId', '==', barangayId),
    where('status', '==', 'pending'),
    orderBy('createdAt', 'desc'),
  );
  const snap = await getDocs(q);
  return snap.docs.map((d) => (normalizeReport(d.id, d.data())));
};

export const getReportsBySeverity = async (severity: SeverityLevel): Promise<WasteReport[]> => {
  const q = query(
    collection(db, 'reports'),
    where('severity', '==', severity),
    orderBy('createdAt', 'desc'),
    limit(50),
  );
  const snap = await getDocs(q);
  return snap.docs.map((d) => (normalizeReport(d.id, d.data())));
};

// ─── Real-time subscriptions ──────────────────────────────────────────────────

export const subscribeToReports = (
  callback: (reports: WasteReport[]) => void,
  userId?: string,
) => {
  const q = userId
    ? query(
        collection(db, 'reports'),
        where('userId', '==', userId),
        orderBy('createdAt', 'desc'),
      )
    : query(collection(db, 'reports'), orderBy('createdAt', 'desc'), limit(50));

  return onSnapshot(q, (snap) => {
    callback(snap.docs.map((d) => (normalizeReport(d.id, d.data()))));
  });
};

export const subscribeToBarangayReports = (
  barangayId: string,
  callback: (reports: WasteReport[]) => void,
  onError?: (e: Error) => void,
) => {
  const q = query(
    collection(db, 'reports'),
    where('barangayId', '==', barangayId),
    orderBy('createdAt', 'desc'),
    limit(50),
  );
  return onSnapshot(
    q,
    (snap) => {
      callback(snap.docs.map((d) => (normalizeReport(d.id, d.data()))));
    },
    // Without this a failed query (no connection, rules, missing index) would leave the map
    // stuck on "Loading map data…" with nothing to show.
    (e) => {
      console.warn('[Reports] Barangay reports query failed:', e);
      callback([]);
      onError?.(e);
    },
  );
};

/**
 * Report statuses that still belong on the map. A report leaves the map once its cleanup is
 * confirmed by an official (confirmTaskCompleted sets it to 'completed').
 */
export const ON_MAP_STATUSES: ReportStatus[] = ['pending', 'verified', 'assigned', 'in_progress', 'rejected', 'cancelled'];

/**
 * The map's reports: a barangay's reports that haven't been cleaned up yet, live. When a
 * cleanup is confirmed the report drops out of this query and its pin disappears by itself.
 * Uses the barangayId + status + createdAt index; if that index isn't deployed yet, falls
 * back to the plain barangay query and leaves out completed reports on the phone.
 */
export const subscribeToMapReports = (
  barangayId: string,
  callback: (reports: WasteReport[]) => void,
  /** Called when even the fallback query fails, with the reason (shown on the map). */
  onError?: (e: Error) => void,
) => {
  let fallbackUnsub: (() => void) | null = null;
  const q = query(
    collection(db, 'reports'),
    where('barangayId', '==', barangayId),
    where('status', 'in', ON_MAP_STATUSES),
    orderBy('createdAt', 'desc'),
    limit(100),
  );
  const unsub = onSnapshot(
    q,
    (snap) => callback(snap.docs.map((d) => normalizeReport(d.id, d.data()))),
    (e) => {
      console.warn('[Reports] Map query failed, using the plain barangay query:', e);
      fallbackUnsub = subscribeToBarangayReports(barangayId, (reports) =>
        callback(reports.filter((r) => r.status !== 'completed')), onError);
    },
  );
  return () => { unsub(); fallbackUnsub?.(); };
};

/**
 * The signed-in person's own reports, live, whatever barangay they were saved under (older
 * reports may have none). A plain filter with no ordering, so it needs no extra index.
 */
export const subscribeToMyReports = (
  userId: string,
  callback: (reports: WasteReport[]) => void,
  onError?: (e: Error) => void,
) => onSnapshot(
  query(collection(db, 'reports'), where('userId', '==', userId), limit(100)),
  (snap) => callback(snap.docs.map((d) => normalizeReport(d.id, d.data()))),
  (e) => { console.warn('[Reports] Own reports query failed:', e); callback([]); onError?.(e); },
);

export const subscribeToCriticalReports = (callback: (reports: WasteReport[]) => void) => {
  const q = query(
    collection(db, 'reports'),
    where('severity', 'in', ['critical', 'high']),
    where('status', 'in', ['pending', 'verified', 'assigned', 'in_progress']),
    orderBy('createdAt', 'desc'),
  );
  return onSnapshot(q, (snap) => {
    callback(snap.docs.map((d) => (normalizeReport(d.id, d.data()))));
  });
};

// ─── Reporter's own waste-type answer ─────────────────────────────────────────

export const setCitizenWasteType = async (reportId: string, wasteType: AIWasteType): Promise<void> => {
  await updateDoc(doc(db, 'reports', reportId), {
    citizenWasteType: wasteType,
    updatedAt: serverTimestamp(),
  });
};

// ─── Duplicates and hotspots ─────────────────────────────────────────────────

/**
 * Looks for other reports near a new one (same barangay) and saves what it finds on
 * the new report: `duplicateOf` when an open report of the same spot was filed in the
 * last 24 hours, and `nearbyReportCount` for hotspot tracking. Non-critical: callers
 * ignore failures. Only the reporter's own new report is written, which the rules allow.
 */
export const checkNearbyReports = async (
  reportId: string,
  location: GeoLocation,
  barangayId?: string,
): Promise<ProximityResult> => {
  const here = { latitude: location.latitude, longitude: location.longitude, approximate: isApproximateAddress(location.address) };
  if (!barangayId || here.approximate) return { nearbyCount: 1, isHotspot: false };

  const snap = await getDocs(query(collection(db, 'reports'), where('barangayId', '==', barangayId)));
  const candidates: NearbyCandidate[] = [];
  snap.forEach((d) => {
    const r = normalizeReport(d.id, d.data());
    const lat = r.location?.latitude;
    const lng = r.location?.longitude;
    const created = r.createdAt ? new Date(r.createdAt) : null;
    if (typeof lat !== 'number' || typeof lng !== 'number' || !created || Number.isNaN(created.getTime())) return;
    candidates.push({
      id: r.id, reportNumber: r.reportNumber, latitude: lat, longitude: lng, createdAt: created, status: r.status,
      approximate: isApproximateAddress(r.location?.address),
    });
  });

  const result = findProximity(here, candidates, reportId);
  await updateDoc(doc(db, 'reports', reportId), {
    nearbyReportCount: result.nearbyCount,
    ...(result.duplicateOf
      ? { duplicateOf: result.duplicateOf.id, duplicateOfNumber: result.duplicateOf.reportNumber, duplicateDistanceM: result.duplicateOf.distanceM }
      : {}),
  });
  return result;
};

/** A report ID made on the phone without a network call, so an offline report keeps one ID for good. */
export const newReportId = (): string => doc(collection(db, 'reports')).id;
