/** The before/after photos a reporter sees once their report is cleaned up. */
import { CleanupResult, CleanupTask, WasteReport } from '../types';

/** What the reporter sees of a finished cleanup: the crew's before/after photos and notes. */
export const cleanupResultOf = (t: CleanupTask, confirmedAt?: string): CleanupResult => ({
  beforePhotoURLs: t.beforePhotoURLs ?? [],
  afterPhotoURLs: t.afterPhotoURLs ?? [],
  confirmedAt: confirmedAt ?? t.confirmedAt ?? new Date().toISOString(),
  ...(t.assignedTeamName ? { crewName: t.assignedTeamName } : {}),
  ...(typeof t.wasteCollectedKg === 'number' ? { wasteCollectedKg: t.wasteCollectedKg } : {}),
  ...(t.completionNotes ? { notes: t.completionNotes } : {}),
});

/**
 * Completed reports that are missing their before/after photos: cleanups confirmed on an app
 * version from before the photos were copied onto the report. Pairs each with its finished task.
 */
export const reportsMissingCleanupPhotos = (reports: WasteReport[], tasks: CleanupTask[]) =>
  reports.flatMap((r) => {
    if (r.status !== 'completed' || r.cleanupResult) return [];
    const task = tasks.find((t) => t.status === 'completed' && (t.id === r.cleanupTaskId || t.reportId === r.id));
    return task ? [{ report: r, task }] : [];
  });

