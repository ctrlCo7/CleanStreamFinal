/**
 * PHASE 6 — Environmental Risk Scoring Engine
 *
 * Produces a 0–100 risk score from four independent factors, each worth 0–25 pts:
 *
 *   Factor A — Object Count Score (0–25)
 *     Logarithmic scale so a scene with 20 items doesn't score 4× a scene with 5.
 *     Capped at 25 for ≥ 15 objects.
 *
 *   Factor B — Density Score (0–25)
 *     Objects per 10k pixel-area, normalised against a reference density of 10 objects
 *     per 10k pixels (dense litter scene). Detects cramped vs sparse distributions.
 *
 *   Factor C — Hazard Score (0–25)
 *     Awarded when hazardous waste types are present: e_waste, cigarette_butt.
 *     Scaled by the maximum confidence of any hazardous detection.
 *
 *   Factor D — Coverage Score (0–25)
 *     Fraction of the image covered by waste bounding boxes.
 *     At coverageRatio = 0.3 (30% of image is waste) the score is maxed.
 *
 *   riskScore = A + B + C + D
 *
 * Cleanup hour estimate: derived empirically from litter cleanup time studies.
 * Water body heuristic: if coverage > 15% and object count ≥ 3, assume waterway.
 */

import { YOLOResult, EnvironmentalScore, SeverityLevel, YOLODetection } from './types';

const HAZARDOUS_TYPES = new Set(['e_waste', 'cigarette_butt', 'hazardous']);

function severityFromScore(score: number): SeverityLevel {
  if (score >= 75) return 'critical';
  if (score >= 50) return 'high';
  if (score >= 25) return 'moderate';
  return 'low';
}

function densityClass(
  score: number,
): EnvironmentalScore['densityClass'] {
  if (score >= 75) return 'severe';
  if (score >= 50) return 'dense';
  if (score >= 25) return 'moderate';
  return 'sparse';
}

function estimateCleanupHours(riskScore: number, objectCount: number): number {
  // Base: 15 minutes per object, scaled by risk
  const baseHours = (objectCount * 0.25) * (1 + riskScore / 100);
  // Minimum 0.5h for any scene with waste; round to nearest quarter-hour
  return Math.round(Math.max(0.5, baseHours) * 4) / 4;
}

// ─── Factor A — Object Count Score ───────────────────────────────────────────

function objectCountScore(objectCount: number): number {
  if (objectCount === 0) return 0;
  // log2(1)=0, log2(15)≈3.9 → multiplied to span 0–25
  const raw = (Math.log2(1 + objectCount) / Math.log2(16)) * 25;
  return Math.min(Math.round(raw), 25);
}

// ─── Factor B — Density Score ─────────────────────────────────────────────────

function detectionDensityScore(densityScore: number): number {
  // Reference: 10 objects per 10k pixels = max density
  const ref = 10;
  const raw = (densityScore / ref) * 25;
  return Math.min(Math.round(raw), 25);
}

// ─── Factor C — Hazard Score ──────────────────────────────────────────────────

function hazardScore(detections: YOLODetection[]): number {
  const hazardDetections = detections.filter((d) => HAZARDOUS_TYPES.has(d.wasteType));
  if (hazardDetections.length === 0) return 0;
  const maxConf = Math.max(...hazardDetections.map((d) => d.confidence));
  // 1 hazardous object at 100% = 15 pts; more objects scale to 25 pts max
  const baseScore = (maxConf / 100) * 15;
  const volumeBonus = Math.min((hazardDetections.length - 1) * 2.5, 10);
  return Math.min(Math.round(baseScore + volumeBonus), 25);
}

// ─── Factor D — Coverage Score ────────────────────────────────────────────────

function coverageScore(coverageRatio: number): number {
  // 0.3 coverage (30% of image is waste) → max 25 pts
  const ref = 0.30;
  const raw = (coverageRatio / ref) * 25;
  return Math.min(Math.round(raw), 25);
}

// ─── Public API ───────────────────────────────────────────────────────────────

export function computeEnvironmentalScore(yoloResult: YOLOResult): EnvironmentalScore {
  const { detections, objectCount, coverageRatio, densityScore: rawDensity } = yoloResult;

  const factorA = objectCountScore(objectCount);
  const factorB = detectionDensityScore(rawDensity);
  const factorC = hazardScore(detections);
  const factorD = coverageScore(coverageRatio);

  const riskScore = Math.min(factorA + factorB + factorC + factorD, 100);
  const severityLevel = severityFromScore(riskScore);
  const dc = densityClass(riskScore);

  // Water body heuristic: scattered litter over large fraction of image
  const waterBodyAffected = coverageRatio > 0.15 && objectCount >= 3;

  return {
    riskScore,
    severityLevel,
    coverageRatio,
    densityClass: dc,
    hazardousPresent: factorC > 0,
    estimatedCleanupHours: estimateCleanupHours(riskScore, objectCount),
    waterBodyAffected,
    factors: {
      objectCountScore: factorA,
      densityScore: factorB,
      hazardScore: factorC,
      coverageScore: factorD,
    },
  };
}
