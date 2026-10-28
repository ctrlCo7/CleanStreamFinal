/**
 * Geometry for live crew tracking: where the truck is along its route, how far is left,
 * when it will arrive, which way it faces, and when it has strayed off the route.
 * Pure, so it is unit-tested in Node; crewTrackingService.ts uses it on the crew's
 * phone, and the map components use it to animate the truck between GPS updates.
 */
import { distanceM } from './reportProximity';

export interface LatLng { latitude: number; longitude: number }

/** Leaving the route by more than this triggers a new route. */
export const OFF_ROUTE_M = 120;
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

/** Keeps at most `max` points (first and last always kept) so a route fits in one Firestore document. */
export function simplifyPath(path: LatLng[], max = 300): LatLng[] {
  if (path.length <= max) return path;
  const step = (path.length - 1) / (max - 1);
  return Array.from({ length: max }, (_, i) => path[Math.round(i * step)]);
}

export function formatEta(seconds: number): string {
  if (seconds < 60) return 'Less than 1 min';
  const min = Math.round(seconds / 60);
  if (min < 60) return `${min} min`;
  return `${Math.floor(min / 60)} hr ${min % 60} min`;
}

export function formatDistance(m: number): string {
  return m < 1000 ? `${Math.round(m / 10) * 10} m` : `${(m / 1000).toFixed(1)} km`;
}
