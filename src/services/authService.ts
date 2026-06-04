import {
  createUserWithEmailAndPassword,
  User as FirebaseUser,
  onAuthStateChanged,
  sendPasswordResetEmail,
  signInWithEmailAndPassword,
  signOut,
} from 'firebase/auth';
import { doc, getDoc, serverTimestamp, setDoc, updateDoc } from 'firebase/firestore';
import { User, UserRole } from '../types';
import { auth, db } from './firebase';

export const registerUser = async (
  email: string,
  password: string,
  firstName: string,
  lastName: string,
  role: UserRole,
  barangay?: string,
  employeeId?: string,
  agency?: string,
): Promise<User> => {
  const credential = await createUserWithEmailAndPassword(auth, email, password);
  const { uid } = credential.user;

  const userData: User = {
    uid,
    email,
    firstName,
    lastName,
    role,
    barangay,
    employeeId,
    agency,
    createdAt: new Date().toISOString(),
  };

  await setDoc(doc(db, 'users', uid), {
    ...userData,
    createdAt: serverTimestamp(),
  });

  return userData;
};

export const loginUser = async (
  email: string,
  password: string,
): Promise<{ firebaseUser: FirebaseUser; userData: User }> => {
  const credential = await signInWithEmailAndPassword(auth, email, password);
  const userDoc = await getDoc(doc(db, 'users', credential.user.uid));

  if (!userDoc.exists()) {
    throw new Error('User profile not found. Contact support.');
  }

  return {
    firebaseUser: credential.user,
    userData: userDoc.data() as User,
  };
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
