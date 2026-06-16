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
import { db } from './firebase';
import { Notification, NotificationType, SeverityLevel, UserRole } from '../types';

const COL = 'notifications';

// ─── Create ───────────────────────────────────────────────────────────────────

export const createNotification = async (
  data: Omit<Notification, 'id' | 'createdAt' | 'read'>,
): Promise<string> => {
  const ref = await addDoc(collection(db, COL), {
    ...data,
    read: false,
    createdAt: serverTimestamp(),
  });
  return ref.id;
};

export const sendReportNotification = async (
  userId: string,
  type: NotificationType,
  reportId: string,
  reportNumber: string,
  severity?: SeverityLevel,
): Promise<void> => {
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
  };

  const msg = messages[type] ?? { title: 'Notification', body: '' };

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
      read: false,
      createdAt: serverTimestamp(),
    });
  });
  await batch.commit();
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
    callback(snap.docs.map((d) => ({ id: d.id, ...d.data() } as Notification)));
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
  const snap = await getDocs(q);
  return snap.docs.map((d) => d.id);
};
