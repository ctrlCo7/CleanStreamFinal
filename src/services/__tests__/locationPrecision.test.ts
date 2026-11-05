import { describe, expect, it } from 'vitest';
import { isApproximate, needsPin, precisionLabel } from '../../utils/locationPrecision';
import { GeoLocation } from '../../types';

const at = (extra: Partial<GeoLocation>): GeoLocation => ({ latitude: 10.35, longitude: 123.91, timestamp: 0, ...extra });

describe('report location precision', () => {
  it('treats the barangay centre fallback as approximate, old and new reports alike', () => {
    expect(isApproximate(at({ source: 'approximate' }))).toBe(true);
    expect(isApproximate(at({ address: 'Talamban (approximate - GPS unavailable)' }))).toBe(true);
    expect(isApproximate(at({ source: 'gps', accuracy: 8 }))).toBe(false);
  });

  it('asks for a pin when the spot is not exact', () => {
    expect(needsPin(at({ source: 'approximate' }))).toBe(true);
    expect(needsPin(at({ source: 'search' }))).toBe(true);
    expect(needsPin(at({ source: 'gps', accuracy: 120 }))).toBe(true);
    expect(needsPin(at({ source: 'gps', accuracy: 12 }))).toBe(false);
    expect(needsPin(at({ source: 'pin' }))).toBe(false);
    expect(needsPin(null)).toBe(false);
  });

  it('describes the precision for officials and crews', () => {
    expect(precisionLabel(at({ source: 'pin' }))).toMatch(/pinned/i);
    expect(precisionLabel(at({ source: 'gps', accuracy: 7.6 }))).toContain('8 m');
    expect(precisionLabel(at({ source: 'approximate' }))).toMatch(/approximate/i);
  });
});
