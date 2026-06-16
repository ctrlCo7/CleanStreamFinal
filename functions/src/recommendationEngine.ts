import { WasteType, WasteCategory, DisposalRecommendation, YOLODetection, SeverityLevel, EnvironmentalScore } from './types';

// ─── Disposal recommendation database (all 12 waste types) ───────────────────

const RECOMMENDATIONS: Record<WasteType, Omit<DisposalRecommendation, 'wasteType' | 'wasteLabel'>> = {
  plastic_bottle: {
    category: 'recyclable',
    action: 'Rinse the bottle and place it in the blue recycling bin. Remove the cap separately.',
    facility: 'Materials Recovery Facility (MRF) / Junk Shop',
    urgency: 'routine',
    icon: '🍶',
  },
  plastic_bag: {
    category: 'non_recyclable',
    action: 'Do not place in recycling. Bring to plastic drop-off points at supermarkets or dispose in black bin.',
    facility: 'Barangay Collection Point',
    urgency: 'scheduled',
    icon: '🛍️',
  },
  glass_bottle: {
    category: 'recyclable',
    action: 'Rinse and place in the designated glass recycling bin. Handle with care to avoid breakage.',
    facility: 'Glass Recycling Center / Junk Shop',
    urgency: 'routine',
    icon: '🍾',
  },
  metal_can: {
    category: 'recyclable',
    action: 'Rinse the can and flatten it before placing in the metal recycling bin.',
    facility: 'Scrap Metal Dealer / MRF',
    urgency: 'routine',
    icon: '🥫',
  },
  paper_waste: {
    category: 'recyclable',
    action: 'Keep dry and free from food contamination. Bundle and place in the paper recycling bin.',
    facility: 'Paper Recycling Center / Junk Shop',
    urgency: 'routine',
    icon: '📄',
  },
  cardboard: {
    category: 'recyclable',
    action: 'Flatten cardboard boxes. Keep dry. Drop off at your barangay recycling center.',
    facility: 'Cardboard / Paper MRF',
    urgency: 'routine',
    icon: '📦',
  },
  food_waste: {
    category: 'organic',
    action: 'Place in the green biodegradable bin for composting. Do not mix with recyclables.',
    facility: 'Barangay Composting Facility',
    urgency: 'immediate',
    icon: '🥦',
  },
  styrofoam: {
    category: 'non_recyclable',
    action: 'Styrofoam is NOT recyclable in standard MRFs. Place in the black residual bin. Avoid burning — releases toxic styrene vapour.',
    facility: 'Sanitary Landfill / Designated Polystyrene Drop-Off',
    urgency: 'scheduled',
    icon: '📦',
  },
  cigarette_butt: {
    category: 'hazardous',
    action: 'Cigarette butts contain nicotine, arsenic, and heavy metals that leach into waterways. Collect in a sealed container and bring to a hazardous waste facility.',
    facility: 'DENR Hazardous Waste Drop-Off / TerraCycle Collection Point',
    urgency: 'immediate',
    icon: '🚬',
  },
  e_waste: {
    category: 'electronic',
    action: 'Do NOT dispose in regular bins. Bring to an e-waste collection drive or authorized DENR-accredited drop-off. Contains lead, mercury, and cadmium.',
    facility: 'DENR-Accredited E-Waste Facility',
    urgency: 'scheduled',
    icon: '📱',
  },
  mixed_waste: {
    category: 'non_recyclable',
    action: 'Place in the black residual waste bin. Try to separate recyclable components (metal, plastic, paper) first before disposal.',
    facility: 'Sanitary Landfill',
    urgency: 'scheduled',
    icon: '🗑️',
  },
  trash_pile: {
    category: 'non_recyclable',
    action: 'Large accumulation detected. Contact your barangay clean-up crew immediately. Sort waste into recyclable/organic/residual before collection.',
    facility: 'Barangay Clean-Up Operations Center',
    urgency: 'immediate',
    icon: '🗂️',
  },
};

const WASTE_TYPE_LABELS: Record<WasteType, string> = {
  plastic_bottle:  'Plastic Bottle',
  plastic_bag:     'Plastic Bag',
  glass_bottle:    'Glass Bottle',
  metal_can:       'Metal / Can',
  paper_waste:     'Paper Waste',
  cardboard:       'Cardboard',
  food_waste:      'Food Waste',
  styrofoam:       'Styrofoam',
  cigarette_butt:  'Cigarette Butt',
  e_waste:         'Electronic Waste',
  mixed_waste:     'Mixed Waste',
  trash_pile:      'Trash Pile',
};

// ─── Build recommendations from detected objects ──────────────────────────────

export function buildRecommendations(detections: YOLODetection[]): DisposalRecommendation[] {
  if (detections.length === 0) {
    return [{ wasteType: 'mixed_waste', wasteLabel: 'Mixed Waste', ...RECOMMENDATIONS.mixed_waste }];
  }

  // Deduplicate by waste type, keeping the highest-confidence detection per type
  const seen = new Map<WasteType, number>();
  detections.forEach((det) => {
    const existing = seen.get(det.wasteType) ?? 0;
    if (det.confidence > existing) seen.set(det.wasteType, det.confidence);
  });

  // Sort: urgent first, then by confidence descending, cap at 5 recs
  return Array.from(seen.entries())
    .sort(([typeA, confA], [typeB, confB]) => {
      const urgencyRank = { immediate: 0, scheduled: 1, routine: 2 };
      const uA = urgencyRank[RECOMMENDATIONS[typeA].urgency];
      const uB = urgencyRank[RECOMMENDATIONS[typeB].urgency];
      if (uA !== uB) return uA - uB;
      return confB - confA;
    })
    .slice(0, 5)
    .map(([wasteType]) => ({
      wasteType,
      wasteLabel: WASTE_TYPE_LABELS[wasteType],
      ...RECOMMENDATIONS[wasteType],
    }));
}

// ─── Severity scoring (Phase 2 fix: recalibrated thresholds) ─────────────────
// Old thresholds (30/50/70) caused `critical` too easily.
// New: 25/50/75 with adjusted category weights to reduce false critical scores.

const CATEGORY_SEVERITY_WEIGHT: Record<WasteCategory, number> = {
  hazardous:           35,
  electronic:          28,
  non_recyclable:      18,
  recyclable:           8,
  organic:             12,
  waterway_pollution:  30,
  severe_pollution:    35,
  moderate_pollution:  20,
  low_pollution:       10,
};

const WASTE_TYPE_TO_CATEGORY: Record<WasteType, WasteCategory> = {
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

export function computeSeverity(
  detections: YOLODetection[],
  objectCount: number,
): { score: number; level: SeverityLevel } {
  if (objectCount === 0) return { score: 5, level: 'low' };

  // Sum confidence-weighted category scores
  let baseScore = 0;
  detections.forEach((det) => {
    const cat = WASTE_TYPE_TO_CATEGORY[det.wasteType] ?? 'non_recyclable';
    baseScore += CATEGORY_SEVERITY_WEIGHT[cat] * (det.confidence / 100);
  });

  // Logarithmic volume multiplier (avoids runaway scores with many detections)
  // log2(1 + 1) = 1.0×, log2(1 + 10) ≈ 1.7×, log2(1 + 50) ≈ 2.1× (capped at 2.5)
  const volumeMultiplier = Math.min(Math.log2(1 + objectCount), 2.5);
  const raw = Math.round(Math.min(baseScore * volumeMultiplier, 100));

  let level: SeverityLevel;
  if (raw >= 75) level = 'critical';
  else if (raw >= 50) level = 'high';
  else if (raw >= 25) level = 'moderate';
  else level = 'low';

  return { score: raw, level };
}

// ─── Volume / area / team estimates ──────────────────────────────────────────

export function estimateTeamNeeded(score: number): string {
  if (score >= 75) return '5–10 workers';
  if (score >= 50) return '3–5 workers';
  if (score >= 25) return '2–3 workers';
  return '1–2 workers';
}

export function estimateSpreadArea(
  objectCount: number,
  coverageRatio = 0,
  imageArea = 307200, // default 640×480
): number {
  if (objectCount === 0) return 0;
  // Assume image covers ~25 m² (typical 5m × 5m waterway bank scene)
  const sceneAreaM2 = 25;
  const estimatedAreaM2 = coverageRatio > 0
    ? Math.round(coverageRatio * sceneAreaM2 * 10) / 10
    : Math.round(objectCount * 1.8);
  return estimatedAreaM2;
}

export function estimateVolume(
  objectCount: number,
  environmental?: EnvironmentalScore,
): number {
  if (objectCount === 0) return 0;
  // Base: 0.3 L per item average (PET bottle ~500ml, plastic bag ~50ml, can ~330ml)
  const baseL = objectCount * 0.3;
  // Density multiplier: dense packing reduces effective volume per unit
  const densityMultiplier = environmental
    ? environmental.densityClass === 'severe' ? 0.7
    : environmental.densityClass === 'dense' ? 0.85
    : 1.0
    : 1.0;
  return Math.round(baseL * densityMultiplier * 10) / 10;
}
