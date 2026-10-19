import { doc, getDoc, onSnapshot, serverTimestamp, setDoc, updateDoc } from 'firebase/firestore';
import { IdVerificationStatus, IdentityEvidence, User, UserRole } from '../types';
import { db } from './firebase';

/**
 * Saves the ID photo and selfies for the Super Admin to review. The document is readable
 * only by the applicant and the Super Admin (see firestore.rules), and the Super Admin
 * portal deletes the images as soon as it records a decision.
 */
export const submitIdentityEvidence = async (uid: string, role: UserRole, evidence: IdentityEvidence): Promise<void> => {
  await setDoc(doc(db, 'verifications', uid), {
    uid,
    role,
    idType: evidence.idType,
    idImage: evidence.idImage,
    selfieNeutral: evidence.selfies.neutral,
    selfieSmile: evidence.selfies.smile,
    selfieTurn: evidence.selfies.turn,
    clientChecks: evidence.clientChecks,
    status: 'pending',
    submittedAt: serverTimestamp(),
  });
};

/** After a rejection: put the account back in the review queue, then send the new photos. */
export const resubmitIdentity = async (uid: string, role: UserRole, evidence: IdentityEvidence): Promise<void> => {
  await updateDoc(doc(db, 'users', uid), { idVerification: 'pending' satisfies IdVerificationStatus });
  await submitIdentityEvidence(uid, role, evidence);
};

/** True if the applicant has an evidence submission on file (it may be missing if the upload failed at sign-up). */
export const hasSubmittedEvidence = async (uid: string): Promise<boolean> => {
  const snap = await getDoc(doc(db, 'verifications', uid));
  return snap.exists() && snap.data().status === 'pending' && typeof snap.data().idImage === 'string';
};

/** Live view of the signed-in user's own profile, so the waiting screen reacts to the decision. */
export const subscribeToOwnProfile = (uid: string, callback: (user: User | null) => void) =>
  onSnapshot(doc(db, 'users', uid), (snap) => callback(snap.exists() ? ({ ...snap.data(), uid: snap.id } as User) : null));
