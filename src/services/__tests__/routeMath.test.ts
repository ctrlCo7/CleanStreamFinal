import { describe, expect, it } from 'vitest';
import {
  bearing, etaSeconds, formatDistance, formatEta, lerpAngle, locateOnRoute, nextInstruction, pathLength, placeSteps,
  simplifyPath, stepArrow, stepText, pointAlong, cornersBetween, isPlausibleFix,
} from '../routeMath';
import { nextMotion } from '../../components/map/truckMotion';
import type { CrewTracking } from '../../types';

// A 3-point route heading north, then east, in Cebu. ~0.009° latitude ≈ 1 km.
const A = { latitude: 10.30, longitude: 123.89 };
const B = { latitude: 10.309, longitude: 123.89 };
const C = { latitude: 10.309, longitude: 123.8991 };
const route = [A, B, C];

describe('bearing', () => {
  it('points the truck the way it drives', () => {
    expect(Math.round(bearing(A, B))).toBe(0);    // north
    expect(Math.round(bearing(B, C))).toBe(90);   // east
    expect(Math.round(bearing(B, A))).toBe(180);  // south
  });
});

describe('lerpAngle', () => {
  it('turns the short way round', () => {
    expect(lerpAngle(350, 10, 0.5)).toBeCloseTo(0, 5);
    expect(lerpAngle(10, 350, 0.5)).toBeCloseTo(0, 5);
    expect(lerpAngle(0, 90, 0.5)).toBeCloseTo(45, 5);
  });
});

describe('locateOnRoute', () => {
  const total = pathLength(route);
  it('measures what is left of the route', () => {
    expect(locateOnRoute(route, A).remainingM).toBeCloseTo(total, -1);
    const mid = locateOnRoute(route, { latitude: 10.3045, longitude: 123.89 });
    expect(mid.segment).toBe(0);
    expect(mid.offRouteM).toBeLessThan(1);
    expect(mid.remainingM).toBeCloseTo(total - pathLength([A, { latitude: 10.3045, longitude: 123.89 }]), -1);
    expect(locateOnRoute(route, C).remainingM).toBeLessThan(1);
  });
  it('notices when the truck has left the route', () => {
    const off = locateOnRoute(route, { latitude: 10.3045, longitude: 123.8925 }); // ~270 m east of the first leg
    expect(off.offRouteM).toBeGreaterThan(200);
  });
  it('copes with tiny routes', () => {
    expect(locateOnRoute([], A).remainingM).toBe(0);
    expect(locateOnRoute([A], B).offRouteM).toBeGreaterThan(900);
  });
});

describe('ETA and formatting', () => {
  it("uses the route's own average speed, with a sensible fallback", () => {
    expect(etaSeconds(1000, 2000, 400)).toBe(200);
    expect(etaSeconds(1000)).toBe(180); // 20 km/h
    expect(etaSeconds(100, 100, 100000)).toBe(71); // never slower than walking
  });
  it('reads like a delivery app', () => {
    expect(formatEta(30)).toBe('Less than 1 min');
    expect(formatEta(8 * 60)).toBe('8 min');
    expect(formatEta(65 * 60)).toBe('1 hr 5 min');
    expect(formatDistance(234)).toBe('230 m');
    expect(formatDistance(2345)).toBe('2.3 km');
  });
});

describe('simplifyPath', () => {
  it('keeps the start and end and caps the size', () => {
    const long = Array.from({ length: 1000 }, (_, i) => ({ latitude: 10 + i / 1e4, longitude: 123 }));
    const s = simplifyPath(long, 300);
    expect(s).toHaveLength(300);
    expect(s[0]).toBe(long[0]);
    expect(s[299]).toBe(long[999]);
    expect(simplifyPath(route)).toBe(route);
  });
});

describe('OpenFreeMap page script', () => {
  it('produces JavaScript that parses, for light and dark, interactive or not', async () => {
    const { glideJs, mapInitJs, openFreeMapStyle, zoomForDelta } = await import('../../components/map/openFreeMap');
    for (const dark of [false, true]) {
      for (const interactive of [false, true]) {
        // eslint-disable-next-line no-new-func
        expect(() => new Function(mapInitJs({ dark, latitude: 10.3, longitude: 123.9, zoom: 13, interactive }) + glideJs)).not.toThrow();
      }
    }
    expect(openFreeMapStyle(false)).toBe('https://tiles.openfreemap.org/styles/liberty');
    expect(openFreeMapStyle(true)).toBe('https://tiles.openfreemap.org/styles/dark');
    expect(zoomForDelta(0.08)).toBeCloseTo(12.1, 1);
    // The tracking page embeds the pin HTML inside a single-quoted JS string.
    const { teardropPinHtml, TRUCK_SVG } = await import('../../components/map/mapIconsHtml');
    expect(teardropPinHtml('#EF4444', true, '🗑️')).not.toContain("'");
    expect(TRUCK_SVG).not.toContain('`');
    expect(TRUCK_SVG).not.toContain("'");
    expect(TRUCK_SVG).toContain('csTruckBody');
  });
});

describe('turn-by-turn directions', () => {
  const steps = placeSteps(route, [
    { type: 'depart', name: 'Jones Ave', location: A },
    { type: 'turn', modifier: 'right', name: 'Osmeña Blvd', location: B },
    { type: 'arrive', name: '', location: C },
  ]);
  const legA = pathLength([A, B]);

  it('places each manoeuvre along the route', () => {
    expect(steps[0].atM).toBe(0);
    expect(steps[1].atM).toBeCloseTo(legA, -1);
    expect(steps[2].atM).toBeCloseTo(pathLength(route), 5);
  });

  it('says what to do in plain words', () => {
    expect(stepText(steps[1])).toBe('Turn right onto Osmeña Blvd');
    expect(stepText({ type: 'roundabout', exit: 2, name: 'N. Bacalso Ave' })).toBe('At the roundabout, take the second exit onto N. Bacalso Ave');
    expect(stepText({ type: 'continue', modifier: 'straight', name: '' })).toBe('Continue straight');
    expect(stepText({ type: 'turn', modifier: 'uturn', name: '' })).toBe('Make a U-turn');
    expect(stepText({ type: 'fork', modifier: 'slight left', name: '' })).toBe('Keep left at the fork');
    expect(stepArrow(steps[1])).toBe('→');
    expect(stepArrow(steps[2])).toBe('🏁');
  });

  it('gives the next turn and how far it is', () => {
    expect(nextInstruction(steps, 0)?.step.type).toBe('depart');
    const n = nextInstruction(steps, 300);
    expect(n?.text).toBe('Turn right onto Osmeña Blvd');
    expect(n?.distanceM).toBeCloseTo(legA - 300, -1);
    // Just past the turn it still shows it; well past, it moves on to arriving.
    expect(nextInstruction(steps, legA + 5)?.step.type).toBe('turn');
    expect(nextInstruction(steps, legA + 100)?.text).toBe('Arrive at the cleanup site');
    expect(nextInstruction(steps, pathLength(route) + 1)).toBeNull();
  });

  it('mentions the following turn only when it comes soon after', () => {
    expect(nextInstruction(steps, 300)?.then).toBeUndefined();
    const close = placeSteps(route, [
      { type: 'turn', modifier: 'left', name: '', location: B },
      { type: 'turn', modifier: 'right', name: 'P. del Rosario St', location: { latitude: 10.309, longitude: 123.8905 } },
    ]);
    expect(nextInstruction(close, 100)?.then).toBe('Turn right onto P. del Rosario St');
  });
});

describe('keeping the truck on the road', () => {
  const legA = pathLength([A, B]);

  it('finds the point and road direction a distance along the route', () => {
    const half = pointAlong(route, legA / 2);
    expect(half.point.latitude).toBeCloseTo((A.latitude + B.latitude) / 2, 5);
    expect(Math.round(half.heading)).toBe(0);
    expect(Math.round(pointAlong(route, legA + 100).heading)).toBe(90);
    expect(pointAlong(route, 1e9).point).toEqual(C);
  });

  it('lists the corners passed between two distances', () => {
    expect(cornersBetween(route, 100, legA + 100)).toEqual([B]);
    expect(cornersBetween(route, 100, 200)).toEqual([]);
    expect(cornersBetween(route, legA + 10, legA + 200)).toEqual([]);
  });

  it('ignores blurry fixes and impossible jumps, but never freezes for long', () => {
    const last = { ...A, accuracy: 8, timeMs: 0 };
    expect(isPlausibleFix({ ...A, accuracy: 10, timeMs: 1000 }, null)).toBe(true);
    expect(isPlausibleFix({ latitude: 10.3001, longitude: 123.89, accuracy: 10, timeMs: 3000 }, last)).toBe(true);
    expect(isPlausibleFix({ latitude: 10.3001, longitude: 123.89, accuracy: 120, timeMs: 3000 }, last)).toBe(false);
    expect(isPlausibleFix({ ...B, accuracy: 10, timeMs: 3000 }, last)).toBe(false); // 1 km in 3 s
    expect(isPlausibleFix({ ...B, accuracy: 120, timeMs: 20000 }, last)).toBe(true);
  });
});

describe('truck motion between updates (viewers)', () => {
  const trip = (alongM: number, atMs: number, onRoute = true) => {
    const at = pointAlong(route, alongM).point;
    return {
      ...at, heading: 0, alongM, onRoute, updatedAtMs: atMs, route, routeDistanceM: pathLength(route),
    } as unknown as CrewTracking;
  };
  const legA = pathLength([A, B]);

  it('drives through the corner instead of cutting across', () => {
    const first = nextMotion(undefined, trip(legA - 50, 0));
    const second = nextMotion(first.memo, trip(legA + 50, 3000));
    expect(second.target.via).toEqual([B]);
    expect(second.target.durationMs).toBe(3000);
  });

  it('jumps straight there after a new route, lost signal or leaving the road', () => {
    const first = nextMotion(undefined, trip(legA - 50, 0));
    expect(nextMotion(first.memo, trip(legA + 50, 3000, false)).target.via).toEqual([]);
    expect(nextMotion({ ...first.memo, routeKey: 'other' }, trip(legA + 50, 3000)).target.via).toEqual([]);
    expect(nextMotion(first.memo, trip(legA + 50, 60000)).target.durationMs).toBe(5000);
  });
});
