import {
  addDoc,
  collection,
  doc,
  getDoc,
  getDocs,
  increment,
  onSnapshot,
  orderBy,
  query,
  serverTimestamp,
  updateDoc,
  where,
} from 'firebase/firestore';
import { Barangay } from '../types';
import { db } from './firebase';

const COL = 'barangays';

export const createBarangay = async (
  data: Omit<Barangay, 'id' | 'createdAt' | 'updatedAt' | 'activeReports' | 'resolvedReports' | 'totalReports'>,
): Promise<string> => {
  const ref = await addDoc(collection(db, COL), {
    ...data,
    activeReports: 0,
    resolvedReports: 0,
    totalReports: 0,
    createdAt: serverTimestamp(),
    updatedAt: serverTimestamp(),
  });
  return ref.id;
};

export const getBarangayById = async (barangayId: string): Promise<Barangay | null> => {
  const snap = await getDoc(doc(db, COL, barangayId));
  if (!snap.exists()) return null;
  return { id: snap.id, ...snap.data() } as Barangay;
};

export const getAllBarangays = async (): Promise<Barangay[]> => {
  const q = query(collection(db, COL), where('isActive', '==', true), orderBy('name', 'asc'));
  const snap = await getDocs(q);
  return snap.docs.map((d) => ({ id: d.id, ...d.data() } as Barangay));
};

export const updateBarangay = async (
  barangayId: string,
  updates: Partial<Omit<Barangay, 'id' | 'createdAt'>>,
): Promise<void> => {
  await updateDoc(doc(db, COL, barangayId), {
    ...updates,
    updatedAt: serverTimestamp(),
  });
};

export const incrementBarangayReportCount = async (
  barangayId: string,
  resolved = false,
): Promise<void> => {
  await updateDoc(doc(db, COL, barangayId), {
    totalReports: increment(1),
    activeReports: resolved ? increment(0) : increment(1),
    resolvedReports: resolved ? increment(1) : increment(0),
    updatedAt: serverTimestamp(),
  });
};

export const decrementActiveReportCount = async (barangayId: string): Promise<void> => {
  await updateDoc(doc(db, COL, barangayId), {
    activeReports: increment(-1),
    resolvedReports: increment(1),
    updatedAt: serverTimestamp(),
  });
};

export const subscribeToBarangays = (callback: (barangays: Barangay[]) => void) => {
  const q = query(collection(db, COL), where('isActive', '==', true), orderBy('name', 'asc'));
  return onSnapshot(q, (snap) => {
    callback(snap.docs.map((d) => ({ id: d.id, ...d.data() } as Barangay)));
  });
};
