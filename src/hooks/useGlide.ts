import { useEffect, useRef, useState } from 'react';
import { LatLng, lerp, lerpAngle, pathLength, pointAlong } from '../services/routeMath';
import { CrewTracking } from '../types';
import { MotionMemo, TruckTarget, nextMotion } from '../components/map/truckMotion';

export interface GlidePoint { latitude: number; longitude: number; heading: number }

/** A position to glide to: optionally through road corners (`via`) and over a set time. */
export type GlideTarget = GlidePoint & { via?: LatLng[]; durationMs?: number };

// Ease-out: fast start, gentle stop, like a vehicle settling.
const ease = (t: number) => 1 - (1 - t) ** 3;
// ~30 frames a second is smooth for a marker and spares the JS thread.
const FRAME_MS = 33;

/**
 * Smoothly moves a map marker from where it is now to each new GPS position, and turns it
 * the short way round to the new heading, instead of jumping every few seconds.
 *
 * With `via` (road corners) the marker drives along the road at a steady speed and turns at
 * each corner, like the car in a ride-hailing app; without it, it eases straight there.
 */
export function useGlide(target: GlideTarget | null, durationMs = 1800): GlidePoint | null {
  const [shown, setShown] = useState<GlidePoint | null>(target);
  const shownRef = useRef<GlidePoint | null>(target);

  useEffect(() => {
    if (!target) return;
    const from = shownRef.current;
    if (!from) {
      shownRef.current = target;
      setShown(target);
      return;
    }
    const duration = target.durationMs ?? durationMs;
    const tracked = target.durationMs != null;
    const path: LatLng[] = [from, ...(target.via ?? []), target];
    const total = pathLength(path);
    const start = Date.now();
    let last = 0;
    let frame = 0;
    const step = () => {
      const now = Date.now();
      const t = Math.min(1, (now - start) / duration);
      if (now - last >= FRAME_MS || t === 1) {
        last = now;
        let next: GlidePoint;
        if (tracked && path.length > 2 && total > 0) {
          // Along the road at a steady speed, turning smoothly towards each stretch of road.
          const at = pointAlong(path, total * t);
          const prevHeading = shownRef.current?.heading ?? from.heading;
          next = { ...at.point, heading: t === 1 ? target.heading : lerpAngle(prevHeading, at.heading, 0.35) };
        } else {
          // Straight there: steady speed for a tracked truck (it turns early, then drives),
          // eased for anything else.
          const e = tracked ? t : ease(t);
          next = { ...lerp(from, target, e), heading: lerpAngle(from.heading, target.heading, tracked ? Math.min(1, e * 2) : e) };
        }
        shownRef.current = next;
        setShown(next);
      }
      if (t < 1) frame = requestAnimationFrame(step);
    };
    frame = requestAnimationFrame(step);
    return () => cancelAnimationFrame(frame);
  }, [target, durationMs]); // eslint-disable-line react-hooks/exhaustive-deps

  return shown;
}

/** The glide target for a tracked truck's latest update (see truckMotion.ts). */
export function useTruckTarget(trip: CrewTracking | null): TruckTarget | null {
  const memo = useRef<MotionMemo | undefined>(undefined);
  const [target, setTarget] = useState<TruckTarget | null>(null);
  useEffect(() => {
    if (!trip) { setTarget(null); return; }
    const next = nextMotion(memo.current, trip);
    memo.current = next.memo;
    setTarget(next.target);
  }, [trip?.latitude, trip?.longitude, trip?.heading, trip?.updatedAtMs]); // eslint-disable-line react-hooks/exhaustive-deps
  return target;
}

/** A tracked truck, moving along the road between updates like a ride-hailing app's car. */
export const useTrackedTruck = (trip: CrewTracking | null): GlidePoint | null => useGlide(useTruckTarget(trip));
