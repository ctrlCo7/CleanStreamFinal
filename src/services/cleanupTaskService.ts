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
  limit,
} from 'firebase/firestore';
import { ref, uploadBytes, getDownloadURL } from 'firebase/storage';
import { db, storage } from './firebase';
import { CleanupTask, CleanupTaskStatus, SeverityLevel } from '../types';

const COL = 'cleanupTasks';

export const createCleanupTask = async (
  data: Omit<CleanupTask, 'id' | 'createdAt' | 'updatedAt' | 'beforePhotoURLs' | 'afterPhotoURLs'>,
): Promise<string> => {
  const ref = await addDoc(collection(db, COL), {
    ...data,
    beforePhotoURLs: [],
    afterPhotoURLs: [],
    status: 'assigned' as CleanupTaskStatus,
    createdAt: serverTimestamp(),
    updatedAt: serverTimestamp(),
  });
  return ref.id;
};

export const getCleanupTaskById = async (taskId: string): Promise<CleanupTask | null> => {
  const snap = await getDoc(doc(db, COL, taskId));
  if (!snap.exists()) return null;
  return { id: snap.id, ...snap.data() } as CleanupTask;
};

export const getTasksByTeam = async (teamId: string): Promise<CleanupTask[]> => {
  const q = query(
    collection(db, COL),
    where('assignedTeamId', '==', teamId),
    orderBy('scheduledDate', 'asc'),
  );
  const snap = await getDocs(q);
  return snap.docs.map((d) => ({ id: d.id, ...d.data() } as CleanupTask));
};

export const getTasksByBarangay = async (
  barangayId: string,
  limitCount = 50,
): Promise<CleanupTask[]> => {
  const q = query(
    collection(db, COL),
    where('barangayId', '==', barangayId),
    orderBy('scheduledDate', 'desc'),
    limit(limitCount),
  );
  const snap = await getDocs(q);
  return snap.docs.map((d) => ({ id: d.id, ...d.data() } as CleanupTask));
};

export const getActiveTasksByBarangay = async (barangayId: string): Promise<CleanupTask[]> => {
  const q = query(
    collection(db, COL),
    where('barangayId', '==', barangayId),
    where('status', 'in', ['assigned', 'accepted', 'in_progress']),
    orderBy('scheduledDate', 'asc'),
  );
  const snap = await getDocs(q);
  return snap.docs.map((d) => ({ id: d.id, ...d.data() } as CleanupTask));
};

export const updateTaskStatus = async (
  taskId: string,
  status: CleanupTaskStatus,
  notes?: string,
): Promise<void> => {
  const updates: Record<string, unknown> = {
    status,
    updatedAt: serverTimestamp(),
  };
  if (notes) updates.progressNotes = notes;
  if (status === 'in_progress') updates.actualStartTime = serverTimestamp();
  if (status === 'completed') {
    updates.actualEndTime = serverTimestamp();
    updates.completedAt = serverTimestamp();
    if (notes) updates.completionNotes = notes;
  }
  await updateDoc(doc(db, COL, taskId), updates);
};

export const uploadTaskPhoto = async (
  uri: string,
  taskId: string,
  phase: 'before' | 'after',
  index: number,
): Promise<string> => {
  const response = await fetch(uri);
  const blob = await response.blob();
  const storageRef = ref(storage, `cleanupTasks/${taskId}/${phase}_${index}.jpg`);
  await uploadBytes(storageRef, blob);
  return getDownloadURL(storageRef);
};

export const addTaskPhoto = async (
  taskId: string,
  photoURL: string,
  phase: 'before' | 'after',
): Promise<void> => {
  const snap = await getDoc(doc(db, COL, taskId));
  if (!snap.exists()) return;
  const task = snap.data() as CleanupTask;
  const field = phase === 'before' ? 'beforePhotoURLs' : 'afterPhotoURLs';
  const existing: string[] = task[field] || [];
  await updateDoc(doc(db, COL, taskId), {
    [field]: [...existing, photoURL],
    updatedAt: serverTimestamp(),
  });
};

export const updateTaskProgress = async (
  taskId: string,
  wasteCollectedKg: number,
  progressNotes: string,
): Promise<void> => {
  await updateDoc(doc(db, COL, taskId), {
    wasteCollectedKg,
    progressNotes,
    updatedAt: serverTimestamp(),
  });
};

export const subscribeToTeamTasks = (
  teamId: string,
  callback: (tasks: CleanupTask[]) => void,
) => {
  const q = query(
    collection(db, COL),
    where('assignedTeamId', '==', teamId),
    where('status', 'in', ['assigned', 'accepted', 'in_progress']),
    orderBy('scheduledDate', 'asc'),
  );
  return onSnapshot(q, (snap) => {
    callback(snap.docs.map((d) => ({ id: d.id, ...d.data() } as CleanupTask)));
  });
};

export const subscribeToBarangayTasks = (
  barangayId: string,
  callback: (tasks: CleanupTask[]) => void,
) => {
  const q = query(
    collection(db, COL),
    where('barangayId', '==', barangayId),
    orderBy('scheduledDate', 'desc'),
    limit(50),
  );
  return onSnapshot(q, (snap) => {
    callback(snap.docs.map((d) => ({ id: d.id, ...d.data() } as CleanupTask)));
  });
};

export const getTasksByPriority = async (priority: SeverityLevel): Promise<CleanupTask[]> => {
  const q = query(
    collection(db, COL),
    where('priority', '==', priority),
    where('status', 'in', ['assigned', 'accepted', 'in_progress']),
    orderBy('scheduledDate', 'asc'),
  );
  const snap = await getDocs(q);
  return snap.docs.map((d) => ({ id: d.id, ...d.data() } as CleanupTask));
};
