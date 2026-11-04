/**
 * Cleanup crews and the life of a cleanup task:
 *
 *   propose (official) -> automatic conflict check -> approve (Barangay Captain only) -> accept or
 *   decline (crew) -> start -> add photos -> finish -> confirm (Captain, which closes the report)
 *
 * A crew can be a smartphone user (the crew leader's account) or have no app at all: an official
 * can record the work on their behalf (`recordWorkOnBehalf`). Notifications are best-effort: a
 * failed notification must never undo or block the work itself.
 */
import { collection, doc, getDoc, getDocs, onSnapshot, query, runTransaction, serverTimestamp, Transaction, updateDoc, where } from 'firebase/firestore';
import { CleanupTask, NotificationType, ScheduleConflictInfo, User, WasteReport } from '../types';
import { addTaskPhoto, getActiveTasksByBarangay, newTaskDoc, uploadTaskPhoto } from './cleanupTaskService';
import { db } from './firebase';
import { createNotification, getNotificationRecipientsByRole, sendReportNotification } from './notificationService';
import { describeConflict, findScheduleConflicts, scheduleInputProblem, workerProblem, ScheduleConflict, ScheduleSlot, suggestFreeSlot } from './scheduleConflicts';
import { logBarangayActivity } from './activityLogService';
import { addDaysKey, phDateKey, phMinutes } from '../utils/phTime';
import { updateReportStatus } from './reportsService';
import { assignmentProblem, reportBarangayId } from './assignmentRules';
import { mergeSummaries, summarizeAnalysis } from './cleanupComparison';
import { withTimeout } from '../utils/async';

const TASKS = 'cleanupTasks';

export interface CrewMember {
  uid: string;
  name: string;
  phone?: string;
  barangayId?: string;
  barangay?: string;
  /** Number of workers in the crew, when the Super Admin set it. */
  crewSize?: number;
}

export const fullName = (u: Pick<User, 'firstName' | 'lastName' | 'email'>): string =>
  `${u.firstName ?? ''} ${u.lastName ?? ''}`.trim() || u.email;

const toCrew = (id: string, d: Record<string, unknown>): CrewMember => ({
  uid: id,
  name: fullName({ firstName: String(d.firstName ?? ''), lastName: String(d.lastName ?? ''), email: String(d.email ?? '') }),
  phone: typeof d.phone === 'string' ? d.phone : undefined,
  barangayId: typeof d.barangayId === 'string' ? d.barangayId : undefined,
  barangay: typeof d.barangay === 'string' ? d.barangay : undefined,
  crewSize: typeof d.crewSize === 'number' && d.crewSize > 0 ? d.crewSize : undefined,
});

const isUsable = (d: Record<string, unknown>): boolean => d.isActive !== false && !d.deletedAt;

/** Active cleanup crews of one barangay (what a barangay official picks from). */
export const getCrewsForBarangay = async (barangayId: string): Promise<CrewMember[]> => {
  const snap = await getDocs(query(collection(db, 'users'), where('role', '==', 'cleanup_team'), where('barangayId', '==', barangayId)));
  return snap.docs.filter((d) => isUsable(d.data())).map((d) => toCrew(d.id, d.data()));
};

export { assignmentProblem, reportBarangayId } from './assignmentRules';

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

// ─── Scheduling: propose → automatic conflict check → Captain approves ──────
//
//   official proposes ─┬─ clashes with an approved cleanup → DECLINED automatically
//                      │     (reason + the clashing schedule + a free time suggested)
//                      └─ free → PROPOSED → Barangay Captain approves (checked again) → ASSIGNED
//                                                          └─ or rejects with remarks → REJECTED
//
// Only the Barangay Captain can approve (firestore.rules enforces it too). A Captain's own
// proposal is approved at once after the same automatic check.

export interface AssignCrewInput {
  report: WasteReport;
  crew: CrewMember;
  /** The official or Captain proposing the schedule. */
  assigner: User;
  /** YYYY-MM-DD (Philippine date) */
  scheduledDate: string;
  /** HH:mm (Philippine time) */
  startTime: string;
  endTime: string;
  notes?: string;
  equipmentNeeded?: string[];
  personnelCount?: number;
}

export type ProposalResult =
  | { outcome: 'declined'; taskId: string; conflicts: ScheduleConflictInfo[]; suggestion: CleanupTask['suggestedSlot'] | null }
  | { outcome: 'proposed'; taskId: string }
  | { outcome: 'approved'; taskId: string };

const toSlot = (t: Pick<CleanupTask, 'id' | 'title' | 'status' | 'scheduledDate' | 'startTime' | 'endTime' | 'assignedTeamId' | 'assignedTeamName' | 'location' | 'equipmentNeeded'>): ScheduleSlot => ({
  id: t.id, title: t.title, status: t.status, scheduledDate: t.scheduledDate, startTime: t.startTime, endTime: t.endTime,
  assignedTeamId: t.assignedTeamId, assignedTeamName: t.assignedTeamName, location: t.location, equipmentNeeded: t.equipmentNeeded ?? [],
});

const conflictInfo = (c: ScheduleConflict): ScheduleConflictInfo => ({
  taskId: c.with.id ?? '',
  title: c.with.title ?? 'Cleanup',
  scheduledDate: c.with.scheduledDate,
  startTime: c.with.startTime,
  endTime: c.with.endTime,
  place: c.with.location?.address || c.with.location?.barangay || '',
  crewName: c.with.assignedTeamName ?? '',
  reasons: c.reasons,
  message: describeConflict(c),
});

/** The barangay's approved cleanups that still hold their time slots. */
const approvedSchedules = async (barangayId: string): Promise<ScheduleSlot[]> =>
  (await getActiveTasksByBarangay(barangayId)).map(toSlot);

/** Checks a schedule against the barangay's approved cleanups. Exported for the screens' live preview. */
export const checkScheduleConflicts = async (barangayId: string, slot: ScheduleSlot) => {
  const existing = await approvedSchedules(barangayId);
  const conflicts = findScheduleConflicts(slot, existing);
  const suggestion = conflicts.length
    ? suggestFreeSlot(slot, existing, { addDays: addDaysKey, earliestDate: phDateKey(), earliestTime: `${String(Math.floor(phMinutes() / 60)).padStart(2, '0')}:${String(phMinutes() % 60).padStart(2, '0')}` })
    : null;
  return { conflicts, suggestion };
};

const captainsOf = (barangayId: string) => getNotificationRecipientsByRole(['admin'], barangayId).catch(() => [] as string[]);
const staffNote = async (userIds: string[], n: { title: string; body: string; type: NotificationType; taskId?: string; reportId?: string }) => {
  await Promise.all(userIds.map((userId) => createNotification({ userId, ...n }).catch((e) => console.warn('[Schedule] notification failed (non-fatal):', e))));
};

/** Marks the report assigned and tells the crew, the reporter and whoever proposed it. */
const announceApproved = async (task: CleanupTask, captain: User) => {
  await updateReportStatus(task.reportId, 'assigned', captain.uid, fullName(captain), {
    assignedTeamId: task.assignedTeamId,
    assignedTeamName: task.assignedTeamName,
    assignedBarangayId: task.barangayId,
    cleanupTaskId: task.id,
    note: `Cleanup scheduled for ${task.scheduledDate}, ${task.startTime}–${task.endTime} (approved by the Barangay Captain)`,
  });
  await notify(task.assignedTeamId, 'New cleanup task', `${task.reportNumber ?? 'A report'} on ${task.scheduledDate}, ${task.startTime}. Open the app to accept it.`, task, 'task_assigned');
  if (task.assignedByUserId !== captain.uid) {
    await staffNote([task.assignedByUserId], {
      title: 'Cleanup schedule approved',
      body: `The Barangay Captain approved the cleanup for ${task.reportNumber ?? 'the report'} on ${task.scheduledDate}, ${task.startTime}–${task.endTime}.`,
      type: 'schedule_approved', taskId: task.id, reportId: task.reportId,
    });
  }
  if (task.reporterUserId) {
    sendReportNotification(task.reporterUserId, 'report_assigned', task.reportId, task.reportNumber ?? task.reportId, undefined,
      `It is scheduled for ${task.scheduledDate}, ${task.startTime}.`).catch(() => undefined);
  }
};

const declineReasonFor = (conflicts: ScheduleConflictInfo[]) =>
  `Declined automatically: it clashes with an approved cleanup. ${conflicts.map((c) => c.message).join(' ')}`;

/** The fields that mark a schedule as declined automatically because of a clash. */
const declinedFields = (conflicts: ScheduleConflictInfo[], suggestion: CleanupTask['suggestedSlot'] | null) => ({
  status: 'declined' as const,
  declineReason: declineReasonFor(conflicts),
  conflicts,
  ...(suggestion ? { suggestedSlot: suggestion } : {}),
  decidedAt: new Date().toISOString(),
});

/** Tells whoever proposed it why it was declined (and a free time), and logs it. */
const announceDeclined = async (
  taskId: string, task: Pick<CleanupTask, 'reportId' | 'reportNumber' | 'assignedByUserId' | 'barangayId'>,
  conflicts: ScheduleConflictInfo[], suggestion: CleanupTask['suggestedSlot'] | null, actor: User,
) => {
  const reason = declineReasonFor(conflicts);
  const free = suggestion ? ` A free time: ${suggestion.scheduledDate}, ${suggestion.startTime}–${suggestion.endTime}.` : '';
  await staffNote([task.assignedByUserId], {
    title: 'Cleanup schedule declined automatically', body: `${reason}${free} Propose a different schedule.`,
    type: 'schedule_declined', taskId, reportId: task.reportId,
  });
  logBarangayActivity({
    actor, barangayId: task.barangayId, action: 'schedule_declined', entityType: 'task', entityId: taskId,
    summary: `Schedule for ${task.reportNumber ?? 'a report'} declined automatically (conflict)`,
  });
};

/**
 * Proposes a cleanup schedule for a verified report. It is checked automatically against the
 * barangay's approved cleanups: a clash declines it at once (with the reason and a free time);
 * otherwise it waits for the Barangay Captain. A Captain's own proposal is approved directly.
 */
export const proposeCleanup = async (i: AssignCrewInput): Promise<ProposalResult> => {
  const { report, crew, assigner } = i;
  const problem = assignmentProblem(report, crew, assigner);
  if (problem) throw new Error(problem);
  if (report.status !== 'verified' && report.status !== 'assigned') {
    throw new Error('Only verified reports can get a cleanup schedule. Verify the report first.');
  }
  const isCaptain = assigner.role === 'admin';
  const barangayId = reportBarangayId(report) as string;
  const barangayName = report.barangay ?? report.location.barangay ?? crew.barangay ?? '';
  const where_ = report.location.address ?? barangayName;
  const assignerName = fullName(assigner);
  const base = {
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
    scheduledDate: i.scheduledDate,
    startTime: i.startTime,
    endTime: i.endTime,
    estimatedDurationMinutes: minutesBetween(i.startTime, i.endTime),
    equipmentNeeded: i.equipmentNeeded ?? [],
    personnelCount: i.personnelCount ?? 0,
    isAiSuggested: false,
  };

  // The schedule itself must make sense (date, times, not in the past -- Philippine time).
  const invalid = scheduleInputProblem(i, phDateKey(), phMinutes())
    ?? workerProblem(i.personnelCount, crew.crewSize, crew.name);
  if (invalid) throw new Error(invalid);

  // Conflict check and decision happen together under the barangay's lock for that day, so two
  // schedules sent at the same moment can't both slip through (see decideUnderLock).
  type Decided =
    | { outcome: 'declined'; taskId: string; conflicts: ScheduleConflictInfo[]; suggestion: CleanupTask['suggestedSlot'] | null }
    | { outcome: 'approved' | 'proposed'; taskId: string };
  const decided: Decided = await decideUnderLock(barangayId, i.scheduledDate, assigner, async (tx) => {
    const { conflicts, suggestion } = await checkScheduleConflicts(barangayId, toSlot({ ...base, id: undefined as unknown as string, status: 'proposed' }));
    const ref = doc(collection(db, TASKS));
    if (conflicts.length) {
      const infos = conflicts.map(conflictInfo);
      tx.set(ref, newTaskDoc({ ...base, ...declinedFields(infos, suggestion) }));
      return { outcome: 'declined', taskId: ref.id, conflicts: infos, suggestion };
    }
    if (isCaptain) {
      const now = new Date().toISOString();
      tx.set(ref, newTaskDoc({ ...base, status: 'assigned', approvedByUserId: assigner.uid, approvedByName: assignerName, approvedAt: now, decidedAt: now }));
      return { outcome: 'approved', taskId: ref.id };
    }
    tx.set(ref, newTaskDoc({ ...base, status: 'proposed' }));
    return { outcome: 'proposed', taskId: ref.id };
  });

  // Notifications and the log only once the decision is saved (never repeated on a retry).
  const { taskId } = decided;
  if (decided.outcome === 'declined') {
    await announceDeclined(taskId, { ...base }, decided.conflicts, decided.suggestion, assigner);
    return { outcome: 'declined', taskId, conflicts: decided.conflicts, suggestion: decided.suggestion };
  }
  if (decided.outcome === 'approved') {
    await announceApproved({ ...base, id: taskId, status: 'assigned' } as CleanupTask, assigner);
    logBarangayActivity({
      actor: assigner, barangayId, action: 'schedule_approved', entityType: 'task', entityId: taskId,
      summary: `Cleanup for ${report.reportNumber ?? 'a report'} scheduled and approved for ${i.scheduledDate}, ${i.startTime}–${i.endTime}`,
    });
    return { outcome: 'approved', taskId };
  }
  await staffNote(await captainsOf(barangayId), {
    title: 'Cleanup schedule awaiting your approval',
    body: `${assignerName} proposed a cleanup for ${report.reportNumber ?? 'a report'} on ${i.scheduledDate}, ${i.startTime}–${i.endTime} with ${crew.name}.`,
    type: 'schedule_proposed', taskId, reportId: report.id,
  });
  logBarangayActivity({
    actor: assigner, barangayId, action: 'schedule_proposed', entityType: 'task', entityId: taskId,
    summary: `Proposed a cleanup for ${report.reportNumber ?? 'a report'} on ${i.scheduledDate}, ${i.startTime}–${i.endTime} (${crew.name})`,
  });
  return { outcome: 'proposed', taskId };
};

/**
 * Serialises schedule decisions per barangay and day. A Firestore transaction reads the
 * lock document `scheduleLocks/{barangayId}_{date}`, runs `decide` (which checks conflicts
 * and writes the decision), and bumps the lock. If two decisions for the same day run at
 * once, Firestore refuses one of them and retries it; the retry's conflict check then sees
 * the other's approved schedule. So two clashing schedules can never both be approved.
 */
const decideUnderLock = async <T>(barangayId: string, date: string, actor: User, decide: (tx: Transaction) => Promise<T>): Promise<T> =>
  runTransaction(db, async (tx) => {
    const lockRef = doc(db, 'scheduleLocks', `${barangayId}_${date}`);
    const lock = await tx.get(lockRef);
    const result = await decide(tx);
    tx.set(lockRef, {
      barangayId, date, version: (Number(lock.data()?.version) || 0) + 1, by: actor.uid, updatedAt: serverTimestamp(),
    });
    return result;
  });

/**
 * The Barangay Captain approves a proposed schedule. It is checked again first (another
 * cleanup may have been approved since): a clash declines it automatically instead. The
 * check and the approval happen under the day's lock, so racing approvals can't both pass.
 */
export const approveCleanup = async (task: CleanupTask, captain: User): Promise<'approved' | 'declined'> => {
  if (captain.role !== 'admin') throw new Error('Only the Barangay Captain can approve cleanup schedules.');
  if (task.status !== 'proposed') throw new Error('This schedule is no longer waiting for approval.');
  const taskRef = doc(db, TASKS, task.id);
  const decided = await decideUnderLock(task.barangayId, task.scheduledDate, captain, async (tx) => {
    const fresh = await tx.get(taskRef);
    if (fresh.data()?.status !== 'proposed') throw new Error('This schedule is no longer waiting for approval.');
    const { conflicts, suggestion } = await checkScheduleConflicts(task.barangayId, toSlot(task));
    if (conflicts.length) {
      const infos = conflicts.map(conflictInfo);
      tx.update(taskRef, { ...declinedFields(infos, suggestion), updatedAt: serverTimestamp() });
      return { outcome: 'declined' as const, infos, suggestion };
    }
    const now = new Date().toISOString();
    tx.update(taskRef, {
      status: 'assigned', approvedByUserId: captain.uid, approvedByName: fullName(captain), approvedAt: now, decidedAt: now,
      updatedAt: serverTimestamp(),
    });
    return { outcome: 'approved' as const };
  });
  if (decided.outcome === 'declined') {
    await announceDeclined(task.id, task, decided.infos, decided.suggestion, captain);
    return 'declined';
  }
  await announceApproved(task, captain);
  logBarangayActivity({
    actor: captain, barangayId: task.barangayId, action: 'schedule_approved', entityType: 'task', entityId: task.id,
    summary: `Approved the cleanup for ${task.reportNumber ?? 'a report'} on ${task.scheduledDate}, ${task.startTime}–${task.endTime}`,
  });
  return 'approved';
};

/** The Barangay Captain rejects a proposed schedule; remarks are required. */
export const rejectCleanup = async (task: CleanupTask, captain: User, remarks: string): Promise<void> => {
  if (captain.role !== 'admin') throw new Error('Only the Barangay Captain can reject cleanup schedules.');
  if (!remarks.trim()) throw new Error('Please give a reason, so the official knows what to change.');
  const now = new Date().toISOString();
  await updateDoc(doc(db, TASKS, task.id), {
    status: 'rejected', rejectedByUserId: captain.uid, rejectedByName: fullName(captain), rejectionRemarks: remarks.trim(),
    decidedAt: now, updatedAt: serverTimestamp(),
  });
  await staffNote([task.assignedByUserId], {
    title: 'Cleanup schedule rejected',
    body: `The Barangay Captain rejected the cleanup for ${task.reportNumber ?? 'the report'} on ${task.scheduledDate}: ${remarks.trim()}`,
    type: 'schedule_rejected', taskId: task.id, reportId: task.reportId,
  });
  logBarangayActivity({
    actor: captain, barangayId: task.barangayId, action: 'schedule_rejected', entityType: 'task', entityId: task.id,
    summary: `Rejected the cleanup for ${task.reportNumber ?? 'a report'} on ${task.scheduledDate}: ${remarks.trim()}`,
  });
};

/** Live list of a barangay's cleanup schedules (all states), for the Captain and officials. */
export const SCHEDULE_DECISION_STATES: CleanupTask['status'][] = ['proposed', 'declined', 'rejected'];

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
  // The reporter's timeline moves to "Cleanup in progress" (it used to stay at "assigned").
  await updateReportStatus(task.reportId, 'in_progress', actor.uid, fullName(actor), { note: 'Cleanup started by the crew' })
    .catch((e) => console.warn('[Crew] Could not mark the report in progress (non-fatal):', e));
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
  // Runs in the background: the crew doesn't wait for the AI.
  analyzeTaskPhoto(task.id, phase, uri).catch((e) => console.warn('[Crew] Photo analysis failed (non-fatal):', e));
  return url;
};

/**
 * Runs the on-device AI on a before/after photo and keeps the result on the task, so the
 * official can see how much of the waste was removed. The AI module is loaded only when
 * needed, so screens that never take task photos don't pay for it.
 */
const analyzeTaskPhoto = async (taskId: string, phase: 'before' | 'after', uri: string): Promise<void> => {
  const { analyzeOnDevice } = await import('./onDeviceAI');
  const ai = await withTimeout(analyzeOnDevice(uri), 45000, 'Task photo analysis');
  const field = phase === 'before' ? 'beforeAnalysis' : 'afterAnalysis';
  const current = (await getDoc(doc(db, TASKS, taskId))).data()?.[field];
  await updateDoc(doc(db, TASKS, taskId), {
    [field]: mergeSummaries(current, summarizeAnalysis(ai)),
    updatedAt: serverTimestamp(),
  });
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
  if (actor.role !== 'admin') throw new Error('Only the Barangay Captain can confirm a finished cleanup.');
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
  if (actor.role !== 'admin') throw new Error('Only the Barangay Captain can record a cleanup as done.');
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
