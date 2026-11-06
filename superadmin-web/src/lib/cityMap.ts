// Data for the Super Admin's city-wide map: report pins, dumping hotspots and live trucks.
// The hotspot and "last seen" rules match the mobile app (src/services/reportProximity.ts
// and src/components/map/trackingStatus.ts), so both show the same thing.
import { collection, onSnapshot, query, where } from 'firebase/firestore';
import { db } from './firebase';
import type { Report, Severity } from './operations';

/** Centre of Cebu City, and a zoom that shows the whole city. */
export const CEBU_CENTER = { latitude: 10.3157, longitude: 123.8854 };
export const CITY_ZOOM = 11.6;

export const SEVERITY_COLORS: Record<Severity, string> = {
  critical: '#C0392B',
  high: '#E07B3A',
  moderate: '#EF9F27',
  low: '#639922',
};
export const RESOLVED_COLOR = '#8a958f';

export const CLOSED_STATUSES = ['completed', 'rejected', 'cancelled'];
export const isOpen = (r: Pick<Report, 'status'>) => !CLOSED_STATUSES.includes(r.status);

// ─── Hotspots ────────────────────────────────────────────────────────────────

export const HOTSPOT_RADIUS_M = 100;
export const HOTSPOT_WINDOW_DAYS = 90;
export const HOTSPOT_MIN_REPORTS = 3;

export function distanceM(lat1: number, lng1: number, lat2: number, lng2: number): number {
  const R = 6371000;
  const rad = Math.PI / 180;
  const dLat = (lat2 - lat1) * rad;
  const dLng = (lng2 - lng1) * rad;
  const a = Math.sin(dLat / 2) ** 2 + Math.cos(lat1 * rad) * Math.cos(lat2 * rad) * Math.sin(dLng / 2) ** 2;
  return 2 * R * Math.asin(Math.min(1, Math.sqrt(a)));
}

export interface Hotspot {
  id: string;
  latitude: number;
  longitude: number;
  count: number;
  reportIds: string[];
  barangay?: string;
  /** The worst severity among its reports. */
  worst: Severity;
}

const SEVERITY_RANK: Record<Severity, number> = { critical: 3, high: 2, moderate: 1, low: 0 };

type Pinnable = Pick<Report, 'id' | 'status' | 'severity' | 'barangay' | 'createdAt' | 'approximate'> & { latitude: number; longitude: number };

/**
 * Places where dumping keeps coming back: 3 or more open reports within 100 m in the last
 * 90 days. Busiest areas are picked first and never share a report. Barangay-centre
 * (approximate) locations don't count, since they aren't where the waste is.
 */
export function findHotspots(reports: Pinnable[], now: Date = new Date()): Hotspot[] {
  const windowMs = HOTSPOT_WINDOW_DAYS * 86400_000;
  const live = reports.filter((r) => !r.approximate && isOpen(r) && r.createdAt
    && now.getTime() - r.createdAt.getTime() <= windowMs && now.getTime() >= r.createdAt.getTime());
  const near = live.map((c) => live.filter((o) => distanceM(c.latitude, c.longitude, o.latitude, o.longitude) <= HOTSPOT_RADIUS_M));
  const order = live.map((_, i) => i).sort((a, b) => near[b].length - near[a].length);
  const used = new Set<string>();
  const out: Hotspot[] = [];
  for (const i of order) {
    const members = near[i].filter((o) => !used.has(o.id));
    if (members.length < HOTSPOT_MIN_REPORTS || used.has(live[i].id)) continue;
    members.forEach((m) => used.add(m.id));
    out.push({
      id: `hs-${live[i].id}`,
      latitude: members.reduce((s, m) => s + m.latitude, 0) / members.length,
      longitude: members.reduce((s, m) => s + m.longitude, 0) / members.length,
      count: members.length,
      reportIds: members.map((m) => m.id),
      barangay: live[i].barangay,
      worst: members.reduce<Severity>((w, m) => (SEVERITY_RANK[m.severity] > SEVERITY_RANK[w] ? m.severity : w), 'low'),
    });
  }
  return out;
}

// ─── Live trucks ─────────────────────────────────────────────────────────────

export interface LiveTrip {
  taskId: string;
  reportId: string;
  crewName: string;
  barangayId: string;
  latitude: number;
  longitude: number;
  heading: number;
  speed?: number;
  destination: { latitude: number; longitude: number };
  route: Array<{ latitude: number; longitude: number }>;
  routeSource: 'osrm' | 'straight';
  remainingM: number;
  etaSeconds: number;
  offRoute?: boolean;
  startedAt: number;
  updatedAtMs: number;
}

/** No update for this long: the crew's phone lost signal (it sends one at least every 15 s). */
export const STALE_S = 60;

// Phone clocks differ (some by minutes), so "last seen" counts from when this browser
// received each update, not from the crew phone's own timestamp.
const SKEW_TRUST_MS = 5 * 60 * 1000;
const receivedAt = new Map<string, { updatedAtMs: number; localMs: number }>();

export function noteReceived(t: Pick<LiveTrip, 'taskId' | 'updatedAtMs'>, now = Date.now()): void {
  const seen = receivedAt.get(t.taskId);
  if (seen && seen.updatedAtMs === t.updatedAtMs) return;
  const localMs = !seen && now - t.updatedAtMs > SKEW_TRUST_MS ? t.updatedAtMs : now;
  receivedAt.set(t.taskId, { updatedAtMs: t.updatedAtMs, localMs });
}

export function secondsSinceSeen(t: Pick<LiveTrip, 'taskId' | 'updatedAtMs'>, now = Date.now()): number {
  const seen = receivedAt.get(t.taskId);
  const from = seen && seen.updatedAtMs === t.updatedAtMs ? seen.localMs : t.updatedAtMs;
  return Math.max(0, Math.round((now - from) / 1000));
}

const num = (v: unknown): number | undefined => (typeof v === 'number' && Number.isFinite(v) ? v : undefined);
const pt = (v: unknown) => {
  const o = (v ?? {}) as Record<string, unknown>;
  const latitude = num(o.latitude);
  const longitude = num(o.longitude);
  return latitude !== undefined && longitude !== undefined ? { latitude, longitude } : null;
};

export function toLiveTrip(id: string, d: Record<string, unknown>): LiveTrip | null {
  const here = pt(d);
  const destination = pt(d.destination);
  if (!here || !destination) return null;
  return {
    taskId: typeof d.taskId === 'string' ? d.taskId : id,
    reportId: String(d.reportId ?? ''),
    crewName: String(d.crewName ?? 'Cleanup crew'),
    barangayId: String(d.barangayId ?? ''),
    ...here,
    heading: num(d.heading) ?? 0,
    speed: num(d.speed),
    destination,
    route: Array.isArray(d.route) ? (d.route as unknown[]).map(pt).filter((p): p is { latitude: number; longitude: number } => !!p) : [],
    routeSource: d.routeSource === 'osrm' ? 'osrm' : 'straight',
    remainingM: num(d.remainingM) ?? 0,
    etaSeconds: num(d.etaSeconds) ?? 0,
    offRoute: d.offRoute === true,
    startedAt: num(d.startedAt) ?? 0,
    updatedAtMs: num(d.updatedAtMs) ?? 0,
  };
}

/** Every truck on its way to a cleanup, in every barangay (the Super Admin may read them all). */
export const subscribeLiveTrips = (onData: (t: LiveTrip[]) => void, onError: (e: Error) => void) =>
  onSnapshot(
    query(collection(db, 'crewTracking'), where('status', '==', 'en_route')),
    (snap) => {
      const trips = snap.docs.map((x) => toLiveTrip(x.id, x.data())).filter((t): t is LiveTrip => !!t);
      trips.forEach((t) => noteReceived(t));
      onData(trips);
    },
    onError,
  );

export const formatEta = (s: number) => {
  if (s < 60) return '< 1 min';
  const m = Math.round(s / 60);
  return m < 60 ? `${m} min` : `${Math.floor(m / 60)} h ${m % 60} min`;
};
export const formatDistance = (m: number) => (m < 1000 ? `${Math.round(m)} m` : `${(m / 1000).toFixed(1)} km`);
