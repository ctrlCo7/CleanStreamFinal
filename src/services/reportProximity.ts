/**
 * Duplicate and hotspot detection for new reports. Pure, so it is unit-tested in Node;
 * reportsService.checkNearbyReports does the Firestore read and write around it.
 *
 * - Duplicate: another open report within 50 m filed in the last 24 hours. Likely the
 *   same pile reported twice; the official can close one as a duplicate.
 * - Hotspot: 3 or more reports (this one included) within 100 m in the last 90 days.
 *   Dumping keeps coming back here, so it needs more than one cleanup.
 */

export const DUPLICATE_RADIUS_M = 50;
export const DUPLICATE_WINDOW_H = 24;
export const HOTSPOT_RADIUS_M = 100;
export const HOTSPOT_WINDOW_DAYS = 90;
export const HOTSPOT_MIN_REPORTS = 3;

export interface NearbyCandidate {
  id: string;
  reportNumber: string;
  latitude: number;
  longitude: number;
  createdAt: Date;
  status: string;
  /** True when the location is a barangay's centre point rather than a GPS fix. */
  approximate?: boolean;
}

export interface ProximityResult {
  duplicateOf?: { id: string; reportNumber: string; distanceM: number };
  /** Reports within HOTSPOT_RADIUS_M in the window, this one included. */
  nearbyCount: number;
  isHotspot: boolean;
}

/** Great-circle distance in metres. */
export function distanceM(lat1: number, lng1: number, lat2: number, lng2: number): number {
  const R = 6371000;
  const toRad = (d: number) => (d * Math.PI) / 180;
  const dLat = toRad(lat2 - lat1);
  const dLng = toRad(lng2 - lng1);
  const a = Math.sin(dLat / 2) ** 2 + Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.sin(dLng / 2) ** 2;
  return 2 * R * Math.asin(Math.min(1, Math.sqrt(a)));
}

/** The fallback location used when GPS fails is a barangay's centre, shared by many reports. */
export const isApproximateAddress = (address?: string | null) => !!address && address.includes('(approximate');

export function findProximity(
  here: { latitude: number; longitude: number; approximate?: boolean },
  others: NearbyCandidate[],
  selfId: string,
  now: Date = new Date(),
): ProximityResult {
  if (here.approximate) return { nearbyCount: 1, isHotspot: false };
  let duplicate: ProximityResult['duplicateOf'];
  let nearby = 1;
  for (const o of others) {
    if (o.id === selfId || o.approximate || o.status === 'rejected' || o.status === 'cancelled') continue;
    const d = distanceM(here.latitude, here.longitude, o.latitude, o.longitude);
    const ageMs = now.getTime() - o.createdAt.getTime();
    if (ageMs < 0) continue;
    if (d <= HOTSPOT_RADIUS_M && ageMs <= HOTSPOT_WINDOW_DAYS * 86400_000) nearby++;
    const open = o.status !== 'completed';
    if (open && d <= DUPLICATE_RADIUS_M && ageMs <= DUPLICATE_WINDOW_H * 3600_000 && (!duplicate || d < duplicate.distanceM)) {
      duplicate = { id: o.id, reportNumber: o.reportNumber, distanceM: Math.round(d) };
    }
  }
  return { duplicateOf: duplicate, nearbyCount: nearby, isHotspot: nearby >= HOTSPOT_MIN_REPORTS };
}

export interface Hotspot {
  latitude: number;
  longitude: number;
  /** Open reports within HOTSPOT_RADIUS_M of the centre in the last HOTSPOT_WINDOW_DAYS. */
  count: number;
  reportIds: string[];
}

/**
 * Hotspots for the map, computed live from the open reports shown (so they appear and
 * disappear as reports are filed or cleaned up): an area where HOTSPOT_MIN_REPORTS or more
 * open reports lie within HOTSPOT_RADIUS_M of one of them in the last HOTSPOT_WINDOW_DAYS.
 * Areas are picked greedily, busiest first, and never share a report. Approximate locations
 * (a barangay's centre point) and rejected/cancelled/completed reports don't count.
 */
export function findHotspots(
  reports: Array<{ id: string; latitude: number; longitude: number; createdAt: Date; status: string; approximate?: boolean }>,
  now: Date = new Date(),
): Hotspot[] {
  const windowMs = HOTSPOT_WINDOW_DAYS * 86400_000;
  const live = reports.filter((r) => !r.approximate
    && !['rejected', 'cancelled', 'completed'].includes(r.status)
    && now.getTime() - r.createdAt.getTime() <= windowMs
    && now.getTime() >= r.createdAt.getTime());
  const near = live.map((c) => live.filter((o) => distanceM(c.latitude, c.longitude, o.latitude, o.longitude) <= HOTSPOT_RADIUS_M));
  const order = live.map((_, i) => i).sort((a, b) => near[b].length - near[a].length);
  const used = new Set<string>();
  const out: Hotspot[] = [];
  for (const i of order) {
    const members = near[i].filter((o) => !used.has(o.id));
    if (members.length < HOTSPOT_MIN_REPORTS || used.has(live[i].id)) continue;
    members.forEach((m) => used.add(m.id));
    out.push({
      latitude: members.reduce((s, m) => s + m.latitude, 0) / members.length,
      longitude: members.reduce((s, m) => s + m.longitude, 0) / members.length,
      count: members.length,
      reportIds: members.map((m) => m.id),
    });
  }
  return out;
}
