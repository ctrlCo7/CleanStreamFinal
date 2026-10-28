import {
  addDoc,
  collection,
  doc,
  onSnapshot,
  orderBy,
  query,
  serverTimestamp,
  updateDoc,
  where,
} from 'firebase/firestore';
import { db } from './firebase';
import { uploadToCloudinary } from './cloudinaryService';
import { GeoLocation } from '../types';

const COL = 'fieldCheckpoints';

export type FieldCheckpointStatus = 'pending' | 'verified';

export interface FieldCheckpointRecord {
  id: string;
  userId: string;
  userName: string;
  barangayId: string;
  barangay: string;
  type: string;
  condition: string;
  wasteType: string;
  notes: string;
  checkpointId?: string;
  checkpointName?: string;
  status: FieldCheckpointStatus;
  photoURL?: string;
  location?: GeoLocation;
  verifiedBy?: string;
  verifiedByName?: string;
  createdAt: Date;
  verifiedAt?: Date;
}

const toRecord = (id: string, data: Record<string, unknown>): FieldCheckpointRecord => ({
  id,
  userId: (data.userId as string) ?? '',
  userName: (data.userName as string) ?? 'Barangay Official',
  barangayId: (data.barangayId as string) ?? '',
  barangay: (data.barangay as string) ?? '—',
  type: (data.type as string) ?? '—',
  condition: (data.condition as string) ?? '—',
  wasteType: (data.wasteType as string) ?? '—',
  notes: (data.notes as string) ?? '',
  checkpointId: data.checkpointId as string | undefined,
  checkpointName: data.checkpointName as string | undefined,
  status: ((data.status as FieldCheckpointStatus) || 'pending'),
  photoURL: data.photoURL as string | undefined,
  location: data.location as GeoLocation | undefined,
  verifiedBy: data.verifiedBy as string | undefined,
  verifiedByName: data.verifiedByName as string | undefined,
  createdAt: (data.createdAt as { toDate?: () => Date })?.toDate?.() ?? new Date(),
  verifiedAt: (data.verifiedAt as { toDate?: () => Date })?.toDate?.(),
});

// ─── Managed checkpoints ────────────────────────────────────────────────────
// Named monitoring points set up in the Super Admin portal (superadmin-web/src/lib/operations.ts):
// where to inspect, who is assigned, and on which days.

const MANAGED_COL = 'checkpoints';

export const CHECKPOINT_DAYS = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'] as const;
export type CheckpointDay = (typeof CHECKPOINT_DAYS)[number];

export interface ManagedCheckpoint {
  id: string;
  name: string;
  barangayId: string;
  barangay: string;
  waterway: string;
  description: string;
  latitude?: number;
  longitude?: number;
  assignedUserIds: string[];
  assignedNames: string[];
  days: CheckpointDay[];
  time: string; // "HH:MM", 24-hour
  isActive: boolean;
  lastInspectedAt?: Date;
  lastInspectedByName?: string;
}

const toManaged = (id: string, data: Record<string, unknown>): ManagedCheckpoint => ({
  id,
  name: (data.name as string) ?? 'Checkpoint',
  barangayId: (data.barangayId as string) ?? '',
  barangay: (data.barangay as string) ?? '—',
  waterway: (data.waterway as string) ?? '',
  description: (data.description as string) ?? '',
  latitude: typeof data.latitude === 'number' ? data.latitude : undefined,
  longitude: typeof data.longitude === 'number' ? data.longitude : undefined,
  assignedUserIds: Array.isArray(data.assignedUserIds) ? (data.assignedUserIds as string[]) : [],
  assignedNames: Array.isArray(data.assignedNames) ? (data.assignedNames as string[]) : [],
  days: Array.isArray(data.days) ? CHECKPOINT_DAYS.filter((d) => (data.days as string[]).includes(d)) : [],
  time: (data.time as string) ?? '07:00',
  isActive: data.isActive !== false,
  lastInspectedAt: (data.lastInspectedAt as { toDate?: () => Date })?.toDate?.(),
  lastInspectedByName: data.lastInspectedByName as string | undefined,
});

/** JS getDay() is Sunday-first; CHECKPOINT_DAYS is Monday-first. */
export const todayCheckpointDay = (d = new Date()): CheckpointDay => CHECKPOINT_DAYS[(d.getDay() + 6) % 7];

export const isInspectedToday = (cp: ManagedCheckpoint, now = new Date()): boolean =>
  !!cp.lastInspectedAt && cp.lastInspectedAt.toDateString() === now.toDateString();

/** "07:30" -> "7:30 AM" */
export const formatCheckpointTime = (hhmm: string): string => {
  const [h, m] = hhmm.split(':').map(Number);
  return `${((h + 11) % 12) + 1}:${String(m || 0).padStart(2, '0')} ${h < 12 ? 'AM' : 'PM'}`;
};

/**
 * Active checkpoints in a barangay. The official's own assignments come first, then the
 * ones scheduled for today, so the likeliest pick is at the top of the list.
 */
export const subscribeToBarangayCheckpoints = (
  barangayId: string,
  userId: string,
  callback: (checkpoints: ManagedCheckpoint[]) => void,
) => {
  const q = query(collection(db, MANAGED_COL), where('barangayId', '==', barangayId));
  return onSnapshot(
    q,
    (snap) => {
      const today = todayCheckpointDay();
      const rank = (c: ManagedCheckpoint) =>
        (c.assignedUserIds.includes(userId) ? 0 : 2) + (c.days.includes(today) ? 0 : 1);
      callback(
        snap.docs
          .map((d) => toManaged(d.id, d.data()))
          .filter((c) => c.isActive)
          .sort((a, b) => rank(a) - rank(b) || a.name.localeCompare(b.name)),
      );
    },
    (err) => {
      console.warn('[Checkpoint] Could not load checkpoints:', err);
      callback([]);
    },
  );
};

export const uploadCheckpointPhoto = async (uri: string, checkpointId: string): Promise<string> =>
  uploadToCloudinary(uri, `fieldCheckpoints/${checkpointId}`, 'photo.jpg');

/** Barangay official submits a field checkpoint report. Per the CleanStream capstone
 * workflow, this is expected to notify the Admin -- callers should pair this with
 * notificationService's getNotificationRecipientsByRole(['admin']) + sendBulkNotification.
 *
 * The Firestore document is created first (critical path), then the photo is
 * uploaded and attached after (non-critical, mirrors reportsService.createReport) --
 * so a flaky upload never blocks the checkpoint submission itself.
 */
export const createCheckpoint = async (
  userId: string,
  userName: string,
  barangayId: string,
  barangay: string,
  type: string,
  condition: string,
  wasteType: string,
  notes: string,
  photoUri?: string,
  location?: GeoLocation,
  checkpoint?: Pick<ManagedCheckpoint, 'id' | 'name'>,
): Promise<string> => {
  const docRef = await addDoc(collection(db, COL), {
    userId,
    userName,
    barangayId,
    barangay,
    type,
    condition,
    wasteType,
    notes,
    status: 'pending',
    location: location ?? null,
    ...(checkpoint ? { checkpointId: checkpoint.id, checkpointName: checkpoint.name } : {}),
    createdAt: serverTimestamp(),
  });

  // Marks the checkpoint inspected for the Admin / Super Admin compliance views. Non-critical:
  // the inspection itself is already saved.
  if (checkpoint) {
    updateDoc(doc(db, MANAGED_COL, checkpoint.id), {
      lastInspectedAt: serverTimestamp(),
      lastInspectedBy: userId,
      lastInspectedByName: userName,
      lastCondition: condition,
    }).catch((e) => console.warn('[Checkpoint] Could not mark checkpoint inspected (non-fatal):', e));
  }

  if (photoUri) {
    try {
      const photoURL = await uploadCheckpointPhoto(photoUri, docRef.id);
      await updateDoc(docRef, { photoURL });
    } catch (uploadErr) {
      console.error('[Checkpoint] Photo upload failed (non-fatal):', uploadErr);
      await updateDoc(docRef, { photoURL: photoUri }).catch((e) =>
        console.warn('[Checkpoint] Could not set fallback photoURL:', e),
      );
    }
  }

  return docRef.id;
};

/** Admin-side: all checkpoint submissions across every barangay, newest first. */
export const subscribeToAllCheckpoints = (
  callback: (checkpoints: FieldCheckpointRecord[]) => void,
) => {
  const q = query(collection(db, COL), orderBy('createdAt', 'desc'));
  return onSnapshot(q, (snap) => {
    callback(snap.docs.map((d) => toRecord(d.id, d.data())));
  });
};

/** Barangay-side: a single officer's own submissions. */
export const subscribeToUserCheckpoints = (
  userId: string,
  callback: (checkpoints: FieldCheckpointRecord[]) => void,
) => {
  const q = query(collection(db, COL), where('userId', '==', userId), orderBy('createdAt', 'desc'));
  return onSnapshot(q, (snap) => {
    callback(snap.docs.map((d) => toRecord(d.id, d.data())));
  });
};

export const verifyCheckpoint = async (
  checkpointId: string,
  adminId: string,
  adminName: string,
): Promise<void> => {
  await updateDoc(doc(db, COL, checkpointId), {
    status: 'verified',
    verifiedBy: adminId,
    verifiedByName: adminName,
    verifiedAt: serverTimestamp(),
  });
};
