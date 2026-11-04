/**
 * Reminders of upcoming cleanups on the crew leader's phone: the evening before (6:00 PM) and
 * one hour before the start, Philippine time. Planned from the crew's approved tasks and
 * rebuilt whenever that list changes, so a cancelled or moved task never rings. Local phone
 * notifications: they work without a connection and with the app closed.
 */
import { addDaysKey, phInstant } from '../utils/phTime';

export interface ReminderTask { id: string; title: string; scheduledDate: string; startTime: string; status: string; location?: { address?: string } }
export interface PlannedReminder { id: string; at: Date; title: string; body: string; taskId: string }

const ACTIVE = ['assigned', 'accepted'];

export function planCleanupReminders(tasks: ReminderTask[], now: Date = new Date()): PlannedReminder[] {
  const out: PlannedReminder[] = [];
  for (const t of tasks) {
    if (!ACTIVE.includes(t.status) || !/^\d{4}-\d{2}-\d{2}$/.test(t.scheduledDate)) continue;
    const start = phInstant(t.scheduledDate, t.startTime);
    const eveBefore = phInstant(addDaysKey(t.scheduledDate, -1), '18:00');
    const hourBefore = new Date(start.getTime() - 3600_000);
    const where = t.location?.address ? ` at ${t.location.address}` : '';
    if (eveBefore > now) out.push({ id: `task-${t.id}-eve`, at: eveBefore, taskId: t.id, title: 'Cleanup tomorrow', body: `${t.title}${where}, starting ${t.startTime}.` });
    if (hourBefore > now) out.push({ id: `task-${t.id}-1h`, at: hourBefore, taskId: t.id, title: 'Cleanup in 1 hour', body: `${t.title}${where} starts at ${t.startTime}.` });
  }
  return out.sort((a, b) => a.at.getTime() - b.at.getTime()).slice(0, 12);
}
