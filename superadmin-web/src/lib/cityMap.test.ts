import { describe, expect, it } from 'vitest';
import { findHotspots, noteReceived, secondsSinceSeen, toLiveTrip } from './cityMap';
import type { Report } from './operations';

const now = new Date('2026-11-06T08:00:00+08:00');
let n = 0;
const rep = (lat: number, lng: number, over: Partial<Report> = {}) => ({
  id: `r${n++}`, status: 'pending', severity: 'moderate', barangay: 'Talamban', approximate: false,
  createdAt: new Date(now.getTime() - 86400_000), latitude: lat, longitude: lng, ...over,
}) as Report & { latitude: number; longitude: number };

describe('city map hotspots', () => {
  it('finds 3+ open reports within 100 m and reports the worst severity', () => {
    const spots = findHotspots([
      rep(10.37, 123.91), rep(10.3702, 123.9101, { severity: 'critical' }), rep(10.3701, 123.9099),
      rep(10.30, 123.89), // far away
    ], now);
    expect(spots).toHaveLength(1);
    expect(spots[0].count).toBe(3);
    expect(spots[0].worst).toBe('critical');
  });

  it('ignores cleaned-up, old and approximate reports', () => {
    expect(findHotspots([
      rep(10.37, 123.91), rep(10.3701, 123.91, { status: 'completed' }), rep(10.3702, 123.91, { approximate: true }),
      rep(10.3701, 123.9101, { createdAt: new Date(now.getTime() - 120 * 86400_000) }),
    ], now)).toHaveLength(0);
  });
});

describe('city map live trucks', () => {
  it('reads a tracking document and skips broken ones', () => {
    const t = toLiveTrip('task1', { crewName: 'Crew A', latitude: 10.3, longitude: 123.9, destination: { latitude: 10.31, longitude: 123.91 }, updatedAtMs: 5 });
    expect(t?.crewName).toBe('Crew A');
    expect(toLiveTrip('bad', { latitude: 10.3 })).toBeNull();
  });

  it('is not "signal lost" just because the crew phone clock is slow', () => {
    const t = { taskId: 'clock', updatedAtMs: Date.now() - 4 * 60_000 };
    noteReceived(t);
    expect(secondsSinceSeen(t)).toBeLessThan(2);
  });
});
