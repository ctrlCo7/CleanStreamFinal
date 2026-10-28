/**
 * Before-and-after comparison for a cleanup task. Each before/after photo is run through
 * the same on-device AI as a waste report; this compares what it found on each side.
 * When no "before" photo was analyzed, the original report's analysis stands in for it.
 * Pure, so it is unit-tested in Node.
 */
import { AIAnalysisResult, PhotoWasteSummary } from '../types';

export type CleanupVerdict = 'clean' | 'mostly' | 'partial' | 'little' | 'unknown';

export interface CleanupComparison {
  before?: PhotoWasteSummary;
  after?: PhotoWasteSummary;
  /** 0–100: share of the detected waste (by item count) no longer seen. */
  removedPct?: number;
  verdict: CleanupVerdict;
}

/** The smallest useful record of one analysis, for storing on the task. */
export function summarizeAnalysis(ai: AIAnalysisResult, source: PhotoWasteSummary['source'] = 'photo'): PhotoWasteSummary {
  return {
    objectCount: ai.objectCount ?? ai.detectedObjects?.length ?? 0,
    volumeM3: ai.estimatedVolume ?? 0,
    // Detection-only score: the waterway bonus depends on context, not on how much waste is left.
    severityScore: ai.baseSeverityScore ?? ai.severityScore,
    analyzedAt: new Date().toISOString(),
    source,
  };
}

/**
 * Several photos of one site show overlapping waste, so they aren't added up: the photo
 * that shows the most waste stands for that side.
 */
export function mergeSummaries(existing: PhotoWasteSummary | undefined, next: PhotoWasteSummary): PhotoWasteSummary {
  if (!existing || existing.source === 'report') return next;
  return next.objectCount > existing.objectCount ? next : existing;
}

export function compareCleanup(
  before: PhotoWasteSummary | undefined,
  after: PhotoWasteSummary | undefined,
  reportAi?: AIAnalysisResult,
): CleanupComparison {
  const base = before ?? (reportAi && reportAi.analysisSource !== 'unavailable' ? summarizeAnalysis(reportAi, 'report') : undefined);
  if (!base || !after) return { before: base, after, verdict: 'unknown' };
  if (base.objectCount === 0) {
    return { before: base, after, verdict: after.objectCount === 0 ? 'clean' : 'unknown' };
  }
  const removedPct = Math.max(0, Math.min(100, Math.round(((base.objectCount - after.objectCount) / base.objectCount) * 100)));
  const verdict: CleanupVerdict =
    after.objectCount === 0 ? 'clean' : removedPct >= 75 ? 'mostly' : removedPct >= 40 ? 'partial' : 'little';
  return { before: base, after, removedPct, verdict };
}

export const VERDICT_TEXT: Record<CleanupVerdict, string> = {
  clean: 'No waste detected in the after photo',
  mostly: 'Most of the waste was removed',
  partial: 'Partly cleaned. Some waste is still visible',
  little: 'Little change. Most of the waste is still there',
  unknown: 'Not enough photos analyzed to compare',
};
