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
  onSnapshot,
  serverTimestamp,
  increment,
  limit,
} from 'firebase/firestore';
import { uploadToCloudinary } from './cloudinaryService';
import { db } from './firebase';
import { Announcement, AnnouncementPriority, AnnouncementType, UserRole } from '../types';

const COL = 'announcements';

export const createAnnouncement = async (
  data: Omit<Announcement, 'id' | 'createdAt' | 'updatedAt' | 'viewCount'>,
): Promise<string> => {
  const ref = await addDoc(collection(db, COL), {
    ...data,
    viewCount: 0,
    isActive: true,
    createdAt: serverTimestamp(),
    updatedAt: serverTimestamp(),
    publishedAt: serverTimestamp(),
  });
  return ref.id;
};

export const getAnnouncementById = async (id: string): Promise<Announcement | null> => {
  const snap = await getDoc(doc(db, COL, id));
  if (!snap.exists()) return null;
  return { id: snap.id, ...snap.data() } as Announcement;
};

export const getActiveAnnouncements = async (
  userRole: UserRole,
  barangayId?: string,
  limitCount = 20,
): Promise<Announcement[]> => {
  const q = query(
    collection(db, COL),
    where('isActive', '==', true),
    where('targetRoles', 'array-contains-any', [userRole, 'all']),
    orderBy('isPinned', 'desc'),
    orderBy('publishedAt', 'desc'),
    limit(limitCount),
  );
  const snap = await getDocs(q);
  const all = snap.docs.map((d) => ({ id: d.id, ...d.data() } as Announcement));

  // Filter by barangay if applicable (can't do two array-contains in one query)
  if (barangayId) {
    return all.filter(
      (a) => a.targetBarangayIds.length === 0 || a.targetBarangayIds.includes(barangayId),
    );
  }
  return all;
};

export const getPinnedAnnouncements = async (): Promise<Announcement[]> => {
  const q = query(
    collection(db, COL),
    where('isActive', '==', true),
    where('isPinned', '==', true),
    orderBy('publishedAt', 'desc'),
  );
  const snap = await getDocs(q);
  return snap.docs.map((d) => ({ id: d.id, ...d.data() } as Announcement));
};

export const getAnnouncementsByType = async (
  type: AnnouncementType,
): Promise<Announcement[]> => {
  const q = query(
    collection(db, COL),
    where('type', '==', type),
    where('isActive', '==', true),
    orderBy('publishedAt', 'desc'),
    limit(20),
  );
  const snap = await getDocs(q);
  return snap.docs.map((d) => ({ id: d.id, ...d.data() } as Announcement));
};

export const updateAnnouncement = async (
  id: string,
  updates: Partial<Omit<Announcement, 'id' | 'createdAt' | 'viewCount'>>,
): Promise<void> => {
  await updateDoc(doc(db, COL, id), {
    ...updates,
    updatedAt: serverTimestamp(),
  });
};

export const deactivateAnnouncement = async (id: string): Promise<void> => {
  await updateDoc(doc(db, COL, id), {
    isActive: false,
    updatedAt: serverTimestamp(),
  });
};

export const togglePinAnnouncement = async (id: string, isPinned: boolean): Promise<void> => {
  await updateDoc(doc(db, COL, id), {
    isPinned,
    updatedAt: serverTimestamp(),
  });
};

export const recordAnnouncementView = async (id: string): Promise<void> => {
  await updateDoc(doc(db, COL, id), {
    viewCount: increment(1),
  });
};

export const uploadAnnouncementImage = async (uri: string, id: string): Promise<string> =>
  uploadToCloudinary(uri, `announcements/${id}`, 'cover.jpg');

export const subscribeToAnnouncements = (
  userRole: UserRole,
  callback: (announcements: Announcement[]) => void,
) => {
  const q = query(
    collection(db, COL),
    where('isActive', '==', true),
    where('targetRoles', 'array-contains-any', [userRole, 'all']),
    orderBy('isPinned', 'desc'),
    orderBy('publishedAt', 'desc'),
    limit(20),
  );
  return onSnapshot(q, (snap) => {
    callback(snap.docs.map((d) => ({ id: d.id, ...d.data() } as Announcement)));
  });
};
