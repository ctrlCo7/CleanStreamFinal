/**
 * Who is told what as a report moves through verification, and the activity log entry for
 * each step. Best effort: a failed notification never blocks the action itself.
 *
 *   submitted → every official of the barangay ("awaiting verification")
 *   verified  → the reporter, and the Barangay Captain ("forwarded for scheduling")
 *   rejected  → the reporter, with the official's remarks
 */
import { User, WasteReport, CONCERN_LABELS } from '../types';
import { createNotification, getNotificationRecipientsByRole, sendReportNotification } from './notificationService';
import { logBarangayActivity } from './activityLogService';

const name = (u: Pick<User, 'firstName' | 'lastName'>) => `${u.firstName ?? ''} ${u.lastName ?? ''}`.trim() || 'An official';
const quiet = (p: Promise<unknown>) => p.catch((e) => console.warn('[Workflow] notification failed (non-fatal):', e));
const barangayOf = (r: Pick<WasteReport, 'barangayId' | 'location'>) => r.barangayId || r.location?.barangayId || '';

/** A new report: every official of its barangay is asked to verify it. */
export async function notifyNewReport(r: Pick<WasteReport, 'id' | 'reportNumber' | 'barangayId' | 'location' | 'concernType' | 'severity'>): Promise<void> {
  const barangayId = barangayOf(r);
  if (!barangayId) return;
  const officials = await getNotificationRecipientsByRole(['barangay'], barangayId).catch(() => [] as string[]);
  const what = r.concernType ? CONCERN_LABELS[r.concernType] : 'Waste report';
  await Promise.all(officials.map((userId) => quiet(createNotification({
    userId, type: 'report_submitted', reportId: r.id, severity: r.severity,
    title: 'New report awaiting verification',
    body: `${what} ${r.reportNumber ?? ''} in ${r.location?.barangay || 'your barangay'} needs checking.`.replace(/\s+/g, ' '),
  }))));
}

/** Verified: the reporter is told, and the report is forwarded to the Captain for scheduling. */
export async function notifyReportVerified(r: WasteReport, official: User): Promise<void> {
  const barangayId = barangayOf(r);
  const num = r.reportNumber ?? r.id;
  if (r.userId) await quiet(sendReportNotification(r.userId, 'report_verified', r.id, num));
  const captains = barangayId ? await getNotificationRecipientsByRole(['admin'], barangayId).catch(() => [] as string[]) : [];
  await Promise.all(captains.map((userId) => quiet(createNotification({
    userId, type: 'report_forwarded', reportId: r.id, severity: r.severity,
    title: 'Verified report forwarded to you',
    body: `${name(official)} verified ${num}. It needs a cleanup schedule.`,
  }))));
  if (barangayId) {
    await logBarangayActivity({
      actor: official, barangayId, action: 'report_verified', entityType: 'report', entityId: r.id,
      summary: `Verified report ${num} and forwarded it to the Barangay Captain`,
    });
  }
}

/** Rejected: the reporter is told why. */
export async function notifyReportRejected(r: WasteReport, official: User, remarks: string): Promise<void> {
  const barangayId = barangayOf(r);
  const num = r.reportNumber ?? r.id;
  if (r.userId) await quiet(sendReportNotification(r.userId, 'report_rejected', r.id, num, undefined, remarks ? `Reason: ${remarks}` : undefined));
  if (barangayId) {
    await logBarangayActivity({
      actor: official, barangayId, action: 'report_rejected', entityType: 'report', entityId: r.id,
      summary: `Rejected report ${num}${remarks ? `: ${remarks}` : ''}`,
    });
  }
}
