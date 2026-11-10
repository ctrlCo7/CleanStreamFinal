import { getApp, getApps, initializeApp } from 'firebase/app';
import AsyncStorage from '@react-native-async-storage/async-storage';
import * as FirebaseAuth from 'firebase/auth';
import { getAuth, initializeAuth, Persistence } from 'firebase/auth';
import { getDatabase } from 'firebase/database';
import { getFirestore, initializeFirestore } from 'firebase/firestore';


const firebaseConfig = {
  apiKey: "AIzaSyChjuW2inLuIsGdRekL_hnAkamKp_eweMk",
  authDomain: "cleanstream-b7942.firebaseapp.com",
  projectId: "cleanstream-b7942",
  storageBucket: "cleanstream-b7942.firebasestorage.app",
  messagingSenderId: "612872331884",
  appId: "1:612872331884:web:595fcd1f455a5c4e6bee49",
  databaseURL: "https://cleanstream-b7942-default-rtdb.firebaseio.com",
};

const app = getApps().length === 0 ? initializeApp(firebaseConfig) : getApp();

// The sign-in is saved on the phone, so whoever signed in last is opened straight away the
// next time the app starts, until they sign out. getReactNativePersistence only exists in
// Firebase's React Native build (which Metro uses), so it is not in the default type files.
const { getReactNativePersistence } = FirebaseAuth as unknown as {
  getReactNativePersistence: (storage: typeof AsyncStorage) => Persistence;
};

let auth: ReturnType<typeof getAuth>;
try {
  auth = initializeAuth(app, {
    persistence: getReactNativePersistence(AsyncStorage),
  });
} catch {
  auth = getAuth(app);
}

export { auth };
// Firestore rejects any document containing an `undefined` value ("Unsupported field
// value: undefined"), which made saving a report fail whenever an optional field such
// as GPS accuracy was absent. Dropping undefined fields instead is the safe behavior
// for this app's optional fields.
export const db = (() => {
  try {
    return initializeFirestore(app, { ignoreUndefinedProperties: true });
  } catch {
    return getFirestore(app); // already initialized (e.g. fast refresh)
  }
})();
export const rtdb = getDatabase(app);
export default app;
