/**
 * AI Service — integrates Firebase Cloud Functions (multi-scale YOLO + CNN) with a local
 * simulation fallback for development / offline use.
 *
 * Production flow:
 *   1. Photo uploaded to Storage by createReport (reports/{reportId}/photo.jpg)
 *   2. analyzeWastePhoto() calls the 'analyzeWasteImage' Cloud Function
 *   3. Cloud Function runs preprocessing → YOLO detection → CNN classification →
 *      environmental scoring → saves AIPredictionDoc
 *   4. Response is mapped to AIAnalysisResult and stored on the WasteReport
 *
 * Fallback flow (Cloud Function unavailable / dev mode):
 *   - simulateLocalAnalysis() returns deterministic mock data per photo URI
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
} from '../types';
import app from './firebase';

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

// ─── Local simulation fallback ────────────────────────────────────────────────

// FNV-1a 32-bit hash — same URI always yields the same seed
const hashUri = (uri: string): number => {
  let h = 0x811c9dc5;
  for (let i = 0; i < uri.length; i++) {
    h ^= uri.charCodeAt(i);
    h = (Math.imul(h, 0x01000193)) >>> 0;
  }
  return h;
};

// LCG PRNG — deterministic per photo, varies across different photos
const makeRng = (seed: number) => {
  let s = seed >>> 0;
  return () => {
    s = (Math.imul(s, 1664525) + 1013904223) >>> 0;
    return s / 0x100000000;
  };
};

type ObjectEntry = {
  label: string;
  wasteType: DetectedObject['wasteType'];
  color: string;
  cnnCategory: CNNClassification['category'];
  cnnLabel: string;
  recAction: string;
  recFacility: string;
  recUrgency: AIDisposalRecommendation['urgency'];
  recIcon: string;
  wtLabel: string;
  wtColor: string;
};

const OBJECT_POOL: ObjectEntry[] = [
  { label: 'Plastic bottle',   wasteType: 'plastic_bottle',  color: '#378ADD', cnnCategory: 'recyclable',    cnnLabel: 'Recyclable',       recAction: 'Rinse and place in blue recycling bin. Remove cap separately.',            recFacility: 'Materials Recovery Facility (MRF)',              recUrgency: 'routine',   recIcon: '🍶',  wtLabel: 'Plastic Bottle',  wtColor: '#378ADD' },
  { label: 'Plastic bag',      wasteType: 'plastic_bag',     color: '#54B4E4', cnnCategory: 'non_recyclable', cnnLabel: 'Non-Recyclable',   recAction: 'Bring to plastic drop-off at supermarkets or dispose in black bin.',     recFacility: 'Barangay Collection Point',                      recUrgency: 'scheduled', recIcon: '🛍️', wtLabel: 'Plastic Bag',     wtColor: '#54B4E4' },
  { label: 'Cardboard box',    wasteType: 'cardboard',       color: '#D35400', cnnCategory: 'recyclable',    cnnLabel: 'Recyclable',       recAction: 'Flatten boxes and keep dry. Drop off at barangay recycling center.',     recFacility: 'Cardboard / Paper MRF',                         recUrgency: 'routine',   recIcon: '📦', wtLabel: 'Cardboard',       wtColor: '#D35400' },
  { label: 'Food waste',       wasteType: 'food_waste',      color: '#639922', cnnCategory: 'organic',       cnnLabel: 'Organic',          recAction: 'Place in the green biodegradable bin for composting.',                  recFacility: 'Barangay Composting Facility',                   recUrgency: 'immediate', recIcon: '🥦', wtLabel: 'Food Waste',      wtColor: '#639922' },
  { label: 'Metal can',        wasteType: 'metal_can',       color: '#888780', cnnCategory: 'recyclable',    cnnLabel: 'Recyclable',       recAction: 'Rinse and flatten before placing in the metal recycling bin.',          recFacility: 'Scrap Metal Dealer / MRF',                       recUrgency: 'routine',   recIcon: '🥫', wtLabel: 'Metal / Can',     wtColor: '#888780' },
  { label: 'Paper waste',      wasteType: 'paper_waste',     color: '#F39C12', cnnCategory: 'recyclable',    cnnLabel: 'Recyclable',       recAction: 'Keep dry and bundle before placing in the paper recycling bin.',        recFacility: 'Paper Recycling Center',                         recUrgency: 'routine',   recIcon: '📄', wtLabel: 'Paper Waste',     wtColor: '#F39C12' },
  { label: 'Glass bottle',     wasteType: 'glass_bottle',    color: '#9B59B6', cnnCategory: 'recyclable',    cnnLabel: 'Recyclable',       recAction: 'Rinse and place in the glass recycling bin. Handle carefully.',        recFacility: 'Glass Recycling Center / Junk Shop',             recUrgency: 'routine',   recIcon: '🍾', wtLabel: 'Glass Bottle',    wtColor: '#9B59B6' },
  { label: 'Electronic waste', wasteType: 'e_waste',         color: '#E07B3A', cnnCategory: 'electronic',    cnnLabel: 'Electronic Waste', recAction: 'Do NOT dispose in regular bins. Bring to an e-waste collection drive.', recFacility: 'DENR-Accredited E-Waste Facility',               recUrgency: 'scheduled', recIcon: '📱', wtLabel: 'E-Waste',         wtColor: '#E07B3A' },
  { label: 'Styrofoam',        wasteType: 'styrofoam',       color: '#16A085', cnnCategory: 'non_recyclable', cnnLabel: 'Non-Recyclable',  recAction: 'Styrofoam is NOT recyclable. Place in black residual bin. Do not burn.', recFacility: 'Sanitary Landfill / Polystyrene Drop-Off',       recUrgency: 'scheduled', recIcon: '📦', wtLabel: 'Styrofoam',       wtColor: '#16A085' },
  { label: 'Cigarette butt',   wasteType: 'cigarette_butt',  color: '#7F8C8D', cnnCategory: 'hazardous',     cnnLabel: 'Hazardous',        recAction: 'Collect in sealed container. Contains heavy metals — hazardous to waterways.', recFacility: 'DENR Hazardous Waste Drop-Off',             recUrgency: 'immediate', recIcon: '🚬', wtLabel: 'Cigarette Butt',  wtColor: '#7F8C8D' },
  { label: 'Mixed waste',      wasteType: 'mixed_waste',     color: '#E74C3C', cnnCategory: 'non_recyclable', cnnLabel: 'Non-Recyclable',  recAction: 'Place in the black residual bin. Try to separate recyclable components.', recFacility: 'Sanitary Landfill',                             recUrgency: 'scheduled', recIcon: '🗑️', wtLabel: 'Mixed Waste',     wtColor: '#E74C3C' },
  { label: 'Trash pile',       wasteType: 'trash_pile',      color: '#922B21', cnnCategory: 'non_recyclable', cnnLabel: 'Non-Recyclable',  recAction: 'Large accumulation detected. Contact barangay clean-up crew immediately.', recFacility: 'Barangay Clean-Up Operations Center',           recUrgency: 'immediate', recIcon: '🗂️', wtLabel: 'Trash Pile',      wtColor: '#922B21' },
];

const getSeverityLevel = (score: number): SeverityLevel => {
  if (score >= 75) return 'critical';
  if (score >= 50) return 'high';
  if (score >= 25) return 'moderate';
  return 'low';
};

const simulateLocalAnalysis = (photoUri: string): Promise<AIAnalysisResult> => {
  return new Promise((resolve) => {
    setTimeout(() => {
      const rng = makeRng(hashUri(photoUri));

      // Deterministically pick 3–6 distinct object types per photo
      const poolCopy = [...OBJECT_POOL].sort(() => rng() - 0.5);
      const count = 3 + Math.floor(rng() * 4); // 3–6
      const picked = poolCopy.slice(0, count);

      const detectedObjects: DetectedObject[] = picked.map((obj) => ({
        label: obj.label,
        wasteType: obj.wasteType,
        confidence: Math.floor(55 + rng() * 40), // 55–94 %
        bbox: {
          x: Math.floor(rng() * 200),
          y: Math.floor(rng() * 200),
          width: Math.floor(50 + rng() * 150),
          height: Math.floor(50 + rng() * 150),
        },
        color: obj.color,
      }));

      const totalConf = detectedObjects.reduce((s, d) => s + d.confidence, 0);
      const wasteTypes: WasteClassification[] = detectedObjects
        .sort((a, b) => b.confidence - a.confidence)
        .map((d, i) => ({
          type: d.wasteType,
          percentage: Math.round((d.confidence / totalConf) * 100),
          label: picked[i].wtLabel,
          color: picked[i].wtColor,
        }));

      const dominant = picked[0];
      const cnnResult: CNNClassification = {
        category: dominant.cnnCategory,
        confidence: Math.floor(70 + rng() * 25),
        label: dominant.cnnLabel,
        allScores: [
          { category: 'recyclable'     as WasteCategory, confidence: Math.floor(rng() * 60), label: 'Recyclable' },
          { category: 'non_recyclable' as WasteCategory, confidence: Math.floor(rng() * 40), label: 'Non-Recyclable' },
          { category: 'organic'        as WasteCategory, confidence: Math.floor(rng() * 30), label: 'Organic' },
          { category: 'hazardous'      as WasteCategory, confidence: Math.floor(rng() * 15), label: 'Hazardous' },
          { category: 'electronic'     as WasteCategory, confidence: Math.floor(rng() * 20), label: 'Electronic Waste' },
        ].sort((a, b) => b.confidence - a.confidence),
      };

      const recommendations: AIDisposalRecommendation[] = picked.slice(0, 4).map((obj) => ({
        wasteType: obj.wasteType,
        wasteLabel: obj.wtLabel,
        category: obj.cnnCategory as AIDisposalRecommendation['category'],
        action: obj.recAction,
        facility: obj.recFacility,
        urgency: obj.recUrgency,
        icon: obj.recIcon,
      }));

      const hasHazardous = picked.some(
        (o) => o.wasteType === 'e_waste' || o.wasteType === 'cigarette_butt',
      );
      const objectCount = detectedObjects.length;

      const coverageRatio = parseFloat((0.05 + rng() * 0.3).toFixed(3));
      const densityClass = coverageRatio > 0.2 ? 'dense' : coverageRatio > 0.1 ? 'moderate' : 'sparse';

      const environmental: EnvironmentalRiskScore = {
        riskScore: Math.floor(20 + rng() * 60),
        severityLevel: getSeverityLevel(Math.floor(20 + rng() * 60)),
        coverageRatio,
        densityClass: densityClass as EnvironmentalRiskScore['densityClass'],
        hazardousPresent: hasHazardous,
        estimatedCleanupHours: parseFloat((objectCount * 0.25 + rng()).toFixed(2)),
        waterBodyAffected: coverageRatio > 0.15 && objectCount >= 3,
        factors: {
          objectCountScore: Math.floor(rng() * 25),
          densityScore:     Math.floor(rng() * 25),
          hazardScore:      hasHazardous ? Math.floor(10 + rng() * 15) : 0,
          coverageScore:    Math.floor(coverageRatio * 80),
        },
      };

      const severityScore = hasHazardous
        ? Math.floor(60 + rng() * 35)
        : Math.floor(20 + rng() * 55);
      const severityLevel = getSeverityLevel(severityScore);
      const volumeM3 = parseFloat((objectCount * 0.3 + rng() * 1.5).toFixed(1));

      resolve({
        modelVersion: 'COCO-SSD/MobileNetV2-CNN v2.0 (local simulation)',
        confidence: parseFloat((72 + rng() * 22).toFixed(1)),
        severityScore,
        severityLevel,
        wasteTypes,
        estimatedVolume: volumeM3,
        spreadArea: parseFloat((objectCount * 1.8 + rng() * 4).toFixed(1)),
        hazardousDetected: hasHazardous,
        teamNeeded: hasHazardous ? '5–10 workers' : severityScore >= 50 ? '3–5 workers' : '1–2 workers',
        cleanupPriority:
          severityLevel === 'critical'
            ? 'CRITICAL — Immediate dispatch required'
            : severityLevel === 'high'
              ? 'HIGH — Schedule within 24 hours'
              : severityLevel === 'moderate'
                ? 'MODERATE — Schedule within 48 hours'
                : 'LOW — Routine cleanup schedule',
        timestamp: new Date().toISOString(),
        objectCount,
        coverageRatio,
        environmentalImpact: hasHazardous ? 'high' : severityScore >= 50 ? 'moderate' : 'low',
        detectedObjects,
        cnnResult,
        recommendations,
        environmental,
      });
    }, 1800);
  });
};

// ─── Public API ───────────────────────────────────────────────────────────────

/**
 * Analyze a waste photo.
 * Uses Cloud Function pipeline when reportId + userId are available.
 * Falls back to deterministic local simulation otherwise.
 */
export const analyzeWastePhoto = async (
  photoUri: string,
  reportId?: string,
  userId?: string,
): Promise<AIAnalysisResult> => {
  if (reportId && userId) {
    const storagePath = `reports/${reportId}/photo.jpg`;
    try {
      return await analyzeWithCloud(storagePath, reportId, userId);
    } catch (err) {
      console.warn('[AI] Cloud analysis failed, using local simulation:', err);
    }
  }
  return simulateLocalAnalysis(photoUri);
};

export const loadLocalModel = async (): Promise<void> => {
  console.log('[AI] Local model placeholder — integrate TFLite here for on-device inference');
};
