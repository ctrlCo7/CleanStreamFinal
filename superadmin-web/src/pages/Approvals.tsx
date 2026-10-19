import { useMemo, useState } from 'react';
import { RolePill } from '../components/Pill';
import { ReviewDialog } from '../components/ReviewDialog';
import { Account } from '../lib/types';
import { fullName, statusOf } from '../lib/accountRules';
import { useData } from '../lib/data';
import { formatDateTime } from '../lib/format';
import { useAccountActions } from '../lib/useAccountActions';

export function Approvals() {
  const { accounts, loading } = useData();
  const actions = useAccountActions();
  const [reviewing, setReviewing] = useState<Account | null>(null);
  const pending = useMemo(
    () => accounts.filter((a) => statusOf(a) === 'pending').sort((a, b) => (a.createdAt?.getTime() ?? 0) - (b.createdAt?.getTime() ?? 0)),
    [accounts],
  );

  return (
    <>
      <header className="page-head">
        <div>
          <h1>Approvals</h1>
          <p className="muted">People who registered in the app and are waiting for you. Admin and Barangay Official applicants submit an ID and selfies for you to check.</p>
        </div>
      </header>

      {loading ? <p className="muted">Loading…</p> : pending.length === 0 ? (
        <div className="empty">
          <strong>You're all caught up</strong>
          <p className="muted">New sign-ups that need approval will show up here.</p>
        </div>
      ) : (
        <ul className="approval-list">
          {pending.map((a) => (
            <li key={a.uid} className="card approval">
              <div className="approval-main">
                <div className="approval-title">
                  <strong>{fullName(a)}</strong> <RolePill role={a.role} />
                </div>
                <dl className="facts">
                  <div><dt>Email</dt><dd>{a.email}</dd></div>
                  {a.barangay && <div><dt>Barangay</dt><dd>{a.barangay}</dd></div>}
                  {a.employeeId && <div><dt>Employee ID</dt><dd>{a.employeeId}</dd></div>}
                  {a.agency && <div><dt>Agency</dt><dd>{a.agency}</dd></div>}
                  <div><dt>Registered</dt><dd>{formatDateTime(a.createdAt)}</dd></div>
                </dl>
              </div>
              <div className="approval-actions">
                {a.idVerification === 'pending' ? (
                  <button className="btn btn-primary" onClick={() => setReviewing(a)}>Review ID</button>
                ) : (
                  <>
                    <button className="btn btn-primary" disabled={actions.busyKey === `approve:${a.uid}`} onClick={() => actions.approve(a)}>Approve</button>
                    <button className="btn btn-danger-outline" onClick={() => actions.remove(a, 'reject')}>Reject</button>
                  </>
                )}
              </div>
            </li>
          ))}
        </ul>
      )}

      {reviewing && <ReviewDialog account={reviewing} onClose={() => setReviewing(null)} />}
    </>
  );
}
