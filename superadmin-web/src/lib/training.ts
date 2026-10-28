import { Report } from './operations';

// Labelled photos for training CleanStream's own waste classifier (see ml/README.md).
// A label comes from the barangay official who verified the report (most reliable) or,
// failing that, from the reporter's own answer on the result screen.

/** The app's 13 waste types: the classes the model learns. Keep in sync with AIWasteType. */
export const TRAINING_CLASSES = [
  'plastic_bottle', 'plastic_bag', 'glass_bottle', 'metal_can', 'paper_waste', 'cardboard', 'food_waste',
  'styrofoam', 'cigarette_butt', 'hazardous_waste', 'e_waste', 'mixed_waste', 'trash_pile',
] as const;
export type TrainingClass = (typeof TRAINING_CLASSES)[number];

export const CLASS_LABELS: Record<TrainingClass, string> = {
  plastic_bottle: 'Plastic bottle', plastic_bag: 'Plastic bag', glass_bottle: 'Glass bottle', metal_can: 'Metal / can',
  paper_waste: 'Paper', cardboard: 'Cardboard', food_waste: 'Food / organic', styrofoam: 'Styrofoam',
  cigarette_butt: 'Cigarette butt', hazardous_waste: 'Hazardous', e_waste: 'E-waste', mixed_waste: 'Mixed', trash_pile: 'Trash pile',
};

export interface TrainingItem {
  id: string;
  reportNumber: string;
  url: string;
  label: TrainingClass;
  labelSource: 'official' | 'reporter';
  /** The AI's guess at the time, to measure how often it was wrong. */
  aiPrediction?: string;
  barangay?: string;
  waterContext?: string;
  createdAt: string;
}

const isClass = (v: string | undefined): v is TrainingClass => !!v && (TRAINING_CLASSES as readonly string[]).includes(v);

/**
 * Reports usable for training: a hosted photo (not a path left on someone's phone) and a
 * human label. Rejected reports are left out; they are often not waste at all.
 */
export const trainingItems = (reports: Report[], officialOnly = false): TrainingItem[] =>
  reports.flatMap((r) => {
    if (!r.photoURL || !/^https:\/\//.test(r.photoURL) || r.status === 'rejected') return [];
    const official = isClass(r.officialWasteType) ? r.officialWasteType : undefined;
    const reporter = isClass(r.reporterWasteType) ? r.reporterWasteType : undefined;
    const label = official ?? (officialOnly ? undefined : reporter);
    if (!label) return [];
    return [{
      id: r.id,
      reportNumber: r.reportNumber,
      url: r.photoURL,
      label,
      labelSource: official ? 'official' : 'reporter',
      aiPrediction: r.aiWasteType,
      barangay: r.barangay,
      waterContext: r.waterContext,
      createdAt: r.createdAt?.toISOString() ?? '',
    } satisfies TrainingItem];
  });

export const classCounts = (items: TrainingItem[]): Record<TrainingClass, number> => {
  const counts = Object.fromEntries(TRAINING_CLASSES.map((c) => [c, 0])) as Record<TrainingClass, number>;
  for (const i of items) counts[i.label]++;
  return counts;
};

/** Share of labelled photos where the AI's guess matched the human label. */
export const aiAgreement = (items: TrainingItem[]): number | null => {
  const judged = items.filter((i) => i.aiPrediction);
  return judged.length ? Math.round((judged.filter((i) => i.aiPrediction === i.label).length / judged.length) * 100) : null;
};

/** The file ml/train_waste_classifier.py reads. */
export const buildManifest = (items: TrainingItem[], now = new Date()) => ({
  format: 'cleanstream-training-manifest',
  version: 1,
  exportedAt: now.toISOString(),
  classes: [...TRAINING_CLASSES],
  items,
});
