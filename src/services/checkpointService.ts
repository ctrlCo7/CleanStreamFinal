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
  status: ((data.status as FieldCheckpointStatus) || 'pending'),
  photoURL: data.photoURL as string | undefined,
  location: data.location as GeoLocation | undefined,
  verifiedBy: data.verifiedBy as string | undefined,
  verifiedByName: data.verifiedByName as string | undefined,
  createdAt: (data.createdAt as { toDate?: () => Date })?.toDate?.() ?? new Date(),
  verifiedAt: (data.verifiedAt as { toDate?: () => Date })?.toDate?.(),
});

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
    createdAt: serverTimestamp(),
  });

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
