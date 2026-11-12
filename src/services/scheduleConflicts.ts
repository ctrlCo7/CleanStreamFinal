/**
 * Automatic cleanup schedule conflict detection. Before a proposed cleanup goes to the
 * Barangay Captain, and again at the moment of approval, it is checked against every
 * APPROVED cleanup in the barangay. It conflicts when it overlaps one in time (same date,
 * overlapping hours) AND shares any of:
 *  - the same crew (personnel),
 *  - the same place (within SAME_PLACE_M metres),
 *  - a limited resource both need (the barangay's truck or boat).
 * A conflicting request is declined automatically, with the reason and the conflicting
 * schedule, and a free time is suggested instead. Pure, so it is unit-tested.
 */
import { distanceM } from './reportProximity';
import { hhmmToMinutes } from '../utils/phTime';

/** Two cleanups closer than this are at the same place. */
export const SAME_PLACE_M = 150;
/** Equipment a barangay usually has only one of, so two cleanups can't both use it at once. */
export const LIMITED_RESOURCES = ['Truck', 'Boat'];
/** Statuses of approved cleanups that still hold their time slot. */
export const APPROVED_STATUSES = ['assigned', 'accepted', 'in_progress'] as const;

export interface ScheduleSlot {
  id?: string;
  title?: string;
  status?: string;
  scheduledDate: string;   // YYYY-MM-DD (Philippine date)
  startTime: string;       // HH:mm
  endTime: string;         // HH:mm
  assignedTeamId: string;
  assignedTeamName?: string;
  location: { latitude: number; longitude: number; address?: string; barangay?: string };
  equipmentNeeded?: string[];
}

export type ConflictReason = 'same_crew' | 'same_location' | 'shared_resource';

export interface ScheduleConflict {
  with: ScheduleSlot;
  reasons: ConflictReason[];
  /** The limited resources both need, when that is a reason. */
  resources: string[];
}

/**
 * Why a schedule can't be proposed at all, or null if it's valid: a real date and times,
 * ending after it starts, and not in the past (Philippine date/time `today`/`nowMinutes`).
 */
export function scheduleInputProblem(
  s: Pick<ScheduleSlot, 'scheduledDate' | 'startTime' | 'endTime'>,
  today: string,
  nowMinutes: number,
): string | null {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(s.scheduledDate ?? '');
  if (!m) return 'Pick a date for the cleanup.';
  const d = new Date(Date.UTC(Number(m[1]), Number(m[2]) - 1, Number(m[3])));
  if (d.getUTCMonth() !== Number(m[2]) - 1 || d.getUTCDate() !== Number(m[3])) return 'That date does not exist.';
  const start = hhmmToMinutes(s.startTime), end = hhmmToMinutes(s.endTime);
  if (!Number.isFinite(start) || !Number.isFinite(end)) return 'Pick a start and end time.';
  if (end <= start) return 'The end time must be after the start time.';
  if (s.scheduledDate < today) return 'The date has already passed.';
  if (s.scheduledDate === today && start < nowMinutes) return 'That start time has already passed today.';
  return null;
}

/**
 * Worker availability: a cleanup can't ask for more workers than the crew has (the crew size
 * the Super Admin set on the crew's account). Null when fine or when either number is unknown.
 */
export function workerProblem(needed: number | undefined, crewSize: number | undefined, crewName: string): string | null {
  if (!needed || !crewSize || needed <= crewSize) return null;
  return `${crewName} has ${crewSize} worker${crewSize === 1 ? '' : 's'}, but this cleanup needs ${needed}. Pick a bigger crew or fewer workers.`;
}

/** A schedule that fell through: declined for a conflict, rejected by the Captain, or turned down by the crew. */
export const FAILED_SCHEDULE_STATUSES = ['declined', 'rejected', 'cancelled'] as const;

/**
 * The fallen-through schedules whose report still needs a new one: only when the report has no
 * other schedule waiting, approved or finished, and only one (the latest) per report. Without
 * this, a schedule stayed in "needs a new proposal" after a new one was already made.
 */
export function schedulesNeedingNewProposal<T extends { id: string; reportId: string; status: string; updatedAt?: unknown; createdAt?: unknown }>(tasks: T[]): T[] {
  const failed = (s: string) => (FAILED_SCHEDULE_STATUSES as readonly string[]).includes(s);
  const covered = new Set(tasks.filter((t) => !failed(t.status)).map((t) => t.reportId));
  const stamp = (t: T) => {
    const v = (t.updatedAt ?? t.createdAt) as { toMillis?: () => number } | string | number | undefined;
    if (v && typeof v === 'object' && typeof v.toMillis === 'function') return v.toMillis();
    const n = typeof v === 'string' ? Date.parse(v) : typeof v === 'number' ? v : NaN;
    return Number.isFinite(n) ? n : 0;
  };
  const latest = new Map<string, T>();
  for (const t of tasks) {
    if (!failed(t.status) || covered.has(t.reportId)) continue;
    const seen = latest.get(t.reportId);
    if (!seen || stamp(t) >= stamp(seen)) latest.set(t.reportId, t);
  }
  return [...latest.values()];
}

export function timesOverlap(a: Pick<ScheduleSlot, 'scheduledDate' | 'startTime' | 'endTime'>, b: Pick<ScheduleSlot, 'scheduledDate' | 'startTime' | 'endTime'>): boolean {
  if (a.scheduledDate !== b.scheduledDate) return false;
  const as = hhmmToMinutes(a.startTime), ae = hhmmToMinutes(a.endTime);
  const bs = hhmmToMinutes(b.startTime), be = hhmmToMinutes(b.endTime);
  if (![as, ae, bs, be].every(Number.isFinite)) return true; // unreadable times: treat as clashing, to be safe
  return as < be && bs < ae;
}

/** Every approved cleanup the candidate clashes with, and why. Empty means it's free. */
export function findScheduleConflicts(candidate: ScheduleSlot, existing: ScheduleSlot[]): ScheduleConflict[] {
  const out: ScheduleConflict[] = [];
  const mine = new Set((candidate.equipmentNeeded ?? []).filter((e) => LIMITED_RESOURCES.includes(e)));
  for (const other of existing) {
    if (candidate.id && other.id === candidate.id) continue;
    if (other.status && !(APPROVED_STATUSES as readonly string[]).includes(other.status)) continue;
    if (!timesOverlap(candidate, other)) continue;
    const reasons: ConflictReason[] = [];
    if (other.assignedTeamId && other.assignedTeamId === candidate.assignedTeamId) reasons.push('same_crew');
    const a = candidate.location, b = other.location;
    if (a && b && distanceM(a.latitude, a.longitude, b.latitude, b.longitude) <= SAME_PLACE_M) reasons.push('same_location');
    const resources = (other.equipmentNeeded ?? []).filter((e) => mine.has(e));
    if (resources.length) reasons.push('shared_resource');
    if (reasons.length) out.push({ with: other, reasons, resources });
  }
  return out;
}

const fmt12 = (hhmm: string) => {
  const m = hhmmToMinutes(hhmm);
  if (!Number.isFinite(m)) return hhmm;
  const h = Math.floor(m / 60), mm = m % 60;
  return `${h % 12 === 0 ? 12 : h % 12}:${String(mm).padStart(2, '0')} ${h < 12 ? 'AM' : 'PM'}`;
};

/** One line per conflict, e.g. "Same crew (Team A) and the truck — Cleanup: RPT-… on 2026-11-05, 8:00 AM–10:00 AM at Talamban". */
export function describeConflict(c: ScheduleConflict): string {
  const why = c.reasons.map((r) => (r === 'same_crew'
    ? `the same crew (${c.with.assignedTeamName || 'crew'})`
    : r === 'same_location' ? 'the same location'
      : `the ${c.resources.map((x) => x.toLowerCase()).join(' and ')}`)).join(', ');
  const place = c.with.location?.address || c.with.location?.barangay || '';
  return `Uses ${why} at the same time as "${c.with.title || 'another cleanup'}" on ${c.with.scheduledDate}, `
    + `${fmt12(c.with.startTime)}–${fmt12(c.with.endTime)}${place ? ` at ${place}` : ''}.`;
}

/**
 * The earliest free slot of the same length for this crew/place/resources, from the
 * requested day onward, within working hours. Searches `days` days in 30-minute steps.
 */
export function suggestFreeSlot(
  candidate: ScheduleSlot,
  existing: ScheduleSlot[],
  opts: { days?: number; dayStart?: string; dayEnd?: string; earliestDate?: string; earliestTime?: string; addDays: (key: string, n: number) => string } ,
): { scheduledDate: string; startTime: string; endTime: string } | null {
  const len = hhmmToMinutes(candidate.endTime) - hhmmToMinutes(candidate.startTime);
  if (!Number.isFinite(len) || len <= 0) return null;
  const dayStart = hhmmToMinutes(opts.dayStart ?? '06:00');
  const dayEnd = hhmmToMinutes(opts.dayEnd ?? '18:00');
  const toHHmm = (m: number) => `${String(Math.floor(m / 60)).padStart(2, '0')}:${String(m % 60).padStart(2, '0')}`;
  for (let i = 0; i < (opts.days ?? 7); i++) {
    const date = opts.addDays(candidate.scheduledDate, i);
    if (opts.earliestDate && date < opts.earliestDate) continue;
    let from = dayStart;
    if (opts.earliestDate && date === opts.earliestDate && opts.earliestTime) {
      const t = hhmmToMinutes(opts.earliestTime);
      from = Math.max(from, Math.ceil(t / 30) * 30);
    }
    for (let s = from; s + len <= dayEnd; s += 30) {
      const slot = { ...candidate, scheduledDate: date, startTime: toHHmm(s), endTime: toHHmm(s + len) };
      if (findScheduleConflicts(slot, existing).length === 0) return { scheduledDate: date, startTime: slot.startTime, endTime: slot.endTime };
    }
  }
  return null;
}
