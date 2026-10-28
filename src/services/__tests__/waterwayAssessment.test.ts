import { describe, expect, it } from 'vitest';
import { AIWasteType, DetectedObject } from '../../types';
import { applyCustomModel, buildAnalysisResult } from '../wasteAnalysis';
import {
  applyWaterwayAssessment, assessPhotoQuality, assessWaterway, computeSceneStats, isRainySeason, waterLikelihoodFrom,
} from '../waterwayAssessment';

const obj = (wasteType: AIWasteType, confidence = 80): DetectedObject => ({
  label: wasteType, wasteType, confidence, bbox: { x: 0, y: 0, width: 10, height: 10 }, color: '#000',
});

const DRY = new Date(2026, 2, 10); // March: dry season
const WET = new Date(2026, 7, 10); // August: rainy season

/** A width×height RGB image: `top` colour above `split` (0–1 of height), `bottom` below, optional noise. */
const image = (width: number, height: number, top: number[], bottom: number[], split = 0.4, noise = 0) => {
  const px = new Uint8Array(width * height * 3);
  let seed = 7;
  const rnd = () => { seed = (seed * 1103515245 + 12345) & 0x7fffffff; return seed / 0x7fffffff; };
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      const c = y < height * split ? top : bottom;
      const n = noise ? (rnd() - 0.5) * noise : 0;
      for (let k = 0; k < 3; k++) px[(y * width + x) * 3 + k] = Math.max(0, Math.min(255, c[k] + n));
    }
  }
  return px;
};

describe('computeSceneStats', () => {
  it('finds a smooth brown water surface below a textured bank', () => {
    const s = computeSceneStats(image(200, 200, [120, 110, 100], [110, 95, 60]), 200, 200);
    expect(s.waterFraction).toBeGreaterThan(0.9);
    expect(s.waterColor).toBe('brown');
  });
  it("doesn't call heavy texture (garbage, leaves) water", () => {
    const s = computeSceneStats(image(200, 200, [120, 110, 100], [60, 120, 50], 0.4, 180), 200, 200);
    expect(s.waterFraction).toBeLessThan(0.2);
    expect(s.waterColor).toBeNull();
  });
  it('recognises dark water and a too-dark photo', () => {
    const s = computeSceneStats(image(100, 100, [20, 20, 20], [15, 15, 18]), 100, 100);
    expect(s.waterColor).toBe('dark');
    expect(assessPhotoQuality(s).issues).toContain('too_dark');
  });
  it('flags a flat, featureless photo as poor quality', () => {
    const q = assessPhotoQuality(computeSceneStats(image(100, 100, [128, 128, 128], [128, 128, 128]), 100, 100));
    expect(q.level).toBe('poor');
    expect(q.issues).toEqual(expect.arrayContaining(['blurry', 'low_contrast']));
  });
});

describe('waterLikelihoodFrom', () => {
  const water = { brightness: 0.4, contrast: 0.2, sharpness: 0.05, waterFraction: 0.5, waterColor: 'brown' as const };
  it('trusts a water scene label most, and agreement most of all', () => {
    expect(waterLikelihoodFrom(undefined, [{ className: 'lakeside, lakeshore', probability: 0.6 }])).toBe(82);
    expect(waterLikelihoodFrom(water)).toBe(60);
    expect(waterLikelihoodFrom(water, [{ className: 'pier', probability: 0.6 }])).toBe(95);
    expect(waterLikelihoodFrom(undefined, [{ className: 'tabby cat', probability: 0.9 }])).toBe(0);
  });
});

describe('assessWaterway', () => {
  it("uses the reporter's answer over the AI's guess", () => {
    const a = assessWaterway({ detectedObjects: [obj('plastic_bag')], coverageRatio: 0.1, hazardousDetected: false, reporterContext: 'drainage', now: DRY,
      sceneLabels: [{ className: 'lakeside', probability: 0.9 }] });
    expect(a).toMatchObject({ context: 'drainage', contextSource: 'reporter' });
  });
  it('infers in-water from the scene when the reporter is unsure', () => {
    const a = assessWaterway({ detectedObjects: [obj('plastic_bottle')], coverageRatio: 0.05, hazardousDetected: false, reporterContext: 'unknown', now: DRY,
      sceneLabels: [{ className: 'seashore', probability: 0.5 }] });
    expect(a).toMatchObject({ context: 'in_water', contextSource: 'ai' });
  });
  it('rates floating plastic in the water as a downstream spread risk with a boom/net action', () => {
    const a = assessWaterway({ detectedObjects: [obj('plastic_bottle'), obj('plastic_bag'), obj('styrofoam')], coverageRatio: 0.1, hazardousDetected: false, reporterContext: 'in_water', now: DRY });
    expect(a.spreadRisk).toBe('high');
    expect(a.floatableShare).toBe(100);
    expect(a.actions.join(' ')).toMatch(/trash boom/);
    expect(a.equipment).toContain('Long-handled skimmer nets');
  });
  it('treats a garbage-choked drain as a flood risk, worse in the rainy season', () => {
    const items = [obj('trash_pile'), obj('plastic_bag'), obj('plastic_bag'), obj('styrofoam')];
    const dry = assessWaterway({ detectedObjects: items, coverageRatio: 0.4, hazardousDetected: false, reporterContext: 'drainage', now: DRY });
    const wet = assessWaterway({ detectedObjects: items, coverageRatio: 0.4, hazardousDetected: false, reporterContext: 'drainage', now: WET });
    expect(dry.blockage.level).toBe('critical');
    expect(wet.rainySeason).toBe(true);
    expect(wet.actions[0]).toMatch(/drain or culvert/);
    expect(wet.healthRisks.join(' ')).toMatch(/leptospirosis/);
    expect(wet.severityFactors.map((f) => f.label)).toContain('Rainy season flood risk');
    expect(dry.severityFactors.map((f) => f.label)).not.toContain('Rainy season flood risk');
  });
  it('puts hazardous waste in water first, with hazmat handling', () => {
    const a = assessWaterway({ detectedObjects: [obj('hazardous_waste'), obj('plastic_bottle')], coverageRatio: 0.05, hazardousDetected: true, reporterContext: 'in_water', now: DRY });
    expect(a.contamination.level).toBe('critical');
    expect(a.actions[0]).toMatch(/hazmat/);
    expect(a.equipment).toContain('Sealed container for hazardous items');
  });
  it('warns about dengue for containers and about dark water', () => {
    const a = assessWaterway({ detectedObjects: [obj('metal_can')], coverageRatio: 0.02, hazardousDetected: false, reporterContext: 'riverbank', now: DRY,
      scene: { brightness: 0.3, contrast: 0.2, sharpness: 0.05, waterFraction: 0.4, waterColor: 'dark' } });
    expect(a.healthRisks.join(' ')).toMatch(/dengue/);
    expect(a.healthRisks.join(' ')).toMatch(/sewage/);
  });
  it('knows the Philippine rainy season', () => {
    expect([4, 5, 10, 11].map((m) => isRainySeason(new Date(2026, m, 1)))).toEqual([false, true, true, false]);
  });
});

describe('applyWaterwayAssessment', () => {
  const base = buildAnalysisResult(
    [{ class: 'bottle', score: 0.8, bbox: [0, 0, 50, 50] }, { class: 'bottle', score: 0.7, bbox: [60, 60, 50, 50] }],
    [{ className: 'water bottle', probability: 0.5 }],
    400, 400, undefined, { now: DRY },
  );
  it('keeps the detection-only score and adds explained waterway points', () => {
    const r = applyWaterwayAssessment(base, { reporterContext: 'in_water', now: DRY });
    const added = r.waterway!.severityFactors.reduce((s, f) => s + f.points, 0);
    expect(added).toBeGreaterThan(0);
    expect(r.severityScore).toBe(Math.min(100, r.baseSeverityScore! + added));
    expect(r.cleanupPriority).toMatch(r.severityLevel.toUpperCase());
  });
  it('is idempotent: applying twice does not double-count', () => {
    const once = applyWaterwayAssessment(base, { reporterContext: 'in_water', now: DRY });
    expect(applyWaterwayAssessment(once, { reporterContext: 'in_water', now: DRY }).severityScore).toBe(once.severityScore);
  });
  it('lowers confidence for a poor photo', () => {
    const r = applyWaterwayAssessment(base, { now: DRY, scene: { brightness: 0.05, contrast: 0.02, sharpness: 0.005, waterFraction: 0, waterColor: null } });
    expect(r.photoQuality?.level).toBe('poor');
    expect(r.confidence).toBeLessThan(base.confidence);
  });
});

describe('buildAnalysisResult volume', () => {
  it('estimates realistic volumes in cubic metres', () => {
    const r = buildAnalysisResult([{ class: 'bottle', score: 0.9, bbox: [0, 0, 40, 40] }], [], 400, 400, undefined, { now: DRY });
    expect(r.estimatedVolume).toBe(0.001); // one bottle ≈ 1 litre, not 0.3 m³
    expect(r.analysisSource).toBe('on_device');
  });
});

describe('applyCustomModel', () => {
  const det = (wasteType: AIWasteType, confidence: number) => obj(wasteType, confidence);
  it('adds a confident answer the detectors missed, after any hazard', () => {
    const out = applyCustomModel([det('hazardous_waste', 90), det('plastic_bottle', 60)],
      { version: 'waste-v1', predictions: [{ wasteType: 'styrofoam', probability: 0.8 }] }, 100, 100);
    expect(out.map((d) => d.wasteType)).toEqual(['hazardous_waste', 'styrofoam', 'plastic_bottle']);
    expect(out[1]).toMatchObject({ confidence: 80, label: 'Styrofoam (CleanStream model)' });
  });
  it('raises the confidence of a matching detection instead of duplicating it', () => {
    const out = applyCustomModel([det('plastic_bag', 50)], { version: 'v', predictions: [{ wasteType: 'plastic_bag', probability: 0.9 }] }, 1, 1);
    expect(out).toHaveLength(1);
    expect(out[0].confidence).toBe(90);
  });
  it('ignores unsure answers and missing output', () => {
    const base = [det('metal_can', 70)];
    expect(applyCustomModel(base, { version: 'v', predictions: [{ wasteType: 'e_waste', probability: 0.4 }] }, 1, 1)).toBe(base);
    expect(applyCustomModel(base, undefined, 1, 1)).toBe(base);
  });
});
