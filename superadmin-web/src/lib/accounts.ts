import { createUserWithEmailAndPassword, deleteUser, sendPasswordResetEmail } from 'firebase/auth';
import {
  Timestamp, addDoc, collection, deleteField, doc, getDoc, limit, onSnapshot, orderBy, query, serverTimestamp,
  setDoc, updateDoc, writeBatch,
} from 'firebase/firestore';
import { AccountFormInput, NewAccountInput, fullName } from './accountRules';
import { barangayById } from './barangays';
import { normalizePhone } from './phone';
import { auth, db, withSecondaryAuth } from './firebase';
import { matchSummaryForRecord } from './faceVerdict';
import { Account, Actor, AuditAction, AuditEntry, ClientChecks, ROLES, ROLE_LABELS, Role, Verification } from './types';

// ─── Reading ─────────────────────────────────────────────────────────────────

const toDate = (v: unknown): Date | null => {
  if (!v) return null;
  if (v instanceof Timestamp) return v.toDate();
  if (v instanceof Date) return v;
  if (typeof v === 'string') {
    const d = new Date(v);
    return Number.isNaN(d.getTime()) ? null : d;
  }
  return null;
};

const str = (v: unknown): string | undefined => (typeof v === 'string' && v.trim() ? v : undefined);

export const toAccount = (id: string, d: Record<string, unknown>): Account => ({
  uid: id,
  email: str(d.email) ?? '',
  firstName: str(d.firstName) ?? '',
  lastName: str(d.lastName) ?? '',
  role: ROLES.includes(d.role as Role) ? (d.role as Role) : 'citizen',
  barangay: str(d.barangay),
  barangayId: str(d.barangayId),
  employeeId: str(d.employeeId),
  agency: str(d.agency),
  phone: str(d.phone),
  // Older documents may predate these flags: treat a missing isActive as active.
  idVerification: (['pending', 'approved', 'rejected'] as const).find((v) => v === d.idVerification),
  idRejectionReason: str(d.idRejectionReason),
  isActive: d.isActive !== false,
  isVerified: d.isVerified === true,
  createdAt: toDate(d.createdAt),
  deletedAt: toDate(d.deletedAt),
});

/** Live list of every account. Sorted client-side because orderBy would silently skip documents missing the field. */
export const subscribeAccounts = (onData: (accounts: Account[]) => void, onError: (e: Error) => void) => {
  // Firestore answers first from its local cache, which here holds only the documents
  // already read (e.g. the Super Admin's own profile), so showing that first snapshot
  // would flash a wrong, tiny total. Wait for the server's answer; if the server can't be
  // reached within a few seconds, fall back to whatever the cache has.
  let gotServerData = false;
  let latest: Account[] | null = null;
  const fallback = window.setTimeout(() => { if (!gotServerData && latest) onData(latest); }, 6000);

  const unsubscribe = onSnapshot(
    collection(db, 'users'),
    { includeMetadataChanges: true },
    (snap) => {
      const list = snap.docs.map((d) => toAccount(d.id, d.data()));
      list.sort((a, b) => (b.createdAt?.getTime() ?? 0) - (a.createdAt?.getTime() ?? 0));
      latest = list;
      if (!snap.metadata.fromCache) gotServerData = true;
      if (gotServerData) onData(list);
    },
    onError,
  );
  return () => { window.clearTimeout(fallback); unsubscribe(); };
};

// ─── Audit log ───────────────────────────────────────────────────────────────

export const ACTION_LABELS: Record<AuditAction, string> = {
  'account.create': 'Created account',
  'account.update': 'Edited account',
  'account.verify': 'Approved account',
  'account.unverify': 'Revoked approval',
  'account.deactivate': 'Deactivated account',
  'account.reactivate': 'Reactivated account',
  'account.remove': 'Removed account',
  'account.restore': 'Restored account',
  'account.reset_password': 'Sent password reset',
  'identity.approve': 'Approved ID verification',
  'identity.reject': 'Rejected ID verification',
};

const logAudit = async (actor: Actor, action: AuditAction, target: Pick<Account, 'uid' | 'email' | 'firstName' | 'lastName'>, details: string) => {
  try {
    await addDoc(collection(db, 'auditLogs'), {
      action,
      actorUid: actor.uid,
      actorEmail: actor.email,
      targetUid: target.uid,
      targetEmail: target.email,
      targetName: fullName(target),
      details,
      createdAt: serverTimestamp(),
    });
  } catch (e) {
    throw new Error(`The change was saved, but writing the audit log failed: ${(e as Error).message}`);
  }
};

export const subscribeAudit = (onData: (entries: AuditEntry[]) => void, onError: (e: Error) => void) =>
  onSnapshot(
    query(collection(db, 'auditLogs'), orderBy('createdAt', 'desc'), limit(300)),
    (snap) =>
      onData(
        snap.docs.map((d) => {
          const x = d.data();
          return {
            id: d.id,
            action: x.action as AuditAction,
            actorUid: String(x.actorUid ?? ''),
            actorEmail: String(x.actorEmail ?? ''),
            targetUid: String(x.targetUid ?? ''),
            targetEmail: String(x.targetEmail ?? ''),
            targetName: String(x.targetName ?? ''),
            details: String(x.details ?? ''),
            createdAt: toDate(x.createdAt),
          };
        }),
      ),
    onError,
  );

// ─── Writing ─────────────────────────────────────────────────────────────────

/** Firestore rejects `undefined` field values, so optional fields that don't apply are left out entirely. */
const clean = (obj: Record<string, unknown>): Record<string, unknown> =>
  Object.fromEntries(Object.entries(obj).filter(([, v]) => v !== undefined));

const profileFields = (input: AccountFormInput) => {
  const b = input.role === 'citizen' || input.role === 'barangay' || input.role === 'cleanup_team' ? barangayById(input.barangayId) : undefined;
  return {
    firstName: input.firstName.trim(),
    lastName: input.lastName.trim(),
    role: input.role,
    barangay: b?.name,
    barangayId: b?.id,
    employeeId: input.employeeId?.trim() || undefined,
    agency: input.agency?.trim() || undefined,
    phone: (input.phone && normalizePhone(input.phone)) || undefined,
  };
};

export const createAccount = async (
  actor: Actor,
  input: NewAccountInput,
  sendResetLink: boolean,
): Promise<{ uid: string; resetEmailError: string | null }> => {
  const email = input.email.trim().toLowerCase();
  const fields = profileFields(input);

  const uid = await withSecondaryAuth(async (secondaryAuth) => {
    const cred = await createUserWithEmailAndPassword(secondaryAuth, email, input.password);
    try {
      await setDoc(
        doc(db, 'users', cred.user.uid),
        clean({
          uid: cred.user.uid,
          email,
          ...fields,
          // Accounts made by the Super Admin need no further approval.
          isActive: true,
          isVerified: true,
          createdAt: serverTimestamp(),
          createdBy: actor.uid,
        }),
      );
    } catch (e) {
      // Don't leave a sign-in with no profile behind (it would block re-using the email).
      await deleteUser(cred.user).catch(() => undefined);
      throw e;
    }
    return cred.user.uid;
  });

  // The account exists either way; a failed email must not read as a failed creation.
  let resetEmailError: string | null = null;
  if (sendResetLink) {
    try {
      await sendPasswordResetEmail(auth, email);
    } catch (e) {
      resetEmailError = (e as Error).message;
    }
  }

  await logAudit(actor, 'account.create', { uid, email, firstName: fields.firstName, lastName: fields.lastName },
    `Created ${ROLE_LABELS[input.role]} account${sendResetLink && !resetEmailError ? ' and emailed a password-setup link' : ''}`);
  return { uid, resetEmailError };
};

const diffSummary = (before: Account, after: ReturnType<typeof profileFields>): string => {
  const changes: string[] = [];
  const cmp = (label: string, a: string | undefined, b: string | undefined) => {
    if ((a ?? '') !== (b ?? '')) changes.push(`${label}: ${a || '(none)'} → ${b || '(none)'}`);
  };
  cmp('first name', before.firstName, after.firstName);
  cmp('last name', before.lastName, after.lastName);
  cmp('role', ROLE_LABELS[before.role], ROLE_LABELS[after.role]);
  cmp('barangay', before.barangay, after.barangay);
  cmp('employee ID', before.employeeId, after.employeeId);
  cmp('agency', before.agency, after.agency);
  cmp('phone', before.phone, after.phone);
  return changes.join('; ');
};

export const updateAccount = async (actor: Actor, target: Account, input: AccountFormInput): Promise<boolean> => {
  const fields = profileFields(input);
  const summary = diffSummary(target, fields);
  if (!summary) return false;

  // deleteField() clears optional fields that no longer apply (e.g. barangay after becoming an Admin).
  await updateDoc(doc(db, 'users', target.uid), {
    firstName: fields.firstName,
    lastName: fields.lastName,
    role: fields.role,
    barangay: fields.barangay ?? deleteField(),
    barangayId: fields.barangayId ?? deleteField(),
    employeeId: fields.employeeId ?? deleteField(),
    agency: fields.agency ?? deleteField(),
    phone: fields.phone ?? deleteField(),
    updatedAt: serverTimestamp(),
  });
  await logAudit(actor, 'account.update', { ...target, firstName: fields.firstName, lastName: fields.lastName }, summary);
  return true;
};

export const setAccountActive = async (actor: Actor, target: Account, active: boolean) => {
  await updateDoc(doc(db, 'users', target.uid), { isActive: active, updatedAt: serverTimestamp() });
  await logAudit(actor, active ? 'account.reactivate' : 'account.deactivate', target,
    active ? 'Account can sign in again' : 'Account blocked from signing in');
};

export const setAccountVerified = async (actor: Actor, target: Account, verified: boolean) => {
  await updateDoc(doc(db, 'users', target.uid), { isVerified: verified, updatedAt: serverTimestamp() });
  await logAudit(actor, verified ? 'account.verify' : 'account.unverify', target,
    verified ? 'Registration approved' : 'Approval revoked');
};

/**
 * "Remove" = block sign-in and hide from the default list. Their reports and history stay intact.
 * Deleting the underlying sign-in itself needs server-side admin access, which this portal
 * (free tier, no backend) deliberately doesn't have; the account simply can no longer be used.
 */
export const removeAccount = async (actor: Actor, target: Account) => {
  await updateDoc(doc(db, 'users', target.uid), {
    isActive: false, deletedAt: serverTimestamp(), deletedBy: actor.uid, updatedAt: serverTimestamp(),
  });
  await logAudit(actor, 'account.remove', target, 'Account removed (sign-in blocked, records kept)');
};

export const restoreAccount = async (actor: Actor, target: Account) => {
  await updateDoc(doc(db, 'users', target.uid), {
    isActive: true, deletedAt: deleteField(), deletedBy: deleteField(), updatedAt: serverTimestamp(),
  });
  await logAudit(actor, 'account.restore', target, 'Account restored');
};

export const sendResetEmail = async (actor: Actor, target: Account) => {
  await sendPasswordResetEmail(auth, target.email);
  await logAudit(actor, 'account.reset_password', target, `Password reset email sent to ${target.email}`);
};

// ─── Identity verification (ID photo + selfies) ──────────────────────────────

/** The applicant's submission, or null if they never uploaded one. */
export const getVerification = async (uid: string): Promise<Verification | null> => {
  const snap = await getDoc(doc(db, 'verifications', uid));
  if (!snap.exists()) return null;
  const d = snap.data();
  return {
    uid,
    role: ROLES.includes(d.role as Role) ? (d.role as Role) : 'barangay',
    idType: str(d.idType) ?? '',
    idImage: str(d.idImage) ?? '',
    selfieNeutral: str(d.selfieNeutral) ?? '',
    selfieSmile: str(d.selfieSmile) ?? '',
    selfieTurn: str(d.selfieTurn) ?? '',
    clientChecks: (d.clientChecks ?? {}) as ClientChecks,
    status: d.status === 'approved' || d.status === 'rejected' ? d.status : 'pending',
    submittedAt: toDate(d.submittedAt),
  };
};

// The photos are deleted the moment a decision is made: only the outcome is kept.
const PURGE_IMAGES = {
  idImage: deleteField(), selfieNeutral: deleteField(), selfieSmile: deleteField(), selfieTurn: deleteField(),
};

type MatchRecord = ReturnType<typeof matchSummaryForRecord>;

const describeMatch = (m: MatchRecord): string =>
  m.verdict === 'not-run' ? 'automatic face check not run' : `face check: ${m.verdict}${m.bestDistance !== null ? ` (distance ${m.bestDistance})` : ''}`;

/** Approves the ID check: the account gets its powers and the photos are deleted, in one step. */
export const approveIdentity = async (actor: Actor, target: Account, match: MatchRecord, hasRecord: boolean) => {
  const batch = writeBatch(db);
  batch.update(doc(db, 'users', target.uid), {
    idVerification: 'approved', isVerified: true, idRejectionReason: deleteField(), updatedAt: serverTimestamp(),
  });
  if (hasRecord) {
    batch.update(doc(db, 'verifications', target.uid), {
      status: 'approved', reviewedBy: actor.uid, reviewedByEmail: actor.email, reviewedAt: serverTimestamp(), faceMatch: match, ...PURGE_IMAGES,
    });
  }
  await batch.commit();
  await logAudit(actor, 'identity.approve', target, `ID verified; ${describeMatch(match)}; photos deleted`);
};

/** Rejects the ID check with a reason the applicant will see; they can resubmit new photos. */
export const rejectIdentity = async (actor: Actor, target: Account, reason: string, match: MatchRecord, hasRecord: boolean) => {
  const batch = writeBatch(db);
  batch.update(doc(db, 'users', target.uid), {
    idVerification: 'rejected', idRejectionReason: reason, updatedAt: serverTimestamp(),
  });
  if (hasRecord) {
    batch.update(doc(db, 'verifications', target.uid), {
      status: 'rejected', reason, reviewedBy: actor.uid, reviewedByEmail: actor.email, reviewedAt: serverTimestamp(), faceMatch: match, ...PURGE_IMAGES,
    });
  }
  await batch.commit();
  await logAudit(actor, 'identity.reject', target, `Reason: ${reason}; ${describeMatch(match)}; photos deleted`);
};
