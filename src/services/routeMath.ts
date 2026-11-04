/**
 * Geometry for live crew tracking: where the truck is along its route, how far is left,
 * when it will arrive, which way it faces, and when it has strayed off the route.
 * Pure, so it is unit-tested in Node; crewTrackingService.ts uses it on the crew's
 * phone, and the map components use it to animate the truck between GPS updates.
 */
import { distanceM } from './reportProximity';

export interface LatLng { latitude: number; longitude: number }

/** Leaving the route by more than this triggers a new route straight away. */
export const OFF_ROUTE_M = 120;
/**
 * Further than this from the route on two fixes in a row also triggers a new route (a
 * wrong turn shows up within a block; one stray fix is just GPS noise).
 */
export const REROUTE_M = 50;
/** Within this distance of the site the crew counts as arrived. */
export const ARRIVED_M = 60;
/** Typical Cebu City driving speed, used when the routing service gives no duration. */
const FALLBACK_SPEED_MPS = 20 / 3.6;

/** Compass bearing from a to b, 0–360 degrees, 0 = north. */
export function bearing(a: LatLng, b: LatLng): number {
  const rad = (d: number) => (d * Math.PI) / 180;
  const y = Math.sin(rad(b.longitude - a.longitude)) * Math.cos(rad(b.latitude));
  const x = Math.cos(rad(a.latitude)) * Math.sin(rad(b.latitude))
    - Math.sin(rad(a.latitude)) * Math.cos(rad(b.latitude)) * Math.cos(rad(b.longitude - a.longitude));
  return ((Math.atan2(y, x) * 180) / Math.PI + 360) % 360;
}

export const lerp = (a: LatLng, b: LatLng, t: number): LatLng => ({
  latitude: a.latitude + (b.latitude - a.latitude) * t,
  longitude: a.longitude + (b.longitude - a.longitude) * t,
});

/** Shortest way to turn from one heading to another, so the truck never spins the long way round. */
export function lerpAngle(from: number, to: number, t: number): number {
  const diff = ((to - from + 540) % 360) - 180;
  return (from + diff * t + 360) % 360;
}

const d = (a: LatLng, b: LatLng) => distanceM(a.latitude, a.longitude, b.latitude, b.longitude);

export function pathLength(path: LatLng[]): number {
  let total = 0;
  for (let i = 1; i < path.length; i++) total += d(path[i - 1], path[i]);
  return total;
}

/**
 * Closest point of the route to `p`: which segment it's on, how far `p` is from the
 * route, and how much of the route is left from there. Uses a flat-earth projection,
 * which is accurate to centimetres at city scale.
 */
export function locateOnRoute(path: LatLng[], p: LatLng): { segment: number; point: LatLng; offRouteM: number; remainingM: number } {
  if (path.length === 0) return { segment: 0, point: p, offRouteM: 0, remainingM: 0 };
  if (path.length === 1) return { segment: 0, point: path[0], offRouteM: d(p, path[0]), remainingM: 0 };

  const k = Math.cos((p.latitude * Math.PI) / 180);
  let best = { segment: 0, point: path[0], dist: Infinity, t: 0 };
  for (let i = 0; i < path.length - 1; i++) {
    const a = path[i], b = path[i + 1];
    const ax = a.longitude * k, ay = a.latitude, bx = b.longitude * k, by = b.latitude, px = p.longitude * k, py = p.latitude;
    const len2 = (bx - ax) ** 2 + (by - ay) ** 2;
    const t = len2 === 0 ? 0 : Math.max(0, Math.min(1, ((px - ax) * (bx - ax) + (py - ay) * (by - ay)) / len2));
    const point = lerp(a, b, t);
    const dist = d(p, point);
    if (dist < best.dist) best = { segment: i, point, dist, t };
  }
  let remaining = d(best.point, path[best.segment + 1]);
  for (let i = best.segment + 1; i < path.length - 1; i++) remaining += d(path[i], path[i + 1]);
  return { segment: best.segment, point: best.point, offRouteM: best.dist, remainingM: remaining };
}

/**
 * Seconds to arrival for what's left of the route, at the route's own average speed
 * (from the routing service), never assuming slower than walking pace.
 */
export function etaSeconds(remainingM: number, routeDistanceM?: number, routeDurationS?: number): number {
  const speed = routeDistanceM && routeDurationS && routeDurationS > 0 ? routeDistanceM / routeDurationS : FALLBACK_SPEED_MPS;
  return Math.round(remainingM / Math.max(speed, 1.4));
}

// Metres from point p to the segment a–b, on a flat-earth projection (fine at city scale).
function segmentDistanceM(p: LatLng, a: LatLng, b: LatLng): number {
  const k = Math.cos((p.latitude * Math.PI) / 180);
  const ax = a.longitude * k, ay = a.latitude, bx = b.longitude * k, by = b.latitude, px = p.longitude * k, py = p.latitude;
  const len2 = (bx - ax) ** 2 + (by - ay) ** 2;
  const t = len2 === 0 ? 0 : Math.max(0, Math.min(1, ((px - ax) * (bx - ax) + (py - ay) * (by - ay)) / len2));
  return d(p, lerp(a, b, t));
}

// Douglas–Peucker: drops points only where the road is straight, so every corner stays.
function douglasPeucker(path: LatLng[], toleranceM: number): LatLng[] {
  const keep = new Uint8Array(path.length);
  keep[0] = 1;
  keep[path.length - 1] = 1;
  const stack: Array<[number, number]> = [[0, path.length - 1]];
  while (stack.length) {
    const [s, e] = stack.pop()!;
    let worst = -1, worstD = toleranceM;
    for (let i = s + 1; i < e; i++) {
      const dist = segmentDistanceM(path[i], path[s], path[e]);
      if (dist > worstD) { worst = i; worstD = dist; }
    }
    if (worst > 0) {
      keep[worst] = 1;
      stack.push([s, worst], [worst, e]);
    }
  }
  return path.filter((_, i) => keep[i]);
}

/**
 * Keeps at most `max` points (first and last always kept) so a route fits in one Firestore
 * document. Points are dropped only along straight stretches (Douglas–Peucker, starting at
 * 1 m), so the line keeps every corner and stays on the road: picking every Nth point
 * instead would cut corners and draw the route, and the truck, through buildings.
 */
export function simplifyPath(path: LatLng[], max = 400): LatLng[] {
  if (path.length <= max) return path;
  let tolerance = 1;
  let out = douglasPeucker(path, tolerance);
  while (out.length > max && tolerance < 200) {
    tolerance *= 1.5;
    out = douglasPeucker(path, tolerance);
  }
  return out;
}

/** Furthest any point of `path` lies from the polyline `simplified`, in metres (for tests and checks). */
export function maxDeviationM(path: LatLng[], simplified: LatLng[]): number {
  let worst = 0;
  for (const p of path) {
    let best = Infinity;
    for (let i = 0; i < simplified.length - 1; i++) best = Math.min(best, segmentDistanceM(p, simplified[i], simplified[i + 1]));
    worst = Math.max(worst, best);
  }
  return worst;
}

// ─── Which way the truck faces ───────────────────────────────────────────────

/** Moving less than this between two fixes is GPS jitter, not a direction. */
export const MIN_HEADING_MOVE_M = 5;
/** Below this speed (m/s, ~4 km/h) the phone's own compass heading is unreliable. */
const MIN_GPS_HEADING_SPEED = 1.2;

/**
 * The truck's heading, from the movement itself, never from how the map is turned:
 *  1. on its road route: the direction of the road at that point;
 *  2. moving: the phone's GPS course over ground;
 *  3. otherwise the bearing between consecutive fixes, when it moved far enough to tell;
 *  4. stopped: keep the last heading (a parked truck doesn't spin with GPS jitter).
 */
export function truckHeading(o: {
  roadHeading?: number | null;
  gpsHeading?: number | null;
  speed?: number | null;
  prev?: LatLng | null;
  next: LatLng;
  last: number;
}): number {
  if (o.roadHeading != null) return o.roadHeading;
  if (o.gpsHeading != null && o.gpsHeading >= 0 && (o.speed ?? 0) >= MIN_GPS_HEADING_SPEED) return o.gpsHeading;
  if (o.prev && d(o.prev, o.next) >= MIN_HEADING_MOVE_M) return bearing(o.prev, o.next);
  return o.last;
}

// ─── When to work out a new route ────────────────────────────────────────────

/** Between two re-routes at least this long, so a bad GPS patch can't flood the routing service. */
export const MIN_REROUTE_MS = 12000;
/** A straight-line route (routing service was unreachable) is retried this often. */
export const STRAIGHT_RETRY_MS = 30000;

/**
 * Whether the crew's phone should fetch a new route now. Far off the route (> OFF_ROUTE_M):
 * at once; a little off (> REROUTE_M): on the second fix in a row, since one stray fix is
 * just GPS noise. A straight-line route is retried every so often in case the routing
 * service is back. Returns the updated count of off-route fixes in a row.
 */
export function rerouteDecision(o: {
  offRouteM: number; offCount: number; straight: boolean; nowMs: number; lastRerouteMs: number; busy: boolean;
}): { offCount: number; strayed: boolean; fetch: boolean } {
  const offCount = o.offRouteM > REROUTE_M ? o.offCount + 1 : 0;
  const strayed = o.offRouteM > OFF_ROUTE_M || offCount >= 2;
  const retryStraight = o.straight && o.nowMs - o.lastRerouteMs > STRAIGHT_RETRY_MS;
  const fetch = (strayed || retryStraight) && !o.busy && o.nowMs - o.lastRerouteMs > MIN_REROUTE_MS;
  return { offCount, strayed, fetch };
}

/** Signed turn from one heading to another, -180..180 (negative = left). */
export const turnDelta = (from: number, to: number) => ((to - from + 540) % 360) - 180;

export function formatEta(seconds: number): string {
  if (seconds < 60) return 'Less than 1 min';
  const min = Math.round(seconds / 60);
  if (min < 60) return `${min} min`;
  return `${Math.floor(min / 60)} hr ${min % 60} min`;
}

// ─── Keeping the truck on the road (like ride-hailing apps) ──────────────────

/** Within this distance of the route, the truck is drawn on the road instead of at the raw GPS fix. */
export const SNAP_M = 35;

/** The point `m` metres along the route, and which way the road goes there. */
export function pointAlong(path: LatLng[], m: number): { point: LatLng; heading: number } {
  if (path.length === 0) return { point: { latitude: 0, longitude: 0 }, heading: 0 };
  if (path.length === 1 || m <= 0) return { point: path[0], heading: path[1] ? bearing(path[0], path[1]) : 0 };
  let left = m;
  for (let i = 0; i < path.length - 1; i++) {
    const len = d(path[i], path[i + 1]);
    if (left <= len) {
      return { point: lerp(path[i], path[i + 1], len === 0 ? 0 : left / len), heading: bearing(path[i], path[i + 1]) };
    }
    left -= len;
  }
  const n = path.length;
  return { point: path[n - 1], heading: bearing(path[n - 2], path[n - 1]) };
}

/** The route's corners between two distances along it (exclusive), so a glide follows the road. */
export function cornersBetween(path: LatLng[], fromM: number, toM: number): LatLng[] {
  const out: LatLng[] = [];
  let at = 0;
  for (let i = 1; i < path.length; i++) {
    at += d(path[i - 1], path[i]);
    if (at > toM) break;
    if (at > fromM && i < path.length - 1) out.push(path[i]);
  }
  return out;
}

export interface GpsFix { latitude: number; longitude: number; accuracy?: number | null; timeMs: number }

// Phones report fixes worse than this indoors or between tall buildings.
const MAX_ACCURACY_M = 50;
// Faster than this (~200 km/h) between two fixes is a GPS glitch, not the truck.
const MAX_SPEED_MPS = 55;
// After this long without a good fix, take whatever comes rather than freezing the truck.
const MAX_GAP_MS = 15000;

/** Whether a GPS fix is believable, compared with the last one that was used. */
export function isPlausibleFix(fix: GpsFix, last: GpsFix | null): boolean {
  if (!last) return true;
  const gap = fix.timeMs - last.timeMs;
  if (gap >= MAX_GAP_MS) return true;
  if (fix.accuracy != null && fix.accuracy > MAX_ACCURACY_M) return false;
  const moved = d(fix, last);
  return moved / Math.max(gap / 1000, 0.5) <= MAX_SPEED_MPS;
}

// ─── Turn-by-turn directions (crew's phone) ──────────────────────────────────

/** One manoeuvre from the routing service (OSRM), e.g. "turn left onto Osmeña Blvd". */
export interface NavStep {
  /** OSRM maneuver type: depart, turn, continue, new name, merge, fork, end of road, roundabout, arrive... */
  type: string;
  /** left, right, slight left, sharp right, straight, uturn... */
  modifier?: string;
  /** Roundabout exit number. */
  exit?: number;
  /** Street name; empty when the road has none. */
  name: string;
  location: LatLng;
  /** Metres from the start of the route to this manoeuvre, measured along the route. */
  atM: number;
}

/** What the crew should do next, and how far away it is. */
export interface NavInstruction {
  step: NavStep;
  distanceM: number;
  text: string;
  /** The manoeuvre right after this one, when it comes soon after (e.g. "Then turn right"). */
  then?: string;
}

/** Works out how far along the route each manoeuvre is. Never goes backwards. */
export function placeSteps(path: LatLng[], steps: Omit<NavStep, 'atM'>[]): NavStep[] {
  const total = pathLength(path);
  let last = 0;
  return steps.map((s) => {
    last = s.type === 'arrive' ? total : Math.max(last, total - locateOnRoute(path, s.location).remainingM);
    return { ...s, atM: last };
  });
}

const ordinal = (n: number) => {
  const words = ['first', 'second', 'third', 'fourth', 'fifth', 'sixth', 'seventh', 'eighth'];
  return words[n - 1] ?? `${n}th`;
};

const TURN_WORDS: Record<string, string> = {
  left: 'left', right: 'right', 'slight left': 'slightly left', 'slight right': 'slightly right',
  'sharp left': 'sharp left', 'sharp right': 'sharp right',
};

/** "Turn left onto Osmeña Blvd" from an OSRM manoeuvre. */
export function stepText(s: Pick<NavStep, 'type' | 'modifier' | 'exit' | 'name'>): string {
  const onto = s.name ? ` onto ${s.name}` : '';
  const turn = TURN_WORDS[s.modifier ?? ''];
  switch (s.type) {
    case 'arrive': return 'Arrive at the cleanup site';
    case 'depart': return s.name ? `Head out on ${s.name}` : 'Head out';
    case 'roundabout':
    case 'rotary':
      return s.exit ? `At the roundabout, take the ${ordinal(s.exit)} exit${onto}` : `Go through the roundabout${onto}`;
    case 'exit roundabout':
    case 'exit rotary':
      return `Exit the roundabout${onto}`;
    case 'merge': return `Merge${turn ? ` ${turn}` : ''}${onto}`;
    case 'on ramp': return `Take the ramp${turn ? ` on the ${s.modifier?.replace('slight ', '')}` : ''}${onto}`;
    case 'off ramp': return `Take the exit${turn ? ` on the ${s.modifier?.replace('slight ', '')}` : ''}${onto}`;
    case 'fork': return `Keep ${s.modifier?.includes('left') ? 'left' : s.modifier?.includes('right') ? 'right' : 'straight'} at the fork${onto}`;
    case 'end of road': return `At the end of the road, turn ${s.modifier?.includes('left') ? 'left' : 'right'}${onto}`;
    default:
      if (s.modifier === 'uturn') return `Make a U-turn${onto}`;
      if (!turn) return s.name ? `Continue on ${s.name}` : 'Continue straight';
      return `Turn ${turn}${onto}`;
  }
}

/** Arrow for the direction banner. */
export function stepArrow(s: Pick<NavStep, 'type' | 'modifier'>): string {
  if (s.type === 'arrive') return '🏁';
  if (s.type === 'roundabout' || s.type === 'rotary') return '⟳';
  switch (s.modifier) {
    case 'left': case 'sharp left': return '←';
    case 'right': case 'sharp right': return '→';
    case 'slight left': return '↖';
    case 'slight right': return '↗';
    case 'uturn': return '↶';
    default: return '↑';
  }
}

// A manoeuvre counts as done once the truck is this far past it.
const PASSED_M = 15;
// "Then ..." is only shown when the next manoeuvre follows within this distance.
const THEN_WITHIN_M = 150;

/**
 * The next manoeuvre for a truck that has driven `travelledM` metres along the route.
 * The opening "Head out" is skipped once the truck is moving.
 */
export function nextInstruction(steps: NavStep[], travelledM: number): NavInstruction | null {
  const i = steps.findIndex((s) => s.atM > travelledM + (s.type === 'arrive' ? 0 : -PASSED_M) && (s.type !== 'depart' || travelledM < PASSED_M));
  if (i < 0) return null;
  const step = steps[i];
  const after = steps[i + 1];
  return {
    step,
    distanceM: Math.max(0, step.atM - travelledM),
    text: stepText(step),
    ...(after && after.atM - step.atM <= THEN_WITHIN_M ? { then: stepText(after) } : {}),
  };
}

export function formatDistance(m: number): string {
  return m < 1000 ? `${Math.round(m / 10) * 10} m` : `${(m / 1000).toFixed(1)} km`;
}
