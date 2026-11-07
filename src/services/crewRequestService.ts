/**
 * Requests for a cleanup team (crew) account. Only the Super Admin creates accounts, so an
 * official or the Barangay Captain asks for one here; the request appears at once in the
 * Super Admin portal ("Crew requests", with a badge and an alert). The Super Admin creates
 * the account or declines with a reason, and the requester gets a notification either way.
 */
import {
  addDoc, collection, doc, onSnapshot, query, serverTimestamp, updateDoc, where,
} from 'firebase/firestore';
import { db } from './firebase';
import { CrewRequest, CrewRequestStatus, User } from '../types';

const COL = 'crewRequests';

export interface CrewRequestInput {
  teamName: string;
  crewSize: number;
  leaderName?: string;
  leaderEmail?: string;
  leaderPhone?: string;
  reason: string;
}

const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

/** What's wrong with the form, by field (empty when it can be sent). Pure, unit-tested. */
export function crewRequestProblems(input: CrewRequestInput): Partial<Record<keyof CrewRequestInput, string>> {
  const out: Partial<Record<keyof CrewRequestInput, string>> = {};
  if (input.teamName.trim().length < 3) out.teamName = 'Give the team a name (at least 3 characters).';
  else if (input.teamName.trim().length > 60) out.teamName = 'Keep the name under 60 characters.';
  if (!Number.isInteger(input.crewSize) || input.crewSize < 1 || input.crewSize > 100) out.crewSize = 'Enter the number of workers (1 to 100).';
  if (input.leaderEmail?.trim() && !EMAIL.test(input.leaderEmail.trim())) out.leaderEmail = 'That email address doesn\'t look right.';
  if (input.leaderPhone?.trim() && input.leaderPhone.replace(/\D/g, '').length < 10) out.leaderPhone = 'Enter a full mobile number, e.g. 0917 123 4567.';
  if (input.reason.trim().length < 10) out.reason = 'Say briefly why the barangay needs this team (at least 10 characters).';
  else if (input.reason.trim().length > 500) out.reason = 'Keep the reason under 500 characters.';
  return out;
}

export async function submitCrewRequest(user: User, input: CrewRequestInput): Promise<string> {
  if (user.role !== 'admin' && user.role !== 'barangay') throw new Error('Only barangay officials and the Captain can request a cleanup team.');
  if (!user.barangayId) throw new Error('Your account has no barangay. Ask the Super Admin to set it first.');
  const clean = (v?: string) => (v && v.trim() ? v.trim() : null);
  const ref = await addDoc(collection(db, COL), {
    barangayId: user.barangayId,
    barangay: user.barangay ?? user.barangayId,
    requestedBy: user.uid,
    requestedByName: `${user.firstName} ${user.lastName}`.trim(),
    requestedByRole: user.role,
    teamName: input.teamName.trim(),
    crewSize: input.crewSize,
    leaderName: clean(input.leaderName),
    leaderEmail: clean(input.leaderEmail)?.toLowerCase() ?? null,
    leaderPhone: clean(input.leaderPhone),
    reason: input.reason.trim(),
    status: 'pending' as CrewRequestStatus,
    createdAt: serverTimestamp(),
  });
  return ref.id;
}

/** The requester changed their mind before the Super Admin answered. */
export const cancelCrewRequest = (id: string) =>
  updateDoc(doc(db, COL, id), { status: 'cancelled' as CrewRequestStatus, cancelledAt: serverTimestamp() });

const iso = (v: unknown): string | undefined => {
  if (!v) return undefined;
  if (typeof v === 'string') return v;
  const t = v as { toDate?: () => Date };
  return t.toDate ? t.toDate().toISOString() : undefined;
};

const toRequest = (id: string, d: Record<string, unknown>): CrewRequest => ({
  id,
  barangayId: String(d.barangayId ?? ''),
  barangay: String(d.barangay ?? ''),
  requestedBy: String(d.requestedBy ?? ''),
  requestedByName: String(d.requestedByName ?? ''),
  requestedByRole: d.requestedByRole === 'admin' ? 'admin' : 'barangay',
  teamName: String(d.teamName ?? ''),
  crewSize: typeof d.crewSize === 'number' ? d.crewSize : 0,
  leaderName: (d.leaderName as string) ?? undefined,
  leaderEmail: (d.leaderEmail as string) ?? undefined,
  leaderPhone: (d.leaderPhone as string) ?? undefined,
  reason: String(d.reason ?? ''),
  status: (['pending', 'approved', 'declined', 'cancelled'] as const).find((s) => s === d.status) ?? 'pending',
  createdAt: iso(d.createdAt) ?? new Date().toISOString(),
  decidedAt: iso(d.decidedAt),
  decidedByName: (d.decidedByName as string) ?? undefined,
  declineReason: (d.declineReason as string) ?? undefined,
  accountEmail: (d.accountEmail as string) ?? undefined,
});

/** Every request from this barangay, newest first (officials and the Captain see each other's). */
export function subscribeToBarangayCrewRequests(
  barangayId: string,
  onData: (requests: CrewRequest[]) => void,
  onError?: (e: Error) => void,
): () => void {
  return onSnapshot(
    query(collection(db, COL), where('barangayId', '==', barangayId)),
    (snap) => onData(snap.docs.map((x) => toRequest(x.id, x.data())).sort((a, b) => b.createdAt.localeCompare(a.createdAt))),
    (e) => onError?.(e),
  );
}
