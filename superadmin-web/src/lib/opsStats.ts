import { barangayById } from './barangays';
import { Checkpoint, DAYS, Day, Inspection, Report, ReportStatus, SEVERITIES, Severity, WASTE_GROUPS, WasteGroup } from './operations';

// Pure calculations behind the Overview, Analytics and Barangay Units pages.
// `now` is a parameter everywhere so the figures can be tested with a fixed clock.

const HOUR = 3_600_000;
/** Year and month of a moment in Philippine time (UTC+8, no daylight saving). */
const phMonth = (d: Date) => { const p = new Date(d.getTime() + 8 * HOUR); return { y: p.getUTCFullYear(), m: p.getUTCMonth() }; };
const DAY_MS = 24 * HOUR;

/** Local calendar day, e.g. "2026-10-24". */
export const dayKey = (d: Date): string =>
  `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;

/** JS getDay() is Sunday-first; DAYS is Monday-first. */
export const dayName = (d: Date): Day => DAYS[(d.getDay() + 6) % 7];

const startOfDay = (d: Date) => new Date(d.getFullYear(), d.getMonth(), d.getDate());

const atTime = (d: Date, hhmm: string) => {
  const [h, m] = hhmm.split(':').map(Number);
  return new Date(d.getFullYear(), d.getMonth(), d.getDate(), h || 0, m || 0);
};

const pct = (part: number, whole: number) => (whole ? Math.round((part / whole) * 100) : 0);
const mean = (xs: number[]) => (xs.length ? xs.reduce((a, b) => a + b, 0) / xs.length : 0);

// ─── Inspections ─────────────────────────────────────────────────────────────

/**
 * The days in the last `windowDays` (today included) on which this checkpoint should have
 * been inspected. Today only counts once its scheduled time has passed, and days before the
 * checkpoint existed never count.
 */
export const expectedDays = (cp: Checkpoint, now: Date, windowDays = 7): string[] => {
  if (!cp.isActive) return [];
  const created = cp.createdAt ? startOfDay(cp.createdAt) : null;
  const out: string[] = [];
  for (let i = windowDays - 1; i >= 0; i--) {
    const day = new Date(startOfDay(now).getTime() - i * DAY_MS);
    if (!cp.days.includes(dayName(day))) continue;
    if (created && day < created) continue;
    if (i === 0 && atTime(day, cp.time) > now) continue;
    out.push(dayKey(day));
  }
  return out;
};

export interface Compliance { expected: number; done: number; missed: number; rate: number }

/** How many scheduled inspections actually happened, per checkpoint and in total. */
export const inspectionCompliance = (checkpoints: Checkpoint[], inspections: Inspection[], now: Date, windowDays = 7) => {
  const doneDays = new Map<string, Set<string>>();
  for (const i of inspections) {
    if (!i.checkpointId || !i.createdAt) continue;
    if (!doneDays.has(i.checkpointId)) doneDays.set(i.checkpointId, new Set());
    doneDays.get(i.checkpointId)!.add(dayKey(i.createdAt));
  }
  const perCheckpoint = new Map<string, Compliance>();
  let expected = 0;
  let done = 0;
  for (const cp of checkpoints) {
    const days = expectedDays(cp, now, windowDays);
    const hit = days.filter((d) => doneDays.get(cp.id)?.has(d)).length;
    perCheckpoint.set(cp.id, { expected: days.length, done: hit, missed: days.length - hit, rate: pct(hit, days.length) });
    expected += days.length;
    done += hit;
  }
  return { perCheckpoint, total: { expected, done, missed: expected - done, rate: pct(done, expected) } as Compliance };
};

export type CheckpointState = 'paused' | 'done-today' | 'due-today' | 'overdue' | 'not-today';

export const checkpointState = (cp: Checkpoint, now: Date): CheckpointState => {
  if (!cp.isActive) return 'paused';
  if (cp.lastInspectedAt && dayKey(cp.lastInspectedAt) === dayKey(now)) return 'done-today';
  if (!cp.days.includes(dayName(now))) return 'not-today';
  return atTime(now, cp.time) <= now ? 'overdue' : 'due-today';
};

export const CHECKPOINT_STATE_LABELS: Record<CheckpointState, string> = {
  paused: 'Paused', 'done-today': 'Inspected today', 'due-today': 'Due today', overdue: 'Overdue', 'not-today': 'Not scheduled today',
};

// ─── Reports ─────────────────────────────────────────────────────────────────

const isResolved = (r: Report) => r.status === 'completed';
const isOpen = (r: Report) => !['completed', 'rejected', 'cancelled'].includes(r.status);
const responseHours = (r: Report) =>
  r.createdAt && r.respondedAt && r.respondedAt >= r.createdAt ? (r.respondedAt.getTime() - r.createdAt.getTime()) / HOUR : null;

export interface BarangayReportStat {
  id: string;
  name: string;
  total: number;
  open: number;
  resolved: number;
  critical: number;
  resolutionRate: number;
  avgResponseHours: number | null;
}

const barangayRows = (reports: Report[]): BarangayReportStat[] => {
  const groups = new Map<string, Report[]>();
  for (const r of reports) {
    const key = r.barangayId ?? r.barangay ?? 'unknown';
    if (!groups.has(key)) groups.set(key, []);
    groups.get(key)!.push(r);
  }
  return [...groups.entries()].map(([id, list]) => {
    const resolved = list.filter(isResolved).length;
    const times = list.map(responseHours).filter((h): h is number => h !== null);
    return {
      id,
      name: barangayById(id)?.name ?? list[0].barangay ?? 'Unknown barangay',
      total: list.length,
      open: list.filter(isOpen).length,
      resolved,
      critical: list.filter((r) => r.severity === 'critical').length,
      resolutionRate: pct(resolved, list.length),
      avgResponseHours: times.length ? mean(times) : null,
    };
  }).sort((a, b) => b.total - a.total);
};

export const reportStats = (reports: Report[], now: Date) => {
  const resolved = reports.filter(isResolved).length;
  const times = reports.map(responseHours).filter((h): h is number => h !== null);
  const confidences = reports.map((r) => r.aiConfidence).filter((c): c is number => c !== undefined);

  // Last six calendar months in Philippine time (whatever the viewer's computer clock says), oldest first.
  const ph = phMonth(now);
  const monthly = Array.from({ length: 6 }, (_, i) => {
    const first = new Date(Date.UTC(ph.y, ph.m - 5 + i, 1));
    const y = first.getUTCFullYear();
    const m = first.getUTCMonth();
    return {
      label: first.toLocaleString('en-PH', { month: 'short', timeZone: 'UTC' }),
      count: reports.filter((r) => { if (!r.createdAt) return false; const p = phMonth(r.createdAt); return p.y === y && p.m === m; }).length,
    };
  });

  // Open reports by severity, and every report by where it is in the workflow.
  const severity = Object.fromEntries(SEVERITIES.map((s) => [s, 0])) as Record<Severity, number>;
  for (const r of reports) if (isOpen(r)) severity[r.severity] += 1;
  const byStatus = {} as Record<ReportStatus, number>;
  for (const r of reports) byStatus[r.status] = (byStatus[r.status] ?? 0) + 1;

  const waste = Object.fromEntries(WASTE_GROUPS.map((g) => [g, 0])) as Record<WasteGroup, number>;
  for (const r of reports) waste[r.wasteGroup] += 1;

  const byBarangay = barangayRows(reports);
  // "Top performing" needs a few reports to mean anything; one resolved report isn't 100% performance.
  const topBarangays = byBarangay.filter((b) => b.total >= 3)
    .sort((a, b) => b.resolutionRate - a.resolutionRate || (a.avgResponseHours ?? Infinity) - (b.avgResponseHours ?? Infinity))
    .slice(0, 5);

  return {
    total: reports.length,
    open: reports.filter(isOpen).length,
    resolved,
    pending: byStatus.pending ?? 0,
    verified: byStatus.verified ?? 0,
    ongoing: (byStatus.assigned ?? 0) + (byStatus.in_progress ?? 0),
    byStatus,
    severity,
    critical: reports.filter((r) => r.severity === 'critical' && isOpen(r)).length,
    hazardous: reports.filter((r) => r.hazardous).length,
    thisWeek: reports.filter((r) => r.createdAt && now.getTime() - r.createdAt.getTime() < 7 * DAY_MS).length,
    resolutionRate: pct(resolved, reports.length),
    avgResponseHours: times.length ? mean(times) : null,
    aiAnalyzed: confidences.length,
    avgConfidence: confidences.length ? Math.round(mean(confidences)) : null,
    gpsTagged: reports.filter((r) => r.latitude !== undefined).length,
    gpsTaggedRate: pct(reports.filter((r) => r.latitude !== undefined).length, reports.length),
    monthly,
    waste,
    byBarangay,
    topBarangays,
  };
};

export const formatHours = (h: number | null): string => {
  if (h === null) return '—';
  if (h < 1) return `${Math.max(1, Math.round(h * 60))} min`;
  if (h < 48) return `${h.toFixed(1)} hr`;
  return `${(h / 24).toFixed(1)} days`;
};

// ─── Hotspots ────────────────────────────────────────────────────────────────

/** Great-circle distance in metres. */
export const distanceM = (lat1: number, lng1: number, lat2: number, lng2: number): number => {
  const R = 6371000;
  const rad = (d: number) => (d * Math.PI) / 180;
  const a = Math.sin(rad(lat2 - lat1) / 2) ** 2 + Math.cos(rad(lat1)) * Math.cos(rad(lat2)) * Math.sin(rad(lng2 - lng1) / 2) ** 2;
  return 2 * R * Math.asin(Math.min(1, Math.sqrt(a)));
};

export interface Hotspot {
  latitude: number;
  longitude: number;
  barangay: string;
  count: number;
  open: number;
  critical: number;
  lastReport: Date | null;
  reportNumbers: string[];
}

/**
 * Places where dumping keeps coming back: 3+ reports within 100 m of each other in the
 * last 90 days (the same rule the app uses to flag a hotspot on a new report). Reports
 * are grouped greedily around the first report of each group; rejected ones don't count.
 */
export const findHotspots = (reports: Report[], now: Date, radiusM = 100, days = 90, min = 3): Hotspot[] => {
  const since = now.getTime() - days * DAY_MS;
  const groups: Array<{ lat: number; lng: number; items: Report[] }> = [];
  const candidates = reports
    .filter((r) => r.latitude !== undefined && r.longitude !== undefined && r.createdAt && r.createdAt.getTime() >= since
      && r.status !== 'rejected' && r.status !== 'cancelled' && !(r.address ?? '').includes('(approximate'))
    .sort((a, b) => a.createdAt!.getTime() - b.createdAt!.getTime());
  for (const r of candidates) {
    const g = groups.find((x) => distanceM(x.lat, x.lng, r.latitude!, r.longitude!) <= radiusM);
    if (g) g.items.push(r);
    else groups.push({ lat: r.latitude!, lng: r.longitude!, items: [r] });
  }
  return groups
    .filter((g) => g.items.length >= min)
    .map((g) => ({
      latitude: g.items.reduce((s, r) => s + r.latitude!, 0) / g.items.length,
      longitude: g.items.reduce((s, r) => s + r.longitude!, 0) / g.items.length,
      barangay: g.items[0].barangay ?? 'Unknown barangay',
      count: g.items.length,
      open: g.items.filter(isOpen).length,
      critical: g.items.filter((r) => r.severity === 'critical').length,
      lastReport: g.items[g.items.length - 1].createdAt,
      reportNumbers: g.items.map((r) => r.reportNumber),
    }))
    .sort((a, b) => b.count - a.count || b.open - a.open);
};
