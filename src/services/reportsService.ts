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
  Timestamp,
} from 'firebase/firestore';
import { ref, uploadBytes, getDownloadURL } from 'firebase/storage';
import { db, storage } from './firebase';
import { WasteReport, GeoLocation, AIAnalysisResult, UserRole, ReportStatus } from '../types';

export const uploadReportPhoto = async (
  uri: string,
  reportId: string,
): Promise<string> => {
  const response = await fetch(uri);
  const blob = await response.blob();
  const storageRef = ref(storage, `reports/${reportId}/photo.jpg`);
  await uploadBytes(storageRef, blob);
  return await getDownloadURL(storageRef);
};

export const createReport = async (
  userId: string,
  userRole: UserRole,
  userName: string,
  photoUri: string,
  location: GeoLocation,
  notes?: string,
  checkpoint?: string,
): Promise<string> => {
  const docRef = await addDoc(collection(db, 'reports'), {
    userId,
    userRole,
    userName,
    location,
    notes: notes || '',
    checkpoint: checkpoint || null,
    status: 'pending',
    severity: 'moderate',
    createdAt: serverTimestamp(),
    updatedAt: serverTimestamp(),
  });

  const photoURL = await uploadReportPhoto(photoUri, docRef.id);
  await updateDoc(docRef, { photoURL });

  return docRef.id;
};

export const updateReportWithAI = async (
  reportId: string,
  aiAnalysis: AIAnalysisResult,
): Promise<void> => {
  await updateDoc(doc(db, 'reports', reportId), {
    aiAnalysis,
    severity: aiAnalysis.severityLevel,
    status: 'pending',
    updatedAt: serverTimestamp(),
  });
};

export const updateReportStatus = async (
  reportId: string,
  status: ReportStatus,
  assignedTeam?: string,
): Promise<void> => {
  const updates: Record<string, unknown> = {
    status,
    updatedAt: serverTimestamp(),
  };
  if (assignedTeam) updates.assignedTeam = assignedTeam;
  if (status === 'resolved') updates.resolvedAt = serverTimestamp();
  await updateDoc(doc(db, 'reports', reportId), updates);
};

export const getReportById = async (reportId: string): Promise<WasteReport | null> => {
  const snap = await getDoc(doc(db, 'reports', reportId));
  if (!snap.exists()) return null;
  return { id: snap.id, ...snap.data() } as WasteReport;
};

export const getReportsByUser = async (userId: string): Promise<WasteReport[]> => {
  const q = query(
    collection(db, 'reports'),
    where('userId', '==', userId),
    orderBy('createdAt', 'desc'),
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
    where('status', 'in', ['pending', 'in_progress']),
    orderBy('createdAt', 'desc'),
  );
  const snap = await getDocs(q);
  return snap.docs.map((d) => ({ id: d.id, ...d.data() } as WasteReport));
};

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
    const reports = snap.docs.map((d) => ({ id: d.id, ...d.data() } as WasteReport));
    callback(reports);
  });
};
