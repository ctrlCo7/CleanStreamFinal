import { useMemo } from 'react';
import { computeStats, fullName, statusOf } from '../lib/accountRules';
import { ACTION_LABELS } from '../lib/accounts';
import { useData } from '../lib/data';
import { useTick } from '../lib/feedback';
import { relativeTime } from '../lib/format';
import { ROLES, ROLE_LABELS } from '../lib/types';
import { useAccountActions } from '../lib/useAccountActions';

export function Overview({ go }: { go: (route: 'accounts' | 'approvals' | 'audit') => void }) {
  const { accounts, audit, loading } = useData();
  const actions = useAccountActions();
  useTick();
  const stats = useMemo(() => computeStats(accounts), [accounts]);
  const pending = useMemo(() => accounts.filter((a) => statusOf(a) === 'pending').slice(0, 5), [accounts]);
  const max = Math.max(1, ...ROLES.map((r) => stats.byRole[r]));

  if (loading) return <p className="muted">Loading…</p>;

  return (
    <>
      <header className="page-head">
        <div>
          <h1>Overview</h1>
          <p className="muted">Every CleanStream account in one place.</p>
        </div>
      </header>

      <section className="stat-grid" aria-label="Account totals">
        <button className="stat" onClick={() => go('accounts')}><span className="stat-n">{stats.total}</span><span className="stat-l">Total accounts</span></button>
        <button className={`stat${stats.pending ? ' stat-attn' : ''}`} onClick={() => go('approvals')}><span className="stat-n">{stats.pending}</span><span className="stat-l">Awaiting approval</span></button>
        <button className="stat" onClick={() => go('accounts')}><span className="stat-n">{stats.inactive}</span><span className="stat-l">Deactivated</span></button>
        <button className="stat" onClick={() => go('accounts')}><span className="stat-n">{stats.newThisWeek}</span><span className="stat-l">New this week</span></button>
      </section>

      <div className="two-col">
        <section className="card">
          <h2>Accounts by role</h2>
          <ul className="bars">
            {ROLES.map((r) => (
              <li key={r}>
                <span className="bars-label">{ROLE_LABELS[r]}</span>
                <span className="bars-track"><span className="bars-fill" style={{ width: `${(stats.byRole[r] / max) * 100}%` }} /></span>
                <span className="bars-n">{stats.byRole[r]}</span>
              </li>
            ))}
          </ul>
        </section>

        <section className="card">
          <div className="card-head">
            <h2>Needs approval</h2>
            {stats.pending > 5 && <button className="link" onClick={() => go('approvals')}>View all {stats.pending}</button>}
          </div>
          {pending.length === 0 ? (
            <p className="muted">Nothing waiting. New barangay and cleanup-team sign-ups will appear here.</p>
          ) : (
            <ul className="list">
              {pending.map((a) => (
                <li key={a.uid}>
                  <div>
                    <strong>{fullName(a)}</strong>
                    <span className="muted"> · {ROLE_LABELS[a.role]}{a.barangay ? ` · ${a.barangay}` : ''}</span>
                  </div>
                  {a.idVerification === 'pending' ? (
                    <button className="btn btn-sm btn-primary" onClick={() => go('approvals')}>Review ID</button>
                  ) : (
                    <button className="btn btn-sm btn-primary" disabled={actions.busyKey === `approve:${a.uid}`} onClick={() => actions.approve(a)}>Approve</button>
                  )}
                </li>
              ))}
            </ul>
          )}
        </section>
      </div>

      <section className="card">
        <div className="card-head">
          <h2>Recent activity</h2>
          <button className="link" onClick={() => go('audit')}>Full audit log</button>
        </div>
        {audit.length === 0 ? (
          <p className="muted">No changes recorded yet.</p>
        ) : (
          <ul className="list">
            {audit.slice(0, 6).map((e) => (
              <li key={e.id}>
                <div>
                  <strong>{ACTION_LABELS[e.action] ?? e.action}</strong>
                  <span className="muted"> · {e.targetName || e.targetEmail} · by {e.actorEmail}</span>
                </div>
                <span className="muted nowrap">{relativeTime(e.createdAt)}</span>
              </li>
            ))}
          </ul>
        )}
      </section>
    </>
  );
}
