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
  status: FieldCheckpointStatus;
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
  status: ((data.status as FieldCheckpointStatus) || 'pending'),
  verifiedBy: data.verifiedBy as string | undefined,
  verifiedByName: data.verifiedByName as string | undefined,
  createdAt: (data.createdAt as { toDate?: () => Date })?.toDate?.() ?? new Date(),
  verifiedAt: (data.verifiedAt as { toDate?: () => Date })?.toDate?.(),
});

/** Barangay official submits a field checkpoint report. Per the CleanStream capstone
 * workflow, this is expected to notify the Admin -- callers should pair this with
 * notificationService's getNotificationRecipientsByRole(['admin']) + sendBulkNotification.
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
): Promise<string> => {
  const ref = await addDoc(collection(db, COL), {
    userId,
    userName,
    barangayId,
    barangay,
    type,
    condition,
    wasteType,
    notes,
    status: 'pending',
    createdAt: serverTimestamp(),
  });
  return ref.id;
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
