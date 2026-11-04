/**
 * Automatic daily checkpoint alarms on an official's phone: for each checkpoint they are
 * assigned to, an alarm when the inspection is due (Philippine time) and a reminder an hour
 * later, for the next two weeks. Rebuilt whenever the checkpoints change (an inspection
 * submitted, a schedule edited) and whenever the app opens, so it always matches. Purely
 * local scheduling: it rings even with no new reports, no cleanups and no connection.
 */
import { getNotifications } from './notificationsModule';
import { initAlarmChannel, requestAlarmPermissions } from './alarmService';
import { appSettings } from './appSettings';
import { isOn, notificationPrefs } from './notificationPrefs';
import { CheckpointLike, planCheckpointAlarms } from './checkpointStatus';

const PREFIX = 'cp-';
const CHANNEL_ID = 'waterway-alarm';
// iPhones keep at most 64 scheduled notifications per app (the barangay alarm uses one).
const MAX_SCHEDULED = 50;

const fmt = (d: Date) => {
  // Philippine time for the text (UTC+8).
  const s = new Date(d.getTime() + 8 * 3600000);
  const h = s.getUTCHours();
  return `${h % 12 === 0 ? 12 : h % 12}:${String(s.getUTCMinutes()).padStart(2, '0')} ${h < 12 ? 'AM' : 'PM'}`;
};

export async function syncCheckpointAlarms(checkpoints: CheckpointLike[], userId: string): Promise<number> {
  const N = getNotifications();
  if (!N) return 0;
  const cancelOurs = async () => {
    const all = await N.getAllScheduledNotificationsAsync().catch(() => []);
    await Promise.all(all.filter((n) => n.identifier.startsWith(PREFIX))
      .map((n) => N.cancelScheduledNotificationAsync(n.identifier).catch(() => undefined)));
  };
  // Off when the Super Admin turned inspection reminders off, or the official muted alarms.
  if (!appSettings().notifications.inspectionReminders || !isOn(notificationPrefs(), 'dailyAlarm')) {
    await cancelOurs();
    return 0;
  }
  await initAlarmChannel();
  if (!(await requestAlarmPermissions())) return 0;
  await cancelOurs();
  const plan = planCheckpointAlarms(checkpoints, userId).slice(0, MAX_SCHEDULED);
  for (const a of plan) {
    await N.scheduleNotificationAsync({
      identifier: a.id,
      content: a.kind === 'due'
        ? { title: `🌊 Checkpoint inspection due: ${a.checkpointName}`, body: `Inspect ${a.checkpointName} now (${fmt(a.at)}). Take a photo as proof.`, sound: 'default', data: { type: 'checkpoint_due', checkpointId: a.checkpointId } }
        : { title: `⏰ Not inspected yet: ${a.checkpointName}`, body: `${a.checkpointName} was due an hour ago. Inspect it soon or it will be marked missed.`, sound: 'default', data: { type: 'checkpoint_reminder', checkpointId: a.checkpointId } },
      trigger: { type: N.SchedulableTriggerInputTypes.DATE, date: a.at, channelId: CHANNEL_ID },
    }).catch((e) => console.warn('[CheckpointAlarm] Could not schedule (non-fatal):', e));
  }
  return plan.length;
}
