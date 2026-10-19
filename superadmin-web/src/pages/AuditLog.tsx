import { useMemo, useState } from 'react';
import { SearchIcon } from '../components/Icons';
import { ACTION_LABELS } from '../lib/accounts';
import { useData } from '../lib/data';
import { formatDateTime } from '../lib/format';
import { AuditAction } from '../lib/types';

export function AuditLog() {
  const { audit, loading } = useData();
  const [query, setQuery] = useState('');
  const [action, setAction] = useState<AuditAction | 'all'>('all');

  const rows = useMemo(() => {
    const q = query.trim().toLowerCase();
    return audit.filter((e) =>
      (action === 'all' || e.action === action) &&
      (!q || [e.targetName, e.targetEmail, e.actorEmail, e.details].some((v) => v.toLowerCase().includes(q))));
  }, [audit, query, action]);

  return (
    <>
      <header className="page-head">
        <div>
          <h1>Audit log</h1>
          <p className="muted">A permanent record of every account change made in this portal. Entries can't be edited or deleted.</p>
        </div>
      </header>

      <div className="toolbar">
        <label className="search">
          <SearchIcon />
          <input type="search" placeholder="Search by person, email or detail" value={query} onChange={(e) => setQuery(e.target.value)} aria-label="Search the audit log" />
        </label>
        <select value={action} onChange={(e) => setAction(e.target.value as AuditAction | 'all')} aria-label="Filter by action">
          <option value="all">All actions</option>
          {(Object.keys(ACTION_LABELS) as AuditAction[]).map((a) => <option key={a} value={a}>{ACTION_LABELS[a]}</option>)}
        </select>
        <span className="muted nowrap">{rows.length} entr{rows.length === 1 ? 'y' : 'ies'}</span>
      </div>

      {loading ? <p className="muted">Loading…</p> : rows.length === 0 ? (
        <div className="empty"><strong>No entries</strong><p className="muted">Nothing matches, or no changes have been made yet.</p></div>
      ) : (
        <div className="table-wrap">
          <table>
            <thead><tr><th>When</th><th>Action</th><th>Account</th><th>Details</th><th>By</th></tr></thead>
            <tbody>
              {rows.map((e) => (
                <tr key={e.id}>
                  <td className="nowrap">{formatDateTime(e.createdAt)}</td>
                  <td><strong>{ACTION_LABELS[e.action] ?? e.action}</strong></td>
                  <td>{e.targetName}<div className="muted small">{e.targetEmail}</div></td>
                  <td>{e.details}</td>
                  <td className="muted">{e.actorEmail}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </>
  );
}
