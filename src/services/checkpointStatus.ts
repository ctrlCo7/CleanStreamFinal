/**
 * Daily waterway checkpoint status and alarm plan. Each active checkpoint is due on its
 * days at its inspection time (Philippine time). For "today" it is:
 *   not_today  – not scheduled today
 *   pending    – due today, not inspected yet, not overdue
 *   ongoing    – an official started the inspection today and hasn't submitted it yet
 *   completed  – inspected today, no problem found
 *   issue      – inspected today and the site is in heavy/critical condition (or flagged)
 *   missed     – due today, still not inspected MISSED_AFTER_MIN after its time
 * Pure, so it is unit-tested.
 */
import { addDaysKey, hhmmToMinutes, phDateKey, phInstant, phMinutes, weekdayOfKey, WeekdayShort } from '../utils/phTime';

/** Not inspected this long after the inspection time: missed. */
export const MISSED_AFTER_MIN = 120;
/** A second reminder this long after the inspection time, if still not inspected. */
export const REMINDER_AFTER_MIN = 60;
/** Site conditions that count as an environmental issue. */
export const ISSUE_CONDITIONS = ['Heavy', 'Critical'];

export type CheckpointDayStatus = 'not_today' | 'pending' | 'ongoing' | 'completed' | 'issue' | 'missed';

export const CHECKPOINT_STATUS_LABELS: Record<CheckpointDayStatus, string> = {
  not_today: 'Not scheduled today',
  pending: 'Pending inspection',
  ongoing: 'Inspection ongoing',
  completed: 'Completed',
  issue: 'Issue detected',
  missed: 'Missed checkpoint',
};

export interface CheckpointLike {
  id: string;
  name: string;
  days: string[];           // "Mon".."Sun"
  time: string;             // "HH:mm" Philippine time
  isActive: boolean;
  assignedUserIds: string[];
  lastInspectedAt?: Date;
  lastCondition?: string;
  lastIssue?: boolean;
  inspectionStartedAt?: Date;
}

export const isIssueCondition = (condition?: string) => !!condition && ISSUE_CONDITIONS.includes(condition);

export function checkpointDayStatus(cp: CheckpointLike, now: Date = new Date()): CheckpointDayStatus {
  const today = phDateKey(now);
  if (!cp.isActive || !cp.days.includes(weekdayOfKey(today) as WeekdayShort)) return 'not_today';
  const inspectedToday = !!cp.lastInspectedAt && phDateKey(cp.lastInspectedAt) === today;
  if (inspectedToday) return cp.lastIssue || isIssueCondition(cp.lastCondition) ? 'issue' : 'completed';
  const startedToday = !!cp.inspectionStartedAt && phDateKey(cp.inspectionStartedAt) === today;
  if (startedToday) return 'ongoing';
  const due = hhmmToMinutes(cp.time);
  if (Number.isFinite(due) && phMinutes(now) >= due + MISSED_AFTER_MIN) return 'missed';
  return 'pending';
}

/** Today's progress across checkpoints (those scheduled today only). */
export function checkpointProgress(cps: CheckpointLike[], now: Date = new Date()) {
  const counts: Record<CheckpointDayStatus, number> = { not_today: 0, pending: 0, ongoing: 0, completed: 0, issue: 0, missed: 0 };
  cps.forEach((c) => { counts[checkpointDayStatus(c, now)]++; });
  const dueToday = cps.length - counts.not_today;
  return { ...counts, dueToday, done: counts.completed + counts.issue };
}

export interface PlannedAlarm {
  /** Stable id so re-planning replaces instead of duplicating. */
  id: string;
  at: Date;
  kind: 'due' | 'reminder';
  checkpointId: string;
  checkpointName: string;
  dateKey: string;
}

/**
 * The phone alarms an official should have for their checkpoints over the next `days` days:
 * one when each inspection is due and a reminder REMINDER_AFTER_MIN later. Today's are left
 * out once the checkpoint is inspected (or started), and anything already past is skipped.
 * Checkpoints with nobody assigned remind every official of the barangay.
 */
export function planCheckpointAlarms(cps: CheckpointLike[], userId: string, now: Date = new Date(), days = 14): PlannedAlarm[] {
  const out: PlannedAlarm[] = [];
  const today = phDateKey(now);
  for (const cp of cps) {
    if (!cp.isActive) continue;
    if (cp.assignedUserIds.length > 0 && !cp.assignedUserIds.includes(userId)) continue;
    if (!Number.isFinite(hhmmToMinutes(cp.time))) continue;
    for (let i = 0; i < days; i++) {
      const dateKey = addDaysKey(today, i);
      if (!cp.days.includes(weekdayOfKey(dateKey))) continue;
      if (i === 0) {
        const s = checkpointDayStatus(cp, now);
        if (s === 'completed' || s === 'issue') continue;
      }
      const due = phInstant(dateKey, cp.time);
      const reminder = new Date(due.getTime() + REMINDER_AFTER_MIN * 60000);
      const started = i === 0 && !!cp.inspectionStartedAt && phDateKey(cp.inspectionStartedAt) === today;
      if (due > now && !started) out.push({ id: `cp-${cp.id}-${dateKey}-due`, at: due, kind: 'due', checkpointId: cp.id, checkpointName: cp.name, dateKey });
      if (reminder > now) out.push({ id: `cp-${cp.id}-${dateKey}-rem`, at: reminder, kind: 'reminder', checkpointId: cp.id, checkpointName: cp.name, dateKey });
    }
  }
  return out.sort((a, b) => a.at.getTime() - b.at.getTime());
}
