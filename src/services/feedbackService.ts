import {
  collection,
  doc,
  addDoc,
  getDoc,
  getDocs,
  updateDoc,
  query,
  where,
  orderBy,
  serverTimestamp,
  limit,
} from 'firebase/firestore';
import { ref, uploadBytes, getDownloadURL } from 'firebase/storage';
import { db, storage } from './firebase';
import { Feedback, FeedbackType, FeedbackStatus, UserRole } from '../types';

const COL = 'feedback';

export const submitFeedback = async (
  data: Omit<Feedback, 'id' | 'createdAt' | 'updatedAt' | 'status' | 'adminResponse' | 'screenshotURLs'>,
): Promise<string> => {
  const ref = await addDoc(collection(db, COL), {
    ...data,
    status: 'open' as FeedbackStatus,
    adminResponse: null,
    screenshotURLs: [],
    createdAt: serverTimestamp(),
    updatedAt: serverTimestamp(),
  });
  return ref.id;
};

export const getFeedbackById = async (id: string): Promise<Feedback | null> => {
  const snap = await getDoc(doc(db, COL, id));
  if (!snap.exists()) return null;
  return { id: snap.id, ...snap.data() } as Feedback;
};

export const getFeedbackByUser = async (userId: string): Promise<Feedback[]> => {
  const q = query(
    collection(db, COL),
    where('userId', '==', userId),
    orderBy('createdAt', 'desc'),
  );
  const snap = await getDocs(q);
  return snap.docs.map((d) => ({ id: d.id, ...d.data() } as Feedback));
};

export const getAllFeedback = async (limitCount = 50): Promise<Feedback[]> => {
  const q = query(
    collection(db, COL),
    orderBy('createdAt', 'desc'),
    limit(limitCount),
  );
  const snap = await getDocs(q);
  return snap.docs.map((d) => ({ id: d.id, ...d.data() } as Feedback));
};

export const getFeedbackByStatus = async (status: FeedbackStatus): Promise<Feedback[]> => {
  const q = query(
    collection(db, COL),
    where('status', '==', status),
    orderBy('createdAt', 'desc'),
    limit(50),
  );
  const snap = await getDocs(q);
  return snap.docs.map((d) => ({ id: d.id, ...d.data() } as Feedback));
};

export const getFeedbackByType = async (type: FeedbackType): Promise<Feedback[]> => {
  const q = query(
    collection(db, COL),
    where('type', '==', type),
    orderBy('createdAt', 'desc'),
    limit(50),
  );
  const snap = await getDocs(q);
  return snap.docs.map((d) => ({ id: d.id, ...d.data() } as Feedback));
};

export const updateFeedbackStatus = async (
  id: string,
  status: FeedbackStatus,
  adminResponse?: string,
): Promise<void> => {
  const updates: Record<string, unknown> = {
    status,
    updatedAt: serverTimestamp(),
  };
  if (adminResponse) updates.adminResponse = adminResponse;
  await updateDoc(doc(db, COL, id), updates);
};

export const uploadFeedbackScreenshot = async (
  uri: string,
  feedbackId: string,
  index: number,
): Promise<string> => {
  const response = await fetch(uri);
  const blob = await response.blob();
  const storageRef = ref(storage, `feedback/${feedbackId}/screenshot_${index}.jpg`);
  await uploadBytes(storageRef, blob);
  return getDownloadURL(storageRef);
};

export const addScreenshotToFeedback = async (
  feedbackId: string,
  screenshotURL: string,
): Promise<void> => {
  const snap = await getDoc(doc(db, COL, feedbackId));
  if (!snap.exists()) return;
  const existing: string[] = snap.data().screenshotURLs ?? [];
  await updateDoc(doc(db, COL, feedbackId), {
    screenshotURLs: [...existing, screenshotURL],
    updatedAt: serverTimestamp(),
  });
};
