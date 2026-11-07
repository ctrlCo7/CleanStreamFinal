import { useEffect, useMemo, useState } from 'react';
import { listBarangays } from '../lib/barangays';
import { LiveTrip, secondsSinceSeen, subscribeLiveTrips } from '../lib/cityMap';
import { useCrewRequests } from '../lib/crewRequestsData';
import { computeStats, fullName, statusOf } from '../lib/accountRules';
import { ACTION_LABELS } from '../lib/accounts';
import { useData } from '../lib/data';
import { useTick } from '../lib/feedback';
import { relativeTime } from '../lib/format';
import { ROLES, ROLE_LABELS } from '../lib/types';
import { useAccountActions } from '../lib/useAccountActions';
import { Route } from '../components/Layout';
import { WASTE_GROUPS, WASTE_LABELS } from '../lib/operations';
import { useOps } from '../lib/opsData';
import { reportStats } from '../lib/opsStats';

export function Overview({ go }: { go: (route: Route) => void }) {
  const { accounts, audit, loading } = useData();
  const actions = useAccountActions();
  useTick();
  const stats = useMemo(() => computeStats(accounts), [accounts]);
  const pending = useMemo(() => accounts.filter((a) => statusOf(a) === 'pending').slice(0, 5), [accounts]);
  const max = Math.max(1, ...ROLES.map((r) => stats.byRole[r]));
  const { reports } = useOps();
  const ops = useMemo(() => reportStats(reports, new Date()), [reports]);
  const maxWaste = Math.max(1, ...WASTE_GROUPS.map((g) => ops.waste[g]));
  const crewRequests = useCrewRequests();
  // Barangays with at least one official, Captain or crew account.
  const barangaysOnBoard = useMemo(() => new Set(accounts
    .filter((a) => (a.role === 'barangay' || a.role === 'admin' || a.role === 'cleanup_team') && a.barangayId && !a.deletedAt)
    .map((a) => a.barangayId)).size, [accounts]);
  const [trips, setTrips] = useState<LiveTrip[]>([]);
  useEffect(() => subscribeLiveTrips(setTrips, () => setTrips([])), []);
  // Trips silent for 30 minutes were never ended (same rule as the City map).
  const liveTrucks = trips.filter((t) => secondsSinceSeen(t) <= 30 * 60).length;

  if (loading) return <p className="muted">Loading…</p>;

  return (
    <>
      <header className="page-head">
        <div>
          <h1>Overview</h1>
          <p className="muted">Waste reports and every CleanStream account in one place.</p>
        </div>
      </header>

      <section className="stat-grid" aria-label="Report totals">
        <button className="stat" onClick={() => go('reports')}><span className="stat-n">{ops.total}</span><span className="stat-l">Total reports</span></button>
        <button className={`stat${ops.pending ? ' stat-attn' : ''}`} onClick={() => go('reports')}><span className="stat-n">{ops.pending}</span><span className="stat-l">Waiting for verification</span></button>
        <button className="stat" onClick={() => go('reports')}><span className="stat-n">{ops.verified}</span><span className="stat-l">Verified, awaiting cleanup</span></button>
        <button className="stat" onClick={() => go('map')}><span className="stat-n">{ops.ongoing}</span><span className="stat-l">Cleanups scheduled or under way</span></button>
        <button className="stat" onClick={() => go('analytics')}><span className="stat-n">{ops.resolved}</span><span className="stat-l">Cleaned up</span></button>
        <button className={`stat${ops.critical ? ' stat-attn' : ''}`} onClick={() => go('reports')}><span className="stat-n">{ops.critical}</span><span className="stat-l">Critical incidents open</span></button>
      </section>

      <section className="stat-grid" aria-label="City operations">
        <button className="stat" onClick={() => go('units')}>
          <span className="stat-n">{barangaysOnBoard}</span>
          <span className="stat-l">Barangays on CleanStream (of {listBarangays().length} in Cebu City)</span>
        </button>
        <button className="stat" onClick={() => go('map')}><span className="stat-n">{liveTrucks}</span><span className="stat-l">Trucks on the way now</span></button>
        <button className={`stat${crewRequests.pending.length ? ' stat-attn' : ''}`} onClick={() => go('requests')}>
          <span className="stat-n">{crewRequests.pending.length}</span><span className="stat-l">Crew requests waiting</span>
        </button>
      </section>

      <div className="two-col">
        <section className="card">
          <div className="card-head"><h2>Report trend</h2><button className="link" onClick={() => go('analytics')}>Analytics</button></div>
          <ul className="bars">
            {ops.monthly.map((m) => (
              <li key={m.label}>
                <span className="bars-label">{m.label}</span>
                <span className="bars-track"><span className="bars-fill" style={{ width: `${(m.count / Math.max(1, ...ops.monthly.map((x) => x.count))) * 100}%` }} /></span>
                <span className="bars-n">{m.count}</span>
              </li>
            ))}
          </ul>
        </section>
        <section className="card">
          <h2>Waste types</h2>
          <ul className="bars">
            {WASTE_GROUPS.map((g) => (
              <li key={g}>
                <span className="bars-label">{WASTE_LABELS[g]}</span>
                <span className="bars-track"><span className={`bars-fill bars-${g}`} style={{ width: `${(ops.waste[g] / maxWaste) * 100}%` }} /></span>
                <span className="bars-n">{ops.waste[g]}</span>
              </li>
            ))}
          </ul>
        </section>
      </div>

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
