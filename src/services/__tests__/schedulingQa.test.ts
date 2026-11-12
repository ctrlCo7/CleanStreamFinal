import { describe, expect, it } from 'vitest';
import { scheduleInputProblem, schedulesNeedingNewProposal } from '../scheduleConflicts';

const t = (id: string, reportId: string, status: string, updatedAt = '2026-11-10T00:00:00Z') => ({ id, reportId, status, updatedAt });

describe('schedules that need a new proposal', () => {
  it('lists a rejected, declined or crew-cancelled schedule while the report has nothing else', () => {
    const out = schedulesNeedingNewProposal([t('a', 'r1', 'rejected'), t('b', 'r2', 'declined'), t('c', 'r3', 'cancelled')]);
    expect(out.map((x) => x.id).sort()).toEqual(['a', 'b', 'c']);
  });

  it('drops it once a new schedule is waiting, approved, in progress or finished', () => {
    for (const status of ['proposed', 'assigned', 'accepted', 'in_progress', 'completed']) {
      expect(schedulesNeedingNewProposal([t('old', 'r1', 'rejected'), t('new', 'r1', status)])).toEqual([]);
    }
  });

  it('counts a report once, keeping its latest fallen-through schedule', () => {
    const out = schedulesNeedingNewProposal([
      t('first', 'r1', 'rejected', '2026-11-08T00:00:00Z'),
      t('second', 'r1', 'declined', '2026-11-09T00:00:00Z'),
    ]);
    expect(out.map((x) => x.id)).toEqual(['second']);
  });

  it('ignores schedules that are fine', () => {
    expect(schedulesNeedingNewProposal([t('a', 'r1', 'proposed'), t('b', 'r2', 'completed')])).toEqual([]);
  });
});

describe('approving a schedule whose time has passed', () => {
  it('is refused when it started earlier today, not only on an earlier day', () => {
    const s = { scheduledDate: '2026-11-11', startTime: '08:00', endTime: '10:00' };
    expect(scheduleInputProblem(s, '2026-11-11', 15 * 60)).toMatch(/already passed/);
    expect(scheduleInputProblem(s, '2026-11-12', 6 * 60)).toMatch(/already passed/);
    expect(scheduleInputProblem(s, '2026-11-11', 7 * 60)).toBeNull();
  });
});
