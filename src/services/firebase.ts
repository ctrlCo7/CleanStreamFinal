import { getApp, getApps, initializeApp } from 'firebase/app';
import { getAuth, initializeAuth, getReactNativePersistence } from 'firebase/auth';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { getDatabase } from 'firebase/database';
import { getFirestore } from 'firebase/firestore';
import { getStorage } from 'firebase/storage';


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

let auth: ReturnType<typeof getAuth>;
try {
  auth = initializeAuth(app, {
    persistence: getReactNativePersistence(AsyncStorage),
  });
} catch {
  auth = getAuth(app);
}

export { auth };
export const db = getFirestore(app);
export const storage = getStorage(app);
export const rtdb = getDatabase(app);
export default app;
