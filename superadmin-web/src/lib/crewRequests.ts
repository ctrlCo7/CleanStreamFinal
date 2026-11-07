// Cleanup team (crew) account requests sent from the app by officials and Barangay Captains.
// The Super Admin creates the account (then the request is marked approved) or declines it with
// a reason; either way the requester gets an in-app notification.
import {
  addDoc, collection, doc, getDoc, onSnapshot, serverTimestamp, updateDoc,
} from 'firebase/firestore';
import { db } from './firebase';
import type { Actor } from './types';

export type CrewRequestStatus = 'pending' | 'approved' | 'declined' | 'cancelled';

export interface CrewRequest {
  id: string;
  barangayId: string;
  barangay: string;
  requestedBy: string;
  requestedByName: string;
  requestedByRole: 'admin' | 'barangay';
  teamName: string;
  crewSize: number;
  leaderName?: string;
  leaderEmail?: string;
  leaderPhone?: string;
  reason: string;
  status: CrewRequestStatus;
  createdAt: Date | null;
  decidedAt: Date | null;
  decidedByName?: string;
  declineReason?: string;
  accountEmail?: string;
}

const str = (v: unknown): string | undefined => (typeof v === 'string' && v.trim() ? v : undefined);
const date = (v: unknown): Date | null => {
  const t = v as { toDate?: () => Date } | null;
  return t && typeof t.toDate === 'function' ? t.toDate() : null;
};

export const toCrewRequest = (id: string, d: Record<string, unknown>): CrewRequest => ({
  id,
  barangayId: str(d.barangayId) ?? '',
  barangay: str(d.barangay) ?? str(d.barangayId) ?? '—',
  requestedBy: str(d.requestedBy) ?? '',
  requestedByName: str(d.requestedByName) ?? '—',
  requestedByRole: d.requestedByRole === 'admin' ? 'admin' : 'barangay',
  teamName: str(d.teamName) ?? 'Cleanup crew',
  crewSize: typeof d.crewSize === 'number' ? d.crewSize : 0,
  leaderName: str(d.leaderName),
  leaderEmail: str(d.leaderEmail),
  leaderPhone: str(d.leaderPhone),
  reason: str(d.reason) ?? '',
  status: (['pending', 'approved', 'declined', 'cancelled'] as const).find((s) => s === d.status) ?? 'pending',
  createdAt: date(d.createdAt),
  decidedAt: date(d.decidedAt),
  decidedByName: str(d.decidedByName),
  declineReason: str(d.declineReason),
  accountEmail: str(d.accountEmail),
});

/** Waiting first (oldest first, so nobody waits longest), then answered ones newest first. */
export const sortRequests = (list: CrewRequest[]): CrewRequest[] => {
  const t = (d: Date | null) => d?.getTime() ?? 0;
  return [...list].sort((a, b) => {
    if ((a.status === 'pending') !== (b.status === 'pending')) return a.status === 'pending' ? -1 : 1;
    return a.status === 'pending' ? t(a.createdAt) - t(b.createdAt) : t(b.decidedAt ?? b.createdAt) - t(a.decidedAt ?? a.createdAt);
  });
};

export const subscribeCrewRequests = (onData: (r: CrewRequest[]) => void, onError: (e: Error) => void) =>
  onSnapshot(collection(db, 'crewRequests'), (snap) => onData(sortRequests(snap.docs.map((x) => toCrewRequest(x.id, x.data())))), onError);

/** A first and last name for the account form, from the crew leader's name or the team name. */
export const splitName = (r: Pick<CrewRequest, 'leaderName' | 'teamName' | 'barangay'>): { firstName: string; lastName: string } => {
  const words = (r.leaderName ?? '').trim().split(/\s+/).filter(Boolean);
  if (words.length >= 2) return { firstName: words.slice(0, -1).join(' '), lastName: words[words.length - 1] };
  if (words.length === 1) return { firstName: words[0], lastName: 'Crew' };
  return { firstName: r.teamName, lastName: 'Crew' };
};

/**
 * Read the request fresh from the database and refuse if it was already answered or withdrawn,
 * e.g. in another browser tab or by another Super Admin. Stops a second crew account being
 * created for the same request.
 */
export async function ensureStillPending(r: CrewRequest): Promise<void> {
  const snap = await getDoc(doc(db, 'crewRequests', r.id));
  const status = snap.exists() ? (snap.data().status as CrewRequestStatus) : 'cancelled';
  if (status !== 'pending') {
    const what = status === 'approved' ? 'already has a crew account' : status === 'declined' ? 'was already declined' : 'was withdrawn by the barangay';
    throw new Error(`This request ${what}, so no account was created.`);
  }
}

const audit = (actor: Actor, action: 'crew_request.approve' | 'crew_request.decline', r: CrewRequest, target: { uid: string; email: string }, details: string) =>
  addDoc(collection(db, 'auditLogs'), {
    action, actorUid: actor.uid, actorEmail: actor.email,
    targetUid: target.uid, targetEmail: target.email, targetName: `${r.teamName} (Brgy. ${r.barangay})`,
    details, createdAt: serverTimestamp(),
  });

const notifyRequester = (actor: Actor, r: CrewRequest, title: string, body: string) =>
  addDoc(collection(db, 'notifications'), {
    userId: r.requestedBy, senderId: actor.uid, type: 'crew_request', title, body, read: false, createdAt: serverTimestamp(),
  });

/** The crew account was created for this request. */
export async function markApproved(actor: Actor, r: CrewRequest, account: { uid: string; email: string }): Promise<void> {
  await updateDoc(doc(db, 'crewRequests', r.id), {
    status: 'approved', decidedAt: serverTimestamp(), decidedBy: actor.uid, decidedByName: 'Super Admin',
    accountUid: account.uid, accountEmail: account.email,
  });
  await audit(actor, 'crew_request.approve', r, account,
    `Requested by ${r.requestedByName} (${r.requestedByRole === 'admin' ? 'Captain' : 'Official'}), ${r.crewSize} workers`);
  await notifyRequester(actor, r, 'Cleanup team account created',
    `"${r.teamName}" now has an account (${account.email}). You can assign it to cleanups in Brgy. ${r.barangay}.`);
}

export async function markDeclined(actor: Actor, r: CrewRequest, reason: string): Promise<void> {
  await updateDoc(doc(db, 'crewRequests', r.id), {
    status: 'declined', decidedAt: serverTimestamp(), decidedBy: actor.uid, decidedByName: 'Super Admin', declineReason: reason.trim(),
  });
  await audit(actor, 'crew_request.decline', r, { uid: r.requestedBy, email: '' }, `Reason: ${reason.trim()}`);
  await notifyRequester(actor, r, 'Cleanup team request declined', `"${r.teamName}" was not created. Reason: ${reason.trim()}`);
}
