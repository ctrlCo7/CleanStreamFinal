import { useEffect } from 'react';
import { User } from '../types';
import { subscribeToTeamTasks } from '../services/cleanupTaskService';
import { getNotifications } from '../services/notificationsModule';
import { planCleanupReminders } from '../services/cleanupReminders';
import { appSettings } from '../services/appSettings';
import { isOn, notificationPrefs } from '../services/notificationPrefs';

/** Keeps the crew leader's "cleanup tomorrow" / "in 1 hour" reminders in step with their approved tasks. */
export function useCleanupReminders(user: User | null | undefined) {
  const uid = user?.role === 'cleanup_team' ? user.uid : undefined;
  useEffect(() => {
    const N = getNotifications();
    if (!uid || !N) return undefined;
    return subscribeToTeamTasks(uid, (tasks) => {
      (async () => {
        const all = await N.getAllScheduledNotificationsAsync().catch(() => []);
        await Promise.all(all.filter((n) => n.identifier.startsWith('task-'))
          .map((n) => N.cancelScheduledNotificationAsync(n.identifier).catch(() => undefined)));
        if (!appSettings().notifications.enablePush || !isOn(notificationPrefs(), 'tasks')) return;
        for (const r of planCleanupReminders(tasks)) {
          await N.scheduleNotificationAsync({
            identifier: r.id,
            content: { title: r.title, body: r.body, sound: 'default', data: { type: 'task_updated', taskId: r.taskId } },
            trigger: { type: N.SchedulableTriggerInputTypes.DATE, date: r.at, channelId: 'cleanstream-updates' },
          }).catch((e) => console.warn('[Reminders] Could not schedule (non-fatal):', e));
        }
      })().catch((e) => console.warn('[Reminders] Sync failed (non-fatal):', e));
    }, (e) => console.warn('[Reminders] Could not load tasks:', e));
  }, [uid]);
}
