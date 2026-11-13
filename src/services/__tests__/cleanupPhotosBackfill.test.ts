import { describe, expect, it } from 'vitest';

import { cleanupResultOf, reportsMissingCleanupPhotos } from '../cleanupResult';
import { CleanupTask, WasteReport } from '../../types';

const task = (over: Partial<CleanupTask> = {}) => ({
  id: 't1', reportId: 'r1', status: 'completed', assignedTeamName: 'Crew A',
  beforePhotoURLs: ['https://img/before.jpg'], afterPhotoURLs: ['https://img/after.jpg'],
  wasteCollectedKg: 12, completionNotes: 'Drain cleared', confirmedAt: '2026-11-10T03:00:00.000Z', ...over,
}) as CleanupTask;
const report = (over: Partial<WasteReport> = {}) => ({ id: 'r1', status: 'completed', cleanupTaskId: 't1', ...over }) as WasteReport;

describe('before/after photos of cleanups confirmed on an older app version', () => {
  it('finds completed reports that are missing them', () => {
    expect(reportsMissingCleanupPhotos([report()], [task()])).toEqual([{ report: report(), task: task() }]);
  });

  it('finds the cleanup by report when the report has no task link', () => {
    expect(reportsMissingCleanupPhotos([report({ cleanupTaskId: undefined })], [task()])).toHaveLength(1);
  });

  it('leaves reports that already have them, are not completed, or whose cleanup is not finished', () => {
    const has = report({ cleanupResult: { beforePhotoURLs: [], afterPhotoURLs: [], confirmedAt: 'x' } });
    expect(reportsMissingCleanupPhotos([has], [task()])).toEqual([]);
    expect(reportsMissingCleanupPhotos([report({ status: 'in_progress' })], [task()])).toEqual([]);
    expect(reportsMissingCleanupPhotos([report()], [task({ status: 'cancelled' })])).toEqual([]);
  });

  it("copies the crew's photos, name, weight, notes and the confirmation time", () => {
    expect(cleanupResultOf(task())).toEqual({
      beforePhotoURLs: ['https://img/before.jpg'], afterPhotoURLs: ['https://img/after.jpg'],
      confirmedAt: '2026-11-10T03:00:00.000Z', crewName: 'Crew A', wasteCollectedKg: 12, notes: 'Drain cleared',
    });
  });
});
