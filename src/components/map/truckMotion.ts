// How a tracked truck moves between two updates on the viewers' maps, like ride-hailing
// apps: along the road (through its corners, not cutting across blocks) and at a steady
// speed lasting about as long as the gap between updates, so it never stops and jumps.
// No React Native imports, so it can be unit-tested; used by useTrackedTruck (Google/Apple
// maps) and by the OpenFreeMap pages (Huawei), which run the same glide in the WebView.
import { CrewTracking } from '../../types';
import { LatLng, cornersBetween } from '../../services/routeMath';

export interface TruckTarget {
  latitude: number;
  longitude: number;
  heading: number;
  /** Road corners to pass through on the way here (may be empty). */
  via: LatLng[];
  durationMs: number;
}

/** What to remember about the last update, to plan the next glide. */
export interface MotionMemo { routeKey: string; alongM?: number; atMs: number }

// The glide lasts about as long as the gap between updates, within these limits.
const MIN_GLIDE_MS = 800;
const MAX_GLIDE_MS = 5000;
// A longer hop along the road than this is a catch-up after lost signal: don't trace it.
const MAX_TRACE_M = 1500;

// A new route (after a wrong turn) means distances along the old one no longer apply.
const routeKey = (t: CrewTracking) => `${Math.round(t.routeDistanceM)}:${t.route.length}`;

export function nextMotion(prev: MotionMemo | undefined, t: CrewTracking): { target: TruckTarget; memo: MotionMemo } {
  const key = routeKey(t);
  let via: LatLng[] = [];
  let durationMs = 1800;
  if (prev) {
    durationMs = Math.min(MAX_GLIDE_MS, Math.max(MIN_GLIDE_MS, t.updatedAtMs - prev.atMs));
    const from = prev.alongM, to = t.alongM;
    if (t.onRoute && prev.routeKey === key && from != null && to != null && to > from && to - from <= MAX_TRACE_M) {
      via = cornersBetween(t.route, from, to);
    }
  }
  return {
    target: { latitude: t.latitude, longitude: t.longitude, heading: t.heading, via, durationMs },
    memo: { routeKey: key, alongM: t.onRoute ? t.alongM : undefined, atMs: t.updatedAtMs },
  };
}
