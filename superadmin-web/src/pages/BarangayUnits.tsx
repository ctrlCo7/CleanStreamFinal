import { useMemo } from 'react';
import { statusOf } from '../lib/accountRules';
import { listBarangays } from '../lib/barangays';
import { useData } from '../lib/data';
import { useTick } from '../lib/feedback';
import { relativeTime } from '../lib/format';
import { OpsErrors, useOps } from '../lib/opsData';
import { inspectionCompliance, reportStats } from '../lib/opsStats';

export function BarangayUnits({ openCheckpoints }: { openCheckpoints: (barangayId: string) => void }) {
  const { accounts, customBarangays } = useData();
  const { reports, checkpoints, inspections, loading } = useOps();
  useTick();

  const rows = useMemo(() => {
    const now = new Date();
    const byBarangay = new Map(reportStats(reports, now).byBarangay.map((b) => [b.id, b]));
    return listBarangays().map((b) => {
      const live = accounts.filter((a) => a.barangayId === b.id && statusOf(a) === 'active');
      const cps = checkpoints.filter((c) => c.barangayId === b.id);
      const comp = inspectionCompliance(cps, inspections, now).total;
      const last = inspections.find((i) => i.barangayId === b.id)?.createdAt ?? null;
      return {
        ...b,
        officials: live.filter((a) => a.role === 'barangay').length,
        crews: live.filter((a) => a.role === 'cleanup_team').length,
        checkpoints: cps.filter((c) => c.isActive).length,
        pausedCheckpoints: cps.filter((c) => !c.isActive).length,
        compliance: comp,
        lastInspection: last,
        openReports: byBarangay.get(b.id)?.open ?? 0,
        critical: byBarangay.get(b.id)?.critical ?? 0,
      };
    });
  }, [accounts, customBarangays, reports, checkpoints, inspections]);

  const totals = rows.reduce(
    (t, r) => ({ officials: t.officials + r.officials, checkpoints: t.checkpoints + r.checkpoints, missed: t.missed + r.compliance.missed, open: t.open + r.openReports }),
    { officials: 0, checkpoints: 0, missed: 0, open: 0 },
  );

  return (
    <>
      <header className="page-head">
        <div>
          <h1>Barangay units</h1>
          <p className="muted">Personnel, checkpoints and patrol compliance for each barangay service point. Compliance covers the last 7 days.</p>
        </div>
      </header>
      <OpsErrors streams={['reports', 'checkpoints', 'inspections']} />

      <section className="stat-grid" aria-label="Totals">
        <div className="stat"><span className="stat-n">{totals.officials}</span><span className="stat-l">Active barangay officials</span></div>
        <div className="stat"><span className="stat-n">{totals.checkpoints}</span><span className="stat-l">Active checkpoints</span></div>
        <div className={`stat${totals.missed ? ' stat-attn' : ''}`}><span className="stat-n">{totals.missed}</span><span className="stat-l">Missed patrols (7 days)</span></div>
        <div className="stat"><span className="stat-n">{totals.open}</span><span className="stat-l">Open reports</span></div>
      </section>

      {loading.checkpoints || loading.reports ? <p className="muted">Loading…</p> : (
        <div className="table-wrap">
          <table>
            <thead>
              <tr><th>Barangay</th><th>Personnel</th><th>Checkpoints</th><th>Inspections</th><th>Missed</th><th>Compliance</th><th>Open reports</th><th><span className="sr-only">Actions</span></th></tr>
            </thead>
            <tbody>
              {rows.map((r) => (
                <tr key={r.id}>
                  <td><strong>{r.name}</strong><div className="muted small">Last inspection: {r.lastInspection ? relativeTime(r.lastInspection) : 'none yet'}</div></td>
                  <td>{r.officials} official{r.officials === 1 ? '' : 's'}<div className="muted small">{r.crews} cleanup crew{r.crews === 1 ? '' : 's'}</div></td>
                  <td>{r.checkpoints}{r.pausedCheckpoints > 0 && <div className="muted small">{r.pausedCheckpoints} paused</div>}</td>
                  <td>{r.compliance.done} of {r.compliance.expected}</td>
                  <td>{r.compliance.missed ? <strong className="text-danger">{r.compliance.missed}</strong> : 0}</td>
                  <td>
                    {r.compliance.expected ? (
                      <span className={`pill ${r.compliance.rate >= 80 ? 'pill-active' : r.compliance.rate >= 50 ? 'pill-pending' : 'pill-rejected'}`}>{r.compliance.rate}%</span>
                    ) : <span className="muted small">{r.checkpoints ? 'Nothing due yet' : 'No checkpoints'}</span>}
                  </td>
                  <td>{r.openReports}{r.critical > 0 && <div className="small text-danger">{r.critical} critical</div>}</td>
                  <td className="actions"><button className="btn btn-sm" onClick={() => openCheckpoints(r.id)}>Checkpoints</button></td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </>
  );
}
