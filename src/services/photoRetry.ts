/**
 * Report photos whose upload failed are never lost. The photo is copied into the app's
 * documents folder (the camera's cache can be cleared by the system), remembered on the
 * phone, and uploaded again whenever the app syncs (on open, coming back to the foreground,
 * and every couple of minutes). Until then the report is marked `photoPending` instead of
 * pointing at a file on this phone that no one else can see.
 */
import AsyncStorage from '@react-native-async-storage/async-storage';
import { Directory, File, Paths } from 'expo-file-system';
import { doc, updateDoc } from 'firebase/firestore';
import { db } from './firebase';
import { uploadToCloudinary } from './cloudinaryService';

const KEY = 'cleanstream_photo_retry_v1';
const DIR = 'pending-photos';

interface PendingPhoto { reportId: string; uri: string; attempts: number; lastError?: string }

const read = async (): Promise<PendingPhoto[]> => {
  try { return JSON.parse((await AsyncStorage.getItem(KEY)) ?? '[]') as PendingPhoto[]; } catch { return []; }
};
const write = (items: PendingPhoto[]) => AsyncStorage.setItem(KEY, JSON.stringify(items));

/** The photo upload for a report (same place as a normal upload, so the URL is stable). */
export const uploadPhotoForReport = (uri: string, reportId: string) =>
  uploadToCloudinary(uri, `reports/${reportId}`, 'photo.jpg');

/** Keeps a safe copy of the photo and remembers to upload it later. */
export async function queuePhotoRetry(reportId: string, uri: string): Promise<void> {
  let keep = uri;
  try {
    const dir = new Directory(Paths.document, DIR);
    dir.create({ intermediates: true, idempotent: true });
    const dest = new File(dir, `${reportId}.jpg`);
    if (!dest.exists) await new File(uri).copy(dest);
    keep = dest.uri;
  } catch (e) {
    console.warn('[PhotoRetry] Could not copy the photo to safe storage; retrying from the original:', e);
  }
  const items = (await read()).filter((i) => i.reportId !== reportId);
  await write([...items, { reportId, uri: keep, attempts: 0 }]);
}

export async function pendingPhotoCount(): Promise<number> {
  return (await read()).length;
}

/** Uploads every waiting photo; each one leaves the list only once it is stored and linked. */
export async function retryPendingPhotos(): Promise<number> {
  const items = await read();
  let done = 0;
  for (const item of items) {
    try {
      const f = new File(item.uri);
      if (!f.exists) {
        // Nothing left to upload (e.g. the app's data was cleared): stop retrying, keep the flag.
        await write((await read()).filter((i) => i.reportId !== item.reportId));
        continue;
      }
      const photoURL = await uploadPhotoForReport(item.uri, item.reportId);
      await updateDoc(doc(db, 'reports', item.reportId), { photoURL, photoPending: false });
      await write((await read()).filter((i) => i.reportId !== item.reportId));
      try { if (item.uri.includes(DIR)) f.delete(); } catch { /* best effort */ }
      done++;
    } catch (e) {
      console.warn('[PhotoRetry] Upload still failing, will retry:', e);
      await write((await read()).map((i) => (i.reportId === item.reportId
        ? { ...i, attempts: i.attempts + 1, lastError: e instanceof Error ? e.message : String(e) } : i)));
    }
  }
  return done;
}
