import { appSettings } from './appSettings';
import { isMuted, notificationPrefs } from './notificationPrefs';
import {
  collection,
  doc,
  addDoc,
  getDocs,
  updateDoc,
  writeBatch,
  query,
  where,
  orderBy,
  onSnapshot,
  serverTimestamp,
  limit,
} from 'firebase/firestore';
import { auth, db } from './firebase';
import { staffOf } from './staffDirectory';
import { sendPush } from './pushService';

/** Every notification is signed with whoever sent it (the security rules require it). */
const sender = () => auth.currentUser?.uid ?? '';
import { Notification, NotificationType, SeverityLevel, UserRole } from '../types';

const COL = 'notifications';

// ─── Create ───────────────────────────────────────────────────────────────────

export const createNotification = async (
  data: Omit<Notification, 'id' | 'createdAt' | 'read'>,
): Promise<string> => {
  // Firestore rejects `undefined` field values outright. Optional fields like
  // `severity` are declared as named params on callers like sendReportNotification,
  // so the key is always present here even when the caller didn't supply a value —
  // strip those before writing rather than let addDoc throw.
  const payload: Record<string, unknown> = { ...data, senderId: sender(), read: false, createdAt: serverTimestamp() };
  for (const key of Object.keys(payload)) {
    if (payload[key] === undefined) delete payload[key];
  }
  const ref = await addDoc(collection(db, COL), payload);
  // Also to the phone, even if the app is closed (when push is set up; see pushService.ts).
  sendPush([data.userId], { title: data.title, body: data.body, type: data.type, data: { notificationId: ref.id, reportId: data.reportId, taskId: data.taskId, eventId: data.eventId } });
  return ref.id;
};

export const sendReportNotification = async (
  userId: string,
  type: NotificationType,
  reportId: string,
  reportNumber: string,
  severity?: SeverityLevel,
  extra?: string,
): Promise<void> => {
  // The Super Admin can turn report status notifications off for everyone.
  if (!appSettings().notifications.reportUpdateAlerts) return;
  const messages: Record<NotificationType, { title: string; body: string }> = {
    report_submitted: {
      title: 'Report Submitted',
      body: `Your report ${reportNumber} has been submitted and is under review.`,
    },
    report_verified: {
      title: 'Report Verified',
      body: `Your report ${reportNumber} has been verified by barangay officials.`,
    },
    report_assigned: {
      title: 'Cleanup Assigned',
      body: `A cleanup team has been assigned to your report ${reportNumber}.`,
    },
    report_in_progress: {
      title: 'Cleanup In Progress',
      body: `Cleanup for report ${reportNumber} is now in progress.`,
    },
    report_completed: {
      title: 'Report Resolved',
      body: `Great news! Report ${reportNumber} has been resolved.`,
    },
    report_rejected: {
      title: 'Report Rejected',
      body: `Report ${reportNumber} was rejected. Please check the details.`,
    },
    task_assigned: { title: 'New Task Assigned', body: 'You have a new cleanup task assigned.' },
    task_updated: { title: 'Task Updated', body: 'A cleanup task has been updated.' },
    event_reminder: { title: 'Event Reminder', body: 'A cleanup event is coming up.' },
    announcement: { title: 'New Announcement', body: 'There is a new announcement for you.' },
    message: { title: 'New Message', body: 'You have a new message.' },
    ai_result: {
      title: 'AI Analysis Ready',
      body: `AI analysis for report ${reportNumber} is complete.`,
    },
    system: { title: 'System Notice', body: 'A system update is available.' },
    report_forwarded: { title: 'Verified report for scheduling', body: `Report ${reportNumber} was verified and needs a cleanup schedule.` },
    schedule_proposed: { title: 'Cleanup schedule awaiting approval', body: `A cleanup for ${reportNumber} was proposed.` },
    schedule_approved: { title: 'Cleanup scheduled', body: `The cleanup for ${reportNumber} was approved.` },
    schedule_rejected: { title: 'Cleanup schedule rejected', body: `The cleanup schedule for ${reportNumber} was rejected.` },
    schedule_declined: { title: 'Cleanup schedule declined', body: `The cleanup schedule for ${reportNumber} clashed with another cleanup.` },
    checkpoint_missed: { title: 'Missed checkpoint', body: 'A waterway checkpoint was not inspected on time.' },
    checkpoint_completed: { title: 'Checkpoint inspected', body: 'A waterway checkpoint inspection was completed.' },
    checkpoint_issue: { title: 'Issue detected at a checkpoint', body: 'An inspection found a problem at a waterway checkpoint.' },
  };

  const base = messages[type] ?? { title: 'Notification', body: '' };
  // Extra detail (e.g. why a report was rejected) is added after the standard text.
  const msg = extra ? { ...base, body: `${base.body} ${extra}` } : base;

  await createNotification({
    userId,
    title: msg.title,
    body: msg.body,
    type,
    severity,
    reportId,
  });
};

export const sendTaskNotification = async (
  userId: string,
  taskId: string,
  taskTitle: string,
): Promise<void> => {
  await createNotification({
    userId,
    title: 'New Cleanup Task',
    body: `You have been assigned: ${taskTitle}`,
    type: 'task_assigned',
    taskId,
  });
};

export const sendBulkNotification = async (
  userIds: string[],
  title: string,
  body: string,
  type: NotificationType,
  extraData?: Partial<Omit<Notification, 'id' | 'userId' | 'title' | 'body' | 'type' | 'read' | 'createdAt'>>,
): Promise<void> => {
  const batch = writeBatch(db);
  userIds.forEach((userId) => {
    const ref = doc(collection(db, COL));
    batch.set(ref, {
      userId,
      title,
      body,
      type,
      ...extraData,
      senderId: sender(),
      read: false,
      createdAt: serverTimestamp(),
    });
  });
  await batch.commit();
  sendPush(userIds, { title, body, type, data: { reportId: extraData?.reportId, taskId: extraData?.taskId, eventId: extraData?.eventId } });
};

// ─── Read ─────────────────────────────────────────────────────────────────────

export const getUserNotifications = async (
  userId: string,
  limitCount = 30,
): Promise<Notification[]> => {
  const q = query(
    collection(db, COL),
    where('userId', '==', userId),
    orderBy('createdAt', 'desc'),
    limit(limitCount),
  );
  const snap = await getDocs(q);
  return snap.docs.map((d) => ({ id: d.id, ...d.data() } as Notification));
};

export const getUnreadCount = async (userId: string): Promise<number> => {
  const q = query(
    collection(db, COL),
    where('userId', '==', userId),
    where('read', '==', false),
  );
  const snap = await getDocs(q);
  return snap.size;
};

// ─── Update ───────────────────────────────────────────────────────────────────

export const markNotificationRead = async (notificationId: string): Promise<void> => {
  await updateDoc(doc(db, COL, notificationId), {
    read: true,
    readAt: serverTimestamp(),
  });
};

export const markAllNotificationsRead = async (userId: string): Promise<void> => {
  const q = query(
    collection(db, COL),
    where('userId', '==', userId),
    where('read', '==', false),
  );
  const snap = await getDocs(q);
  const batch = writeBatch(db);
  snap.docs.forEach((d) => {
    batch.update(d.ref, { read: true, readAt: serverTimestamp() });
  });
  await batch.commit();
};

// ─── Subscribe ────────────────────────────────────────────────────────────────

export const subscribeToNotifications = (
  userId: string,
  callback: (notifications: Notification[]) => void,
  limitCount = 30,
) => {
  const q = query(
    collection(db, COL),
    where('userId', '==', userId),
    orderBy('createdAt', 'desc'),
    limit(limitCount),
  );
  return onSnapshot(q, (snap) => {
    // Kinds the person muted in Notification settings are left out of the list and badge.
    const prefs = notificationPrefs();
    callback(snap.docs.map((d) => {
      const data = d.data() as Record<string, unknown>;
      // A notice written a moment ago has no server time yet; treat it as "now".
      const ts = data.createdAt as { toDate?: () => Date } | string | null;
      const createdAt = typeof ts === 'string' ? ts : ts?.toDate?.()?.toISOString() ?? new Date().toISOString();
      return { id: d.id, ...data, createdAt } as Notification;
    }).filter((n) => !isMuted(prefs, n.type)));
  }, (e) => {
    console.warn('[Notifications] Could not load notifications:', e);
    callback([]);
  });
};

// ─── FCM token management ─────────────────────────────────────────────────────

export const saveUserFcmToken = async (userId: string, fcmToken: string): Promise<void> => {
  await updateDoc(doc(db, 'users', userId), { fcmToken });
};

export const clearUserFcmToken = async (userId: string): Promise<void> => {
  await updateDoc(doc(db, 'users', userId), { fcmToken: null });
};

// ─── Helpers ──────────────────────────────────────────────────────────────────

export const getNotificationRecipientsByRole = async (
  roles: Array<UserRole | 'all'>,
  barangayId?: string,
): Promise<string[]> => {
  if (roles.includes('all')) {
    const snap = await getDocs(collection(db, 'users'));
    return snap.docs.map((d) => d.id);
  }
  let q = query(collection(db, 'users'), where('role', 'in', roles));
  if (barangayId) {
    q = query(collection(db, 'users'), where('role', 'in', roles), where('barangayId', '==', barangayId));
  }
  try {
    const snap = await getDocs(q);
    return snap.docs.map((d) => d.id);
  } catch (e) {
    // Citizens may not read other people's profiles. To reach a barangay's officials or
    // Captain (e.g. about their new report) they use the staff directory instead.
    const staffRoles = roles.filter((r) => r === 'barangay' || r === 'admin');
    if (barangayId && staffRoles.length) return staffOf(barangayId, staffRoles);
    throw e;
  }
};
