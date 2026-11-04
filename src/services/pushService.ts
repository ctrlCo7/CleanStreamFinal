/**
 * Notifications that reach a phone even when CleanStream is closed, without Firebase's paid
 * plan: Expo's free push service (exp.host), which delivers through Firebase Cloud Messaging
 * on Android and APNs on iPhone. Each phone saves its push token in `pushTokens/{uid}`;
 * whoever creates a notification also asks Expo to push it.
 *
 * Needs one-time setup outside the code (see DEPLOYMENT.md): google-services.json for Android
 * and the FCM V1 key uploaded to EAS; an Apple push key for iPhone. Until then getting a token
 * fails, nothing is sent, and the in-app list plus pop-ups while the app is open still work.
 * Phones without Google services (most Huawei) can't receive these pushes.
 */
import { Platform } from 'react-native';
import Constants from 'expo-constants';
import { doc, getDoc, serverTimestamp, setDoc } from 'firebase/firestore';
import { db } from './firebase';
import { getNotifications } from './notificationsModule';
import { NotificationType, User } from '../types';
import { appSettings } from './appSettings';
import { categoryOf, CATEGORY_TYPES, isOn, notificationPrefs } from './notificationPrefs';

const EXPO_PUSH_URL = 'https://exp.host/--/api/v2/push/send';
const STAFF = ['barangay', 'admin', 'cleanup_team', 'superadmin'];

let registered = false;
/** True once this phone has a push token saved (then pushes replace local pop-ups). */
export const hasPushToken = () => registered;

/** Saves this phone's Expo push token for the signed-in person. Silent no-op if unavailable. */
export async function registerPushToken(user: Pick<User, 'uid' | 'role'> | null | undefined): Promise<void> {
  registered = false;
  const N = getNotifications();
  if (!user || !N || Platform.OS === 'web') return;
  try {
    const perm = await N.getPermissionsAsync();
    if (!perm.granted) return;
    const projectId = (Constants.expoConfig?.extra as { eas?: { projectId?: string } } | undefined)?.eas?.projectId;
    const { data: token } = await N.getExpoPushTokenAsync(projectId ? { projectId } : undefined);
    if (!token) return;
    await setDoc(doc(db, 'pushTokens', user.uid), {
      token, platform: Platform.OS, staff: STAFF.includes(user.role),
      // The kinds this person turned off, so senders don't push them (Notification settings).
      muted: (Object.keys(CATEGORY_TYPES) as Array<keyof typeof CATEGORY_TYPES>).filter((c) => !isOn(notificationPrefs(), c)),
      updatedAt: serverTimestamp(),
    });
    registered = true;
  } catch (e) {
    // Expected until push credentials are set up (see DEPLOYMENT.md); in-app delivery still works.
    console.warn('[Push] Push notifications not available on this phone yet:', e instanceof Error ? e.message : e);
  }
}

/** Asks Expo to push a notification to these people's phones. Best effort; never throws. */
export async function sendPush(
  userIds: string[],
  message: { title: string; body: string; type: NotificationType; data?: Record<string, unknown> },
): Promise<void> {
  // The Super Admin can switch phone notifications off for everyone (System settings).
  if (!userIds.length || !appSettings().notifications.enablePush) return;
  const category = categoryOf(message.type);
  try {
    const tokens = (await Promise.all(userIds.map(async (uid) => {
      try {
        const snap = await getDoc(doc(db, 'pushTokens', uid));
        if (!snap.exists()) return undefined;
        const d = snap.data() as { token?: string; muted?: string[] };
        return (d.muted ?? []).includes(category) ? undefined : d.token;
      } catch {
        return undefined; // not allowed to read this person's token, or none saved
      }
    }))).filter((t): t is string => typeof t === 'string' && t.startsWith('ExponentPushToken'));
    if (!tokens.length) return;
    const res = await fetch(EXPO_PUSH_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
      body: JSON.stringify(tokens.map((to) => ({
        to, title: message.title, body: message.body, data: { type: message.type, ...(message.data ?? {}) }, sound: 'default',
        channelId: 'cleanstream-updates', priority: 'high',
      }))),
    });
    if (!res.ok) console.warn('[Push] Expo push service answered', res.status);
  } catch (e) {
    console.warn('[Push] Could not send push (the in-app notification is saved):', e);
  }
}
