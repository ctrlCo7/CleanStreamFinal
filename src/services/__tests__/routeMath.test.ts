import { describe, expect, it } from 'vitest';
import {
  bearing, etaSeconds, formatDistance, formatEta, lerpAngle, locateOnRoute, pathLength, simplifyPath,
} from '../routeMath';

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
  });
});
