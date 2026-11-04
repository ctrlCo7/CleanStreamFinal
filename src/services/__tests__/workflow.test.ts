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

describe('QA regressions', () => {
  it('maps a 0–100 severity score to the same level as the AI does (75/50/25)', async () => {
    const { severityFromScore } = await import('../../utils/mapUtils');
    expect([0, 24, 25, 49, 50, 74, 75, 100].map(severityFromScore))
      .toEqual(['low', 'low', 'moderate', 'moderate', 'high', 'high', 'critical', 'critical']);
  });

  it('refuses schedules that are impossible or in the past (Philippine time)', async () => {
    const { scheduleInputProblem } = await import('../scheduleConflicts');
    const ok = { scheduledDate: '2026-11-05', startTime: '08:00', endTime: '10:00' };
    expect(scheduleInputProblem(ok, '2026-11-04', 600)).toBeNull();
    expect(scheduleInputProblem({ ...ok, endTime: '08:00' }, '2026-11-04', 600)).toContain('end time');
    expect(scheduleInputProblem({ ...ok, scheduledDate: '2026-11-03' }, '2026-11-04', 600)).toContain('passed');
    expect(scheduleInputProblem({ ...ok, scheduledDate: '2026-11-04' }, '2026-11-04', 9 * 60)).toContain('already passed today');
    expect(scheduleInputProblem({ ...ok, scheduledDate: '2026-02-31' }, '2026-01-01', 0)).toContain('does not exist');
    expect(scheduleInputProblem({ ...ok, startTime: '' }, '2026-11-04', 0)).toContain('start and end');
  });

  it('opens the right screen for each role when a notification is tapped', async () => {
    const { notificationTarget } = await import('../notificationRouting');
    expect(notificationTarget({ type: 'schedule_proposed', taskId: 't' }, 'admin')).toEqual({ screen: 'AdminApprovals' });
    expect(notificationTarget({ type: 'schedule_declined', taskId: 't' }, 'barangay')).toEqual({ screen: 'CleanupTaskDetail', params: { taskId: 't' } });
    expect(notificationTarget({ type: 'report_submitted', reportId: 'r' }, 'barangay')).toEqual({ screen: 'BarangayVerifyDetail', params: { reportId: 'r' } });
    expect(notificationTarget({ type: 'report_forwarded', reportId: 'r' }, 'admin')).toEqual({ screen: 'AdminSchedule', params: { reportId: 'r' } });
    expect(notificationTarget({ type: 'report_assigned', reportId: 'r', taskId: 't' }, 'citizen')).toEqual({ screen: 'CitizenDetail', params: { reportId: 'r' } });
    expect(notificationTarget({ type: 'checkpoint_missed' }, 'admin')).toEqual({ screen: 'AdminTabs', params: { screen: 'AdminHistory' } });
    expect(notificationTarget({ type: 'checkpoint_missed' }, 'barangay')).toEqual({ screen: 'BarangayTabs', params: { screen: 'BarangayReport' } });
    expect(notificationTarget({ type: 'system' }, 'citizen')).toBeNull();
  });

  it('applies the duplicate (50 m, 24 h) and hotspot (100 m, 90 days, 3 reports) limits inclusively', async () => {
    const { findProximity } = await import('../reportProximity');
    const now = new Date(Date.UTC(2026, 10, 4));
    const here = { latitude: 10.3, longitude: 123.9 };
    const north = (m: number) => ({ latitude: 10.3 + m / 111195, longitude: 123.9 });
    const mk = (id: string, m: number, hoursAgo: number, status = 'pending') => ({
      id, reportNumber: id, ...north(m), createdAt: new Date(now.getTime() - hoursAgo * 3600000), status,
    });
    expect(findProximity(here, [mk('a', 49.9, 23.9)], 'self', now).duplicateOf?.id).toBe('a');
    expect(findProximity(here, [mk('a', 50.5, 1)], 'self', now).duplicateOf).toBeUndefined();     // just beyond 50 m
    expect(findProximity(here, [mk('a', 10, 24.1)], 'self', now).duplicateOf).toBeUndefined();    // just beyond 24 h
    expect(findProximity(here, [mk('a', 10, 1, 'rejected')], 'self', now).duplicateOf).toBeUndefined();
    const hot = findProximity(here, [mk('a', 99, 24 * 89), mk('b', 60, 5)], 'self', now);
    expect(hot).toMatchObject({ nearbyCount: 3, isHotspot: true });
    expect(findProximity(here, [mk('a', 99, 24 * 91), mk('b', 101, 5)], 'self', now).isHotspot).toBe(false); // outside 90 days / 100 m
  });

  it('shows dates and times in Philippine time, whatever the phone is set to', async () => {
    const { formatClock, formatDay, toDateKey } = await import('../../utils/dates');
    const late = new Date(Date.UTC(2026, 10, 3, 17, 30)); // 01:30 on Nov 4 in the Philippines
    expect(formatClock(late)).toBe('1:30 AM');
    expect(formatDay(late)).toBe('Nov 4, 2026');
    expect(toDateKey(late)).toBe('2026-11-04');
  });
});

describe('hotspots on the map', () => {
  it('marks 3+ open reports within 100 m (last 90 days) as one hotspot, and updates as reports close', async () => {
    const { findHotspots } = await import('../reportProximity');
    const now = new Date(Date.UTC(2026, 10, 4));
    const at = (id: string, northM: number, daysAgo = 1, status = 'pending') =>
      ({ id, latitude: 10.3 + northM / 111195, longitude: 123.9, createdAt: new Date(now.getTime() - daysAgo * 864e5), status });
    const three = [at('a', 0), at('b', 40), at('c', 80)];
    const hs = findHotspots(three, now);
    expect(hs).toHaveLength(1);
    expect(hs[0].count).toBe(3);
    // One cleaned up: no longer a hotspot. One too old or too far: not counted.
    expect(findHotspots([at('a', 0), at('b', 40), at('c', 80, 1, 'completed')], now)).toEqual([]);
    expect(findHotspots([at('a', 0), at('b', 40), at('c', 80, 91)], now)).toEqual([]);
    expect(findHotspots([at('a', 0), at('b', 40), at('c', 250)], now)).toEqual([]);
    // Two separate areas, each counted once.
    const two = findHotspots([...three, at('d', 5000), at('e', 5050), at('f', 5090)], now);
    expect(two.map((h) => h.count)).toEqual([3, 3]);
  });
});

describe('worker availability', () => {
  it('refuses a cleanup that needs more workers than the crew has', async () => {
    const { workerProblem } = await import('../scheduleConflicts');
    expect(workerProblem(8, 6, 'Team A')).toContain('Team A has 6 workers, but this cleanup needs 8');
    expect(workerProblem(6, 6, 'Team A')).toBeNull();
    expect(workerProblem(undefined, 6, 'Team A')).toBeNull(); // not specified
    expect(workerProblem(8, undefined, 'Team A')).toBeNull(); // crew size not recorded yet
  });
});

describe('message notifications', () => {
  it('open the Messages tab of the right app', async () => {
    const { notificationTarget } = await import('../notificationRouting');
    expect(notificationTarget({ type: 'message' }, 'citizen')).toEqual({ screen: 'CitizenTabs', params: { screen: 'CitizenMessages' } });
    expect(notificationTarget({ type: 'message' }, 'barangay')).toEqual({ screen: 'BarangayTabs', params: { screen: 'BarangayMessages' } });
    expect(notificationTarget({ type: 'message' }, 'admin')).toEqual({ screen: 'AdminTabs', params: { screen: 'AdminMessages' } });
  });
});

describe('upcoming cleanup reminders', () => {
  it('remind the crew the evening before and an hour before, in Philippine time', async () => {
    const { planCleanupReminders } = await import('../cleanupReminders');
    const { phInstant } = await import('../../utils/phTime');
    const now = new Date(Date.UTC(2026, 10, 4, 0, 0)); // Nov 4, 08:00 PHT
    const task = { id: 't1', title: 'Cleanup: RPT-1', scheduledDate: '2026-11-06', startTime: '08:00', status: 'accepted' };
    const plan = planCleanupReminders([task], now);
    expect(plan.map((p) => p.id)).toEqual(['task-t1-eve', 'task-t1-1h']);
    expect(plan[0].at.getTime()).toBe(phInstant('2026-11-05', '18:00').getTime());
    expect(plan[1].at.getTime()).toBe(phInstant('2026-11-06', '07:00').getTime());
    // Not approved yet, finished, or already past: no reminders.
    expect(planCleanupReminders([{ ...task, status: 'proposed' }], now)).toEqual([]);
    expect(planCleanupReminders([{ ...task, status: 'completed' }], now)).toEqual([]);
    expect(planCleanupReminders([{ ...task, scheduledDate: '2026-11-04', startTime: '08:30' }], now)).toEqual([]);
  });
});
