// What the tracking dashboard says the truck is doing. No React Native imports (unit-tested).
import { CrewTracking } from '../../types';

/** No update for this long: the crew's phone lost signal or closed the app (heartbeat is 20 s). */
export const STALE_S = 60;
/** Closer than this to the site counts as arriving. */
const ARRIVING_M = 150;
/** Faster than this (m/s, ~4 km/h) counts as driving. */
const MOVING_MPS = 1.2;

export type MovementStatus = 'lost' | 'rerouting' | 'arriving' | 'moving' | 'stopped';

export function movementStatus(t: CrewTracking, sinceS: number): MovementStatus {
  if (t.status === 'en_route' && sinceS > STALE_S) return 'lost';
  if (t.offRoute) return 'rerouting';
  if (t.remainingM <= ARRIVING_M) return 'arriving';
  if (t.speed == null) return 'moving';
  return t.speed >= MOVING_MPS ? 'moving' : 'stopped';
}

/** km/h, rounded, when the phone reported a speed. */
export const speedKmh = (t: CrewTracking): number | null => (t.speed == null ? null : Math.round(t.speed * 3.6));

/** How much of the trip is done, 0–100, from the remaining distance along the route. */
export function tripProgress(t: CrewTracking): number {
  // The whole trip's length; a re-route starts a new, shorter route but not a new trip.
  const total = Math.max(t.tripDistanceM ?? t.routeDistanceM ?? 0, t.remainingM);
  if (!total) return 0;
  return Math.max(0, Math.min(100, Math.round((1 - t.remainingM / total) * 100)));
}
