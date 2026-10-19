import { describe, expect, it } from 'vitest';
import { matchSummaryForRecord, summarizeMatch, verdictForDistance } from './faceVerdict';

describe('verdictForDistance', () => {
  it('maps distances to the calibrated bands', () => {
    expect(verdictForDistance(0.3)).toBe('strong');
    expect(verdictForDistance(0.5)).toBe('strong');
    expect(verdictForDistance(0.55)).toBe('likely');
    expect(verdictForDistance(0.6)).toBe('likely');
    expect(verdictForDistance(0.65)).toBe('uncertain');
    expect(verdictForDistance(0.7)).toBe('uncertain');
    expect(verdictForDistance(0.71)).toBe('mismatch');
    expect(verdictForDistance(1.1)).toBe('mismatch');
  });
});

describe('summarizeMatch', () => {
  const s = (step: 'neutral' | 'smile' | 'turn', distance: number | null) => ({ step, faceFound: distance !== null, distance });

  it('judges by the closest selfie', () => {
    const r = summarizeMatch(true, [s('neutral', 0.82), s('smile', 0.48), s('turn', 0.9)], 0.4, 'webgl');
    expect(r.bestDistance).toBe(0.48);
    expect(r.verdict).toBe('strong');
  });
  it('cannot compare without a face on the ID', () => {
    expect(summarizeMatch(false, [s('neutral', 0.3)], null, 'cpu').verdict).toBe('no-face');
  });
  it('cannot compare when no selfie has a face', () => {
    expect(summarizeMatch(true, [s('neutral', null), s('smile', null), s('turn', null)], null, 'cpu').verdict).toBe('no-face');
  });
  it('ignores selfies without a face when picking the best', () => {
    expect(summarizeMatch(true, [s('neutral', null), s('smile', 0.62), s('turn', null)], null, 'cpu').verdict).toBe('uncertain');
  });
  it('flags selfies that look like different people', () => {
    expect(summarizeMatch(true, [s('neutral', 0.5)], 0.9, 'cpu').selfiesConsistent).toBe(false);
    expect(summarizeMatch(true, [s('neutral', 0.5)], 0.5, 'cpu').selfiesConsistent).toBe(true);
    expect(summarizeMatch(true, [s('neutral', 0.5)], null, 'cpu').selfiesConsistent).toBeNull();
  });
});

describe('matchSummaryForRecord', () => {
  it('stores a compact, rounded summary and handles "not run"', () => {
    expect(matchSummaryForRecord(null).verdict).toBe('not-run');
    const r = summarizeMatch(true, [{ step: 'neutral', faceFound: true, distance: 0.48123 }], 0.2, 'cpu');
    expect(matchSummaryForRecord(r)).toEqual({ verdict: 'strong', bestDistance: 0.48, selfiesConsistent: true });
  });
});
