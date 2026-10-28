/**
 * Who may assign which crew to which report. Kept free of Firebase imports so it can be
 * unit-tested; crewService uses it, and firestore.rules enforces the same on the server.
 */
import { User, WasteReport } from '../types';

type CrewLike = { barangayId?: string; barangay?: string; name: string };

/** The barangay a report belongs to. Its cleanup can only go to that barangay's crews. */
export const reportBarangayId = (report: Pick<WasteReport, 'barangayId' | 'location'>): string | undefined =>
  report.barangayId || report.location?.barangayId || undefined;

/**
 * Why this crew can't take this report's cleanup, or null if it can. A cleanup stays inside
 * the report's barangay: only that barangay's officials (or the Admin) assign it, and only
 * to that barangay's own crews. The security rules enforce the same.
 */
export function assignmentProblem(
  report: Pick<WasteReport, 'barangayId' | 'location' | 'barangay'>,
  crew: CrewLike,
  assigner: Pick<User, 'role' | 'barangayId'>,
): string | null {
  const barangayId = reportBarangayId(report);
  const where_ = report.barangay || report.location?.barangay || 'this barangay';
  if (!barangayId) return 'This report has no barangay, so it can\'t be assigned. Ask the Admin to check its location.';
  if (assigner.role === 'barangay' && assigner.barangayId !== barangayId) {
    return `This report is in ${where_}. Only ${where_}'s officials or the Admin can assign its cleanup.`;
  }
  if (assigner.role !== 'barangay' && assigner.role !== 'admin') return 'Only barangay officials and the Admin can assign cleanups.';
  if (crew.barangayId !== barangayId) {
    return `${crew.name} is a crew of ${crew.barangay || 'another barangay'}. Only ${where_}'s own crews can clean up reports in ${where_}.`;
  }
  return null;
}


/** Roles that only ever see their own barangay's reports (firestore.rules enforces the same). */
export const isBarangayBound = (role?: string): boolean => role === 'barangay' || role === 'cleanup_team';

/**
 * Whether this viewer may open the report. Barangay officials and cleanup crews only see
 * their own barangay's reports (and any they filed themselves); everyone else sees all.
 */
export function canViewReport(
  report: Pick<WasteReport, 'barangayId' | 'location' | 'userId'>,
  viewer: Pick<User, 'role' | 'barangayId' | 'uid'> | null | undefined,
): boolean {
  if (!viewer) return false;
  if (!isBarangayBound(viewer.role) || report.userId === viewer.uid) return true;
  const barangayId = reportBarangayId(report);
  return !!barangayId && !!viewer.barangayId && barangayId === viewer.barangayId;
}
