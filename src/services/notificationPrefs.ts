/**
 * Each person's own notification choices (Profile → Notification settings), saved on their
 * user document as `notificationPrefs`. Muted kinds are hidden from their notification list
 * and badge, and phone alarms/notices they turned off aren't shown.
 * Pure, so it is unit-tested.
 */
import { NotificationType } from '../types';

export type NotificationCategory = 'reports' | 'tasks' | 'community' | 'messages' | 'alerts' | 'dailyAlarm';

export type NotificationPrefs = Partial<Record<NotificationCategory, boolean>>;

export const CATEGORY_TYPES: Record<Exclude<NotificationCategory, 'dailyAlarm'>, NotificationType[]> = {
  reports: ['report_submitted', 'report_verified', 'report_assigned', 'report_in_progress', 'report_completed', 'report_rejected', 'ai_result'],
  tasks: ['task_assigned', 'task_updated'],
  community: ['event_reminder', 'announcement'],
  messages: ['message'],
  alerts: ['system'],
};

export function categoryOf(type: NotificationType): NotificationCategory {
  for (const [cat, types] of Object.entries(CATEGORY_TYPES) as Array<[NotificationCategory, NotificationType[]]>) {
    if (types.includes(type)) return cat;
  }
  return 'alerts';
}

/** Everything is on unless the person turned it off. */
export const isOn = (prefs: NotificationPrefs | undefined, cat: NotificationCategory) => prefs?.[cat] !== false;

export const isMuted = (prefs: NotificationPrefs | undefined, type: NotificationType) => !isOn(prefs, categoryOf(type));

// The signed-in person's choices, kept here so services can apply them.
let current: NotificationPrefs | undefined;
export const setNotificationPrefs = (prefs: NotificationPrefs | undefined) => { current = prefs; };
export const notificationPrefs = () => current;
