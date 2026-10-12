/**
 * Daily waterway checkpoint alarm -- admin sets one time per barangay
 * ("every day at 7:00 AM, check the waterway"), and every barangay official
 * assigned to that barangay gets their phone ring/notify at that time.
 * Barangay officials cannot set or edit this themselves (see firestore.rules:
 * checkpointAlarms is admin-write, authenticated-read only) -- it is purely
 * admin-configured, then fanned out to devices via local scheduling.
 *
 * This is entirely on-device local scheduling via expo-notifications -- no
 * backend, no Cloud Functions, no push server -- so it works the same
 * whether or not Firebase Functions/Blaze billing is ever enabled. Firestore
 * is only the source of truth for what the admin configured (so the alarm
 * shows up correctly if an official reinstalls or switches devices); the
 * actual ringing is scheduled with the OS via scheduleNotificationAsync,
 * using a fixed identifier so re-scheduling after an admin change just
 * replaces the one standing alarm rather than accumulating duplicates.
 */
import * as Notifications from 'expo-notifications';
import { collection, doc, getDoc, onSnapshot, serverTimestamp, setDoc } from 'firebase/firestore';
import { db } from './firebase';

const COL = 'checkpointAlarms';
const CHANNEL_ID = 'waterway-alarm';
const CHECKPOINT_NOTIFICATION_ID = 'daily-checkpoint-alarm';

export interface CheckpointAlarmConfig {
  barangayId: string;
  barangayName: string;
  hour: number;
  minute: number;
  updatedBy: string;
  updatedByName: string;
  updatedAt: string;
}

const toConfig = (barangayId: string, data: Record<string, unknown>): CheckpointAlarmConfig => ({
  barangayId,
  barangayName: (data.barangayName as string) ?? '—',
  hour: typeof data.hour === 'number' ? data.hour : 7,
  minute: typeof data.minute === 'number' ? data.minute : 0,
  updatedBy: (data.updatedBy as string) ?? '',
  updatedByName: (data.updatedByName as string) ?? 'Admin',
  updatedAt: (data.updatedAt as { toDate?: () => Date })?.toDate?.().toISOString() ?? new Date().toISOString(),
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
    name: 'Daily checkpoint alarm',
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

// ─── Admin: set the checkpoint time for a barangay ─────────────────────────

export const setCheckpointAlarm = async (
  barangayId: string,
  barangayName: string,
  hour: number,
  minute: number,
  adminUid: string,
  adminName: string,
): Promise<void> => {
  await setDoc(doc(db, COL, barangayId), {
    barangayId,
    barangayName,
    hour,
    minute,
    updatedBy: adminUid,
    updatedByName: adminName,
    updatedAt: serverTimestamp(),
  });
};

/** Admin dashboard: live list of every barangay's current checkpoint config. */
export const subscribeToAllCheckpointAlarms = (
  callback: (configs: CheckpointAlarmConfig[]) => void,
) => {
  // No query needed -- admin can read the whole small (one doc per barangay)
  // collection directly; sorted client-side by barangay name for a stable list.
  return onSnapshot(collection(db, COL), (snap) => {
    const configs = snap.docs.map((d) => toConfig(d.id, d.data()));
    configs.sort((a, b) => a.barangayName.localeCompare(b.barangayName));
    callback(configs);
  });
};

// ─── Barangay official: read + locally schedule their own barangay's alarm ─

export const getCheckpointAlarm = async (barangayId: string): Promise<CheckpointAlarmConfig | null> => {
  const snap = await getDoc(doc(db, COL, barangayId));
  if (!snap.exists()) return null;
  return toConfig(snap.id, snap.data());
};

export const subscribeToCheckpointAlarm = (
  barangayId: string,
  callback: (config: CheckpointAlarmConfig | null) => void,
) => {
  return onSnapshot(doc(db, COL, barangayId), (snap) => {
    callback(snap.exists() ? toConfig(snap.id, snap.data()) : null);
  });
};

/** Cancels any existing locally-scheduled checkpoint alarm and, if a config
 * is given, reschedules it as a daily OS-level alarm at that time. Call this
 * whenever the barangay official's screen mounts and whenever their
 * barangay's config changes (including becoming unset), so the phone's real
 * alarm state always matches what the admin last configured -- the OS can
 * also silently drop scheduled notifications (app reinstall, notification
 * permission revoked then regranted, Android force-stop), so this doubles
 * as the defensive re-sync for that case too. */
export const reconcileDailyCheckpointAlarm = async (config: CheckpointAlarmConfig | null): Promise<void> => {
  await initAlarmChannel();
  await Notifications.cancelScheduledNotificationAsync(CHECKPOINT_NOTIFICATION_ID).catch(() => {});
  if (!config) return;

  const granted = await requestAlarmPermissions();
  if (!granted) return;

  await Notifications.scheduleNotificationAsync({
    identifier: CHECKPOINT_NOTIFICATION_ID,
    content: {
      title: '🌊 Daily waterway checkpoint',
      body: `Time to check the waterway in ${config.barangayName}.`,
      sound: 'default',
      data: { type: 'checkpoint_alarm', barangayId: config.barangayId },
    },
    trigger: {
      type: Notifications.SchedulableTriggerInputTypes.DAILY,
      hour: config.hour,
      minute: config.minute,
      channelId: CHANNEL_ID,
    },
  });
};
