/**
 * Everything that happens after a waste report document exists: AI analysis (with the
 * reporter's "where is the waste?" answer and the rain forecast), saving the result,
 * the duplicate/hotspot check, and notifications. Shared by the live submit on the
 * report screen and by the offline queue when it uploads a report filed without signal.
 * Every step here is non-critical: the report is already saved.
 */
import { AIAnalysisResult, GeoLocation, WaterContext } from '../types';
import { withTimeout } from '../utils/async';
import { analyzeWastePhoto, unavailableAnalysis } from './aiService';
import { checkNearbyReports, updateReportWithAI } from './reportsService';
import { getNotificationRecipientsByRole, sendBulkNotification, sendReportNotification } from './notificationService';
import { ProximityResult } from './reportProximity';

export interface AfterCreateInput {
  reportId: string;
  reportNumber: string;
  userId: string;
  location: GeoLocation;
  photoUri: string;
  waterContext: WaterContext;
  /** Resolves when the reporter taps "Skip analysis". */
  skip?: Promise<void>;
}

export interface AfterCreateResult {
  ai: AIAnalysisResult;
  /** Why there's no real AI result, if there isn't one. */
  aiIssue: 'skipped' | 'failed' | null;
  proximity: ProximityResult | null;
}

export async function analyzeAndSaveReport(input: AfterCreateInput): Promise<AfterCreateResult> {
  const { reportId, reportNumber, userId, location, photoUri, waterContext } = input;

  sendReportNotification(userId, 'report_submitted', reportId, reportNumber)
    .catch((e) => console.warn('[Submit] Notification send failed (non-fatal):', e));

  // Runs alongside the AI.
  const proximityPromise = withTimeout(checkNearbyReports(reportId, location, location.barangayId), 12000, 'Nearby check')
    .catch((e) => { console.warn('[Submit] Nearby-report check failed (non-fatal):', e); return null; });

  let ai: AIAnalysisResult;
  let aiIssue: AfterCreateResult['aiIssue'] = null;
  try {
    // Outer hard deadline on top of the per-stage timeouts inside analyzeWastePhoto.
    const analysis = withTimeout(analyzeWastePhoto(photoUri, reportId, userId, waterContext, location), 50000, 'AI analysis');
    const raced = await (input.skip ? Promise.race([analysis, input.skip.then(() => null)]) : analysis);
    if (raced) {
      ai = raced;
    } else {
      ai = { ...unavailableAnalysis(waterContext), modelVersion: 'Skipped by reporter' };
      aiIssue = 'skipped';
    }
  } catch (e) {
    console.error('[Submit] AI analysis failed (non-fatal):', e);
    ai = unavailableAnalysis(waterContext);
    aiIssue = 'failed';
  }

  try {
    await withTimeout(updateReportWithAI(reportId, ai), 10000, 'Saving AI result');
  } catch (e) {
    console.error('[Submit] AI result save failed (non-fatal):', e);
  }

  // Barangay officials hear about critical/high reports in their barangay right away.
  if ((ai.severityLevel === 'critical' || ai.severityLevel === 'high') && location.barangayId) {
    getNotificationRecipientsByRole(['barangay'], location.barangayId)
      .then((ids) => ids.length === 0 ? undefined : sendBulkNotification(
        ids,
        `${ai.severityLevel === 'critical' ? '🚨 Critical' : '⚠️ High'} severity report`,
        `A new ${ai.severityLevel} severity report (${reportNumber}) was just submitted in ${location.barangay || 'your barangay'}.`,
        'system',
        { severity: ai.severityLevel, reportId },
      ))
      .catch((e) => console.warn('[Submit] Barangay severity alert failed (non-fatal):', e));
  }

  return { ai, aiIssue, proximity: await proximityPromise };
}
