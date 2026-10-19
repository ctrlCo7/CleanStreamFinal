import { useCallback, useState } from 'react';
import { AccountFormInput, NewAccountInput, fullName, guardDisable, guardRoleChange } from './accountRules';
import {
  createAccount, removeAccount, restoreAccount, sendResetEmail, setAccountActive, setAccountVerified,
  updateAccount,
} from './accounts';
import { useActor } from './auth';
import { useData } from './data';
import { useConfirm, useToast } from './feedback';
import { Account } from './types';

const explain = (e: unknown): string => {
  const code = (e as { code?: string }).code ?? '';
  if (code === 'permission-denied' || code === 'firestore/permission-denied') {
    return "Permission denied. Make sure the latest security rules are deployed and you're signed in as a Super Admin.";
  }
  if (code === 'auth/email-already-in-use') return 'An account with that email already exists.';
  if (code === 'auth/weak-password') return 'That password is too weak. Use a longer one.';
  if (code === 'auth/invalid-email') return 'That email address is not valid.';
  if (code === 'auth/network-request-failed' || code === 'unavailable') return 'No connection. Check your internet and try again.';
  return (e as Error).message || 'Something went wrong.';
};

/** Every account operation, with its safety checks, confirmation and success/error feedback. */
export function useAccountActions() {
  const actor = useActor();
  const { accounts } = useData();
  const toast = useToast();
  const confirm = useConfirm();
  const [busyKey, setBusyKey] = useState<string | null>(null);

  const run = useCallback(async (key: string, work: () => Promise<void>, success: string): Promise<boolean> => {
    setBusyKey(key);
    try {
      await work();
      toast.success(success);
      return true;
    } catch (e) {
      toast.error(explain(e));
      return false;
    } finally {
      setBusyKey(null);
    }
  }, [toast]);

  const create = useCallback(async (input: NewAccountInput, sendResetLink: boolean): Promise<boolean> => {
    let resetEmailError: string | null = null;
    const ok = await run('create', async () => {
      resetEmailError = (await createAccount(actor, input, sendResetLink)).resetEmailError;
    }, `${input.firstName} ${input.lastName} created`);
    if (ok && resetEmailError) toast.error(`Account created, but the password-reset email failed: ${resetEmailError}`);
    return ok;
  }, [actor, run, toast]);

  const edit = useCallback(async (target: Account, input: AccountFormInput): Promise<boolean> => {
    const guard = guardRoleChange(actor, target, input.role, accounts);
    if (!guard.ok) { toast.error(guard.reason ?? 'Not allowed.'); return false; }
    let changed = false;
    const ok = await run(`edit:${target.uid}`, async () => { changed = await updateAccount(actor, target, input); }, 'Changes saved');
    if (ok && !changed) toast.success('Nothing to change.');
    return ok;
  }, [accounts, actor, run, toast]);

  const approve = useCallback((a: Account) =>
    run(`approve:${a.uid}`, () => setAccountVerified(actor, a, true), `${fullName(a)} approved`), [actor, run]);

  const revoke = useCallback(async (a: Account) => {
    const yes = await confirm({
      title: 'Revoke approval?', confirmLabel: 'Revoke approval',
      message: <p><strong>{fullName(a)}</strong> will go back to “Pending approval”.</p>,
    });
    if (yes) await run(`revoke:${a.uid}`, () => setAccountVerified(actor, a, false), `Approval revoked for ${fullName(a)}`);
  }, [actor, confirm, run]);

  const deactivate = useCallback(async (a: Account) => {
    const guard = guardDisable(actor, a, accounts, 'deactivate');
    if (!guard.ok) { toast.error(guard.reason ?? 'Not allowed.'); return; }
    const yes = await confirm({
      title: 'Deactivate account?', confirmLabel: 'Deactivate', danger: true,
      message: <p><strong>{fullName(a)}</strong> will be signed out of the app and blocked from signing in until you reactivate them. Their data is kept.</p>,
    });
    if (yes) await run(`deactivate:${a.uid}`, () => setAccountActive(actor, a, false), `${fullName(a)} deactivated`);
  }, [accounts, actor, confirm, run, toast]);

  const reactivate = useCallback((a: Account) =>
    run(`reactivate:${a.uid}`, () => setAccountActive(actor, a, true), `${fullName(a)} reactivated`), [actor, run]);

  const remove = useCallback(async (a: Account, verb: 'remove' | 'reject' = 'remove') => {
    const guard = guardDisable(actor, a, accounts, 'remove');
    if (!guard.ok) { toast.error(guard.reason ?? 'Not allowed.'); return; }
    const yes = await confirm({
      title: verb === 'reject' ? 'Reject this registration?' : 'Remove account?',
      confirmLabel: verb === 'reject' ? 'Reject' : 'Remove', danger: true,
      message: (
        <>
          <p><strong>{fullName(a)}</strong> will be blocked from signing in and hidden from the default list.</p>
          <p className="muted">Their reports and history are kept, and you can restore the account later from the “Removed” filter.</p>
        </>
      ),
    });
    if (yes) await run(`remove:${a.uid}`, () => removeAccount(actor, a), `${fullName(a)} removed`);
  }, [accounts, actor, confirm, run, toast]);

  const restore = useCallback((a: Account) =>
    run(`restore:${a.uid}`, () => restoreAccount(actor, a), `${fullName(a)} restored`), [actor, run]);

  const resetPassword = useCallback(async (a: Account) => {
    const yes = await confirm({
      title: 'Send password reset email?', confirmLabel: 'Send email',
      message: <p>A link to choose a new password will be sent to <strong>{a.email}</strong>.</p>,
    });
    if (yes) await run(`reset:${a.uid}`, () => sendResetEmail(actor, a), `Reset email sent to ${a.email}`);
  }, [actor, confirm, run]);

  return { busyKey, create, edit, approve, revoke, deactivate, reactivate, remove, restore, resetPassword };
}
