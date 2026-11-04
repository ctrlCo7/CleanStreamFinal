import {
  collection,
  addDoc,
  getDocs,
  query,
  where,
  orderBy,
  serverTimestamp,
  limit,
  onSnapshot,
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

/**
 * Records an action in a barangay's activity log (who did what, when), which that
 * barangay's Captain and the Super Admin can review. Never throws: logging must not
 * block the action itself.
 */
export const logBarangayActivity = async (e: {
  actor: { uid: string; firstName?: string; lastName?: string; role: UserRole };
  barangayId: string;
  action: ActivityAction;
  entityType: ActivityEntityType;
  entityId: string;
  summary: string;
  details?: ActivityLog['details'];
}): Promise<void> => {
  try {
    await addDoc(collection(db, COL), {
      userId: e.actor.uid,
      userName: `${e.actor.firstName ?? ''} ${e.actor.lastName ?? ''}`.trim() || 'Someone',
      userRole: e.actor.role,
      barangayId: e.barangayId,
      action: e.action,
      entityType: e.entityType,
      entityId: e.entityId,
      details: { summary: e.summary, ...(e.details ?? {}) },
      deviceInfo: null,
      timestamp: serverTimestamp(),
    });
  } catch (err) {
    console.warn('[Activity] Could not record activity (non-fatal):', err);
  }
};

/** A barangay's recent activity, newest first (the Captain's activity log). */
export const subscribeToBarangayActivity = (
  barangayId: string,
  callback: (logs: ActivityLog[]) => void,
  max = 30,
) => onSnapshot(
  query(collection(db, COL), where('barangayId', '==', barangayId), orderBy('timestamp', 'desc'), limit(max)),
  (snap) => callback(snap.docs.map((d) => {
    const data = d.data() as Record<string, unknown>;
    const ts = data.timestamp as { toDate?: () => Date } | null;
    return { id: d.id, ...data, timestamp: ts?.toDate?.()?.toISOString() ?? new Date().toISOString() } as ActivityLog;
  })),
  (err) => { console.warn('[Activity] Could not load the activity log:', err); callback([]); },
);

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
