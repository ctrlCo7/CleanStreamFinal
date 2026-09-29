/**
 * Waterway check alarms -- lets a barangay official set recurring times
 * ("every Mon/Wed/Fri at 7:00 AM, check the waterway near the Public
 * Market") and have their phone actually ring/notify them at that time,
 * routed through a dedicated high-importance Android channel so it behaves
 * like an alarm rather than a quiet background notification.
 *
 * This is entirely on-device local scheduling via expo-notifications --
 * no backend, no Cloud Functions, no push server -- so it works the same
 * whether or not Firebase Functions/Blaze billing is ever enabled. Firestore
 * is only the source of truth for what the user configured (so alarms show
 * up correctly if they reinstall or switch devices); the actual ringing is
 * scheduled with the OS via scheduleNotificationAsync.
 */
import * as Notifications from 'expo-notifications';
import {
  addDoc,
  collection,
  deleteDoc,
  doc,
  getDocs,
  onSnapshot,
  orderBy,
  query,
  serverTimestamp,
  updateDoc,
  where,
} from 'firebase/firestore';
import { db } from './firebase';

const COL = 'waterwayAlarms';
const CHANNEL_ID = 'waterway-alarm';

// expo-notifications weekday convention: 1 = Sunday ... 7 = Saturday.
export const DAY_LABELS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];

export interface WaterwayAlarmRecord {
  id: string;
  userId: string;
  barangayId: string;
  barangay: string;
  label: string;
  hour: number;
  minute: number;
  days: number[]; // subset of 1..7
  isActive: boolean;
  notificationIds: Record<string, string>; // day (as string) -> scheduled notification id
  createdAt: string;
}

const toRecord = (id: string, data: Record<string, unknown>): WaterwayAlarmRecord => ({
  id,
  userId: (data.userId as string) ?? '',
  barangayId: (data.barangayId as string) ?? '',
  barangay: (data.barangay as string) ?? '—',
  label: (data.label as string) ?? 'Waterway check',
  hour: typeof data.hour === 'number' ? data.hour : 8,
  minute: typeof data.minute === 'number' ? data.minute : 0,
  days: Array.isArray(data.days) ? (data.days as number[]) : [],
  isActive: (data.isActive as boolean) ?? true,
  notificationIds: (data.notificationIds as Record<string, string>) ?? {},
  createdAt: (data.createdAt as { toDate?: () => Date })?.toDate?.().toISOString() ?? new Date().toISOString(),
});

// ─── Notification handler / channel setup ──────────────────────────────────

let handlerConfigured = false;

/** Without an explicit handler, foreground notifications on this SDK don't
 * show a banner/sound at all -- must be set once, early (call from app init). */
export function configureAlarmNotificationHandler(): void {
  if (handlerConfigured) return;
  handlerConfigured = true;
  Notifications.setNotificationHandler({
    handleNotification: async () => ({
      shouldShowBanner: true,
      shouldShowList: true,
      shouldPlaySound: true,
      shouldSetBadge: false,
    }),
  });
}

export async function requestAlarmPermissions(): Promise<boolean> {
  const current = await Notifications.getPermissionsAsync();
  if (current.granted) return true;
  const requested = await Notifications.requestPermissionsAsync();
  return requested.granted;
}

let channelReady = false;

export async function initAlarmChannel(): Promise<void> {
  if (channelReady) return;
  configureAlarmNotificationHandler();
  await Notifications.setNotificationChannelAsync(CHANNEL_ID, {
    name: 'Waterway check alarms',
    importance: Notifications.AndroidImportance.MAX,
    sound: 'default',
    vibrationPattern: [0, 500, 250, 500, 250, 500],
    enableVibrate: true,
    enableLights: true,
    lightColor: '#2E86DE',
    lockscreenVisibility: Notifications.AndroidNotificationVisibility.PUBLIC,
    bypassDnd: true,
    audioAttributes: { usage: Notifications.AndroidAudioUsage.ALARM },
  });
  channelReady = true;
}

// ─── Scheduling helpers ─────────────────────────────────────────────────────

async function scheduleForDays(
  label: string,
  hour: number,
  minute: number,
  days: number[],
): Promise<Record<string, string>> {
  await initAlarmChannel();
  const ids: Record<string, string> = {};
  for (const weekday of days) {
    // eslint-disable-next-line no-await-in-loop -- sequential is fine, at most 7 calls
    const id = await Notifications.scheduleNotificationAsync({
      content: {
        title: '🌊 Waterway check time',
        body: label,
        sound: 'default',
        data: { type: 'waterway_alarm' },
      },
      trigger: {
        type: Notifications.SchedulableTriggerInputTypes.WEEKLY,
        weekday,
        hour,
        minute,
        channelId: CHANNEL_ID,
      },
    });
    ids[String(weekday)] = id;
  }
  return ids;
}

async function cancelAll(notificationIds: Record<string, string>): Promise<void> {
  await Promise.all(
    Object.values(notificationIds).map((id) =>
      Notifications.cancelScheduledNotificationAsync(id).catch(() => {}),
    ),
  );
}

// ─── CRUD ───────────────────────────────────────────────────────────────────

export const createAlarm = async (
  userId: string,
  barangayId: string,
  barangay: string,
  label: string,
  hour: number,
  minute: number,
  days: number[],
): Promise<string> => {
  const granted = await requestAlarmPermissions();
  if (!granted) {
    throw new Error('Notification permission was not granted, so the alarm cannot ring.');
  }
  const notificationIds = await scheduleForDays(label, hour, minute, days);
  const ref = await addDoc(collection(db, COL), {
    userId,
    barangayId,
    barangay,
    label,
    hour,
    minute,
    days,
    isActive: true,
    notificationIds,
    createdAt: serverTimestamp(),
  });
  return ref.id;
};

export const deleteAlarm = async (alarm: WaterwayAlarmRecord): Promise<void> => {
  await cancelAll(alarm.notificationIds);
  await deleteDoc(doc(db, COL, alarm.id));
};

export const setAlarmActive = async (alarm: WaterwayAlarmRecord, isActive: boolean): Promise<void> => {
  if (isActive) {
    const notificationIds = await scheduleForDays(alarm.label, alarm.hour, alarm.minute, alarm.days);
    await updateDoc(doc(db, COL, alarm.id), { isActive: true, notificationIds });
  } else {
    await cancelAll(alarm.notificationIds);
    await updateDoc(doc(db, COL, alarm.id), { isActive: false, notificationIds: {} });
  }
};

export const subscribeToUserAlarms = (
  userId: string,
  callback: (alarms: WaterwayAlarmRecord[]) => void,
) => {
  const q = query(collection(db, COL), where('userId', '==', userId), orderBy('createdAt', 'desc'));
  return onSnapshot(q, (snap) => callback(snap.docs.map((d) => toRecord(d.id, d.data()))));
};

/** Defensive re-sync: the OS can silently drop scheduled local notifications
 * (app reinstall, notification permission revoked then regranted, Android
 * force-stop) even though Firestore still says the alarm is active. Call on
 * barangay login/dashboard mount so the phone's real alarm state always
 * matches what the user configured, without making them recreate alarms
 * by hand every time. */
export const reconcileAlarmsOnDevice = async (userId: string): Promise<void> => {
  await initAlarmChannel();
  const granted = await requestAlarmPermissions();
  if (!granted) return;

  const q = query(collection(db, COL), where('userId', '==', userId), where('isActive', '==', true));
  const snap = await getDocs(q);
  const scheduled = await Notifications.getAllScheduledNotificationsAsync();
  const liveIds = new Set(scheduled.map((n) => n.identifier));

  await Promise.all(
    snap.docs.map(async (d) => {
      const alarm = toRecord(d.id, d.data());
      const isMissing = alarm.days.some(
        (day) => !alarm.notificationIds[String(day)] || !liveIds.has(alarm.notificationIds[String(day)]),
      );
      if (!isMissing) return;
      await cancelAll(alarm.notificationIds);
      const notificationIds = await scheduleForDays(alarm.label, alarm.hour, alarm.minute, alarm.days);
      await updateDoc(doc(db, COL, d.id), { notificationIds });
    }),
  );
};
