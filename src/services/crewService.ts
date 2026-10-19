/**
 * Cleanup crews and the life of a cleanup task:
 *
 *   assign (Admin / barangay official) -> accept or decline (crew) -> start -> add photos -> finish
 *   -> confirm (official / Admin, which closes the report and tells the reporter)
 *
 * A crew can be a smartphone user (the crew leader's account) or have no app at all: an official
 * can record the work on their behalf (`recordWorkOnBehalf`). Notifications are best-effort: a
 * failed notification must never undo or block the work itself.
 */
import { collection, doc, getDocs, onSnapshot, query, serverTimestamp, updateDoc, where } from 'firebase/firestore';
import { CleanupTask, User, WasteReport } from '../types';
import { addTaskPhoto, createCleanupTask, uploadTaskPhoto } from './cleanupTaskService';
import { db } from './firebase';
import { createNotification, sendReportNotification } from './notificationService';
import { updateReportStatus } from './reportsService';

const TASKS = 'cleanupTasks';

export interface CrewMember {
  uid: string;
  name: string;
  phone?: string;
  barangayId?: string;
  barangay?: string;
}

export const fullName = (u: Pick<User, 'firstName' | 'lastName' | 'email'>): string =>
  `${u.firstName ?? ''} ${u.lastName ?? ''}`.trim() || u.email;

const toCrew = (id: string, d: Record<string, unknown>): CrewMember => ({
  uid: id,
  name: fullName({ firstName: String(d.firstName ?? ''), lastName: String(d.lastName ?? ''), email: String(d.email ?? '') }),
  phone: typeof d.phone === 'string' ? d.phone : undefined,
  barangayId: typeof d.barangayId === 'string' ? d.barangayId : undefined,
  barangay: typeof d.barangay === 'string' ? d.barangay : undefined,
});

const isUsable = (d: Record<string, unknown>): boolean => d.isActive !== false && !d.deletedAt;

/** Active cleanup crews of one barangay (what a barangay official picks from). */
export const getCrewsForBarangay = async (barangayId: string): Promise<CrewMember[]> => {
  const snap = await getDocs(query(collection(db, 'users'), where('role', '==', 'cleanup_team'), where('barangayId', '==', barangayId)));
  return snap.docs.filter((d) => isUsable(d.data())).map((d) => toCrew(d.id, d.data()));
};

/** Every active cleanup crew (Admin only: officials can't read across barangays by design). */
export const getAllCrews = async (): Promise<CrewMember[]> => {
  const snap = await getDocs(query(collection(db, 'users'), where('role', '==', 'cleanup_team')));
  return snap.docs.filter((d) => isUsable(d.data())).map((d) => toCrew(d.id, d.data()));
};

/** Live view of one task (crew, official and admin all watch the same record). */
export const subscribeToTask = (taskId: string, callback: (task: CleanupTask | null) => void, onError?: (error: Error) => void) =>
  onSnapshot(doc(db, TASKS, taskId), (snap) => callback(snap.exists() ? ({ id: snap.id, ...snap.data() } as CleanupTask) : null), onError);

const notify = async (userId: string | undefined, title: string, body: string, task: CleanupTask, type: 'task_assigned' | 'task_updated') => {
  if (!userId) return;
  try {
    await createNotification({ userId, title, body, type, taskId: task.id, reportId: task.reportId });
  } catch (e) {
    console.warn('[Crew] notification failed (non-fatal):', e);
  }
};

const minutesBetween = (start: string, end: string): number => {
  const [sh, sm] = start.split(':').map(Number);
  const [eh, em] = end.split(':').map(Number);
  const diff = eh * 60 + em - (sh * 60 + sm);
  return Number.isFinite(diff) && diff > 0 ? diff : 120;
};

// ─── Assigning ───────────────────────────────────────────────────────────────

export interface AssignCrewInput {
  report: WasteReport;
  crew: CrewMember;
  /** The official or Admin doing the assigning. */
  assigner: User;
  /** YYYY-MM-DD */
  scheduledDate: string;
  /** HH:mm */
  startTime: string;
  endTime: string;
  notes?: string;
  equipmentNeeded?: string[];
  personnelCount?: number;
}

/** Creates the task, marks the report assigned, and tells the crew and the person who reported it. */
export const assignCrewToReport = async (i: AssignCrewInput): Promise<string> => {
  const { report, crew, assigner } = i;
  const assignerName = fullName(assigner);
  // An official can only create tasks for their own barangay (enforced by the security rules too).
  const barangayId = assigner.role === 'barangay'
    ? assigner.barangayId ?? ''
    : report.barangayId ?? report.location.barangayId ?? crew.barangayId ?? '';
  const barangayName = report.barangay ?? report.location.barangay ?? crew.barangay ?? '';
  const where_ = report.location.address ?? barangayName;

  const taskId = await createCleanupTask({
    reportId: report.id,
    reportNumber: report.reportNumber,
    reporterUserId: report.userId,
    barangayId,
    barangay: barangayName,
    assignedTeamId: crew.uid,
    assignedTeamName: crew.name,
    assignedTeamPhone: crew.phone,
    assignedByUserId: assigner.uid,
    assignedByName: assignerName,
    assignedByPhone: assigner.phone,
    title: `Cleanup: ${report.reportNumber ?? report.id}`,
    description: i.notes?.trim() || `${report.severity} severity waste report${where_ ? ` at ${where_}` : ''}.`,
    location: report.location,
    priority: report.severity,
    status: 'assigned',
    scheduledDate: i.scheduledDate,
    startTime: i.startTime,
    endTime: i.endTime,
    estimatedDurationMinutes: minutesBetween(i.startTime, i.endTime),
    equipmentNeeded: i.equipmentNeeded ?? [],
    personnelCount: i.personnelCount ?? 0,
    isAiSuggested: false,
  });

  await updateReportStatus(report.id, 'assigned', assigner.uid, assignerName, {
    assignedTeamId: crew.uid,
    assignedTeamName: crew.name,
    assignedBarangayId: barangayId,
    cleanupTaskId: taskId,
  });

  const task = { id: taskId, reportId: report.id } as CleanupTask;
  await notify(crew.uid, 'New cleanup task', `${report.reportNumber ?? 'A report'} on ${i.scheduledDate}, ${i.startTime}. Open the app to accept it.`, task, 'task_assigned');
  if (report.userId) {
    try {
      await sendReportNotification(report.userId, 'report_assigned', report.id, report.reportNumber ?? report.id);
    } catch (e) {
      console.warn('[Crew] reporter notification failed (non-fatal):', e);
    }
  }
  return taskId;
};

// ─── The crew's side ─────────────────────────────────────────────────────────

export const respondToTask = async (task: CleanupTask, actor: User, accept: boolean, reason?: string): Promise<void> => {
  const name = fullName(actor);
  if (accept) {
    await updateDoc(doc(db, TASKS, task.id), { status: 'accepted', updatedAt: serverTimestamp() });
    await notify(task.assignedByUserId, 'Crew accepted the task', `${name} accepted ${task.title}.`, task, 'task_updated');
  } else {
    await updateDoc(doc(db, TASKS, task.id), { status: 'cancelled', declineReason: reason?.trim() || 'No reason given', updatedAt: serverTimestamp() });
    await notify(task.assignedByUserId, 'Crew declined the task', `${name} can't do ${task.title}: ${reason?.trim() || 'no reason given'}. Please assign another crew.`, task, 'task_updated');
  }
};

export const startTask = async (task: CleanupTask, actor: User): Promise<void> => {
  await updateDoc(doc(db, TASKS, task.id), { status: 'in_progress', actualStartTime: serverTimestamp(), updatedAt: serverTimestamp() });
  await notify(task.assignedByUserId, 'Cleanup started', `${fullName(actor)} has started ${task.title}.`, task, 'task_updated');
  if (task.reporterUserId) {
    try {
      await sendReportNotification(task.reporterUserId, 'report_in_progress', task.reportId, task.reportNumber ?? task.reportId);
    } catch (e) {
      console.warn('[Crew] reporter notification failed (non-fatal):', e);
    }
  }
};

/** Uploads a photo and attaches it to the task. Returns the hosted URL. */
export const addPhotoToTask = async (task: CleanupTask, phase: 'before' | 'after', uri: string): Promise<string> => {
  const index = (phase === 'before' ? task.beforePhotoURLs : task.afterPhotoURLs)?.length ?? 0;
  const url = await uploadTaskPhoto(uri, task.id, phase, index);
  await addTaskPhoto(task.id, url, phase);
  return url;
};

export interface FinishInput { notes?: string; wasteCollectedKg?: number }

/** A crew leader finishes their task. At least one "after" photo is required as proof. */
export const finishTask = async (task: CleanupTask, actor: User, input: FinishInput): Promise<void> => {
  if ((task.afterPhotoURLs?.length ?? 0) === 0) throw new Error('Add at least one "after" photo before finishing.');
  await updateDoc(doc(db, TASKS, task.id), {
    status: 'completed',
    completionNotes: input.notes?.trim() ?? '',
    ...(input.wasteCollectedKg !== undefined ? { wasteCollectedKg: input.wasteCollectedKg } : {}),
    actualEndTime: serverTimestamp(),
    completedAt: serverTimestamp(),
    updatedAt: serverTimestamp(),
  });
  await notify(task.assignedByUserId, 'Cleanup finished', `${fullName(actor)} finished ${task.title}. Please review the photos and confirm.`, task, 'task_updated');
};

// ─── The official's / Admin's side ───────────────────────────────────────────

/** Confirms a finished cleanup: closes the report and tells the person who reported it. */
export const confirmTaskCompleted = async (task: CleanupTask, actor: User): Promise<void> => {
  await updateReportStatus(task.reportId, 'completed', actor.uid, fullName(actor), { note: 'Cleanup confirmed' });
  await updateDoc(doc(db, TASKS, task.id), { confirmedByUserId: actor.uid, confirmedAt: new Date().toISOString(), updatedAt: serverTimestamp() });
  if (task.reporterUserId) {
    try {
      await sendReportNotification(task.reporterUserId, 'report_completed', task.reportId, task.reportNumber ?? task.reportId);
    } catch (e) {
      console.warn('[Crew] reporter notification failed (non-fatal):', e);
    }
  }
};

/**
 * For crews without the app: the official does the crew's steps for them (the work is recorded under
 * the official's name, flagged as recorded on behalf) and confirms in one go.
 */
export const recordWorkOnBehalf = async (task: CleanupTask, actor: User, input: FinishInput): Promise<void> => {
  if ((task.afterPhotoURLs?.length ?? 0) === 0) throw new Error('Add at least one "after" photo before recording the work as done.');
  await updateDoc(doc(db, TASKS, task.id), {
    status: 'completed',
    completionNotes: input.notes?.trim() ?? '',
    ...(input.wasteCollectedKg !== undefined ? { wasteCollectedKg: input.wasteCollectedKg } : {}),
    recordedByUserId: actor.uid,
    recordedByName: fullName(actor),
    actualEndTime: serverTimestamp(),
    completedAt: serverTimestamp(),
    updatedAt: serverTimestamp(),
  });
  await confirmTaskCompleted(task, actor);
};
