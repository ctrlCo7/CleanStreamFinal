import { useEffect, useMemo, useState } from 'react';
import { DownloadIcon, SearchIcon } from '../components/Icons';
import { ReportStatusPill, SeverityPill } from '../components/Pill';
import { csvCell } from '../lib/accountRules';
import { listBarangays } from '../lib/barangays';
import { useToast } from '../lib/feedback';
import { formatDateTime } from '../lib/format';
import {
  REPORT_STATUSES, REPORT_STATUS_LABELS, Report, ReportStatus, SEVERITIES, Severity, WASTE_GROUPS, WASTE_LABELS, WasteGroup,
} from '../lib/operations';
import { OpsErrors, useOps } from '../lib/opsData';
import { useData } from '../lib/data';

const PAGE_SIZE = 25;

const CONTEXT_LABELS = { in_water: 'In water', riverbank: 'Riverbank', drainage: 'Drainage canal', unknown: 'Not determined' } as const;

const formatVolume = (m3?: number) =>
  m3 === undefined || m3 <= 0 ? null : m3 < 1 ? `${Math.max(1, Math.round(m3 * 1000))} L` : `${m3.toFixed(1)} m³`;

interface Filter {
  query: string;
  barangayId: string;
  severity: Severity | 'all';
  status: ReportStatus | 'all' | 'open';
  waste: WasteGroup | 'all';
  water: 'all' | 'wet';
}

const matches = (r: Report, f: Filter): boolean => {
  const q = f.query.trim().toLowerCase();
  return (f.barangayId === 'all' || r.barangayId === f.barangayId)
    && (f.severity === 'all' || r.severity === f.severity)
    && (f.status === 'all' || (f.status === 'open' ? !['completed', 'rejected', 'cancelled'].includes(r.status) : r.status === f.status))
    && (f.waste === 'all' || r.wasteGroup === f.waste)
    && (f.water === 'all' || r.waterContext === 'in_water' || r.waterContext === 'drainage')
    && (!q || [r.reportNumber, r.userName, r.address, r.barangay, r.wasteLabel, r.checkpoint].some((v) => v?.toLowerCase().includes(q)));
};

const toCsv = (reports: Report[]): string => {
  const header = ['Report no.', 'Submitted', 'Reporter', 'Barangay', 'Address', 'Latitude', 'Longitude', 'Waste type', 'Category',
    'Severity', 'Status', 'AI confidence (%)', 'Est. volume (m3)', 'Hazardous', 'Water context', 'Blockage risk', 'Resolved'];
  const rows = reports.map((r) => [
    r.reportNumber, r.createdAt?.toISOString() ?? '', r.userName, r.barangay, r.address, r.latitude, r.longitude, r.wasteLabel,
    WASTE_LABELS[r.wasteGroup], r.severity, REPORT_STATUS_LABELS[r.status], r.aiConfidence, r.estimatedVolume,
    r.hazardous ? 'yes' : 'no', r.waterContext ?? '', r.blockage ?? '', r.resolvedAt?.toISOString() ?? '',
  ]);
  return [header, ...rows].map((row) => row.map(csvCell).join(',')).join('\r\n');
};

export function Reports() {
  const { reports, loading } = useOps();
  useData(); // re-render when newly registered barangays arrive
  const toast = useToast();
  const [filter, setFilter] = useState<Filter>({ query: '', barangayId: 'all', severity: 'all', status: 'all', waste: 'all', water: 'all' });
  const [page, setPage] = useState(0);

  const filtered = useMemo(() => reports.filter((r) => matches(r, filter)), [reports, filter]);
  const pageCount = Math.max(1, Math.ceil(filtered.length / PAGE_SIZE));
  useEffect(() => { setPage((p) => Math.min(p, pageCount - 1)); }, [pageCount]);
  const rows = filtered.slice(page * PAGE_SIZE, (page + 1) * PAGE_SIZE);
  const update = (patch: Partial<Filter>) => { setFilter((f) => ({ ...f, ...patch })); setPage(0); };

  const exportCsv = () => {
    const blob = new Blob(['﻿', toCsv(filtered)], { type: 'text/csv;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `cleanstream-reports-${new Date().toISOString().slice(0, 10)}.csv`;
    a.click();
    URL.revokeObjectURL(url);
    toast.success(`Exported ${filtered.length} report${filtered.length === 1 ? '' : 's'}`);
  };

  return (
    <>
      <header className="page-head">
        <div>
          <h1>All reports</h1>
          <p className="muted">Every waterway waste report from citizens and barangay officials, across all barangays.</p>
        </div>
      </header>
      <OpsErrors streams={['reports']} />

      <div className="toolbar">
        <label className="search">
          <SearchIcon />
          <input type="search" placeholder="Search report no., reporter, place or waste" value={filter.query} onChange={(e) => update({ query: e.target.value })} aria-label="Search reports" />
        </label>
        <select value={filter.barangayId} onChange={(e) => update({ barangayId: e.target.value })} aria-label="Filter by barangay">
          <option value="all">All barangays</option>
          {listBarangays().map((b) => <option key={b.id} value={b.id}>{b.name}</option>)}
        </select>
        <select value={filter.severity} onChange={(e) => update({ severity: e.target.value as Filter['severity'] })} aria-label="Filter by severity">
          <option value="all">Any severity</option>
          {SEVERITIES.map((s) => <option key={s} value={s}>{s[0].toUpperCase() + s.slice(1)}</option>)}
        </select>
        <select value={filter.status} onChange={(e) => update({ status: e.target.value as Filter['status'] })} aria-label="Filter by status">
          <option value="all">Any status</option>
          <option value="open">Open (not resolved)</option>
          {REPORT_STATUSES.map((s) => <option key={s} value={s}>{REPORT_STATUS_LABELS[s]}</option>)}
        </select>
        <select value={filter.waste} onChange={(e) => update({ waste: e.target.value as Filter['waste'] })} aria-label="Filter by waste type">
          <option value="all">Any waste type</option>
          {WASTE_GROUPS.map((g) => <option key={g} value={g}>{WASTE_LABELS[g]}</option>)}
        </select>
        <select value={filter.water} onChange={(e) => update({ water: e.target.value as Filter['water'] })} aria-label="Filter by water">
          <option value="all">Anywhere</option>
          <option value="wet">In water or drainage</option>
        </select>
        <span className="muted nowrap">{filtered.length} report{filtered.length === 1 ? '' : 's'}</span>
        <button className="btn" onClick={exportCsv} disabled={filtered.length === 0}><DownloadIcon /> Export CSV</button>
      </div>

      {loading.reports ? <p className="muted">Loading reports…</p> : filtered.length === 0 ? (
        <div className="empty">
          <strong>No reports match</strong>
          <p className="muted">{reports.length === 0 ? 'No waste reports have been submitted yet.' : 'Try a different search or filter.'}</p>
        </div>
      ) : (
        <>
          <div className="table-wrap">
            <table>
              <thead><tr><th>Report</th><th>Location</th><th>Waste type</th><th>Waterway</th><th>Severity</th><th>Volume</th><th>Reported</th><th>Status</th></tr></thead>
              <tbody>
                {rows.map((r) => (
                  <tr key={r.id}>
                    <td>
                      <strong>{r.reportNumber}</strong>
                      <div className="muted small">{r.userName}{r.userRole === 'barangay' ? ' · Barangay' : ''}</div>
                      {r.duplicateOfNumber && <span className="pill pill-rs-verified pill-tight" title={`Same spot as ${r.duplicateOfNumber}, filed within 24 hours`}>Possible duplicate</span>}
                      {(r.nearbyReportCount ?? 0) >= 3 && <span className="pill pill-sev-high pill-tight" title={`${r.nearbyReportCount} reports within 100 m in 90 days`}>Hotspot</span>}
                    </td>
                    <td>
                      {r.barangay ?? <span className="muted">Unknown barangay</span>}
                      <div className="muted small">
                        {r.checkpoint ? `Checkpoint: ${r.checkpoint}` : r.address ?? (r.latitude !== undefined ? `${r.latitude.toFixed(5)}, ${r.longitude!.toFixed(5)}` : 'No GPS fix')}
                      </div>
                    </td>
                    <td>
                      {WASTE_LABELS[r.wasteGroup]}{r.hazardous && r.wasteGroup !== 'hazardous' && <span className="pill pill-sev-critical pill-inline">Hazard</span>}
                      <div className="muted small">{r.wasteLabel}{r.aiConfidence !== undefined ? ` · AI ${r.aiConfidence}%` : ''}</div>
                    </td>
                    <td>
                      {r.waterContext && r.waterContext !== 'unknown' ? CONTEXT_LABELS[r.waterContext] : <span className="muted">—</span>}
                      {r.blockage && r.blockage !== 'low' && <div className="muted small">Blockage: {r.blockage}</div>}
                    </td>
                    <td><SeverityPill severity={r.severity} /></td>
                    <td className="nowrap">{formatVolume(r.estimatedVolume) ?? <span className="muted">—</span>}</td>
                    <td className="nowrap">{formatDateTime(r.createdAt)}</td>
                    <td><ReportStatusPill status={r.status} /></td>
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
    </>
  );
}
