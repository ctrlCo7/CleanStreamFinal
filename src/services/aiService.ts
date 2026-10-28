/**
 * AI Service — real on-device inference (COCO-SSD + MobileNet via onDeviceAI.ts) is
 * the primary analysis path, with the Firebase Cloud Functions pipeline as a
 * fallback and an explicit "AI unavailable" result as the last resort. See
 * analyzeWastePhoto()'s docstring for the exact priority order and why.
 */

import { getFunctions, httpsCallable } from 'firebase/functions';
import {
  AIAnalysisResult,
  AIDisposalRecommendation,
  CNNClassification,
  DetectedObject,
  EnvironmentalRiskScore,
  SeverityLevel,
  type WasteCategory,
  WasteClassification,
  RainOutlook,
  WaterContext,
} from '../types';
import app from './firebase';
import { analyzeOnDevice, warmUpOnDeviceModels } from './onDeviceAI';
import { applyWaterwayAssessment } from './waterwayAssessment';
import { getRainOutlook } from './weatherService';
import { withTimeout } from '../utils/async';

// ─── Cloud Function response shape ───────────────────────────────────────────

interface CloudAnalyzeRequest {
  storagePath: string;
  reportId: string;
  userId: string;
}

interface CloudAnalyzeResponse {
  success: boolean;
  predictionId: string;
  result: {
    yolo: {
      detections: Array<{
        label: string;
        wasteType: string;
        confidence: number;
        bbox: { x: number; y: number; width: number; height: number };
        color: string;
      }>;
      objectCount: number;
      coverageRatio: number;
    };
    cnn: {
      primary: { category: string; confidence: number; label: string };
      scores: Array<{ category: string; confidence: number; label: string }>;
      pollutionSeverity: string;
      environmentalImpact: string;
      modelVersion: string;
    };
    environmental: {
      riskScore: number;
      severityLevel: string;
      coverageRatio: number;
      densityClass: string;
      hazardousPresent: boolean;
      estimatedCleanupHours: number;
      waterBodyAffected: boolean;
      factors: {
        objectCountScore: number;
        densityScore: number;
        hazardScore: number;
        coverageScore: number;
      };
    };
    recommendations: Array<{
      wasteType: string;
      wasteLabel: string;
      category: string;
      action: string;
      facility: string;
      urgency: string;
      icon: string;
    }>;
    modelVersion: string;
    confidence: number;
    severityScore: number;
    severityLevel: string;
    wasteTypes: Array<{ type: string; percentage: number; label: string; color: string }>;
    estimatedVolume: number;
    spreadArea: number;
    hazardousDetected: boolean;
    teamNeeded: string;
    cleanupPriority: string;
    timestamp: string;
    objectCount: number;
    coverageRatio: number;
    environmentalImpact: string;
    processedImageURL: string;
  };
  error?: string;
}

// On-device inference (model download + WebGL init + detection) has no
// built-in timeout -- on a slow network or a device where tf.ready()'s WebGL
// context setup stalls, the awaited promise can simply never settle, leaving
// the report screen's "Analyzing…" spinner stuck forever with no fallback
// ever kicking in. Racing it against a timeout guarantees analyzeWastePhoto
// always settles one way or another.
const ON_DEVICE_TIMEOUT_MS = 25000;

// ─── Cloud Function caller ────────────────────────────────────────────────────

const analyzeWithCloud = async (
  storagePath: string,
  reportId: string,
  userId: string,
): Promise<AIAnalysisResult> => {
  const functions = getFunctions(app);
  const analyze = httpsCallable<CloudAnalyzeRequest, CloudAnalyzeResponse>(
    functions,
    'analyzeWasteImage',
  );

  const { data } = await analyze({ storagePath, reportId, userId });
  if (!data.success || !data.result) {
    throw new Error(data.error ?? 'Cloud analysis returned no result');
  }

  const r = data.result;

  const detectedObjects: DetectedObject[] = r.yolo.detections.map((d) => ({
    label: d.label,
    wasteType: d.wasteType as DetectedObject['wasteType'],
    confidence: d.confidence,
    bbox: d.bbox,
    color: d.color,
  }));

  const cnnResult: CNNClassification = {
    category: r.cnn.primary.category as CNNClassification['category'],
    confidence: r.cnn.primary.confidence,
    label: r.cnn.primary.label,
    allScores: r.cnn.scores.map((s) => ({
      category: s.category as CNNClassification['category'],
      confidence: s.confidence,
      label: s.label,
    })),
  };

  const recommendations: AIDisposalRecommendation[] = r.recommendations.map((rec) => ({
    wasteType: rec.wasteType as AIDisposalRecommendation['wasteType'],
    wasteLabel: rec.wasteLabel,
    category: rec.category as AIDisposalRecommendation['category'],
    action: rec.action,
    facility: rec.facility,
    urgency: rec.urgency as AIDisposalRecommendation['urgency'],
    icon: rec.icon,
  }));

  const environmental: EnvironmentalRiskScore = {
    riskScore: r.environmental.riskScore,
    severityLevel: r.environmental.severityLevel as SeverityLevel,
    coverageRatio: r.environmental.coverageRatio,
    densityClass: r.environmental.densityClass as EnvironmentalRiskScore['densityClass'],
    hazardousPresent: r.environmental.hazardousPresent,
    estimatedCleanupHours: r.environmental.estimatedCleanupHours,
    waterBodyAffected: r.environmental.waterBodyAffected,
    factors: r.environmental.factors,
  };

  return {
    modelVersion: r.modelVersion,
    confidence: r.confidence,
    severityScore: r.severityScore,
    severityLevel: r.severityLevel as SeverityLevel,
    wasteTypes: r.wasteTypes as WasteClassification[],
    estimatedVolume: r.estimatedVolume,
    spreadArea: r.spreadArea,
    hazardousDetected: r.hazardousDetected,
    teamNeeded: r.teamNeeded,
    cleanupPriority: r.cleanupPriority,
    timestamp: r.timestamp,
    predictionId: data.predictionId,
    objectCount: r.objectCount,
    coverageRatio: r.coverageRatio,
    environmentalImpact: r.environmentalImpact,
    processedImageURL: r.processedImageURL,
    detectedObjects,
    cnnResult,
    recommendations,
    environmental,
  };
};

// ─── Public API ───────────────────────────────────────────────────────────────

/**
 * Analyze a waste photo.
 *
 * Priority order:
 *   1. On-device (real COCO-SSD + MobileNet inference via onDeviceAI.ts) — the
 *      primary path. Free, no backend, works without Cloud Functions deployed.
 *   2. Cloud Function pipeline, only if reportId + userId are available — kept as
 *      an opportunistic secondary path for if/when Cloud Functions get deployed
 *      (they aren't currently: the project is on the free Spark plan, which can't
 *      run Cloud Functions v2 at all).
 *   3. An explicit "AI unavailable" result if neither could run (e.g. an
 *      unsupported device), so report submission never hard-blocks on AI analysis.
 *      It detects nothing and says so; the result screen then asks the reporter
 *      what the waste is, and an official sets the real severity on review.
 *
 * Every path gets the waterway assessment (waterwayAssessment.ts) with the
 * reporter's answer to "where is the waste?".
 */
export const analyzeWastePhoto = async (
  photoUri: string,
  reportId?: string,
  userId?: string,
  reporterContext?: WaterContext,
  location?: { latitude: number; longitude: number },
): Promise<AIAnalysisResult> => {
  // The forecast downloads while the models run, so it adds no waiting.
  const rainPromise = location ? getRainOutlook(location.latitude, location.longitude) : Promise.resolve(undefined);
  try {
    return await withTimeout(analyzeOnDevice(photoUri, reporterContext, rainPromise), ON_DEVICE_TIMEOUT_MS, 'On-device analysis');
  } catch (err) {
    console.warn('[AI] On-device analysis failed or timed out, trying cloud fallback:', err);
  }

  if (reportId && userId) {
    const storagePath = `reports/${reportId}/photo.jpg`;
    try {
      const cloud = await withTimeout(analyzeWithCloud(storagePath, reportId, userId), 8000, 'Cloud analysis');
      return applyWaterwayAssessment({ ...cloud, analysisSource: 'cloud' }, { reporterContext, rain: await rainPromise });
    } catch (err) {
      console.warn('[AI] Cloud analysis failed:', err);
    }
  }
  return unavailableAnalysis(reporterContext, await rainPromise);
};

/**
 * What a report gets when no AI could run. Previously this was a "simulation" that
 * invented 3–6 random waste types with 55–94% confidence, which looked exactly like a
 * real result and could flag an empty photo as critical. Now it reports nothing
 * detected, a neutral moderate placeholder severity, and 0% confidence.
 */
export const unavailableAnalysis = (reporterContext?: WaterContext, rain?: RainOutlook): AIAnalysisResult =>
  applyWaterwayAssessment({
    modelVersion: 'AI unavailable on this device',
    analysisSource: 'unavailable',
    confidence: 0,
    severityScore: 30,
    severityLevel: 'moderate',
    wasteTypes: [],
    estimatedVolume: 0,
    spreadArea: 0,
    hazardousDetected: false,
    teamNeeded: '2–3 workers',
    cleanupPriority: 'MODERATE — Schedule within 48 hours',
    timestamp: new Date().toISOString(),
    objectCount: 0,
    detectedObjects: [],
  }, { reporterContext, rain });

export const loadLocalModel = async (): Promise<void> => {
  warmUpOnDeviceModels();
};
