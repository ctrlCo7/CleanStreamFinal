/**
 * Runs the two on-device models on one photo and returns their raw output for
 * buildAnalysisResult. Shared by the app (onDeviceAI.ts) and the accuracy harness
 * (scripts/ai-eval), so what is measured is exactly what phones run.
 *
 * Whole-photo classification misses small items: in a riverbank photo, MobileNet names the
 * riverbank, not the battery in it. With `crops` on, it also classifies zoomed-in parts of the
 * photo (each object COCO-SSD found, the centre, and the four quarters) and keeps the
 * strongest evidence for each label.
 */
import type * as tfType from '@tensorflow/tfjs';
import type { RawClassification, RawDetection } from './wasteAnalysis';

export interface InferenceModels {
  detect(img: tfType.Tensor3D, maxBoxes: number, minScore: number): Promise<RawDetection[]>;
  classify(img: tfType.Tensor3D, topk: number): Promise<RawClassification[]>;
}

export interface InferenceOptions {
  /** How many whole-photo guesses to keep. */
  topK: number;
  /** Also classify zoomed-in regions. */
  crops: boolean;
  /** Crop guesses count a little less than whole-photo ones (a crop sees less context). */
  cropWeight: number;
  /** At most this many detected objects are classified on their own. */
  maxObjectCrops: number;
}

/** What phones ran before these improvements. */
export const BASELINE_OPTIONS: InferenceOptions = { topK: 5, crops: false, cropWeight: 0.9, maxObjectCrops: 0 };
/** What phones run now. */
export const IMPROVED_OPTIONS: InferenceOptions = { topK: 10, crops: true, cropWeight: 0.9, maxObjectCrops: 4 };

type Box = [number, number, number, number]; // x, y, width, height

/** Regions to classify on their own: detected objects (padded) first, then centre and quarters. */
export function cropBoxes(
  width: number, height: number, detections: RawDetection[], maxObjectCrops: number,
): Box[] {
  const boxes: Box[] = [];
  const minSide = 48;
  const objects = detections
    .filter((d) => d.score >= 0.25 && d.bbox[2] * d.bbox[3] >= 0.02 * width * height)
    .sort((a, b) => b.bbox[2] * b.bbox[3] - a.bbox[2] * a.bbox[3])
    .slice(0, maxObjectCrops);
  for (const d of objects) {
    const [x, y, w, h] = d.bbox;
    const padX = w * 0.1;
    const padY = h * 0.1;
    const x0 = Math.max(0, Math.floor(x - padX));
    const y0 = Math.max(0, Math.floor(y - padY));
    const x1 = Math.min(width, Math.ceil(x + w + padX));
    const y1 = Math.min(height, Math.ceil(y + h + padY));
    if (x1 - x0 >= minSide && y1 - y0 >= minSide) boxes.push([x0, y0, x1 - x0, y1 - y0]);
  }
  const cw = Math.round(width * 0.6);
  const ch = Math.round(height * 0.6);
  boxes.push([Math.round((width - cw) / 2), Math.round((height - ch) / 2), cw, ch]);
  const hw = Math.floor(width / 2);
  const hh = Math.floor(height / 2);
  boxes.push([0, 0, hw, hh], [hw, 0, width - hw, hh], [0, hh, hw, height - hh], [hw, hh, width - hw, height - hh]);
  return boxes.filter(([, , w, h]) => w >= minSide && h >= minSide);
}

/** Keep each label once, with its strongest (weighted) probability, best first. */
export function mergeClassifications(lists: Array<{ items: RawClassification[]; weight: number }>, limit: number): RawClassification[] {
  const best = new Map<string, number>();
  for (const { items, weight } of lists) {
    for (const c of items) {
      const p = c.probability * weight;
      if (p > (best.get(c.className) ?? 0)) best.set(c.className, p);
    }
  }
  return [...best.entries()]
    .map(([className, probability]) => ({ className, probability }))
    .sort((a, b) => b.probability - a.probability)
    .slice(0, limit);
}

export async function runInference(
  tf: typeof tfType,
  image: tfType.Tensor3D,
  models: InferenceModels,
  options: InferenceOptions = BASELINE_OPTIONS,
): Promise<{ predictions: RawDetection[]; classifications: RawClassification[] }> {
  const [predictions, whole] = await Promise.all([
    models.detect(image, 20, 0.25),
    models.classify(image, options.topK),
  ]);
  if (!options.crops) return { predictions, classifications: whole };

  const [height, width] = image.shape;
  const lists: Array<{ items: RawClassification[]; weight: number }> = [{ items: whole, weight: 1 }];
  for (const [x, y, w, h] of cropBoxes(width, height, predictions, options.maxObjectCrops)) {
    const crop = tf.slice(image, [y, x, 0], [h, w, 3]) as tfType.Tensor3D;
    try {
      lists.push({ items: await models.classify(crop, 5), weight: options.cropWeight });
    } finally {
      crop.dispose();
    }
  }
  return { predictions, classifications: mergeClassifications(lists, Math.max(options.topK, 10)) };
}
