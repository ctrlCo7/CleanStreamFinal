import { getApp, getApps, initializeApp } from 'firebase/app';
import { getAuth, initializeAuth, inMemoryPersistence } from 'firebase/auth';
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

// In-memory persistence: the session lives only for the current app run, so
// every fresh launch lands on the Login/Signup screen instead of auto-restoring
// a previously signed-in account.
let auth: ReturnType<typeof getAuth>;
try {
  auth = initializeAuth(app, {
    persistence: inMemoryPersistence,
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
