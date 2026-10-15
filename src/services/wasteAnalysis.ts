/**
 * Pure (platform-free) waste analysis: turns raw COCO-SSD detections and
 * MobileNet classifications into CleanStream's AIAnalysisResult -- waste types,
 * categories, severity, environmental score and disposal recommendations.
 * Kept free of React Native / TensorFlow imports so it can be unit-tested in Node.
 */

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

export interface RawDetection { class: string; score: number; bbox: [number, number, number, number] }
export interface RawClassification { className: string; probability: number }

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
// Only COCO classes that plausibly show up as litter/waste are listed. Everything
// else the detector can emit (people, animals, vehicles, aircraft, bicycles,
// clocks, sports gear, appliances like toilets...) is a false positive for waste
// purposes -- on real litter photos COCO-SSD regularly returns things like
// "airplane" for cigarette butts or "toilet" for foam cups -- so unlisted
// classes are ignored rather than defaulted to 'mixed_waste'.
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

  backpack: 'plastic_bag',
  handbag: 'plastic_bag',
  suitcase: 'trash_pile',
  book: 'paper_waste',

  chair: 'mixed_waste',
  couch: 'mixed_waste',
  bed: 'mixed_waste',
};

// COCO detections of these are frequently wrong on litter photos, so they must
// clear a higher confidence bar than the default.
const LOW_TRUST_COCO = new Set(['cup', 'fork', 'knife', 'spoon', 'suitcase', 'backpack', 'handbag', 'chair', 'couch', 'bed']);

function cocoMinScore(cocoClass: string): number {
  if (cocoClass === 'bottle') return 0.3;
  return LOW_TRUST_COCO.has(cocoClass) ? 0.6 : 0.4;
}

function isWasteDetection(p: RawDetection): boolean {
  const cls = p.class.toLowerCase();
  return (cls === 'bottle' || cls in COCO_TO_WASTE) && p.score >= cocoMinScore(cls);
}

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

// MobileNet classifies the whole image against 1000 ImageNet classes. Several of
// those are real waste items COCO has no class for (plastic bags, cartons, trash
// cans, drink bottles/cans), so they are surfaced as detections in their own
// right instead of only nudging the category score. ImageNet has no cigarette
// butt or foam class, so those two waste types cannot be identified on-device.
const IMAGENET_TO_WASTE: Array<[RegExp, AIWasteType, number]> = [
  [/water bottle|pop bottle|water jug/, 'plastic_bottle', 0.15],
  [/beer bottle|wine bottle|whiskey jug/, 'glass_bottle', 0.15],
  [/milk can|tin can|beer can|pop can/, 'metal_can', 0.15],
  [/plastic bag/, 'plastic_bag', 0.15],
  [/packet|wrapper/, 'plastic_bag', 0.2],
  [/carton/, 'cardboard', 0.2],
  [/paper towel|envelope|newspaper|menu/, 'paper_waste', 0.3],
  [/ashcan|trash can|garbage|dumpster|bucket|barrel/, 'mixed_waste', 0.15],
  [/cellular telephone|mobile phone|laptop|notebook|monitor|television|remote control|mouse|computer keyboard|hard disc|ipod|modem|router|joystick|printer/, 'e_waste', 0.3],
  [/banana|orange|lemon|strawberry|pineapple|pomegranate|granny smith|fig|jackfruit|custard apple|cucumber|zucchini|broccoli|cauliflower|head cabbage|bell pepper|mushroom|artichoke|cardoon|ear|acorn squash|butternut squash|spaghetti squash|guacamole|pizza|cheeseburger|hotdog|bagel|pretzel|dough|meat loaf|mashed potato|burrito|ice cream|carbonara/, 'food_waste', 0.2],
];

function classificationsToDetections(
  classifications: RawClassification[],
  alreadyFound: Set<AIWasteType>,
  imageWidth: number,
  imageHeight: number,
): DetectedObject[] {
  const found: DetectedObject[] = [];
  // A single container is either glass, plastic or metal -- never several. If the
  // box detector already identified one (it resolves material using these same
  // labels), skip them here; otherwise only the highest-probability one counts.
  const CONTAINERS: AIWasteType[] = ['plastic_bottle', 'glass_bottle', 'metal_can'];
  let containerTaken = CONTAINERS.some((t) => alreadyFound.has(t));
  for (const c of classifications) {
    const label = c.className.toLowerCase();
    const match = IMAGENET_TO_WASTE.find(([re, , minProb]) => re.test(label) && c.probability >= minProb);
    if (!match) continue;
    const wasteType = match[1];
    if (alreadyFound.has(wasteType)) continue;
    if (CONTAINERS.includes(wasteType)) {
      if (containerTaken) continue;
      containerTaken = true;
    }
    alreadyFound.add(wasteType);
    found.push({
      label: c.className.split(',')[0],
      wasteType,
      confidence: Math.round(c.probability * 100),
      // Whole-image classification has no location; use the full frame.
      bbox: { x: 0, y: 0, width: imageWidth, height: imageHeight },
      color: WASTE_TYPE_COLORS[wasteType],
    });
  }
  return found;
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


export function buildAnalysisResult(
  predictions: RawDetection[],
  classifications: RawClassification[],
  imageWidth: number,
  imageHeight: number,
): AIAnalysisResult {
  const imageArea = imageWidth * imageHeight;
  const mobileNetLabels = classifications.map((c) => c.className.toLowerCase());
  let mobileNetCategory: WasteCategory | null = null;
  let mobileNetConfidence = 0;

  const cocoObjects: DetectedObject[] = predictions.filter(isWasteDetection).map((p) => {
    const wasteType = resolveWasteType(p.class.toLowerCase(), mobileNetLabels);
    return {
      label: p.class,
      wasteType,
      confidence: Math.round(p.score * 100),
      bbox: { x: p.bbox[0], y: p.bbox[1], width: p.bbox[2], height: p.bbox[3] },
      color: WASTE_TYPE_COLORS[wasteType],
    };
  });
  const classifierObjects = classificationsToDetections(
    classifications,
    new Set(cocoObjects.map((d) => d.wasteType)),
    imageWidth,
    imageHeight,
  );
  const detectedObjects: DetectedObject[] = [...cocoObjects, ...classifierObjects];

  for (const pred of classifications) {
    const cls = pred.className.toLowerCase();
    const match = IMAGENET_TO_CATEGORY.find(([key]) => cls.includes(key));
    if (match) {
      [, mobileNetCategory] = match;
      mobileNetConfidence = Math.round(pred.probability * 100);
      break;
    }
  }

  const totalBboxArea = cocoObjects.reduce((sum, d) => sum + d.bbox.width * d.bbox.height, 0);
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

  // primary.confidence is the category's share of the detections (always ~100% for a
  // single detection), not how sure the models are. Report the strongest detection's
  // own score instead, and cap it when nothing was identified at all.
  const reportedConfidence = detectedObjects.length === 0
    ? Math.min(primary.confidence, 30)
    : Math.max(...detectedObjects.map((d) => d.confidence));
  const cnnResult: CNNClassification = { category: primary.category, confidence: reportedConfidence, label: primary.label, allScores: sortedScores };

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

  return {
    modelVersion: 'COCO-SSD/MobileNetV2 (on-device)',
    confidence: reportedConfidence,
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
