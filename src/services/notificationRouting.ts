/**
 * Where tapping a notification takes each kind of user. Shared by the notifications list and
 * by the phone notification that pops up for it. No React Native imports (unit-tested).
 */
import { Notification, UserRole } from '../types';

export type NotificationTarget =
  | { screen: 'CleanupTaskDetail'; params: { taskId: string } }
  | { screen: 'AdminApprovals'; params?: undefined }
  | { screen: 'RequestCrew'; params?: undefined }
  | { screen: 'BarangayVerifyDetail'; params: { reportId: string } }
  | { screen: 'AdminSchedule'; params: { reportId: string } }
  | { screen: 'CitizenDetail'; params: { reportId: string } }
  | { screen: 'AdminTabs'; params: { screen: 'AdminHistory' } }
  | { screen: 'BarangayTabs'; params: { screen: 'BarangayReport' } }
  | { screen: 'CitizenEventDetail'; params: { eventId: string } }
  | { screen: 'CitizenTabs'; params: { screen: 'CitizenMessages' } }
  | { screen: 'AdminTabs'; params: { screen: 'AdminMessages' } }
  | { screen: 'BarangayTabs'; params: { screen: 'BarangayMessages' } }
  | null;

export function notificationTarget(n: Pick<Notification, 'type' | 'reportId' | 'taskId' | 'eventId'>, role: UserRole | undefined): NotificationTarget {
  if (n.type === 'schedule_proposed' && role === 'admin') return { screen: 'AdminApprovals' };
  // The Super Admin answered a cleanup team request.
  if (n.type === 'crew_request' && (role === 'admin' || role === 'barangay')) return { screen: 'RequestCrew' };
  // A new chat message opens that person's Messages.
  if (n.type === 'message') {
    if (role === 'citizen') return { screen: 'CitizenTabs', params: { screen: 'CitizenMessages' } };
    if (role === 'admin') return { screen: 'AdminTabs', params: { screen: 'AdminMessages' } };
    if (role === 'barangay') return { screen: 'BarangayTabs', params: { screen: 'BarangayMessages' } };
    return null;
  }
  if (n.type.startsWith('checkpoint_')) {
    if (role === 'admin') return { screen: 'AdminTabs', params: { screen: 'AdminHistory' } };
    if (role === 'barangay') return { screen: 'BarangayTabs', params: { screen: 'BarangayReport' } };
  }
  if (n.taskId && role !== 'citizen') return { screen: 'CleanupTaskDetail', params: { taskId: n.taskId } };
  if (n.reportId) {
    if (role === 'barangay') return { screen: 'BarangayVerifyDetail', params: { reportId: n.reportId } };
    if (role === 'admin') return { screen: 'AdminSchedule', params: { reportId: n.reportId } };
    if (role === 'citizen') return { screen: 'CitizenDetail', params: { reportId: n.reportId } };
  }
  if (n.eventId) return { screen: 'CitizenEventDetail', params: { eventId: n.eventId } };
  return null;
}
