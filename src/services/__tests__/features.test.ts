import { describe, expect, it } from 'vitest';
import { AIAnalysisResult, PhotoWasteSummary } from '../../types';
import { rainOutlookFrom } from '../weatherService';
import { distanceM, findProximity, isApproximateAddress } from '../reportProximity';
import { compareCleanup, mergeSummaries, summarizeAnalysis } from '../cleanupComparison';
import { assessWaterway } from '../waterwayAssessment';
import { AI_TEXT, STRINGS, translate, translateAiText } from '../../i18n/strings';

// ─── Rain forecast ─────────────────────────────────────────────────────────────

describe('rainOutlookFrom', () => {
  const now = new Date('2026-08-10T00:00:00+08:00');
  const hours = (n: number) => Array.from({ length: n }, (_, i) => {
    const d = new Date(now.getTime() + i * 3600_000);
    // Open-Meteo local time format, Asia/Manila
    const local = new Date(d.getTime() + 8 * 3600_000).toISOString().slice(0, 16);
    return local;
  });
  it('sums the next 24 and 72 hours and grades heavy rain', () => {
    const time = hours(96);
    const precipitation = time.map((_, i) => (i < 24 ? 3 : 1));
    const r = rainOutlookFrom({ hourly: { time, precipitation, precipitation_probability: time.map(() => 80) } }, now)!;
    expect(r.next24hMm).toBe(72);
    expect(r.next72hMm).toBe(72 + 48);
    expect(r.level).toBe('heavy');
    expect(r.maxProbability).toBe(80);
  });
  it('reports no rain and rejects malformed data', () => {
    const time = hours(48);
    expect(rainOutlookFrom({ hourly: { time, precipitation: time.map(() => 0) } }, now)?.level).toBe('none');
    expect(rainOutlookFrom({}, now)).toBeUndefined();
    expect(rainOutlookFrom({ hourly: { time, precipitation: [1] } }, now)).toBeUndefined();
  });
  it('raises flood risk and adds a pre-rain action when heavy rain is coming', () => {
    const base = { detectedObjects: [{ label: 'x', wasteType: 'plastic_bag' as const, confidence: 80, bbox: { x: 0, y: 0, width: 1, height: 1 }, color: '' }],
      coverageRatio: 0.2, hazardousDetected: false, reporterContext: 'drainage' as const, now: new Date(2026, 2, 1) };
    const dry = assessWaterway(base);
    const wet = assessWaterway({ ...base, rain: { level: 'heavy', next24hMm: 60, next72hMm: 90, maxProbability: 90, fetchedAt: '' } });
    expect(['low', 'moderate', 'high', 'critical'].indexOf(wet.floodRisk)).toBeGreaterThan(['low', 'moderate', 'high', 'critical'].indexOf(dry.floodRisk));
    expect(wet.actions.join(' ')).toMatch(/Heavy rain is forecast/);
    expect(wet.severityFactors.map((f) => f.label)).toContain('Heavy rain forecast in 24 hours');
    expect(wet.rain?.next24hMm).toBe(60);
  });
});

// ─── Duplicates and hotspots ───────────────────────────────────────────────────

describe('findProximity', () => {
  const now = new Date('2026-10-28T12:00:00Z');
  const here = { latitude: 10.3157, longitude: 123.8854 };
  // ~0.00027° latitude ≈ 30 m
  const near = (id: string, hoursAgo: number, dLat = 0.00027, status = 'pending') => ({
    id, reportNumber: `RPT-${id}`, latitude: here.latitude + dLat, longitude: here.longitude,
    createdAt: new Date(now.getTime() - hoursAgo * 3600_000), status,
  });

  it('measures distance', () => {
    expect(Math.round(distanceM(10, 123, 10.001, 123))).toBe(111);
  });
  it('flags an open report of the same spot from today as a duplicate', () => {
    const r = findProximity(here, [near('a', 3), near('far', 2, 0.01)], 'self', now);
    expect(r.duplicateOf).toMatchObject({ id: 'a', reportNumber: 'RPT-a' });
    expect(r.duplicateOf!.distanceM).toBeGreaterThan(20);
    expect(r.nearbyCount).toBe(2);
  });
  it('ignores old, rejected, resolved and its own report for duplicates', () => {
    const r = findProximity(here, [near('old', 30), near('rej', 1, 0.0001, 'rejected'), near('done', 1, 0.0001, 'completed'), near('self', 0)], 'self', now);
    expect(r.duplicateOf).toBeUndefined();
  });
  it('marks a hotspot at 3+ reports within 100 m in 90 days', () => {
    const r = findProximity(here, [near('a', 24 * 10), near('b', 24 * 40, 0.0005), near('old', 24 * 120)], 'self', now);
    expect(r.nearbyCount).toBe(3);
    expect(r.isHotspot).toBe(true);
  });
  it('never matches on approximate (barangay centre) locations', () => {
    expect(isApproximateAddress('Guadalupe (approximate - GPS unavailable)')).toBe(true);
    expect(findProximity({ ...here, approximate: true }, [near('a', 1, 0)], 'self', now)).toEqual({ nearbyCount: 1, isHotspot: false });
    expect(findProximity(here, [{ ...near('a', 1, 0), approximate: true }], 'self', now).duplicateOf).toBeUndefined();
  });
});

// ─── Before and after ──────────────────────────────────────────────────────────

describe('cleanup comparison', () => {
  const s = (objectCount: number, source: PhotoWasteSummary['source'] = 'photo'): PhotoWasteSummary =>
    ({ objectCount, volumeM3: objectCount / 100, severityScore: objectCount * 5, analyzedAt: '', source });

  it('grades how much waste was removed', () => {
    expect(compareCleanup(s(10), s(0)).verdict).toBe('clean');
    expect(compareCleanup(s(10), s(2))).toMatchObject({ removedPct: 80, verdict: 'mostly' });
    expect(compareCleanup(s(10), s(5))).toMatchObject({ removedPct: 50, verdict: 'partial' });
    expect(compareCleanup(s(10), s(9))).toMatchObject({ removedPct: 10, verdict: 'little' });
    expect(compareCleanup(s(4), s(6)).removedPct).toBe(0);
  });
  it('falls back to the report analysis as the before, but not an unavailable one', () => {
    const report = { objectCount: 8, estimatedVolume: 0.05, severityScore: 60, baseSeverityScore: 48 } as AIAnalysisResult;
    const cmp = compareCleanup(undefined, s(2), report);
    expect(cmp.before).toMatchObject({ objectCount: 8, severityScore: 48, source: 'report' });
    expect(cmp.removedPct).toBe(75);
    expect(compareCleanup(undefined, s(2), { ...report, analysisSource: 'unavailable' }).verdict).toBe('unknown');
    expect(compareCleanup(s(5), undefined).verdict).toBe('unknown');
  });
  it('keeps the photo showing the most waste for each side', () => {
    expect(mergeSummaries(s(3), s(7)).objectCount).toBe(7);
    expect(mergeSummaries(s(7), s(3)).objectCount).toBe(7);
    expect(mergeSummaries(s(9, 'report'), s(3)).objectCount).toBe(3);
    expect(summarizeAnalysis({ detectedObjects: [{}, {}], severityScore: 40 } as AIAnalysisResult).objectCount).toBe(2);
  });
});

// ─── Translations ──────────────────────────────────────────────────────────────

describe('translations', () => {
  const en = STRINGS.en as Record<string, string>;
  const placeholders = (s: string) => (s.match(/\{\w+\}/g) ?? []).sort().join(',');

  it('only translates keys that exist in English, with the same placeholders', () => {
    for (const lang of ['fil', 'ceb'] as const) {
      for (const [key, text] of Object.entries(STRINGS[lang])) {
        expect(en[key], `${lang}:${key} has no English`).toBeDefined();
        expect(placeholders(text!), `${lang}:${key}`).toBe(placeholders(en[key]));
      }
    }
  });
  it('covers every resident string in Filipino and Cebuano', () => {
    for (const lang of ['fil', 'ceb'] as const) {
      const missing = Object.keys(en).filter((k) => !(k in STRINGS[lang]) && !k.startsWith('common.ok'));
      expect(missing, `${lang} missing`).toEqual([]);
    }
  });
  it('translates every sentence the waterway AI can produce', () => {
    const src = require('node:fs').readFileSync(require('node:path').join(__dirname, '..', 'waterwayAssessment.ts'), 'utf8') as string;
    const sentences = [...src.matchAll(/(?:push|label:)\(?\s*'([A-Z][^']{6,})'/g)].map((m) => m[1]);
    const extra = ['CRITICAL — Immediate dispatch required', 'HIGH — Schedule within 24 hours', 'MODERATE — Schedule within 48 hours', 'LOW — Routine cleanup schedule'];
    for (const s of [...sentences, ...extra]) {
      expect(AI_TEXT.fil[s], `fil: ${s}`).toBeDefined();
      expect(AI_TEXT.ceb[s], `ceb: ${s}`).toBeDefined();
    }
    expect(sentences.length).toBeGreaterThan(30);
  });
  it('fills placeholders and falls back to English', () => {
    expect(translate('fil', 'result.itemMany', { n: 4 })).toBe('4 bagay ang natukoy');
    expect(translate('ceb', 'common.ok')).toBe('OK');
    expect(translateAiText('ceb', 'Something new')).toBe('Something new');
  });
});

describe('map pin severity', () => {
  it('gives every report a severity colour, however it was saved', async () => {
    const { reportSeverity, getMarkerColor, SEVERITY_COLORS } = await import('../../utils/mapUtils');
    expect(reportSeverity({ severity: 'critical' })).toBe('critical');
    expect(reportSeverity({ severity: 'High' })).toBe('high');          // capitalised
    expect(reportSeverity({ severity: ' moderate ' })).toBe('moderate');
    expect(reportSeverity({ aiAnalysis: { severityLevel: 'high' } })).toBe('high'); // only the AI's level
    expect(reportSeverity({ severity: 'unknown', aiAnalysis: { severityScore: 80 } })).toBe('critical'); // only a score
    expect(reportSeverity({ aiAnalysis: { severityScore: 30 } })).toBe('moderate');
    expect(reportSeverity({})).toBe('low');
    expect(getMarkerColor(reportSeverity({ severity: 'High' }))).toBe(SEVERITY_COLORS.high);
  });
});

describe('saying why a save failed', () => {
  it('explains refused, offline and missing cases instead of "try again"', async () => {
    const { explainWriteError } = await import('../../utils/firestoreErrors');
    expect(explainWriteError({ code: 'permission-denied' }, 'verify this report', { otherBarangay: true }))
      .toContain('another barangay');
    expect(explainWriteError({ code: 'permission-denied' }, 'verify this report')).toContain('not allowed');
    expect(explainWriteError({ code: 'unavailable' }, 'verify this report')).toContain('no connection');
    expect(explainWriteError({ code: 'not-found' }, 'verify this report')).toContain('no longer exists');
    expect(explainWriteError(new Error('boom'), 'verify this report')).toContain('boom');
  });
});
