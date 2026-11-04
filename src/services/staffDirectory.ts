/**
 * Who to notify in a barangay, without exposing anyone's profile. `barangayStaff/{barangayId}`
 * holds only the account ids of the barangay's officials and Captain (no names, phones or
 * other personal details). Each official or Captain adds themselves when they open the app;
 * the security rules let them add only themselves, only in their own barangay.
 *
 * Citizens can't read other people's user profiles (privacy), so when a citizen's phone has
 * to tell the officials about a new report, it reads this list instead.
 */
import { arrayUnion, doc, getDoc, serverTimestamp, setDoc } from 'firebase/firestore';
import { db } from './firebase';
import { User } from '../types';

const COL = 'barangayStaff';

/** Lists this official or Captain in their barangay's staff directory (idempotent). */
export async function registerInStaffDirectory(user: Pick<User, 'uid' | 'role' | 'barangayId'> | null | undefined): Promise<void> {
  if (!user?.barangayId) return;
  const field = user.role === 'barangay' ? 'officials' : user.role === 'admin' ? 'captains' : null;
  if (!field) return;
  try {
    await setDoc(doc(db, COL, user.barangayId), { [field]: arrayUnion(user.uid), updatedAt: serverTimestamp() }, { merge: true });
  } catch (e) {
    console.warn('[Staff] Could not register in the staff directory (non-fatal):', e);
  }
}

/** The account ids of a barangay's officials ('barangay') and/or Captain ('admin'). */
export async function staffOf(barangayId: string, roles: string[]): Promise<string[]> {
  const snap = await getDoc(doc(db, COL, barangayId));
  if (!snap.exists()) return [];
  const d = snap.data() as { officials?: string[]; captains?: string[] };
  return [
    ...(roles.includes('barangay') ? d.officials ?? [] : []),
    ...(roles.includes('admin') ? d.captains ?? [] : []),
  ];
}
