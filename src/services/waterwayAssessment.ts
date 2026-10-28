/**
 * Waterway-specific assessment layered on top of the object/scene detection in
 * wasteAnalysis.ts. The detectors answer "what waste is in the photo"; this module
 * answers the questions that matter for a river, creek or canal:
 *
 *   - Is the waste actually in (or right next to) water?        -> context
 *   - Will it block the flow and worsen flooding?               -> blockage, floodRisk
 *   - Will it float away and spread downstream?                 -> spreadRisk
 *   - Is it contaminating the water? Who could get sick?        -> contamination, healthRisks
 *   - What should the crew do first, and bring?                 -> actions, equipment
 *
 * and folds those into the severity score with an explicit, explainable list of
 * factors. Everything here is a rule-based estimate from what one photo shows, and
 * the result screen presents it that way.
 *
 * Pure (no React Native / TensorFlow imports) so it can be unit-tested in Node.
 */

import {
  AIAnalysisResult,
  AIWasteType,
  DetectedObject,
  PhotoQuality,
  RainOutlook,
  SeverityFactor,
  SeverityLevel,
  WaterColor,
  WaterContext,
  WaterwayAssessment,
} from '../types';

// ─── Scene statistics from raw pixels ─────────────────────────────────────────

export interface SceneStats {
  /** 0–1 mean luminance. */
  brightness: number;
  /** 0–1 luminance standard deviation. */
  contrast: number;
  /** Mean luminance gradient between neighbouring samples — low means blurry or featureless. */
  sharpness: number;
  /** 0–1 share of the lower part of the frame that looks like a smooth water surface. */
  waterFraction: number;
  waterColor: WaterColor | null;
}

const rgbToHsv = (r: number, g: number, b: number): [number, number, number] => {
  const max = Math.max(r, g, b);
  const min = Math.min(r, g, b);
  const d = max - min;
  let h = 0;
  if (d > 0) {
    if (max === r) h = 60 * (((g - b) / d) % 6);
    else if (max === g) h = 60 * ((b - r) / d + 2);
    else h = 60 * ((r - g) / d + 4);
  }
  if (h < 0) h += 360;
  return [h, max === 0 ? 0 : d / max, max];
};

// A water surface is smooth: neighbouring pixels differ little. Vegetation, rubble and
// garbage piles are textured, which is what keeps green leaves or brown dirt from being
// mistaken for green or murky water.
const SMOOTH_GRADIENT = 0.045;

/**
 * Brightness, contrast, sharpness and a water-surface estimate from an RGB(A) pixel
 * buffer (row-major, 0–255). Samples a grid of ~40k points, so it is fast on a
 * 640px image. Water is only looked for in the lower 70% of the frame, where it
 * almost always is in a photo taken from a bank or bridge.
 */
export function computeSceneStats(pixels: ArrayLike<number>, width: number, height: number, channels = 3): SceneStats {
  const step = Math.max(1, Math.floor(Math.sqrt((width * height) / 40000)));
  const lum = (x: number, y: number) => {
    const i = (y * width + x) * channels;
    return (0.299 * pixels[i] + 0.587 * pixels[i + 1] + 0.114 * pixels[i + 2]) / 255;
  };

  let n = 0, sum = 0, sumSq = 0, gradSum = 0, gradN = 0;
  let lowerN = 0;
  const waterCounts: Record<WaterColor, number> = { blue: 0, green: 0, brown: 0, dark: 0 };
  const waterTop = Math.floor(height * 0.3);

  for (let y = 0; y < height; y += step) {
    for (let x = 0; x < width; x += step) {
      const l = lum(x, y);
      n++; sum += l; sumSq += l * l;

      let grad: number | null = null;
      if (x + step < width && y + step < height) {
        grad = (Math.abs(l - lum(x + step, y)) + Math.abs(l - lum(x, y + step))) / 2;
        gradSum += grad; gradN++;
      }

      if (y < waterTop || grad === null) continue;
      lowerN++;
      if (grad > SMOOTH_GRADIENT) continue;
      const i = (y * width + x) * channels;
      const [h, s, v] = rgbToHsv(pixels[i] / 255, pixels[i + 1] / 255, pixels[i + 2] / 255);
      if (v < 0.16) waterCounts.dark++;
      else if (h >= 165 && h <= 235 && s >= 0.12 && v <= 0.92) waterCounts.blue++;
      else if (h >= 70 && h < 165 && s >= 0.15 && s <= 0.7 && v <= 0.75) waterCounts.green++;
      else if (h >= 15 && h < 70 && s >= 0.12 && s <= 0.55 && v <= 0.65) waterCounts.brown++;
    }
  }

  const brightness = n ? sum / n : 0;
  const contrast = n ? Math.sqrt(Math.max(0, sumSq / n - brightness * brightness)) : 0;
  const waterTotal = waterCounts.blue + waterCounts.green + waterCounts.brown + waterCounts.dark;
  const waterFraction = lowerN ? waterTotal / lowerN : 0;
  const top = (Object.entries(waterCounts) as Array<[WaterColor, number]>).sort((a, b) => b[1] - a[1])[0];

  return {
    brightness,
    contrast,
    sharpness: gradN ? gradSum / gradN : 0,
    waterFraction,
    waterColor: waterFraction >= 0.15 && top[1] > 0 ? top[0] : null,
  };
}

export function assessPhotoQuality(scene: SceneStats): PhotoQuality {
  const issues: PhotoQuality['issues'] = [];
  if (scene.brightness < 0.16) issues.push('too_dark');
  else if (scene.brightness > 0.9) issues.push('overexposed');
  if (scene.sharpness < 0.02) issues.push('blurry');
  if (scene.contrast < 0.07) issues.push('low_contrast');
  return { level: issues.length === 0 ? 'good' : issues.length === 1 ? 'fair' : 'poor', issues };
}

export const PHOTO_ISSUE_TEXT: Record<PhotoQuality['issues'][number], string> = {
  too_dark: 'Photo is very dark',
  overexposed: 'Photo is washed out by bright light',
  blurry: 'Photo may be blurry',
  low_contrast: 'Photo has very little detail',
};

// ─── Water in the scene ───────────────────────────────────────────────────────

// MobileNet (ImageNet) scene/object classes that only appear where there is open water.
const WATER_SCENE = /lakeside|lakeshore|seashore|coast|sandbar|\bdam\b|dike|breakwater|groin|jetty|pier|boathouse|canoe|paddle|speedboat|gondola|fireboat|lifeboat|yawl|catamaran|trimaran|schooner|fountain/;
const DRAIN_SCENE = /manhole cover|grille|drain/;

export interface SceneLabel { className: string; probability: number }

export function waterLikelihoodFrom(scene: SceneStats | undefined, labels: SceneLabel[] = []): number {
  const sceneHit = labels.find((l) => WATER_SCENE.test(l.className.toLowerCase()));
  const sceneScore = sceneHit ? Math.round(55 + sceneHit.probability * 45) : 0;
  // Colour alone is weak evidence (a brown road can pass), so on its own it tops out at 70.
  const pixelScore = scene && scene.waterFraction >= 0.12 ? Math.min(70, Math.round(scene.waterFraction * 120)) : 0;
  if (sceneScore && pixelScore) return Math.min(95, Math.max(sceneScore, pixelScore) + 15);
  return Math.max(sceneScore, pixelScore);
}

// ─── Waste behaviour in water ─────────────────────────────────────────────────

/** Items that float and drift downstream. */
const FLOATABLE = new Set<AIWasteType>(['plastic_bottle', 'plastic_bag', 'styrofoam', 'cigarette_butt', 'food_waste', 'paper_waste']);

/** How much each item contributes to clogging a channel, drain or culvert. */
const CLOG_WEIGHT: Record<AIWasteType, number> = {
  trash_pile: 6, plastic_bag: 3, styrofoam: 2, mixed_waste: 2, cardboard: 2, food_waste: 1.5,
  plastic_bottle: 1, paper_waste: 1, glass_bottle: 0.5, metal_can: 0.5, e_waste: 1, hazardous_waste: 0.5, cigarette_butt: 0.1,
};

/** Containers that hold rainwater, where dengue mosquitoes (Aedes) breed. */
const HOLDS_WATER = new Set<AIWasteType>(['plastic_bottle', 'glass_bottle', 'metal_can', 'styrofoam', 'plastic_bag', 'mixed_waste', 'trash_pile']);

const levelOf = (score: number): SeverityLevel =>
  score >= 75 ? 'critical' : score >= 50 ? 'high' : score >= 25 ? 'moderate' : 'low';

const LEVEL_RANK: Record<SeverityLevel, number> = { low: 0, moderate: 1, high: 2, critical: 3 };
const atLeast = (level: SeverityLevel, min: SeverityLevel) => LEVEL_RANK[level] >= LEVEL_RANK[min];

/** The Philippine wet season (southwest monsoon and most typhoons): June to November. */
export const isRainySeason = (d: Date) => d.getMonth() >= 5 && d.getMonth() <= 10;

export interface WaterwayInput {
  detectedObjects: DetectedObject[];
  coverageRatio: number;
  hazardousDetected: boolean;
  scene?: SceneStats;
  sceneLabels?: SceneLabel[];
  /** What the reporter said. Takes priority over the AI's guess. */
  reporterContext?: WaterContext;
  /** Forecast for the location; heavy rain raises the flood risk of a blocked channel. */
  rain?: RainOutlook;
  now?: Date;
}

export function assessWaterway(input: WaterwayInput): WaterwayAssessment {
  const now = input.now ?? new Date();
  const objects = input.detectedObjects;
  const types = objects.map((o) => o.wasteType);
  const has = (t: AIWasteType) => types.includes(t);
  const labels = input.sceneLabels ?? [];

  // Where is it?
  const waterLikelihood = waterLikelihoodFrom(input.scene, labels);
  let context: WaterContext = 'unknown';
  let contextSource: WaterwayAssessment['contextSource'] = 'none';
  if (input.reporterContext && input.reporterContext !== 'unknown') {
    context = input.reporterContext;
    contextSource = 'reporter';
  } else if (labels.some((l) => DRAIN_SCENE.test(l.className.toLowerCase()) && l.probability >= 0.2)) {
    context = 'drainage';
    contextSource = 'ai';
  } else if (waterLikelihood >= 60) {
    context = 'in_water';
    contextSource = 'ai';
  }
  const wet = context === 'in_water' || context === 'drainage';
  const waterColor = input.scene?.waterColor ?? undefined;

  // Blockage: bulky and clog-prone items plus how much of the frame is covered.
  const clog = objects.reduce((s, o) => s + (CLOG_WEIGHT[o.wasteType] ?? 1), 0);
  const contextFactor = context === 'drainage' ? 1.3 : context === 'in_water' ? 1.1 : context === 'riverbank' ? 0.8 : 1;
  const blockageScore = Math.min(100, Math.round((clog * 6 + input.coverageRatio * 120) * contextFactor));
  const blockage = { score: blockageScore, level: levelOf(blockageScore) };

  // Flood risk: a blocked channel overflows when it rains.
  const rainySeason = isRainySeason(now);
  const rain = input.rain;
  const rainPoints = rain?.level === 'heavy' ? 25 : rain?.level === 'moderate' ? 12 : rain?.level === 'light' ? 4 : 0;
  const floodScore = blockageScore + (rainySeason ? 15 : 0) + (context === 'drainage' ? 10 : 0) + rainPoints;
  const floodRisk = objects.length === 0 ? 'low' : levelOf(floodScore);

  // Downstream spread: floating waste in moving water ends up somewhere else.
  const floatCount = types.filter((t) => FLOATABLE.has(t)).length;
  const floatableShare = objects.length ? Math.round((floatCount / objects.length) * 100) : 0;
  const spreadRisk: SeverityLevel =
    floatCount === 0 ? 'low'
      : context === 'in_water' ? (floatableShare >= 50 ? 'high' : 'moderate')
        : context === 'drainage' || context === 'riverbank' ? 'moderate'
          : 'low';

  // Contamination of the water itself.
  const organicShare = objects.length ? types.filter((t) => t === 'food_waste').length / objects.length : 0;
  let contaminationScore = 0;
  if (has('hazardous_waste')) contaminationScore += wet ? 75 : 50;
  if (has('e_waste')) contaminationScore += wet ? 45 : 30;
  if (has('cigarette_butt')) contaminationScore += 15;
  contaminationScore += Math.round(organicShare * (wet ? 60 : 35));
  if (wet || context === 'riverbank') {
    if (waterColor === 'dark') contaminationScore += 25;
    else if (waterColor === 'green') contaminationScore += 12;
    else if (waterColor === 'brown') contaminationScore += 6;
  }
  contaminationScore = Math.min(100, contaminationScore);
  const contamination = { score: contaminationScore, level: levelOf(contaminationScore) };

  // Health risks for residents and the cleanup crew.
  const healthRisks: string[] = [];
  if (types.some((t) => HOLDS_WATER.has(t))) {
    healthRisks.push('Containers that collect rainwater can become breeding sites for dengue mosquitoes.');
  }
  if (wet && (rainySeason || atLeast(floodRisk, 'high'))) {
    healthRisks.push('Floodwater mixed with garbage can spread leptospirosis. Wear boots and avoid wading with open wounds.');
  }
  if (has('glass_bottle') || has('metal_can') || has('hazardous_waste')) {
    healthRisks.push('Broken glass or sharp metal may be present. Use puncture-resistant gloves.');
  }
  if (has('hazardous_waste') || has('e_waste')) {
    healthRisks.push('Chemicals or heavy metals may be leaching into the water.');
  }
  if (organicShare > 0 && wet) {
    healthRisks.push('Rotting organic waste uses up oxygen in the water, causing foul odor and harming fish.');
  }
  if (waterColor === 'dark' && (wet || context === 'riverbank')) {
    healthRisks.push('Very dark water can mean sewage or stagnant water. Avoid skin contact.');
  } else if (waterColor === 'green' && (wet || context === 'riverbank')) {
    healthRisks.push('Green water can mean algae growth from sewage or fertilizer runoff.');
  }

  // What the crew should do, most urgent first.
  const actions: string[] = [];
  if (has('hazardous_waste')) {
    actions.push('Keep residents and volunteers away from the hazardous item. Request a hazmat-trained crew (CENRO / DENR-EMB).');
  }
  if (rain?.level === 'heavy' && objects.length > 0 && atLeast(blockage.level, 'moderate')) {
    actions.push('Heavy rain is forecast in the next 24 hours. Clear this before it rains.');
  }
  if (atLeast(blockage.level, 'high')) {
    actions.push(context === 'drainage'
      ? 'Clear the drain or culvert inlet first to restore water flow.'
      : 'Remove the debris blocking the channel before the next heavy rain.');
  }
  if (context === 'in_water' && floatCount > 0) {
    actions.push('Place a net or trash boom downstream to catch floating waste before it spreads.');
  }
  if (context === 'riverbank') {
    actions.push('Collect the waste on the bank before rain washes it into the water.');
  }
  if (rainySeason && atLeast(floodRisk, 'high')) {
    actions.push('Schedule ahead of forecast rain: flood risk is higher during the rainy season (June–November).');
  }
  if (organicShare > 0 && wet) {
    actions.push('Remove organic waste quickly to prevent odor and oxygen loss in the water.');
  }
  if (has('plastic_bottle') || has('metal_can') || has('glass_bottle') || has('cardboard')) {
    actions.push('Bag recyclables (bottles, cans, cardboard) separately for the barangay MRF.');
  }
  if (objects.length > 0) {
    actions.push('Re-inspect this spot after 7 days. Repeated dumping here marks it as a hotspot.');
  }

  // What to bring.
  const equipment = ['Heavy-duty gloves', 'Garbage sacks'];
  if (context === 'in_water') equipment.push('Long-handled skimmer nets', 'Rubber boots or waders', 'Safety rope');
  if (context === 'drainage') equipment.push('Drain hooks and rakes', 'Shovels');
  if (context === 'riverbank') equipment.push('Rakes and grabbers');
  if (has('hazardous_waste') || has('e_waste')) equipment.push('Sealed container for hazardous items', 'Face masks');
  if (has('trash_pile') || blockage.level === 'critical') equipment.push('Truck for hauling');
  if (context === 'in_water' && atLeast(blockage.level, 'high')) equipment.push('Boat or trash boom');

  // Points added to the detection-based severity, each with its reason.
  const severityFactors: SeverityFactor[] = [];
  if (context === 'in_water') severityFactors.push({ label: 'Waste is in the water', points: 12 });
  else if (context === 'drainage') severityFactors.push({ label: 'Waste is in a drainage canal', points: 10 });
  else if (context === 'riverbank') severityFactors.push({ label: 'Waste is on the riverbank', points: 5 });
  if (blockage.level === 'critical') severityFactors.push({ label: 'Severe flow blockage', points: 12 });
  else if (blockage.level === 'high') severityFactors.push({ label: 'Likely to block water flow', points: 8 });
  else if (blockage.level === 'moderate') severityFactors.push({ label: 'Some risk of blocking flow', points: 3 });
  if (contamination.level === 'critical') severityFactors.push({ label: 'Serious water contamination', points: 12 });
  else if (contamination.level === 'high') severityFactors.push({ label: 'Water contamination risk', points: 8 });
  if (rainySeason && atLeast(floodRisk, 'high')) severityFactors.push({ label: 'Rainy season flood risk', points: 5 });
  if (objects.length > 0 && atLeast(blockage.level, 'moderate')) {
    if (rain?.level === 'heavy') severityFactors.push({ label: 'Heavy rain forecast in 24 hours', points: 6 });
    else if (rain?.level === 'moderate') severityFactors.push({ label: 'Rain forecast in 24 hours', points: 3 });
  }

  return {
    context, contextSource, waterLikelihood, waterColor,
    blockage, floodRisk, spreadRisk, contamination, floatableShare, rainySeason,
    ...(rain ? { rain } : {}),
    healthRisks, actions, equipment, severityFactors,
  };
}

// ─── Applying it to an analysis result ────────────────────────────────────────

export function teamForSeverity(score: number): string {
  if (score >= 75) return '5–10 workers';
  if (score >= 50) return '3–5 workers';
  if (score >= 25) return '2–3 workers';
  return '1–2 workers';
}

export function priorityForSeverity(level: SeverityLevel): string {
  return level === 'critical' ? 'CRITICAL — Immediate dispatch required'
    : level === 'high' ? 'HIGH — Schedule within 24 hours'
      : level === 'moderate' ? 'MODERATE — Schedule within 48 hours'
        : 'LOW — Routine cleanup schedule';
}

export interface ApplyOptions {
  scene?: SceneStats;
  sceneLabels?: SceneLabel[];
  reporterContext?: WaterContext;
  rain?: RainOutlook;
  now?: Date;
}

/**
 * Adds the waterway assessment and photo-quality check to an analysis result and
 * raises the severity by the waterway factors. The detection-only score is kept as
 * baseSeverityScore so the result screen can show the breakdown.
 */
export function applyWaterwayAssessment(result: AIAnalysisResult, opts: ApplyOptions = {}): AIAnalysisResult {
  const waterway = assessWaterway({
    detectedObjects: result.detectedObjects ?? [],
    coverageRatio: result.coverageRatio ?? 0,
    hazardousDetected: result.hazardousDetected,
    scene: opts.scene,
    sceneLabels: opts.sceneLabels,
    reporterContext: opts.reporterContext,
    rain: opts.rain,
    now: opts.now,
  });
  const photoQuality = opts.scene ? assessPhotoQuality(opts.scene) : undefined;

  const base = result.baseSeverityScore ?? result.severityScore;
  // With nothing detected there's nothing for the water to make worse.
  const bonus = (result.detectedObjects?.length ?? 0) > 0 || result.analysisSource === 'unavailable'
    ? waterway.severityFactors.reduce((s, f) => s + f.points, 0)
    : 0;
  const severityScore = Math.min(100, base + bonus);
  const severityLevel = levelOf(severityScore);

  // A poor photo makes every detection less trustworthy.
  const confidence = photoQuality?.level === 'poor' ? Math.round(result.confidence * 0.8) : result.confidence;

  return {
    ...result,
    confidence,
    baseSeverityScore: base,
    severityScore,
    severityLevel,
    teamNeeded: teamForSeverity(severityScore),
    cleanupPriority: priorityForSeverity(severityLevel),
    waterway,
    ...(photoQuality ? { photoQuality } : {}),
  };
}
