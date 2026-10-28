import { useMemo } from 'react';
import { useTick } from '../lib/feedback';
import { WASTE_GROUPS, WASTE_LABELS } from '../lib/operations';
import { OpsErrors, useOps } from '../lib/opsData';
import { findHotspots, formatHours, inspectionCompliance, reportStats } from '../lib/opsStats';
import { relativeTime } from '../lib/format';

export function Analytics() {
  const { reports, checkpoints, inspections, loading } = useOps();
  useTick();
  const now = new Date();
  const stats = useMemo(() => reportStats(reports, new Date()), [reports]);
  const compliance = useMemo(() => inspectionCompliance(checkpoints, inspections, new Date()), [checkpoints, inspections]);
  const hotspots = useMemo(() => findHotspots(reports, new Date()), [reports]);
  const maxMonth = Math.max(1, ...stats.monthly.map((m) => m.count));
  const maxWaste = Math.max(1, ...WASTE_GROUPS.map((g) => stats.waste[g]));
  const maxBarangay = Math.max(1, ...stats.byBarangay.map((b) => b.total));

  if (loading.reports) return <p className="muted">Loading…</p>;

  return (
    <>
      <header className="page-head">
        <div>
          <h1>Analytics</h1>
          <p className="muted">How reporting, AI analysis and barangay inspections are performing. Figures update live.</p>
        </div>
      </header>
      <OpsErrors streams={['reports', 'checkpoints', 'inspections']} />

      <section className="stat-grid" aria-label="Key figures">
        <div className="stat"><span className="stat-n">{stats.total}</span><span className="stat-l">Total reports</span></div>
        <div className="stat"><span className="stat-n">{stats.resolutionRate}%</span><span className="stat-l">Resolution rate</span></div>
        <div className="stat"><span className="stat-n">{formatHours(stats.avgResponseHours)}</span><span className="stat-l">Avg. response time</span></div>
        <div className="stat"><span className="stat-n">{stats.avgConfidence === null ? '—' : `${stats.avgConfidence}%`}</span><span className="stat-l">Avg. AI confidence</span></div>
        <div className="stat"><span className="stat-n">{stats.gpsTaggedRate}%</span><span className="stat-l">GPS-tagged ({stats.gpsTagged})</span></div>
        <div className={`stat${stats.hazardous ? ' stat-attn' : ''}`}><span className="stat-n">{stats.hazardous}</span><span className="stat-l">Hazardous waste incidents</span></div>
        <div className={`stat${compliance.total.missed ? ' stat-attn' : ''}`}>
          <span className="stat-n">{compliance.total.expected ? `${compliance.total.rate}%` : '—'}</span>
          <span className="stat-l">Inspection compliance (7 days)</span>
        </div>
      </section>

      <div className="two-col">
        <section className="card">
          <h2>Reports per month</h2>
          <div className="columns" role="img" aria-label={stats.monthly.map((m) => `${m.label}: ${m.count}`).join(', ')}>
            {stats.monthly.map((m) => (
              <div key={m.label} className="column">
                <span className="column-n">{m.count}</span>
                <span className="column-bar" style={{ height: `${(m.count / maxMonth) * 100}%` }} />
                <span className="column-l">{m.label}</span>
              </div>
            ))}
          </div>
        </section>
        <section className="card">
          <h2>Waste type breakdown</h2>
          <ul className="bars">
            {WASTE_GROUPS.map((g) => (
              <li key={g}>
                <span className="bars-label">{WASTE_LABELS[g]}</span>
                <span className="bars-track"><span className={`bars-fill bars-${g}`} style={{ width: `${(stats.waste[g] / maxWaste) * 100}%` }} /></span>
                <span className="bars-n">{stats.waste[g]}</span>
              </li>
            ))}
          </ul>
        </section>
      </div>

      <div className="two-col">
        <section className="card">
          <h2>Reports by barangay</h2>
          {stats.byBarangay.length === 0 ? <p className="muted">No reports yet.</p> : (
            <ul className="bars">
              {stats.byBarangay.slice(0, 10).map((b) => (
                <li key={b.id}>
                  <span className="bars-label ellipsis" title={b.name}>{b.name}</span>
                  <span className="bars-track"><span className="bars-fill" style={{ width: `${(b.total / maxBarangay) * 100}%` }} /></span>
                  <span className="bars-n">{b.total}</span>
                </li>
              ))}
            </ul>
          )}
        </section>
        <section className="card">
          <h2>Top-performing barangays</h2>
          {stats.topBarangays.length === 0 ? (
            <p className="muted">Shown once a barangay has at least 3 reports.</p>
          ) : (
            <ol className="list ranked">
              {stats.topBarangays.map((b) => (
                <li key={b.id}>
                  <div><strong>{b.name}</strong><span className="muted"> · {b.resolved} of {b.total} resolved</span></div>
                  <span className="nowrap"><strong>{b.resolutionRate}%</strong><span className="muted small"> · {formatHours(b.avgResponseHours)}</span></span>
                </li>
              ))}
            </ol>
          )}
        </section>
      </div>

      <section className="card">
        <div className="card-head">
          <h2>Dumping hotspots</h2>
          <span className="muted small">3+ reports within 100 m in the last 90 days</span>
        </div>
        {hotspots.length === 0 ? (
          <p className="muted">No hotspots yet. A spot appears here once it has been reported three times.</p>
        ) : (
          <div className="table-wrap flat">
            <table>
              <thead><tr><th>Location</th><th>Reports</th><th>Still open</th><th>Critical</th><th>Latest</th><th><span className="sr-only">Map</span></th></tr></thead>
              <tbody>
                {hotspots.slice(0, 15).map((h) => (
                  <tr key={`${h.latitude},${h.longitude}`}>
                    <td><strong>{h.barangay}</strong><div className="muted small">{h.latitude.toFixed(5)}, {h.longitude.toFixed(5)}</div></td>
                    <td><strong>{h.count}</strong></td>
                    <td>{h.open ? <strong className="text-danger">{h.open}</strong> : 0}</td>
                    <td>{h.critical}</td>
                    <td className="nowrap">{h.lastReport ? relativeTime(h.lastReport) : '—'}</td>
                    <td className="actions">
                      <a className="btn btn-sm" href={`https://www.google.com/maps/search/?api=1&query=${h.latitude},${h.longitude}`} target="_blank" rel="noreferrer">Map</a>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
        {hotspots.length > 0 && <p className="muted small" style={{ marginBottom: 0 }}>Consider adding a checkpoint, signage or a volunteer cleanup at these spots.</p>}
      </section>

      <section className="card">
        <div className="card-head">
          <h2>Inspection compliance by checkpoint</h2>
          <span className="muted small">Scheduled inspections in the last 7 days · as of {now.toLocaleTimeString('en-PH', { hour: 'numeric', minute: '2-digit' })}</span>
        </div>
        {checkpoints.length === 0 ? (
          <p className="muted">No checkpoints yet. Add them on the Checkpoints page to track patrols.</p>
        ) : (
          <div className="table-wrap flat">
            <table>
              <thead><tr><th>Checkpoint</th><th>Barangay</th><th>Scheduled</th><th>Done</th><th>Missed</th><th>Compliance</th></tr></thead>
              <tbody>
                {checkpoints.filter((c) => c.isActive).map((c) => {
                  const k = compliance.perCheckpoint.get(c.id)!;
                  return (
                    <tr key={c.id}>
                      <td><strong>{c.name}</strong></td>
                      <td>{c.barangay}</td>
                      <td>{k.expected}</td>
                      <td>{k.done}</td>
                      <td>{k.missed ? <strong className="text-danger">{k.missed}</strong> : 0}</td>
                      <td>{k.expected ? `${k.rate}%` : <span className="muted">—</span>}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </section>
    </>
  );
}
