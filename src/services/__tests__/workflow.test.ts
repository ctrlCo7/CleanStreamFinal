import { describe, expect, it } from 'vitest';
import { addDaysKey, phDateKey, phInstant, phMinutes, phWeekday, weekdayOfKey } from '../../utils/phTime';
import { describeConflict, findScheduleConflicts, ScheduleSlot, suggestFreeSlot, timesOverlap } from '../scheduleConflicts';
import { checkpointDayStatus, checkpointProgress, CheckpointLike, planCheckpointAlarms } from '../checkpointStatus';

// 2026-11-04 (Wednesday) 09:00 in the Philippines = 01:00 UTC.
const PH_9AM = new Date(Date.UTC(2026, 10, 4, 1, 0));

describe('Philippine Standard Time (UTC+8)', () => {
  it('uses the Philippine date and time whatever the phone is set to', () => {
    expect(phDateKey(PH_9AM)).toBe('2026-11-04');
    expect(phMinutes(PH_9AM)).toBe(9 * 60);
    expect(phWeekday(PH_9AM)).toBe('Wed');
    // 23:30 UTC on Nov 3 is already 07:30 on Nov 4 in the Philippines.
    expect(phDateKey(new Date(Date.UTC(2026, 10, 3, 23, 30)))).toBe('2026-11-04');
    expect(phInstant('2026-11-04', '09:00').getTime()).toBe(PH_9AM.getTime());
    expect(addDaysKey('2026-12-31', 1)).toBe('2027-01-01');
    expect(weekdayOfKey('2026-11-08')).toBe('Sun');
  });
});

const TALAMBAN = { latitude: 10.3540, longitude: 123.9110, address: 'Talamban Rd' };
const FAR = { latitude: 10.3700, longitude: 123.9300, address: 'Upper Talamban' };
const approved = (over: Partial<ScheduleSlot>): ScheduleSlot => ({
  id: 'a1', title: 'Cleanup: RPT-1', status: 'assigned', scheduledDate: '2026-11-05', startTime: '08:00', endTime: '10:00',
  assignedTeamId: 'crewA', assignedTeamName: 'Team A', location: TALAMBAN, equipmentNeeded: ['Gloves'], ...over,
});
const proposal = (over: Partial<ScheduleSlot>): ScheduleSlot => ({
  scheduledDate: '2026-11-05', startTime: '09:00', endTime: '11:00', assignedTeamId: 'crewB', location: FAR, equipmentNeeded: [], ...over,
});

describe('automatic cleanup schedule conflict detection', () => {
  it('only counts overlapping times on the same date', () => {
    expect(timesOverlap(approved({}), proposal({}))).toBe(true);
    expect(timesOverlap(approved({}), proposal({ startTime: '10:00', endTime: '12:00' }))).toBe(false); // back to back
    expect(timesOverlap(approved({}), proposal({ scheduledDate: '2026-11-06' }))).toBe(false);
  });

  it('declines the same crew at the same time', () => {
    const c = findScheduleConflicts(proposal({ assignedTeamId: 'crewA' }), [approved({})]);
    expect(c).toHaveLength(1);
    expect(c[0].reasons).toEqual(['same_crew']);
    expect(describeConflict(c[0])).toContain('the same crew (Team A)');
    expect(describeConflict(c[0])).toContain('2026-11-05, 8:00 AM–10:00 AM');
  });

  it('declines the same location at the same time', () => {
    const near = { latitude: 10.3545, longitude: 123.9112 }; // ~60 m away
    expect(findScheduleConflicts(proposal({ location: near }), [approved({})])[0].reasons).toEqual(['same_location']);
  });

  it('declines when both need the barangay truck or boat, but not gloves', () => {
    expect(findScheduleConflicts(proposal({ equipmentNeeded: ['Truck'] }), [approved({ equipmentNeeded: ['Truck', 'Gloves'] })])[0].reasons)
      .toEqual(['shared_resource']);
    expect(findScheduleConflicts(proposal({ equipmentNeeded: ['Gloves'] }), [approved({})])).toEqual([]);
  });

  it('lets different crews at different places work at the same time', () => {
    expect(findScheduleConflicts(proposal({}), [approved({})])).toEqual([]);
  });

  it('ignores schedules that are not approved, and itself', () => {
    for (const status of ['proposed', 'declined', 'rejected', 'cancelled', 'completed']) {
      expect(findScheduleConflicts(proposal({ assignedTeamId: 'crewA' }), [approved({ status })])).toEqual([]);
    }
    expect(findScheduleConflicts(approved({}), [approved({})])).toEqual([]);
  });

  it('suggests the next free time for a declined request', () => {
    const slot = suggestFreeSlot(proposal({ assignedTeamId: 'crewA' }), [approved({})], { addDays: addDaysKey });
    expect(slot).toEqual({ scheduledDate: '2026-11-05', startTime: '06:00', endTime: '08:00' });
    const later = suggestFreeSlot(proposal({ assignedTeamId: 'crewA' }), [approved({})],
      { addDays: addDaysKey, earliestDate: '2026-11-05', earliestTime: '07:10' });
    expect(later).toEqual({ scheduledDate: '2026-11-05', startTime: '10:00', endTime: '12:00' });
  });
});

const cp = (over: Partial<CheckpointLike>): CheckpointLike => ({
  id: 'cp1', name: 'Mahiga Creek bridge', days: ['Mon', 'Tue', 'Wed', 'Thu', 'Fri'], time: '07:00', isActive: true, assignedUserIds: ['me'], ...over,
});

describe('daily checkpoint status', () => {
  const at = (hh: number, mm = 0) => new Date(Date.UTC(2026, 10, 4, hh - 8, mm)); // PH time on Wed Nov 4
  it('is pending before and just after its time, then missed', () => {
    expect(checkpointDayStatus(cp({}), at(6))).toBe('pending');
    expect(checkpointDayStatus(cp({}), at(8, 59))).toBe('pending');
    expect(checkpointDayStatus(cp({}), at(9))).toBe('missed');
  });
  it('is ongoing once started, and completed or issue once inspected today', () => {
    expect(checkpointDayStatus(cp({ inspectionStartedAt: at(7, 5) }), at(10))).toBe('ongoing');
    expect(checkpointDayStatus(cp({ lastInspectedAt: at(7, 20), lastCondition: 'Mild' }), at(10))).toBe('completed');
    expect(checkpointDayStatus(cp({ lastInspectedAt: at(7, 20), lastCondition: 'Critical' }), at(10))).toBe('issue');
    // Yesterday's inspection doesn't count for today.
    expect(checkpointDayStatus(cp({ lastInspectedAt: new Date(at(7).getTime() - 864e5) }), at(10))).toBe('missed');
  });
  it('is not due on days off or when paused', () => {
    expect(checkpointDayStatus(cp({ days: ['Sat'] }), at(10))).toBe('not_today');
    expect(checkpointDayStatus(cp({ isActive: false }), at(10))).toBe('not_today');
  });
  it('sums up the day', () => {
    const p = checkpointProgress([cp({}), cp({ id: '2', lastInspectedAt: at(7), lastCondition: 'Clean' }), cp({ id: '3', days: ['Sun'] })], at(10));
    expect(p).toMatchObject({ dueToday: 2, done: 1, missed: 1, completed: 1 });
  });
});

describe('daily checkpoint alarms', () => {
  const now = new Date(Date.UTC(2026, 10, 4, 6 - 8, 0)); // 06:00 PH, Wed
  it('rings at the inspection time (PH) and reminds an hour later, on scheduled days only', () => {
    const plan = planCheckpointAlarms([cp({})], 'me', now, 7);
    // Wed–Fri this week + Mon–Tue next week = 5 days x 2
    expect(plan).toHaveLength(10);
    expect(plan[0]).toMatchObject({ kind: 'due', dateKey: '2026-11-04' });
    expect(plan[0].at.getTime()).toBe(phInstant('2026-11-04', '07:00').getTime());
    expect(plan[1].at.getTime()).toBe(phInstant('2026-11-04', '08:00').getTime());
    expect(plan.some((a) => a.dateKey === '2026-11-07' || a.dateKey === '2026-11-08')).toBe(false); // weekend
  });
  it("skips today's once inspected, and other officials' checkpoints", () => {
    const done = planCheckpointAlarms([cp({ lastInspectedAt: now })], 'me', now, 1);
    expect(done).toEqual([]);
    expect(planCheckpointAlarms([cp({ assignedUserIds: ['someoneElse'] })], 'me', now, 7)).toEqual([]);
    expect(planCheckpointAlarms([cp({ assignedUserIds: [] })], 'me', now, 1)).toHaveLength(2); // nobody assigned: everyone
  });
  it('works even with no reports or cleanups at all (alarms come from the checkpoints alone)', () => {
    expect(planCheckpointAlarms([cp({})], 'me', now, 14).length).toBeGreaterThan(0);
  });
});
