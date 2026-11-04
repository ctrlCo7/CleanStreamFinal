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
