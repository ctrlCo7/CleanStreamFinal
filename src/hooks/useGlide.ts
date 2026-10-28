import { useEffect, useRef, useState } from 'react';
import { lerp, lerpAngle } from '../services/routeMath';

export interface GlidePoint { latitude: number; longitude: number; heading: number }

// Ease-out: fast start, gentle stop, like a vehicle settling.
const ease = (t: number) => 1 - (1 - t) ** 3;
// ~30 frames a second is smooth for a marker and spares the JS thread.
const FRAME_MS = 33;

/**
 * Smoothly moves a map marker from where it is now to each new GPS position, and turns it
 * the short way round to the new heading, instead of jumping every few seconds.
 */
export function useGlide(target: GlidePoint | null, durationMs = 1800): GlidePoint | null {
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
    const start = Date.now();
    let last = 0;
    let frame = 0;
    const step = () => {
      const now = Date.now();
      const t = Math.min(1, (now - start) / durationMs);
      if (now - last >= FRAME_MS || t === 1) {
        last = now;
        const e = ease(t);
        const next = { ...lerp(from, target, e), heading: lerpAngle(from.heading, target.heading, e) };
        shownRef.current = next;
        setShown(next);
      }
      if (t < 1) frame = requestAnimationFrame(step);
    };
    frame = requestAnimationFrame(step);
    return () => cancelAnimationFrame(frame);
  }, [target?.latitude, target?.longitude, target?.heading, durationMs]); // eslint-disable-line react-hooks/exhaustive-deps

  return shown;
}
