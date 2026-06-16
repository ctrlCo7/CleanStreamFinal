import {
  collection,
  addDoc,
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
import { ref, uploadBytes, getDownloadURL } from 'firebase/storage';
import { db, storage } from './firebase';
import {
  WasteReport,
  GeoLocation,
  AIAnalysisResult,
  UserRole,
  ReportStatus,
  StatusHistoryEntry,
  SeverityLevel,
} from '../types';

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

const localUriToBlob = (uri: string): Promise<Blob> =>
  new Promise((resolve, reject) => {
    const xhr = new XMLHttpRequest();
    xhr.onload = () => resolve(xhr.response as Blob);
    xhr.onerror = () => reject(new Error('Failed to read local file'));
    xhr.responseType = 'blob';
    xhr.open('GET', uri, true);
    xhr.send(null);
  });

export const uploadReportPhoto = async (uri: string, reportId: string): Promise<string> => {
  const blob = await localUriToBlob(uri);
  const storageRef = ref(storage, `reports/${reportId}/photo.jpg`);
  await uploadBytes(storageRef, blob);
  return getDownloadURL(storageRef);
};

export const uploadReportThumbnail = async (uri: string, reportId: string): Promise<string> => {
  const blob = await localUriToBlob(uri);
  const storageRef = ref(storage, `reports/${reportId}/thumbnail.jpg`);
  await uploadBytes(storageRef, blob);
  return getDownloadURL(storageRef);
};

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
): Promise<{ reportId: string; reportNumber: string }> => {
  const reportNumber = generateReportNumber(userName);
  const initialStatus: ReportStatus = 'pending';

  const firstEntry: Omit<StatusHistoryEntry, 'changedAt'> = {
    status: initialStatus,
    changedBy: userId,
    changedByName: userName,
  };

  // ── CRITICAL: create the Firestore document ───────────────────────────────
  console.log('[Report] Creating Firestore document...');
  const docRef = await addDoc(collection(db, 'reports'), {
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
    createdAt: serverTimestamp(),
    updatedAt: serverTimestamp(),
  });
  console.log('[Report] Firestore document created:', docRef.id);

  // ── NON-CRITICAL: upload photo to Storage ─────────────────────────────────
  try {
    console.log('[Report] Uploading photo to Firebase Storage...');
    const photoURL = await uploadReportPhoto(photoUri, docRef.id);
    await updateDoc(docRef, { photoURL });
    console.log('[Report] Photo uploaded successfully:', photoURL);
  } catch (uploadErr) {
    console.error('[Report] Photo upload failed (non-fatal):', uploadErr);
    // Store the local URI as a fallback so the rest of the app can still display
    await updateDoc(docRef, { photoURL: photoUri }).catch((e) =>
      console.warn('[Report] Could not set fallback photoURL:', e),
    );
  }

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
) =>
  updateReportStatus(reportId, 'verified', barangayUserId, barangayUserName, {
    verifiedBy: barangayUserId,
    verifiedByName: barangayUserName,
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
  return { id: snap.id, ...snap.data() } as WasteReport;
};

export const getReportsByUser = async (userId: string): Promise<WasteReport[]> => {
  try {
    const q = query(
      collection(db, 'reports'),
      where('userId', '==', userId),
      orderBy('createdAt', 'desc'),
    );
    const snap = await getDocs(q);
    return snap.docs.map((d) => ({ id: d.id, ...d.data() } as WasteReport));
  } catch {
    // Composite index may not exist yet — fall back to unordered query and sort client-side
    console.warn('[Reports] Ordered query failed, using unordered fallback');
    const q = query(collection(db, 'reports'), where('userId', '==', userId));
    const snap = await getDocs(q);
    const docs = snap.docs.map((d) => ({ id: d.id, ...d.data() } as WasteReport));
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
  return snap.docs.map((d) => ({ id: d.id, ...d.data() } as WasteReport));
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
  return snap.docs.map((d) => ({ id: d.id, ...d.data() } as WasteReport));
};

export const getAllReports = async (limitCount = 50): Promise<WasteReport[]> => {
  const q = query(
    collection(db, 'reports'),
    orderBy('createdAt', 'desc'),
    limit(limitCount),
  );
  const snap = await getDocs(q);
  return snap.docs.map((d) => ({ id: d.id, ...d.data() } as WasteReport));
};

export const getCriticalReports = async (): Promise<WasteReport[]> => {
  const q = query(
    collection(db, 'reports'),
    where('severity', 'in', ['critical', 'high']),
    where('status', 'in', ['pending', 'verified', 'in_progress']),
    orderBy('createdAt', 'desc'),
  );
  const snap = await getDocs(q);
  return snap.docs.map((d) => ({ id: d.id, ...d.data() } as WasteReport));
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
  return snap.docs.map((d) => ({ id: d.id, ...d.data() } as WasteReport));
};

export const getReportsBySeverity = async (severity: SeverityLevel): Promise<WasteReport[]> => {
  const q = query(
    collection(db, 'reports'),
    where('severity', '==', severity),
    orderBy('createdAt', 'desc'),
    limit(50),
  );
  const snap = await getDocs(q);
  return snap.docs.map((d) => ({ id: d.id, ...d.data() } as WasteReport));
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
    callback(snap.docs.map((d) => ({ id: d.id, ...d.data() } as WasteReport)));
  });
};

export const subscribeToBarangayReports = (
  barangayId: string,
  callback: (reports: WasteReport[]) => void,
) => {
  const q = query(
    collection(db, 'reports'),
    where('barangayId', '==', barangayId),
    orderBy('createdAt', 'desc'),
    limit(50),
  );
  return onSnapshot(q, (snap) => {
    callback(snap.docs.map((d) => ({ id: d.id, ...d.data() } as WasteReport)));
  });
};

export const subscribeToCriticalReports = (callback: (reports: WasteReport[]) => void) => {
  const q = query(
    collection(db, 'reports'),
    where('severity', 'in', ['critical', 'high']),
    where('status', 'in', ['pending', 'verified', 'assigned', 'in_progress']),
    orderBy('createdAt', 'desc'),
  );
  return onSnapshot(q, (snap) => {
    callback(snap.docs.map((d) => ({ id: d.id, ...d.data() } as WasteReport)));
  });
};
