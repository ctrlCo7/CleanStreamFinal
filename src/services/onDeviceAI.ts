/**
 * On-device AI analysis — runs COCO-SSD (object detection) + MobileNet (scene
 * classification) directly on the phone via @tensorflow/tfjs-react-native, so waste
 * report analysis works without any backend at all: no Cloud Functions, no Blaze
 * billing plan, no network round-trip beyond the one-time model download.
 *
 * This is a port of the same pipeline that already existed server-side
 * (functions/src/yoloDetection.ts, cnnClassification.ts, recommendationEngine.ts,
 * environmentalScoring.ts) — same COCO-class mapping, same MobileNet keyword
 * mapping, same severity/environmental scoring formulas — so results are
 * consistent with what the Cloud Function pipeline would have produced, for
 * whenever that path becomes available again (e.g. if the project upgrades to
 * Blaze later). Two real mapping bugs found via a live misclassification were
 * fixed here (and should also be fixed server-side, see yoloDetection.ts):
 * COCO's "cup" no longer maps to plastic_bottle, and "fork"/"knife"/"spoon" no
 * longer map to metal_can — both were producing misleading disposal instructions
 * for ordinary cutlery/drinkware that isn't actually bottle or can waste.
 *
 * Known simplifications vs. the server pipeline (v1, single-scale only):
 * - Single-scale detection only (no multi-scale/region-crop passes) -- keeps
 *   on-device latency reasonable; small/distant object recall is lower than the
 *   server pipeline's 6-pass approach.
 * - No annotated bounding-box image is generated/uploaded -- detectedObjects
 *   (with bboxes) is still returned on the result for a future overlay UI to use
 *   directly against the original photo, so nothing is lost, just not rendered yet.
 * - Models are cached in memory for the app session only, not on disk -- every
 *   fresh app cold-start re-downloads ~15-30MB from TensorFlow's model CDN on
 *   first use. Persistent on-disk caching (bundling the models as app assets, or
 *   a custom IOHandler backed by expo-file-system) is a real future improvement,
 *   not implemented here.
 *
 * NEEDS REAL-DEVICE VALIDATION: this has not been run on an actual device/dev-client
 * build. The tfjs-react-native platform adapter + decodeJpeg init sequence below
 * follows the documented pattern, but this package's declared peer dependencies are
 * several Expo SDK versions stale (last real update targeted Expo ~SDK 48), so
 * installing requires --legacy-peer-deps and the very first real run is the actual
 * test of whether it works end-to-end on this Expo SDK 57 / RN 0.86 New Architecture
 * setup.
 */

import * as tf from '@tensorflow/tfjs';
import { decodeJpeg } from '@tensorflow/tfjs-react-native';
import * as cocoSsd from '@tensorflow-models/coco-ssd';
import * as mobilenetLib from '@tensorflow-models/mobilenet';
import { File } from 'expo-file-system';
import {
  AIAnalysisResult,
  AIDisposalRecommendation,
  AIWasteType,
  CNNClassification,
  DetectedObject,
  EnvironmentalRiskScore,
  SeverityLevel,
  WasteCategory,
  WasteClassification,
} from '../types';

// ─── tfjs-react-native init (runs once, on first use) ─────────────────────────

let readyPromise: Promise<void> | null = null;

async function ensureReady(): Promise<void> {
  if (!readyPromise) {
    readyPromise = (async () => {
      // Importing '@tensorflow/tfjs-react-native' registers the 'rn-webgl' backend
      // as a side effect; requiring it here (rather than only at module top-level)
      // keeps the registration + tf.ready() sequencing explicit and easy to reason
      // about if init ever needs a retry.
      await import('@tensorflow/tfjs-react-native');
      await tf.ready();
      // If the GPU backend failed to initialize on this device, tfjs silently
      // falls back to its pure-JS CPU backend, where coco-ssd/mobilenet inference
      // blocks the JS thread for minutes -- freezing the UI so completely that
      // timeouts can't even fire. Fail fast instead so the caller's fallback
      // path takes over immediately.
      if (tf.getBackend() !== 'rn-webgl') {
        throw new Error(`rn-webgl backend unavailable (got "${tf.getBackend()}")`);
      }
    })();
  }
  return readyPromise;
}

// ─── Model singletons (loaded once, kept in memory for the app session) ───────

let cocoModelPromise: Promise<cocoSsd.ObjectDetection> | null = null;
let mobileNetPromise: Promise<mobilenetLib.MobileNet> | null = null;

async function loadCocoModel(): Promise<cocoSsd.ObjectDetection> {
  if (!cocoModelPromise) {
    cocoModelPromise = ensureReady().then(() => cocoSsd.load({ base: 'mobilenet_v2' }));
  }
  return cocoModelPromise;
}

async function loadMobileNetModel(): Promise<mobilenetLib.MobileNet> {
  if (!mobileNetPromise) {
    mobileNetPromise = ensureReady().then(() => mobilenetLib.load({ version: 2, alpha: 1.0 }));
  }
  return mobileNetPromise;
}

/** Call on app start (or when entering the report-capture flow) to start
 * downloading/warming both models ahead of time, so the first real report
 * submission isn't stuck waiting for a ~15-30MB cold download.
 */
export function warmUpOnDeviceModels(): void {
  loadCocoModel().catch((e) => console.warn('[onDeviceAI] COCO-SSD warm-up failed:', e));
  loadMobileNetModel().catch((e) => console.warn('[onDeviceAI] MobileNet warm-up failed:', e));
}

// ─── COCO class -> CleanStream waste type mapping ──────────────────────────────
// Same table as functions/src/yoloDetection.ts's COCO_TO_WASTE, with two fixes:
// - cup: was 'plastic_bottle', now 'mixed_waste' -- a cup/mug detection can't
//   distinguish ceramic/ glass/paper/plastic, so confidently calling it a plastic
//   bottle produced wrong disposal instructions for a real ceramic mug.
// - fork/knife/spoon: was 'metal_can', now 'mixed_waste' -- cutlery isn't can
//   waste; "rinse and flatten before recycling" is nonsensical advice for a fork.

// COCO's 'bottle' class is shape-only detection -- it can't distinguish a glass
// beer bottle from a plastic water bottle from a metal canteen, so it is
// deliberately left out of this static table and resolved dynamically instead
// (see resolveBottleWasteType below), using MobileNet's classification on the
// same image as a material signal.
const COCO_TO_WASTE: Record<string, AIWasteType> = {
  'wine glass': 'glass_bottle',
  cup: 'mixed_waste',
  bowl: 'food_waste',

  fork: 'mixed_waste',
  knife: 'mixed_waste',
  spoon: 'mixed_waste',

  banana: 'food_waste',
  apple: 'food_waste',
  sandwich: 'food_waste',
  orange: 'food_waste',
  broccoli: 'food_waste',
  carrot: 'food_waste',
  'hot dog': 'food_waste',
  pizza: 'food_waste',
  donut: 'food_waste',
  cake: 'food_waste',

  'cell phone': 'e_waste',
  laptop: 'e_waste',
  tv: 'e_waste',
  keyboard: 'e_waste',
  mouse: 'e_waste',
  remote: 'e_waste',
  microwave: 'e_waste',
  toaster: 'e_waste',
  'hair drier': 'e_waste',
  refrigerator: 'e_waste',
  oven: 'e_waste',
  sink: 'mixed_waste',
  toilet: 'mixed_waste',

  backpack: 'plastic_bag',
  handbag: 'plastic_bag',
  tie: 'mixed_waste',

  suitcase: 'trash_pile',
  'sports ball': 'mixed_waste',

  book: 'paper_waste',
  clock: 'mixed_waste',
  scissors: 'mixed_waste',

  'teddy bear': 'mixed_waste',
  toothbrush: 'mixed_waste',
  umbrella: 'mixed_waste',
  frisbee: 'mixed_waste',
  skis: 'mixed_waste',
  snowboard: 'mixed_waste',
  kite: 'mixed_waste',
  'baseball bat': 'mixed_waste',
  'baseball glove': 'mixed_waste',
  skateboard: 'mixed_waste',
  surfboard: 'mixed_waste',
  'tennis racket': 'mixed_waste',

  bicycle: 'mixed_waste',
  car: 'mixed_waste',
  motorcycle: 'mixed_waste',
  truck: 'mixed_waste',
  boat: 'mixed_waste',
  'fire hydrant': 'mixed_waste',

  'potted plant': 'mixed_waste',
  'dining table': 'mixed_waste',
  chair: 'mixed_waste',
  couch: 'mixed_waste',
  bed: 'mixed_waste',
};

const WASTE_TYPE_LABELS: Record<AIWasteType, string> = {
  plastic_bottle: 'Plastic Bottle',
  plastic_bag: 'Plastic Bag',
  glass_bottle: 'Glass Bottle',
  metal_can: 'Metal / Can',
  paper_waste: 'Paper Waste',
  cardboard: 'Cardboard',
  food_waste: 'Food Waste',
  styrofoam: 'Styrofoam',
  cigarette_butt: 'Cigarette Butt',
  e_waste: 'E-Waste',
  mixed_waste: 'Mixed Waste',
  trash_pile: 'Trash Pile',
};

const WASTE_TYPE_COLORS: Record<AIWasteType, string> = {
  plastic_bottle: '#378ADD',
  plastic_bag: '#54B4E4',
  glass_bottle: '#9B59B6',
  metal_can: '#888780',
  paper_waste: '#F39C12',
  cardboard: '#D35400',
  food_waste: '#639922',
  styrofoam: '#16A085',
  cigarette_butt: '#7F8C8D',
  e_waste: '#E07B3A',
  mixed_waste: '#E74C3C',
  trash_pile: '#922B21',
};

// COCO's 'bottle' detection is shape-only; disambiguate material using
// MobileNet's ImageNet classification on the same photo, which does have
// material-specific bottle synsets. Falls back to plastic_bottle (the most
// common litter case) when MobileNet gives no useful signal.
function resolveBottleWasteType(mobileNetLabels: string[]): AIWasteType {
  const joined = mobileNetLabels.join(' | ');
  if (/wine bottle|beer bottle/.test(joined)) return 'glass_bottle';
  if (/canteen|milk can|tin can/.test(joined)) return 'metal_can';
  return 'plastic_bottle';
}

function resolveWasteType(cocoClass: string, mobileNetLabels: string[]): AIWasteType {
  if (cocoClass === 'bottle') return resolveBottleWasteType(mobileNetLabels);
  return COCO_TO_WASTE[cocoClass] ?? 'mixed_waste';
}

// ─── CNN category mapping (mirrors functions/src/cnnClassification.ts) ────────

const CNN_CATEGORY_LABELS: Record<WasteCategory, string> = {
  recyclable: 'Recyclable',
  non_recyclable: 'Non-Recyclable',
  organic: 'Organic',
  hazardous: 'Hazardous',
  electronic: 'Electronic Waste',
  waterway_pollution: 'Waterway Pollution',
  severe_pollution: 'Severe Pollution',
  moderate_pollution: 'Moderate Pollution',
  low_pollution: 'Low Pollution',
};

const WASTE_TYPE_CATEGORY: Record<AIWasteType, WasteCategory> = {
  plastic_bottle: 'recyclable',
  plastic_bag: 'non_recyclable',
  glass_bottle: 'recyclable',
  metal_can: 'recyclable',
  paper_waste: 'recyclable',
  cardboard: 'recyclable',
  food_waste: 'organic',
  styrofoam: 'non_recyclable',
  cigarette_butt: 'hazardous',
  e_waste: 'electronic',
  mixed_waste: 'non_recyclable',
  trash_pile: 'non_recyclable',
};

const IMAGENET_TO_CATEGORY: Array<[string, WasteCategory]> = [
  ['water bottle', 'recyclable'], ['pop bottle', 'recyclable'], ['beer bottle', 'recyclable'],
  ['wine bottle', 'recyclable'], ['beer can', 'recyclable'], ['pop can', 'recyclable'],
  ['tin can', 'recyclable'], ['canteen', 'recyclable'], ['carton', 'recyclable'],
  ['milk can', 'recyclable'], ['bucket', 'non_recyclable'], ['barrel', 'non_recyclable'],
  ['cardboard', 'recyclable'], ['paper bag', 'recyclable'], ['envelope', 'recyclable'],
  ['newspaper', 'recyclable'], ['notebook', 'recyclable'], ['book', 'recyclable'],
  ['tissue', 'non_recyclable'],
  ['plastic bag', 'non_recyclable'], ['shopping bag', 'non_recyclable'], ['grocery bag', 'non_recyclable'],
  ['garbage bag', 'non_recyclable'], ['trash bag', 'non_recyclable'], ['polythene', 'non_recyclable'],
  ['wrapper', 'non_recyclable'], ['foam', 'non_recyclable'], ['styrofoam', 'non_recyclable'],
  ['cup', 'non_recyclable'], ['straw', 'non_recyclable'], ['utensil', 'non_recyclable'],
  ['banana', 'organic'], ['apple', 'organic'], ['orange', 'organic'], ['broccoli', 'organic'],
  ['pizza', 'organic'], ['compost', 'organic'], ['food', 'organic'], ['vegetable', 'organic'],
  ['fruit', 'organic'], ['meat', 'organic'], ['bread', 'organic'],
  ['mobile phone', 'electronic'], ['cellular telephone', 'electronic'], ['laptop', 'electronic'],
  ['television', 'electronic'], ['remote control', 'electronic'], ['ipod', 'electronic'],
  ['mouse', 'electronic'], ['hard disc', 'electronic'], ['hard disk', 'electronic'],
  ['monitor', 'electronic'], ['modem', 'electronic'], ['router', 'electronic'],
  ['battery', 'hazardous'], ['medicine', 'hazardous'], ['syringe', 'hazardous'],
  ['lighter', 'hazardous'], ['paint', 'hazardous'], ['pesticide', 'hazardous'], ['chemical', 'hazardous'],
  ['glass', 'recyclable'], ['jar', 'recyclable'], ['vial', 'recyclable'],
  ['metal', 'recyclable'], ['iron', 'recyclable'], ['steel', 'recyclable'],
  ['aluminium', 'recyclable'], ['copper', 'recyclable'],
];

// ─── Disposal recommendations (mirrors functions/src/recommendationEngine.ts) ─

const RECOMMENDATIONS: Record<AIWasteType, Omit<AIDisposalRecommendation, 'wasteType' | 'wasteLabel'>> = {
  plastic_bottle: { category: 'recyclable', action: 'Rinse and place in the blue recycling bin. Remove cap separately.', facility: 'Materials Recovery Facility (MRF) / Junk Shop', urgency: 'routine', icon: '🍶' },
  plastic_bag: { category: 'non_recyclable', action: 'Do not place in recycling. Bring to plastic drop-off points at supermarkets or dispose in black bin.', facility: 'Barangay Collection Point', urgency: 'scheduled', icon: '🛍️' },
  glass_bottle: { category: 'recyclable', action: 'Rinse and place in the designated glass recycling bin. Handle with care.', facility: 'Glass Recycling Center / Junk Shop', urgency: 'routine', icon: '🍾' },
  metal_can: { category: 'recyclable', action: 'Rinse the can and flatten it before placing in the metal recycling bin.', facility: 'Scrap Metal Dealer / MRF', urgency: 'routine', icon: '🥫' },
  paper_waste: { category: 'recyclable', action: 'Keep dry and free from food contamination. Bundle and place in the paper recycling bin.', facility: 'Paper Recycling Center / Junk Shop', urgency: 'routine', icon: '📄' },
  cardboard: { category: 'recyclable', action: 'Flatten cardboard boxes. Keep dry. Drop off at your barangay recycling center.', facility: 'Cardboard / Paper MRF', urgency: 'routine', icon: '📦' },
  food_waste: { category: 'organic', action: 'Place in the green biodegradable bin for composting. Do not mix with recyclables.', facility: 'Barangay Composting Facility', urgency: 'immediate', icon: '🥦' },
  styrofoam: { category: 'non_recyclable', action: 'Styrofoam is NOT recyclable in standard MRFs. Place in the black residual bin. Avoid burning.', facility: 'Sanitary Landfill / Designated Polystyrene Drop-Off', urgency: 'scheduled', icon: '📦' },
  cigarette_butt: { category: 'hazardous', action: 'Contains nicotine, arsenic, and heavy metals that leach into waterways. Collect in a sealed container.', facility: 'DENR Hazardous Waste Drop-Off / TerraCycle Collection Point', urgency: 'immediate', icon: '🚬' },
  e_waste: { category: 'electronic', action: 'Do NOT dispose in regular bins. Bring to an e-waste collection drive. Contains lead, mercury, cadmium.', facility: 'DENR-Accredited E-Waste Facility', urgency: 'scheduled', icon: '📱' },
  mixed_waste: { category: 'non_recyclable', action: 'Place in the black residual waste bin. Try to separate recyclable components first.', facility: 'Sanitary Landfill', urgency: 'scheduled', icon: '🗑️' },
  trash_pile: { category: 'non_recyclable', action: 'Large accumulation detected. Contact your barangay clean-up crew immediately.', facility: 'Barangay Clean-Up Operations Center', urgency: 'immediate', icon: '🗂️' },
};

// ─── Severity / environmental scoring (mirrors the two functions/src files) ───

const CATEGORY_SEVERITY_WEIGHT: Record<WasteCategory, number> = {
  hazardous: 35, electronic: 28, non_recyclable: 18, recyclable: 8, organic: 12,
  waterway_pollution: 30, severe_pollution: 35, moderate_pollution: 20, low_pollution: 10,
};

function computeSeverity(detections: DetectedObject[]): { score: number; level: SeverityLevel } {
  if (detections.length === 0) return { score: 5, level: 'low' };
  let baseScore = 0;
  detections.forEach((det) => {
    const cat = WASTE_TYPE_CATEGORY[det.wasteType] ?? 'non_recyclable';
    baseScore += CATEGORY_SEVERITY_WEIGHT[cat] * (det.confidence / 100);
  });
  const volumeMultiplier = Math.min(Math.log2(1 + detections.length), 2.5);
  const raw = Math.round(Math.min(baseScore * volumeMultiplier, 100));
  let level: SeverityLevel;
  if (raw >= 75) level = 'critical';
  else if (raw >= 50) level = 'high';
  else if (raw >= 25) level = 'moderate';
  else level = 'low';
  return { score: raw, level };
}

function severityFromScore(score: number): SeverityLevel {
  if (score >= 75) return 'critical';
  if (score >= 50) return 'high';
  if (score >= 25) return 'moderate';
  return 'low';
}

function computeEnvironmentalScore(
  detections: DetectedObject[],
  coverageRatio: number,
  densityScore: number,
): EnvironmentalRiskScore {
  const objectCount = detections.length;
  const objectCountScore = objectCount === 0 ? 0 : Math.min(Math.round((Math.log2(1 + objectCount) / Math.log2(16)) * 25), 25);
  const densityFactor = Math.min(Math.round((densityScore / 10) * 25), 25);

  const hazardDetections = detections.filter((d) => d.wasteType === 'e_waste' || d.wasteType === 'cigarette_butt');
  const hazardFactor = hazardDetections.length === 0 ? 0 : Math.min(
    Math.round((Math.max(...hazardDetections.map((d) => d.confidence)) / 100) * 15 + Math.min((hazardDetections.length - 1) * 2.5, 10)),
    25,
  );
  const coverageFactor = Math.min(Math.round((coverageRatio / 0.30) * 25), 25);

  const riskScore = Math.min(objectCountScore + densityFactor + hazardFactor + coverageFactor, 100);
  const severityLevel = severityFromScore(riskScore);
  const densityClass: EnvironmentalRiskScore['densityClass'] =
    riskScore >= 75 ? 'severe' : riskScore >= 50 ? 'dense' : riskScore >= 25 ? 'moderate' : 'sparse';

  const baseHours = (objectCount * 0.25) * (1 + riskScore / 100);
  const estimatedCleanupHours = Math.round(Math.max(0.5, baseHours) * 4) / 4;

  return {
    riskScore,
    severityLevel,
    coverageRatio,
    densityClass,
    hazardousPresent: hazardFactor > 0,
    estimatedCleanupHours,
    waterBodyAffected: coverageRatio > 0.15 && objectCount >= 3,
    factors: {
      objectCountScore, densityScore: densityFactor, hazardScore: hazardFactor, coverageScore: coverageFactor,
    },
  };
}

function buildWasteTypeDistribution(detections: DetectedObject[]): WasteClassification[] {
  if (detections.length === 0) {
    return [{ type: 'mixed_waste', percentage: 100, label: 'Mixed Waste', color: WASTE_TYPE_COLORS.mixed_waste }];
  }
  const counts: Partial<Record<AIWasteType, number>> = {};
  detections.forEach((d) => { counts[d.wasteType] = (counts[d.wasteType] ?? 0) + 1; });
  const total = detections.length;
  return (Object.entries(counts) as [AIWasteType, number][])
    .sort(([, a], [, b]) => b - a)
    .map(([type, count]) => ({
      type,
      percentage: Math.round((count / total) * 100),
      label: WASTE_TYPE_LABELS[type],
      color: WASTE_TYPE_COLORS[type],
    }));
}

function buildRecommendations(detections: DetectedObject[]): AIDisposalRecommendation[] {
  if (detections.length === 0) {
    return [{ wasteType: 'mixed_waste', wasteLabel: 'Mixed Waste', ...RECOMMENDATIONS.mixed_waste }];
  }
  const seen = new Map<AIWasteType, number>();
  detections.forEach((det) => {
    const existing = seen.get(det.wasteType) ?? 0;
    if (det.confidence > existing) seen.set(det.wasteType, det.confidence);
  });
  const urgencyRank = { immediate: 0, scheduled: 1, routine: 2 };
  return Array.from(seen.entries())
    .sort(([typeA, confA], [typeB, confB]) => {
      const uA = urgencyRank[RECOMMENDATIONS[typeA].urgency];
      const uB = urgencyRank[RECOMMENDATIONS[typeB].urgency];
      return uA !== uB ? uA - uB : confB - confA;
    })
    .slice(0, 5)
    .map(([wasteType]) => ({ wasteType, wasteLabel: WASTE_TYPE_LABELS[wasteType], ...RECOMMENDATIONS[wasteType] }));
}

function estimateTeamNeeded(score: number): string {
  if (score >= 75) return '5–10 workers';
  if (score >= 50) return '3–5 workers';
  if (score >= 25) return '2–3 workers';
  return '1–2 workers';
}

function estimateSpreadArea(objectCount: number, coverageRatio: number): number {
  if (objectCount === 0) return 0;
  return coverageRatio > 0 ? Math.round(coverageRatio * 25 * 10) / 10 : Math.round(objectCount * 1.8);
}

function estimateVolume(objectCount: number, densityClass: EnvironmentalRiskScore['densityClass']): number {
  if (objectCount === 0) return 0;
  const baseL = objectCount * 0.3;
  const densityMultiplier = densityClass === 'severe' ? 0.7 : densityClass === 'dense' ? 0.85 : 1.0;
  return Math.round(baseL * densityMultiplier * 10) / 10;
}

// ─── Image loading ──────────────────────────────────────────────────────────

// Camera photos decode to a tensor at full resolution (a 4032x3024 shot is
// ~140MB as an int32 tensor) and get uploaded as a texture to the rn-webgl
// backend. tfjs-react-native is a stale package (last targeted Expo ~SDK 48)
// paired with a much newer tfjs core, and that pairing is known to lag on
// releasing GPU texture memory -- a couple of full-res allocations survive,
// but by the 3rd/4th report submission in the same session the GPU/JS memory
// budget gets exhausted and Expo Go crashes outright. Downscaling immediately
// after decode (both models only need a few hundred px on a side anyway) and
// disposing the oversized original right away keeps steady-state memory low
// regardless of how many reports get analyzed in one session.
const MAX_TENSOR_SIDE = 640;

async function readPhotoAsTensor(photoUri: string): Promise<tf.Tensor3D> {
  const file = new File(photoUri);
  const bytes = await file.bytes();
  const fullSizeTensor = decodeJpeg(bytes) as tf.Tensor3D;
  const [height, width] = fullSizeTensor.shape;
  if (Math.max(height, width) <= MAX_TENSOR_SIDE) return fullSizeTensor;

  const scale = MAX_TENSOR_SIDE / Math.max(height, width);
  const resizedFloat = tf.image.resizeBilinear(fullSizeTensor, [
    Math.round(height * scale),
    Math.round(width * scale),
  ]) as tf.Tensor3D;
  fullSizeTensor.dispose();

  // resizeBilinear always outputs float32 regardless of input dtype, but
  // coco-ssd's frozen graph requires its image_tensor input to be int32 (the
  // same dtype decodeJpeg produces) -- without this cast, every photo that
  // needed downscaling (i.e. virtually every real camera photo) threw
  // "must be int32, but was float32" and silently fell through to the
  // fallback chain's random local simulation instead of real detection.
  const resized = tf.cast(resizedFloat, 'int32') as tf.Tensor3D;
  resizedFloat.dispose();
  return resized;
}

// ─── Public API ─────────────────────────────────────────────────────────────

export async function analyzeOnDevice(photoUri: string): Promise<AIAnalysisResult> {
  const startMs = Date.now();

  const [cocoModel, mobileNetModel] = await Promise.all([loadCocoModel(), loadMobileNetModel()]);

  const tensor = await readPhotoAsTensor(photoUri);
  const [imageHeight, imageWidth] = tensor.shape;
  const imageArea = imageWidth * imageHeight;

  let detectedObjects: DetectedObject[] = [];
  let mobileNetCategory: WasteCategory | null = null;
  let mobileNetConfidence = 0;

  // coco-ssd/mobilenet are supposed to tidy their own intermediate tensors, but
  // tfjs-react-native's stale rn-webgl backend paired with a much newer tfjs core
  // is not trusted to interoperate cleanly here -- wrap the whole inference call
  // in an explicit engine scope so anything either library leaves behind still
  // gets force-disposed the moment this function returns, rather than slowly
  // accumulating GPU-texture memory across report submissions in the same session.
  tf.engine().startScope();
  try {
    const [predictions, classifications] = await Promise.all([
      cocoModel.detect(tensor, 20, 0.25),
      mobileNetModel.classify(tensor, 5),
    ]);
    const mobileNetLabels = classifications.map((c) => c.className.toLowerCase());

    detectedObjects = predictions.map((p) => {
      const wasteType = resolveWasteType(p.class.toLowerCase(), mobileNetLabels);
      return {
        label: p.class,
        wasteType,
        confidence: Math.round(p.score * 100),
        bbox: { x: p.bbox[0], y: p.bbox[1], width: p.bbox[2], height: p.bbox[3] },
        color: WASTE_TYPE_COLORS[wasteType],
      };
    });

    for (const pred of classifications) {
      const cls = pred.className.toLowerCase();
      const match = IMAGENET_TO_CATEGORY.find(([key]) => cls.includes(key));
      if (match) {
        [, mobileNetCategory] = match;
        mobileNetConfidence = Math.round(pred.probability * 100);
        break;
      }
    }
  } finally {
    tf.engine().endScope();
    tensor.dispose();
  }

  const totalBboxArea = detectedObjects.reduce((sum, d) => sum + d.bbox.width * d.bbox.height, 0);
  const coverageRatio = imageArea > 0 ? Math.min(totalBboxArea / imageArea, 1) : 0;
  const densityScore = imageArea > 0 ? (detectedObjects.length / imageArea) * 10000 : 0;

  // Confidence-weighted YOLO category distribution, blended 70/30 with MobileNet
  const yoloScores: Partial<Record<WasteCategory, number>> = {};
  if (detectedObjects.length === 0) {
    yoloScores.non_recyclable = 60;
  } else {
    let totalWeight = 0;
    detectedObjects.forEach((det) => {
      const cat = WASTE_TYPE_CATEGORY[det.wasteType] ?? 'non_recyclable';
      yoloScores[cat] = (yoloScores[cat] ?? 0) + det.confidence;
      totalWeight += det.confidence;
    });
    if (totalWeight > 0) {
      (Object.keys(yoloScores) as WasteCategory[]).forEach((k) => {
        yoloScores[k] = Math.round(((yoloScores[k] ?? 0) / totalWeight) * 100);
      });
    }
  }
  const blended: Partial<Record<WasteCategory, number>> = { ...yoloScores };
  if (mobileNetCategory) {
    const existing = blended[mobileNetCategory] ?? 0;
    blended[mobileNetCategory] = Math.round(existing * 0.7 + mobileNetConfidence * 0.3);
  }
  (['recyclable', 'non_recyclable', 'organic', 'hazardous', 'electronic'] as WasteCategory[]).forEach((cat) => {
    if (blended[cat] === undefined) blended[cat] = 0;
  });

  const environmental = computeEnvironmentalScore(detectedObjects, coverageRatio, densityScore);
  const envCategory: WasteCategory =
    environmental.riskScore >= 75 ? 'severe_pollution'
      : environmental.riskScore >= 50 ? 'waterway_pollution'
        : environmental.riskScore >= 25 ? 'moderate_pollution'
          : 'low_pollution';
  blended[envCategory] = Math.max(blended[envCategory] ?? 0, 20);

  const sortedScores = (Object.entries(blended) as [WasteCategory, number][])
    .filter(([, v]) => v > 0)
    .sort(([, a], [, b]) => b - a)
    .map(([category, confidence]) => ({ category, confidence, label: CNN_CATEGORY_LABELS[category] }));

  const primary = sortedScores[0] ?? { category: 'non_recyclable' as WasteCategory, confidence: 50, label: 'Non-Recyclable' };
  const hazardousDetected = detectedObjects.some((d) => d.wasteType === 'e_waste' || d.wasteType === 'cigarette_butt') || environmental.hazardousPresent;

  const cnnResult: CNNClassification = { category: primary.category, confidence: primary.confidence, label: primary.label, allScores: sortedScores };

  const { score: severityScore, level: severityLevel } = computeSeverity(detectedObjects);
  const recommendations = buildRecommendations(detectedObjects);
  const wasteTypes = buildWasteTypeDistribution(detectedObjects);

  const environmentalImpact =
    hazardousDetected && (severityLevel === 'critical' || severityLevel === 'high') ? 'severe'
      : hazardousDetected ? 'high'
        : severityLevel === 'critical' ? 'high'
          : severityLevel === 'high' ? 'moderate'
            : severityLevel === 'moderate' ? 'low'
              : 'minimal';

  const mem = tf.memory() as tf.MemoryInfo & { numBytesInGPU?: number };
  console.log(
    `[onDeviceAI] Done in ${Date.now() - startMs}ms — ${detectedObjects.length} objects, severity=${severityLevel} — ` +
      `tensors=${mem.numTensors} gpuBytes=${mem.numBytesInGPU ?? 'n/a'}`,
  );

  return {
    modelVersion: 'COCO-SSD/MobileNetV2 (on-device)',
    confidence: primary.confidence,
    severityScore,
    severityLevel,
    wasteTypes,
    estimatedVolume: estimateVolume(detectedObjects.length, environmental.densityClass),
    spreadArea: estimateSpreadArea(detectedObjects.length, coverageRatio),
    hazardousDetected,
    teamNeeded: estimateTeamNeeded(severityScore),
    cleanupPriority:
      severityLevel === 'critical' ? 'CRITICAL — Immediate dispatch required'
        : severityLevel === 'high' ? 'HIGH — Schedule within 24 hours'
          : severityLevel === 'moderate' ? 'MODERATE — Schedule within 48 hours'
            : 'LOW — Routine cleanup schedule',
    timestamp: new Date().toISOString(),
    objectCount: detectedObjects.length,
    coverageRatio,
    environmentalImpact,
    detectedObjects,
    cnnResult,
    recommendations,
    environmental,
  };
}
