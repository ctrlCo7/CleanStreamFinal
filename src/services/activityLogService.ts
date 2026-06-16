import {
  collection,
  addDoc,
  getDocs,
  query,
  where,
  orderBy,
  serverTimestamp,
  limit,
} from 'firebase/firestore';
import { db } from './firebase';
import { ActivityLog, ActivityAction, ActivityEntityType, UserRole } from '../types';

const COL = 'activityLogs';

export const logActivity = async (
  userId: string,
  userName: string,
  userRole: UserRole,
  action: ActivityAction,
  entityType: ActivityEntityType,
  entityId: string,
  details: ActivityLog['details'] = {},
  deviceInfo?: string,
): Promise<void> => {
  await addDoc(collection(db, COL), {
    userId,
    userName,
    userRole,
    action,
    entityType,
    entityId,
    details,
    deviceInfo: deviceInfo ?? null,
    timestamp: serverTimestamp(),
  });
};

export const getActivityLogsByUser = async (
  userId: string,
  limitCount = 50,
): Promise<ActivityLog[]> => {
  const q = query(
    collection(db, COL),
    where('userId', '==', userId),
    orderBy('timestamp', 'desc'),
    limit(limitCount),
  );
  const snap = await getDocs(q);
  return snap.docs.map((d) => ({ id: d.id, ...d.data() } as ActivityLog));
};

export const getActivityLogsByEntity = async (
  entityType: ActivityEntityType,
  entityId: string,
): Promise<ActivityLog[]> => {
  const q = query(
    collection(db, COL),
    where('entityType', '==', entityType),
    where('entityId', '==', entityId),
    orderBy('timestamp', 'desc'),
  );
  const snap = await getDocs(q);
  return snap.docs.map((d) => ({ id: d.id, ...d.data() } as ActivityLog));
};

export const getActivityLogsByAction = async (
  action: ActivityAction,
  limitCount = 100,
): Promise<ActivityLog[]> => {
  const q = query(
    collection(db, COL),
    where('action', '==', action),
    orderBy('timestamp', 'desc'),
    limit(limitCount),
  );
  const snap = await getDocs(q);
  return snap.docs.map((d) => ({ id: d.id, ...d.data() } as ActivityLog));
};

export const getRecentSystemActivity = async (limitCount = 100): Promise<ActivityLog[]> => {
  const q = query(
    collection(db, COL),
    orderBy('timestamp', 'desc'),
    limit(limitCount),
  );
  const snap = await getDocs(q);
  return snap.docs.map((d) => ({ id: d.id, ...d.data() } as ActivityLog));
};

// ─── Convenience wrappers ─────────────────────────────────────────────────────

export const logReportCreated = (
  userId: string,
  userName: string,
  userRole: UserRole,
  reportId: string,
  severity: string,
) => logActivity(userId, userName, userRole, 'report_created', 'report', reportId, { severity });

export const logReportVerified = (
  userId: string,
  userName: string,
  reportId: string,
  reportNumber: string,
) =>
  logActivity(userId, userName, 'barangay', 'report_verified', 'report', reportId, {
    reportNumber,
  });

export const logReportAssigned = (
  userId: string,
  userName: string,
  reportId: string,
  teamId: string,
  teamName: string,
) =>
  logActivity(userId, userName, 'barangay', 'report_assigned', 'report', reportId, {
    teamId,
    teamName,
  });

export const logTaskCompleted = (
  userId: string,
  userName: string,
  userRole: UserRole,
  taskId: string,
  wasteCollectedKg: number,
) =>
  logActivity(userId, userName, userRole, 'task_completed', 'task', taskId, {
    wasteCollectedKg,
  });

export const logUserLogin = (userId: string, userName: string, userRole: UserRole) =>
  logActivity(userId, userName, userRole, 'login', 'user', userId);

export const logUserLogout = (userId: string, userName: string, userRole: UserRole) =>
  logActivity(userId, userName, userRole, 'logout', 'user', userId);
