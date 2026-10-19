import { FirebaseApp, deleteApp, initializeApp } from 'firebase/app';
import { Auth, browserSessionPersistence, connectAuthEmulator, inMemoryPersistence, initializeAuth, signOut } from 'firebase/auth';
import { connectFirestoreEmulator, getFirestore } from 'firebase/firestore';

// Same project (and same public web config) as the mobile app.
export const firebaseConfig = {
  apiKey: 'AIzaSyChjuW2inLuIsGdRekL_hnAkamKp_eweMk',
  authDomain: 'cleanstream-b7942.firebaseapp.com',
  projectId: 'cleanstream-b7942',
  storageBucket: 'cleanstream-b7942.firebasestorage.app',
  messagingSenderId: '612872331884',
  appId: '1:612872331884:web:595fcd1f455a5c4e6bee49',
};

// Local end-to-end testing against the Firebase emulators (never set in production).
const USE_EMULATORS = import.meta.env.VITE_USE_EMULATORS === 'true';
const AUTH_EMULATOR = 'http://127.0.0.1:9099';

export const app: FirebaseApp = initializeApp(firebaseConfig);
// Session-only persistence (a Super Admin session must not outlive the tab). Created without the
// popup/redirect resolver on purpose: this portal only uses email + password, and omitting it
// means the page never loads Google's helper iframe/script, so a strict Content-Security-Policy works.
export const auth = initializeAuth(app, { persistence: browserSessionPersistence });
export const db = getFirestore(app);

if (USE_EMULATORS) {
  connectAuthEmulator(auth, AUTH_EMULATOR, { disableWarnings: true });
  connectFirestoreEmulator(db, '127.0.0.1', 8080);
}

/**
 * Runs `fn` with an auth instance from a throwaway second app. Creating an account with
 * createUserWithEmailAndPassword signs the new user in on whichever Auth instance made the
 * call, so doing it on the main instance would log the Super Admin out. The second app keeps
 * that sign-in isolated and is discarded afterwards.
 */
export async function withSecondaryAuth<T>(fn: (secondaryAuth: Auth) => Promise<T>): Promise<T> {
  const secondary = initializeApp(firebaseConfig, `account-creator-${Date.now()}`);
  const secondaryAuth = initializeAuth(secondary, { persistence: inMemoryPersistence });
  if (USE_EMULATORS) connectAuthEmulator(secondaryAuth, AUTH_EMULATOR, { disableWarnings: true });
  try {
    return await fn(secondaryAuth);
  } finally {
    await signOut(secondaryAuth).catch(() => undefined);
    await deleteApp(secondary).catch(() => undefined);
  }
}
