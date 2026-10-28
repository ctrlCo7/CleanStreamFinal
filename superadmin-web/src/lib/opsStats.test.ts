import { describe, expect, it } from 'vitest';
import { Checkpoint, Inspection, toReport, validateCheckpoint, wasteGroupOf } from './operations';
import { checkpointState, dayName, expectedDays, findHotspots, formatHours, inspectionCompliance, reportStats } from './opsStats';

// Saturday 24 Oct 2026, 10:00 local time.
const NOW = new Date(2026, 9, 24, 10, 0);

const cp = (over: Partial<Checkpoint> = {}): Checkpoint => ({
  id: 'cp1', name: 'Bridge 2', barangayId: 'guadalupe', barangay: 'Guadalupe', waterway: '', description: '',
  assignedUserIds: [], assignedNames: [], days: ['Mon', 'Wed', 'Fri'], time: '07:00', isActive: true,
  lastInspectedAt: null, createdAt: new Date(2026, 0, 1), ...over,
});

const insp = (day: Date, checkpointId = 'cp1'): Inspection => ({
  id: String(day.getTime()), userId: 'u', userName: 'Official', barangayId: 'guadalupe', barangay: 'Guadalupe',
  checkpointId, type: '', condition: 'Clean', wasteType: '', status: 'pending', createdAt: day,
});

describe('dayName', () => {
  it('is Monday-first', () => {
    expect(dayName(NOW)).toBe('Sat');
    expect(dayName(new Date(2026, 9, 19))).toBe('Mon');
    expect(dayName(new Date(2026, 9, 25))).toBe('Sun');
  });
});

describe('expectedDays', () => {
  it('counts scheduled days in the window, including today once its time has passed', () => {
    // 18–24 Oct: Mon 19, Wed 21, Fri 23 — and Sat 24 is not scheduled.
    expect(expectedDays(cp(), NOW)).toEqual(['2026-10-19', '2026-10-21', '2026-10-23']);
    expect(expectedDays(cp({ days: ['Sat'] }), NOW)).toEqual(['2026-10-24']);
  });
  it("leaves out today if the inspection time hasn't come yet", () => {
    expect(expectedDays(cp({ days: ['Sat'], time: '15:00' }), NOW)).toEqual([]);
  });
  it('skips days before the checkpoint existed, and paused checkpoints', () => {
    expect(expectedDays(cp({ createdAt: new Date(2026, 9, 22) }), NOW)).toEqual(['2026-10-23']);
    expect(expectedDays(cp({ isActive: false }), NOW)).toEqual([]);
  });
});

describe('inspectionCompliance', () => {
  it('matches inspections to scheduled days, ignoring extras and other checkpoints', () => {
    const result = inspectionCompliance([cp()], [
      insp(new Date(2026, 9, 19, 8)),
      insp(new Date(2026, 9, 19, 16)), // second visit the same day counts once
      insp(new Date(2026, 9, 20, 8)),  // unscheduled day
      insp(new Date(2026, 9, 21, 8), 'other'),
    ], NOW);
    expect(result.total).toEqual({ expected: 3, done: 1, missed: 2, rate: 33 });
  });
  it('reports 0% only when something was due', () => {
    expect(inspectionCompliance([], [], NOW).total).toEqual({ expected: 0, done: 0, missed: 0, rate: 0 });
  });
});

describe('checkpointState', () => {
  it('reflects today', () => {
    expect(checkpointState(cp({ days: ['Sat'] }), NOW)).toBe('overdue');
    expect(checkpointState(cp({ days: ['Sat'], time: '15:00' }), NOW)).toBe('due-today');
    expect(checkpointState(cp({ days: ['Sat'], lastInspectedAt: new Date(2026, 9, 24, 7) }), NOW)).toBe('done-today');
    expect(checkpointState(cp(), NOW)).toBe('not-today');
    expect(checkpointState(cp({ isActive: false }), NOW)).toBe('paused');
  });
});

describe('toReport', () => {
  it('reads the mobile app report shape', () => {
    const r = toReport('abc', {
      reportNumber: 'CS-001', status: 'completed', severity: 'critical', barangayId: 'guadalupe', barangay: 'Guadalupe',
      location: { latitude: 10.31, longitude: 123.88, address: 'Near bridge' },
      aiAnalysis: { confidence: 82, estimatedVolume: 1.5, hazardousDetected: false, wasteTypes: [{ type: 'plastic_bottle', label: 'Plastic bottle' }] },
      createdAt: '2026-10-20T00:00:00Z', verifiedAt: '2026-10-20T03:00:00Z', resolvedAt: '2026-10-21T00:00:00Z',
    });
    expect(r).toMatchObject({ wasteGroup: 'plastic', aiConfidence: 82, latitude: 10.31, estimatedVolume: 1.5, hazardous: false });
    expect(r.respondedAt?.toISOString()).toBe('2026-10-20T03:00:00.000Z');
  });
  it('treats a 0,0 location as no GPS fix and 0–1 confidence as a fraction', () => {
    const r = toReport('x', { location: { latitude: 0, longitude: 0 }, aiAnalysis: { confidence: 0.6 } });
    expect(r.latitude).toBeUndefined();
    expect(r.aiConfidence).toBe(60);
    expect(r.status).toBe('pending');
  });
  it('prefers the reporter-confirmed waste type over the AI guess', () => {
    expect(toReport('x', { citizenWasteType: 'hazardous_waste', aiAnalysis: { wasteTypes: [{ type: 'plastic_bag' }] } }).wasteGroup).toBe('hazardous');
  });
});

describe('wasteGroupOf', () => {
  it('maps detailed AI labels to categories', () => {
    expect(wasteGroupOf('metal_can')).toBe('metal');
    expect(wasteGroupOf('e_waste')).toBe('electronic');
    expect(wasteGroupOf('food_waste')).toBe('organic');
    expect(wasteGroupOf('styrofoam')).toBe('plastic');
    expect(wasteGroupOf('trash_pile')).toBe('mixed');
    expect(wasteGroupOf(undefined)).toBe('mixed');
  });
});

describe('reportStats', () => {
  const mk = (over: Record<string, unknown>) => toReport(Math.random().toString(36), { barangayId: 'guadalupe', ...over });
  it('computes totals, response time and top barangays', () => {
    const reports = [
      mk({ status: 'completed', createdAt: '2026-10-20T00:00:00Z', verifiedAt: '2026-10-20T02:00:00Z' }),
      mk({ status: 'completed', createdAt: '2026-10-21T00:00:00Z', verifiedAt: '2026-10-21T04:00:00Z' }),
      mk({ status: 'pending', severity: 'critical', createdAt: '2026-10-22T00:00:00Z' }),
      mk({ status: 'rejected', severity: 'critical', barangayId: 'tejero', createdAt: '2026-09-01T00:00:00Z' }),
    ];
    const s = reportStats(reports, NOW);
    expect(s).toMatchObject({ total: 4, resolved: 2, open: 1, critical: 1, resolutionRate: 50 });
    expect(s.avgResponseHours).toBe(3);
    expect(s.topBarangays.map((b) => b.id)).toEqual(['guadalupe']);
    expect(s.monthly.map((m) => m.count)).toEqual([0, 0, 0, 0, 1, 3]);
  });
});

describe('validateCheckpoint', () => {
  const ok = { name: 'A', barangayId: 'guadalupe', waterway: '', description: '', latitude: '', longitude: '', assignedUserIds: [], assignedNames: [], days: ['Mon' as const], time: '07:00', isActive: true };
  it('accepts a minimal checkpoint', () => expect(validateCheckpoint(ok)).toEqual({}));
  it('needs both coordinates or neither, in range', () => {
    expect(validateCheckpoint({ ...ok, latitude: '10.3' }).latitude).toBeTruthy();
    expect(validateCheckpoint({ ...ok, latitude: '95', longitude: '123' }).latitude).toBeTruthy();
    expect(validateCheckpoint({ ...ok, latitude: '10.3', longitude: '123.9' })).toEqual({});
  });
  it('needs a day and a valid time', () => {
    expect(validateCheckpoint({ ...ok, days: [] }).days).toBeTruthy();
    expect(validateCheckpoint({ ...ok, time: '7am' }).time).toBeTruthy();
  });
});

describe('formatHours', () => {
  it('picks a readable unit', () => {
    expect(formatHours(null)).toBe('—');
    expect(formatHours(0.25)).toBe('15 min');
    expect(formatHours(5)).toBe('5.0 hr');
    expect(formatHours(72)).toBe('3.0 days');
  });
});

describe('toReport waterway fields', () => {
  it('reads the waterway assessment written by the app', () => {
    const r = toReport('w', { aiAnalysis: { waterway: { context: 'drainage', blockage: { level: 'high', score: 60 } } } });
    expect(r).toMatchObject({ waterContext: 'drainage', blockage: 'high' });
    expect(toReport('x', {}).waterContext).toBeUndefined();
  });
});

describe('findHotspots', () => {
  const at = (lat: number, daysAgo: number, over: Record<string, unknown> = {}) => toReport(Math.random().toString(36), {
    location: { latitude: lat, longitude: 123.88 }, barangay: 'Guadalupe', status: 'pending',
    createdAt: new Date(NOW.getTime() - daysAgo * 86400000).toISOString(), ...over,
  });
  it('groups 3+ recent reports within 100 m and ignores the rest', () => {
    const spots = findHotspots([
      at(10.3, 1), at(10.3003, 5), at(10.3006, 20), // ~33 m apart: one hotspot
      at(10.4, 1), at(10.4, 2),                      // only two
      at(10.3, 200),                                 // too old
      at(10.3, 2, { status: 'rejected' }),           // rejected
    ], NOW);
    expect(spots).toHaveLength(1);
    expect(spots[0]).toMatchObject({ count: 3, open: 3, barangay: 'Guadalupe' });
  });
  it('ignores approximate (GPS fallback) locations', () => {
    const approx = { location: { latitude: 10.5, longitude: 123.88, address: 'Tejero (approximate - GPS unavailable)' } };
    expect(findHotspots([at(0, 1, approx), at(0, 2, approx), at(0, 3, approx)], NOW)).toEqual([]);
  });
});
