/**
 * PHASE 3 — Upgraded CNN Classification
 *
 * Improvements over baseline:
 *   • Extended WasteCategory set: waterway_pollution, severe_pollution,
 *     moderate_pollution, low_pollution — enabling environmental severity routing
 *   • 60+ ImageNet keyword mappings (up from 20) — higher hit rate for waste scenes
 *   • YOLO fusion is now CONFIDENCE-WEIGHTED (not count-weighted) — a single
 *     e_waste item at 35% confidence no longer dominates 5 plastic bottles at 90%
 *   • Pollution severity classification using detection density and coverage ratio
 *   • Environmental impact rating: minimal / low / moderate / high / severe
 *   • pollutionSeverity and environmentalImpact fields on CNNResult
 *
 * The underlying model is still MobileNet v2 (ImageNet-pretrained). The primary
 * improvement is in the fusion logic and keyword coverage.
 * Next step: fine-tune EfficientNet-B0 on TACO + WasteNet (see PHASE 7).
 */

import * as tf from '@tensorflow/tfjs-node';
import * as mobilenet from '@tensorflow-models/mobilenet';
import sharp from 'sharp';
import { CNNResult, CNNClassScore, WasteCategory, YOLODetection, YOLOResult, SeverityLevel } from './types';

// ─── Category metadata ────────────────────────────────────────────────────────

export const CNN_CATEGORIES: Record<WasteCategory, { label: string; color: string; icon: string }> = {
  recyclable:            { label: 'Recyclable',           color: '#378ADD', icon: '♻️' },
  non_recyclable:        { label: 'Non-Recyclable',       color: '#E24B4A', icon: '🚫' },
  organic:               { label: 'Organic',               color: '#639922', icon: '🌿' },
  hazardous:             { label: 'Hazardous',             color: '#C0392B', icon: '⚠️' },
  electronic:            { label: 'Electronic Waste',     color: '#E07B3A', icon: '📱' },
  waterway_pollution:    { label: 'Waterway Pollution',   color: '#1A5276', icon: '🌊' },
  severe_pollution:      { label: 'Severe Pollution',     color: '#922B21', icon: '🔴' },
  moderate_pollution:    { label: 'Moderate Pollution',   color: '#D35400', icon: '🟠' },
  low_pollution:         { label: 'Low Pollution',        color: '#1E8449', icon: '🟡' },
};

// ─── Waste type → base CNN category ──────────────────────────────────────────

const WASTE_TYPE_CATEGORY: Record<string, WasteCategory> = {
  plastic_bottle:  'recyclable',
  plastic_bag:     'non_recyclable',
  glass_bottle:    'recyclable',
  metal_can:       'recyclable',
  paper_waste:     'recyclable',
  cardboard:       'recyclable',
  food_waste:      'organic',
  styrofoam:       'non_recyclable',
  cigarette_butt:  'hazardous',
  e_waste:         'electronic',
  mixed_waste:     'non_recyclable',
  trash_pile:      'non_recyclable',
};

// ─── Extended ImageNet keyword → waste category (60+ entries) ────────────────
// Each entry is [keyword_substring, category].
// The first match for a prediction's className wins.

const IMAGENET_TO_CATEGORY: Array<[string, WasteCategory]> = [
  // Bottles / cans
  ['water bottle',       'recyclable'],
  ['pop bottle',         'recyclable'],
  ['beer bottle',        'recyclable'],
  ['wine bottle',        'recyclable'],
  ['beer can',           'recyclable'],
  ['pop can',            'recyclable'],
  ['tin can',            'recyclable'],
  ['canteen',            'recyclable'],
  ['carton',             'recyclable'],
  ['milk can',           'recyclable'],
  ['bucket',             'non_recyclable'],
  ['barrel',             'non_recyclable'],

  // Paper / cardboard
  ['cardboard',          'recyclable'],
  ['paper bag',          'recyclable'],
  ['envelope',           'recyclable'],
  ['newspaper',          'recyclable'],
  ['notebook',           'recyclable'],
  ['book',               'recyclable'],
  ['tissue',             'non_recyclable'],

  // Plastic bags / packaging
  ['plastic bag',        'non_recyclable'],
  ['shopping bag',       'non_recyclable'],
  ['grocery bag',        'non_recyclable'],
  ['garbage bag',        'non_recyclable'],
  ['trash bag',          'non_recyclable'],
  ['polythene',          'non_recyclable'],
  ['wrapper',            'non_recyclable'],
  ['foam',               'non_recyclable'],
  ['styrofoam',          'non_recyclable'],
  ['cup',                'non_recyclable'],
  ['straw',              'non_recyclable'],
  ['utensil',            'non_recyclable'],

  // Food / organic
  ['banana',             'organic'],
  ['apple',              'organic'],
  ['orange',             'organic'],
  ['broccoli',           'organic'],
  ['pizza',              'organic'],
  ['compost',            'organic'],
  ['food',               'organic'],
  ['vegetable',          'organic'],
  ['fruit',              'organic'],
  ['meat',               'organic'],
  ['bread',              'organic'],

  // Electronics
  ['mobile phone',       'electronic'],
  ['cellular telephone', 'electronic'],
  ['laptop',             'electronic'],
  ['television',         'electronic'],
  ['remote control',     'electronic'],
  ['ipod',               'electronic'],
  ['mouse',              'electronic'],
  ['hard disc',          'electronic'],
  ['hard disk',          'electronic'],
  ['monitor',            'electronic'],
  ['modem',              'electronic'],
  ['router',             'electronic'],

  // Hazardous
  ['battery',            'hazardous'],
  ['medicine',           'hazardous'],
  ['syringe',            'hazardous'],
  ['lighter',            'hazardous'],
  ['paint',              'hazardous'],
  ['pesticide',          'hazardous'],
  ['chemical',           'hazardous'],

  // Glass
  ['glass',              'recyclable'],
  ['jar',                'recyclable'],
  ['vial',               'recyclable'],

  // Metal
  ['metal',              'recyclable'],
  ['iron',               'recyclable'],
  ['steel',              'recyclable'],
  ['aluminium',          'recyclable'],
  ['copper',             'recyclable'],
];

// ─── Model singleton (double-checked locking pattern) ─────────────────────────

let _mobileNet: mobilenet.MobileNet | null = null;
let _mobileNetLoading: Promise<mobilenet.MobileNet> | null = null;

async function loadMobileNet(): Promise<mobilenet.MobileNet> {
  if (_mobileNet) return _mobileNet;
  if (_mobileNetLoading) return _mobileNetLoading;

  _mobileNetLoading = (async () => {
    console.log('[CNN] Loading MobileNet v2...');
    const m = await mobilenet.load({ version: 2, alpha: 1.0 });
    _mobileNet = m;
    console.log('[CNN] MobileNet ready.');
    return m;
  })();

  return _mobileNetLoading;
}

// Warm up on import
loadMobileNet().catch(() => { /* best-effort */ });

// ─── Image → tensor (224×224, normalised to [-1, 1]) ─────────────────────────

async function imageToTensor(buffer: Buffer): Promise<tf.Tensor3D> {
  const size = 224;
  const rawBuffer = await sharp(buffer)
    .resize(size, size, { fit: 'fill' })
    .removeAlpha()
    .raw()
    .toBuffer();
  return tf.tensor3d(new Uint8Array(rawBuffer), [size, size, 3])
    .toFloat()
    .div(127.5)
    .sub(1) as tf.Tensor3D;
}

// ─── Confidence-weighted YOLO category scores ─────────────────────────────────

function categoryScoresFromYOLO(
  detections: YOLODetection[],
): Partial<Record<WasteCategory, number>> {
  const scores: Partial<Record<WasteCategory, number>> = {};

  if (detections.length === 0) {
    scores.non_recyclable = 60;
    return scores;
  }

  // Sum confidence values (not counts) for each category
  let totalWeight = 0;
  detections.forEach((det) => {
    const cat: WasteCategory = WASTE_TYPE_CATEGORY[det.wasteType] ?? 'non_recyclable';
    const w = det.confidence; // confidence-weighted — a 90% bottle beats a 35% e-waste
    scores[cat] = (scores[cat] ?? 0) + w;
    totalWeight += w;
  });

  // Normalise to 0–100
  if (totalWeight > 0) {
    (Object.keys(scores) as WasteCategory[]).forEach((k) => {
      scores[k] = Math.round(((scores[k] ?? 0) / totalWeight) * 100);
    });
  }

  return scores;
}

// ─── Pollution severity from detection density ────────────────────────────────

function computePollutionSeverity(
  yoloResult: YOLOResult,
): { severity: SeverityLevel; envCategory: WasteCategory } {
  const { objectCount, coverageRatio, densityScore } = yoloResult;

  // Weighted pollution index (0–100)
  // densityScore: objects per 10k px — normalised to max of 50 objects/10kpx
  const densityNorm = Math.min(densityScore / 50, 1);
  const pollutionIndex =
    objectCount * 5 * 0.4        // object count component (up to 40 pts)
    + densityNorm * 35            // density component (up to 35 pts)
    + coverageRatio * 25;         // coverage component (up to 25 pts)

  const capped = Math.min(pollutionIndex, 100);

  if (capped >= 75) return { severity: 'critical', envCategory: 'severe_pollution' };
  if (capped >= 50) return { severity: 'high',     envCategory: 'waterway_pollution' };
  if (capped >= 25) return { severity: 'moderate', envCategory: 'moderate_pollution' };
  return { severity: 'low', envCategory: 'low_pollution' };
}

// ─── Environmental impact rating ─────────────────────────────────────────────

type EnvironmentalImpact = 'minimal' | 'low' | 'moderate' | 'high' | 'severe';

function rateEnvironmentalImpact(
  severity: SeverityLevel,
  hazardousPresent: boolean,
): EnvironmentalImpact {
  if (hazardousPresent && (severity === 'critical' || severity === 'high')) return 'severe';
  if (hazardousPresent) return 'high';
  if (severity === 'critical') return 'high';
  if (severity === 'high') return 'moderate';
  if (severity === 'moderate') return 'low';
  return 'minimal';
}

// ─── Main classification ──────────────────────────────────────────────────────

export async function runCNNClassification(
  imageBuffer: Buffer,
  yoloDetections: YOLODetection[],
  yoloResult?: YOLOResult,
): Promise<CNNResult> {
  const startMs = Date.now();

  // Stage 1 — MobileNet top-5 ImageNet predictions
  let mobileNetCategory: WasteCategory | null = null;
  let mobileNetConfidence = 0;

  try {
    const tensor = await imageToTensor(imageBuffer);
    const model = await loadMobileNet();
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const predictions = await model.classify(tensor as any, 5);
    tensor.dispose();

    for (const pred of predictions) {
      const cls = pred.className.toLowerCase();
      const match = IMAGENET_TO_CATEGORY.find(([key]) => cls.includes(key));
      if (match) {
        [, mobileNetCategory] = match;
        mobileNetConfidence = Math.round(pred.probability * 100);
        break;
      }
    }
  } catch (err) {
    console.warn('[CNN] MobileNet inference failed, using YOLO scores only:', err);
  }

  // Stage 2 — Confidence-weighted YOLO category distribution
  const yoloScores = categoryScoresFromYOLO(yoloDetections);

  // Stage 3 — Blend: 70% YOLO + 30% MobileNet
  const blended: Partial<Record<WasteCategory, number>> = { ...yoloScores };
  if (mobileNetCategory) {
    const existing = blended[mobileNetCategory] ?? 0;
    blended[mobileNetCategory] = Math.round(existing * 0.7 + mobileNetConfidence * 0.3);
  }

  // Ensure all 5 base categories have a score (environmental categories are derived)
  const baseCats: WasteCategory[] = ['recyclable', 'non_recyclable', 'organic', 'hazardous', 'electronic'];
  baseCats.forEach((cat) => {
    if (blended[cat] === undefined) blended[cat] = 0;
  });

  // Stage 4 — Pollution severity from YOLO density metrics
  const effectiveYoloResult: YOLOResult = yoloResult ?? {
    detections: yoloDetections,
    objectCount: yoloDetections.length,
    imageWidth: 640,
    imageHeight: 480,
    coverageRatio: 0,
    densityScore: 0,
    processingTimeMs: 0,
  };

  const { severity: pollutionSeverity, envCategory } = computePollutionSeverity(effectiveYoloResult);

  // Inject pollution category score so it appears in the sorted list
  blended[envCategory] = Math.max(blended[envCategory] ?? 0, 20);

  const sortedScores: CNNClassScore[] = (Object.entries(blended) as [WasteCategory, number][])
    .filter(([, v]) => v > 0)
    .sort(([, a], [, b]) => b - a)
    .map(([category, confidence]) => ({
      category,
      confidence,
      label: CNN_CATEGORIES[category]?.label ?? category,
    }));

  const primary: CNNClassScore = sortedScores[0] ?? {
    category: 'non_recyclable',
    confidence: 50,
    label: 'Non-Recyclable',
  };

  const hazardousPresent = yoloDetections.some(
    (d) => d.wasteType === 'e_waste' || d.wasteType === 'cigarette_butt',
  );

  return {
    primary,
    scores: sortedScores,
    pollutionSeverity,
    environmentalImpact: rateEnvironmentalImpact(pollutionSeverity, hazardousPresent),
    modelVersion: 'MobileNetV2-CNN v2.0',
    processingTimeMs: Date.now() - startMs,
  };
}
