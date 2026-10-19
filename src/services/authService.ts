import {
  createUserWithEmailAndPassword,
  User as FirebaseUser,
  onAuthStateChanged,
  sendPasswordResetEmail,
  signInWithEmailAndPassword,
  signOut,
} from 'firebase/auth';
import { doc, getDoc, serverTimestamp, setDoc, updateDoc } from 'firebase/firestore';
import { IdentityEvidence, User, UserRole } from '../types';
import { auth, db } from './firebase';
import { submitIdentityEvidence } from './identityVerificationService';

/** Admin and Barangay Official sign-ups must have their ID and face verified by the Super Admin. */
export const requiresIdentityCheck = (role: UserRole): boolean => role === 'admin' || role === 'barangay';

export const registerUser = async (
  email: string,
  password: string,
  firstName: string,
  lastName: string,
  role: UserRole,
  barangay?: string,
  employeeId?: string,
  agency?: string,
  barangayId?: string,
  evidence?: IdentityEvidence,
  phone?: string,
): Promise<User> => {
  // Checked before the sign-in is created so a missing ID photo can't leave a half-made account.
  if (requiresIdentityCheck(role) && !evidence) {
    throw new Error('Please complete the ID and face verification first.');
  }
  const credential = await createUserWithEmailAndPassword(auth, email, password);
  const { uid } = credential.user;

  const userData: User = {
    uid,
    email,
    firstName,
    lastName,
    role,
    barangay,
    barangayId,
    employeeId,
    agency,
    phone,
    ...(requiresIdentityCheck(role) ? { idVerification: 'pending' as const } : {}),
    isActive: true,
    isVerified: false,
    createdAt: new Date().toISOString(),
  };

  // Firestore's setDoc rejects `undefined` field values outright (throws
  // "Unsupported field value: undefined"), so optional fields that don't apply to
  // this role (e.g. barangay for an admin) must be omitted, not passed through as-is.
  const firestorePayload: Record<string, unknown> = { ...userData, createdAt: serverTimestamp() };
  for (const key of Object.keys(firestorePayload)) {
    if (firestorePayload[key] === undefined) delete firestorePayload[key];
  }

  await setDoc(doc(db, 'users', uid), firestorePayload);

  if (evidence) {
    try {
      await submitIdentityEvidence(uid, role, evidence);
    } catch {
      // The account exists and waits in 'pending'; the waiting screen lets them send the photos again.
      throw new Error('Your account was created, but we could not upload your ID photos. Sign in and submit them again.');
    }
  }

  return userData;
};

// Accounts the Super Admin has deactivated or removed, and Super Admin accounts themselves
// (which only use the web portal), must never get into the mobile app.
const assertCanUseApp = (profile: User): void => {
  if (profile.role === 'superadmin') {
    throw new Error('Super Admin accounts sign in on the web portal, not in this app.');
  }
  if (profile.isActive === false) {
    throw new Error('This account has been deactivated. Please contact the Super Admin.');
  }
};

export const loginUser = async (
  email: string,
  password: string,
): Promise<{ firebaseUser: FirebaseUser; userData: User }> => {
  const credential = await signInWithEmailAndPassword(auth, email, password);
  const userDoc = await getDoc(doc(db, 'users', credential.user.uid));

  if (!userDoc.exists()) {
    await signOut(auth);
    throw new Error('User profile not found. Contact support.');
  }

  const userData = userDoc.data() as User;
  try {
    assertCanUseApp(userData);
  } catch (e) {
    await signOut(auth);
    throw e;
  }

  return { firebaseUser: credential.user, userData };
};

export const logoutUser = async (): Promise<void> => {
  await signOut(auth);
};

export const resetPassword = async (email: string): Promise<void> => {
  await sendPasswordResetEmail(auth, email);
};

export const getUserProfile = async (uid: string): Promise<User | null> => {
  const userDoc = await getDoc(doc(db, 'users', uid));
  if (!userDoc.exists()) return null;
  return userDoc.data() as User;
};

/** Profile for a restored session, or an error (and sign-out) if the account may no longer use the app. */
export const getUsableProfile = async (uid: string): Promise<User> => {
  const profile = await getUserProfile(uid);
  if (!profile) throw new Error('Profile not found');
  try {
    assertCanUseApp(profile);
  } catch (e) {
    await signOut(auth);
    throw e;
  }
  return profile;
};

export const updateUserProfile = async (
  uid: string,
  updates: Partial<User>,
): Promise<void> => {
  await updateDoc(doc(db, 'users', uid), {
    ...updates,
    updatedAt: serverTimestamp(),
  });
};

export const onAuthChange = (callback: (user: FirebaseUser | null) => void) => {
  return onAuthStateChanged(auth, callback);
};
