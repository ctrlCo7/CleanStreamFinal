// What the tracking dashboard says the truck is doing. No React Native imports (unit-tested).
import { CrewTracking } from '../../types';

/** No update for this long: the crew's phone lost signal or closed the app (heartbeat is 15 s). */
export const STALE_S = 60;
/** Closer than this to the site counts as arriving. */
const ARRIVING_M = 150;
/** Faster than this (m/s, ~4 km/h) counts as driving. */
const MOVING_MPS = 1.2;

// ─── "Last seen", measured with this phone's own clock ───────────────────────
// Each phone's clock is a little off (some by minutes), so comparing the crew phone's
// updatedAtMs with this phone's clock can say "Signal lost" for a truck that is live.
// Instead, remember when this phone received each new update and count from then.
const SKEW_TRUST_MS = 5 * 60 * 1000;
const receivedAt = new Map<string, { updatedAtMs: number; localMs: number }>();

/** Call for every copy of a trip that arrives from the server. */
export function noteReceived(t: Pick<CrewTracking, 'taskId' | 'updatedAtMs'>, now = Date.now()): void {
  const seen = receivedAt.get(t.taskId);
  if (seen && seen.updatedAtMs === t.updatedAtMs) return;
  // The first copy may really be old (the crew's phone died long ago): an age far beyond any
  // clock difference is believed; anything less counts as just received.
  const localMs = !seen && now - t.updatedAtMs > SKEW_TRUST_MS ? t.updatedAtMs : now;
  receivedAt.set(t.taskId, { updatedAtMs: t.updatedAtMs, localMs });
}

/** Seconds since the crew's phone last reported in, as seen from this phone. */
export function secondsSinceSeen(t: Pick<CrewTracking, 'taskId' | 'updatedAtMs'>, now = Date.now()): number {
  const seen = receivedAt.get(t.taskId);
  const from = seen && seen.updatedAtMs === t.updatedAtMs ? seen.localMs : t.updatedAtMs;
  return Math.max(0, Math.round((now - from) / 1000));
}

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
