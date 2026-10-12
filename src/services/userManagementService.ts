/**
 * Admin-only management of citizen, barangay official, and cleanup team
 * accounts -- view everyone, verify newly self-registered barangay/cleanup
 * team accounts, and activate/deactivate accounts. Firestore rules already
 * give admins full read/update on `users`; this is the client-side surface
 * for that.
 *
 * "Delete" is intentionally not offered here: deleting a Firebase Auth user
 * requires the Admin SDK (server-side), and permanently removing a user's
 * Firestore doc would orphan their reports/checkpoints. Deactivating
 * (isActive: false) is the reversible equivalent and is what every other
 * account-level control in this app already uses.
 */
import { collection, doc, onSnapshot, orderBy, query, updateDoc } from 'firebase/firestore';
import { db } from './firebase';
import { User } from '../types';

const COL = 'users';

export const subscribeToAllUsers = (callback: (users: User[]) => void) => {
  const q = query(collection(db, COL), orderBy('createdAt', 'desc'));
  return onSnapshot(q, (snap) => {
    callback(snap.docs.map((d) => ({ uid: d.id, ...d.data() } as User)));
  });
};

export const setUserActive = async (userId: string, isActive: boolean): Promise<void> => {
  await updateDoc(doc(db, COL, userId), { isActive });
};

export const setUserVerified = async (userId: string, isVerified: boolean): Promise<void> => {
  await updateDoc(doc(db, COL, userId), { isVerified });
};
