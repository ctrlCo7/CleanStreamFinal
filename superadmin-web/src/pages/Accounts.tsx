import { useEffect, useMemo, useState } from 'react';
import { AccountForm } from '../components/AccountForm';
import { Dialog } from '../components/Dialog';
import { ReviewDialog } from '../components/ReviewDialog';
import { DownloadIcon, PlusIcon, SearchIcon } from '../components/Icons';
import { MenuItem, RolePill, RowMenu, StatusPill } from '../components/Pill';
import {
  AccountFilter, accountsToCsv, filterAccounts, fullName, guardDisable, guardRoleChange, statusOf,
} from '../lib/accountRules';
import { useActor } from '../lib/auth';
import { useData } from '../lib/data';
import { useToast } from '../lib/feedback';
import { formatDate, initials } from '../lib/format';
import { Account, AccountStatus, ROLES, ROLE_LABELS, SELF_REGISTERING_STAFF } from '../lib/types';
import { useAccountActions } from '../lib/useAccountActions';

const PAGE_SIZE = 20;

const STATUS_OPTIONS: Array<{ value: AccountFilter['status']; label: string }> = [
  { value: 'live', label: 'All (hide removed)' },
  { value: 'active', label: 'Active' },
  { value: 'pending', label: 'Pending approval' },
  { value: 'rejected', label: 'ID rejected' },
  { value: 'inactive', label: 'Deactivated' },
  { value: 'removed', label: 'Removed' },
  { value: 'all', label: 'Everything' },
];

type FormState = null | { mode: 'create' } | { mode: 'edit'; account: Account };

export function Accounts() {
  const { accounts, loading } = useData();
  const actor = useActor();
  const actions = useAccountActions();
  const toast = useToast();

  const [filter, setFilter] = useState<AccountFilter>({ query: '', role: 'all', status: 'live' });
  const [page, setPage] = useState(0);
  const [form, setForm] = useState<FormState>(null);
  const [created, setCreated] = useState<{ email: string; password: string } | null>(null);
  const [reviewing, setReviewing] = useState<Account | null>(null);

  const filtered = useMemo(() => filterAccounts(accounts, filter), [accounts, filter]);
  const pageCount = Math.max(1, Math.ceil(filtered.length / PAGE_SIZE));
  useEffect(() => { setPage((p) => Math.min(p, pageCount - 1)); }, [pageCount]);
  const rows = filtered.slice(page * PAGE_SIZE, (page + 1) * PAGE_SIZE);

  const update = (patch: Partial<AccountFilter>) => { setFilter((f) => ({ ...f, ...patch })); setPage(0); };

  const exportCsv = () => {
    const blob = new Blob(['﻿', accountsToCsv(filtered)], { type: 'text/csv;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `cleanstream-accounts-${new Date().toISOString().slice(0, 10)}.csv`;
    a.click();
    URL.revokeObjectURL(url);
    toast.success(`Exported ${filtered.length} account${filtered.length === 1 ? '' : 's'}`);
  };

  const menuFor = (a: Account): MenuItem[] => {
    const status = statusOf(a);
    const self = a.uid === actor.uid;
    const disableGuard = guardDisable(actor, a, accounts, 'remove');
    const items: MenuItem[] = [{ label: 'Edit details', onSelect: () => setForm({ mode: 'edit', account: a }) }];
    if (status !== 'removed') {
      if (a.idVerification === 'pending') {
        items.push({ label: 'Review ID…', onSelect: () => setReviewing(a) });
      } else if (a.idVerification === undefined && SELF_REGISTERING_STAFF.includes(a.role)) {
        items.push(a.isVerified
          ? { label: 'Revoke approval', onSelect: () => actions.revoke(a) }
          : { label: 'Approve', onSelect: () => actions.approve(a) });
      }
      items.push(status === 'inactive'
        ? { label: 'Reactivate', onSelect: () => actions.reactivate(a) }
        : { label: 'Deactivate', onSelect: () => actions.deactivate(a), disabled: !disableGuard.ok, title: disableGuard.reason });
      items.push({ label: 'Send password reset email', onSelect: () => actions.resetPassword(a) });
      items.push({ label: 'Remove account', danger: true, onSelect: () => actions.remove(a), disabled: !disableGuard.ok, title: self ? "You can't remove your own account." : disableGuard.reason });
    } else {
      items.push({ label: 'Restore account', onSelect: () => actions.restore(a) });
    }
    return items;
  };

  const editRoleLock = (a: Account): string | undefined => {
    const other = a.role === 'admin' ? 'citizen' : 'admin';
    const g = guardRoleChange(actor, a, other, accounts);
    return g.ok ? undefined : g.reason;
  };

  const copy = async (text: string, what: string) => {
    try {
      await navigator.clipboard.writeText(text);
      toast.success(`${what} copied`);
    } catch {
      toast.error("Couldn't copy automatically. Select the text and copy it manually.");
    }
  };

  return (
    <>
      <header className="page-head">
        <div>
          <h1>Accounts</h1>
          <p className="muted">Create, edit, approve, deactivate and remove every kind of CleanStream account.</p>
        </div>
        <button className="btn btn-primary" onClick={() => setForm({ mode: 'create' })}><PlusIcon /> New account</button>
      </header>

      <div className="toolbar">
        <label className="search">
          <SearchIcon />
          <input type="search" placeholder="Search name, email, barangay or ID" value={filter.query} onChange={(e) => update({ query: e.target.value })} aria-label="Search accounts" />
        </label>
        <select value={filter.role} onChange={(e) => update({ role: e.target.value as AccountFilter['role'] })} aria-label="Filter by role">
          <option value="all">All roles</option>
          {ROLES.map((r) => <option key={r} value={r}>{ROLE_LABELS[r]}</option>)}
        </select>
        <select value={filter.status} onChange={(e) => update({ status: e.target.value as AccountFilter['status'] })} aria-label="Filter by status">
          {STATUS_OPTIONS.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
        </select>
        <span className="muted nowrap">{filtered.length} account{filtered.length === 1 ? '' : 's'}</span>
        <button className="btn" onClick={exportCsv} disabled={filtered.length === 0}><DownloadIcon /> Export CSV</button>
      </div>

      {loading ? <p className="muted">Loading accounts…</p> : filtered.length === 0 ? (
        <div className="empty">
          <strong>No accounts match</strong>
          <p className="muted">Try a different search or filter{accounts.length === 0 ? ', or create the first account' : ''}.</p>
        </div>
      ) : (
        <>
          <div className="table-wrap">
            <table>
              <thead><tr><th>Person</th><th>Role</th><th>Barangay / ID</th><th>Status</th><th>Created</th><th><span className="sr-only">Actions</span></th></tr></thead>
              <tbody>
                {rows.map((a) => (
                  <tr key={a.uid} className={statusOf(a) === 'removed' ? 'row-removed' : undefined}>
                    <td>
                      <div className="person">
                        <span className="avatar" aria-hidden="true">{initials(a.firstName, a.lastName, a.email)}</span>
                        <div>
                          <strong>{fullName(a)}{a.uid === actor.uid && <span className="you"> (you)</span>}</strong>
                          <div className="muted small">{a.email}</div>
                        </div>
                      </div>
                    </td>
                    <td><RolePill role={a.role} /></td>
                    <td>{a.barangay ?? <span className="muted">—</span>}{a.employeeId && <div className="muted small">{a.employeeId}</div>}</td>
                    <td><StatusPill account={a} /></td>
                    <td className="nowrap">{formatDate(a.createdAt)}</td>
                    <td className="actions"><RowMenu label={`Actions for ${fullName(a)}`} items={menuFor(a)} /></td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          {pageCount > 1 && (
            <nav className="pager" aria-label="Pagination">
              <button className="btn btn-sm" onClick={() => setPage((p) => p - 1)} disabled={page === 0}>Previous</button>
              <span className="muted">Page {page + 1} of {pageCount}</span>
              <button className="btn btn-sm" onClick={() => setPage((p) => p + 1)} disabled={page >= pageCount - 1}>Next</button>
            </nav>
          )}
        </>
      )}

      {form?.mode === 'create' && (
        <AccountForm
          mode="create"
          busy={actions.busyKey === 'create'}
          onClose={() => setForm(null)}
          onSubmit={async (input, sendReset) => {
            if (await actions.create(input, sendReset)) {
              setForm(null);
              setCreated({ email: input.email.trim().toLowerCase(), password: input.password });
            }
          }}
        />
      )}
      {form?.mode === 'edit' && (
        <AccountForm
          mode="edit"
          account={form.account}
          roleLockedReason={editRoleLock(form.account)}
          busy={actions.busyKey === `edit:${form.account.uid}`}
          onClose={() => setForm(null)}
          onSubmit={async (input) => { if (await actions.edit(form.account, input)) setForm(null); }}
        />
      )}

      {reviewing && <ReviewDialog account={reviewing} onClose={() => setReviewing(null)} />}

      {created && (
        <Dialog title="Account created" onClose={() => setCreated(null)}>
          <div className="dialog-body">
            <p>Give these sign-in details to the new user. <strong>The password won't be shown again.</strong></p>
            <dl className="credentials">
              <div><dt>Email</dt><dd><code>{created.email}</code> <button className="btn btn-sm" onClick={() => copy(created.email, 'Email')}>Copy</button></dd></div>
              <div><dt>Temporary password</dt><dd><code>{created.password}</code> <button className="btn btn-sm" onClick={() => copy(created.password, 'Password')}>Copy</button></dd></div>
            </dl>
            <p className="muted">They can choose their own password from the app's “Forgot password” link at any time.</p>
          </div>
          <div className="dialog-actions"><button className="btn btn-primary" onClick={() => setCreated(null)} autoFocus>Done</button></div>
        </Dialog>
      )}
    </>
  );
}

export type { AccountStatus };
