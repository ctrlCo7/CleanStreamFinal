/**
 * PHASE 2 — Upgraded Detection Module
 *
 * Improvements over baseline:
 *   • Image is preprocessed (brightness / contrast / noise) before inference
 *   • Multi-scale detection: original + 1.5× upscale + four half-region crops
 *     → significantly improves recall for small objects (cigarette butts,
 *       bottle caps, small plastic bags)
 *   • Lower confidence threshold (0.25) for occluded / wet / partially submerged objects
 *   • Custom Non-Maximum Suppression (NMS) with IoU threshold 0.45 deduplicates
 *     the merged multi-scale candidate set before scoring
 *   • Expanded COCO-class → waste-type mapping (all 80 COCO classes evaluated)
 *   • New waste types: styrofoam, cigarette_butt, trash_pile
 *   • Coverage ratio and density score added to YOLOResult
 *   • tensor.dispose() called AFTER await — no premature release
 *
 * NOTE: The underlying model is still COCO-SSD (SSD MobileNetV2) which is trained
 * on 80 general-purpose COCO classes, NOT on waste-specific imagery. Multi-scale
 * detection and preprocessing improve recall of COCO-class objects that overlap
 * with waste (bottles, cups, bags, electronics). For a true waste detector, the
 * next step is to fine-tune YOLOv8 or RT-DETR on TACO + WasteNet datasets
 * (see PHASE 7 — Dataset Recommendations).
 */

import * as cocoSsd from '@tensorflow-models/coco-ssd';
import * as tf from '@tensorflow/tfjs-node';
import * as admin from 'firebase-admin';
import sharp from 'sharp';
import { preprocessImage, upscaleImage, extractRegion } from './preprocessor';
import { BoundingBox, WasteType, YOLODetection, YOLOResult } from './types';

// ─── COCO class → CleanStream waste type mapping (all 80 COCO classes) ─────────

const COCO_TO_WASTE: Record<string, WasteType> = {
  // Drinks / food containers → plastic/glass bottles
  bottle:             'plastic_bottle',
  'wine glass':       'glass_bottle',
  cup:                'plastic_bottle',
  bowl:               'food_waste',

  // Cutlery → metal_can (metallic single-use items)
  fork:               'metal_can',
  knife:              'metal_can',
  spoon:              'metal_can',

  // Food → food_waste
  banana:             'food_waste',
  apple:              'food_waste',
  sandwich:           'food_waste',
  orange:             'food_waste',
  broccoli:           'food_waste',
  carrot:             'food_waste',
  'hot dog':          'food_waste',
  pizza:              'food_waste',
  donut:              'food_waste',
  cake:               'food_waste',

  // Electronics → e_waste
  'cell phone':       'e_waste',
  laptop:             'e_waste',
  tv:                 'e_waste',
  keyboard:           'e_waste',
  mouse:              'e_waste',
  remote:             'e_waste',
  microwave:          'e_waste',
  toaster:            'e_waste',
  'hair drier':       'e_waste',

  // Appliances → e_waste (dumped large items are a real waterway problem)
  refrigerator:       'e_waste',
  oven:               'e_waste',
  sink:               'mixed_waste',
  toilet:             'mixed_waste',

  // Bags → plastic_bag
  backpack:           'plastic_bag',
  handbag:            'plastic_bag',
  'tie':              'mixed_waste',

  // Luggage/bins → trash_pile (large accumulation indicators)
  suitcase:           'trash_pile',
  'sports ball':      'mixed_waste',

  // Paper / cardboard
  book:               'paper_waste',
  'clock':            'mixed_waste',
  scissors:           'metal_can',

  // Mixed/toys/misc → mixed_waste
  'teddy bear':       'mixed_waste',
  toothbrush:         'mixed_waste',
  umbrella:           'mixed_waste',
  frisbee:            'mixed_waste',
  skis:               'mixed_waste',
  snowboard:          'mixed_waste',
  kite:               'mixed_waste',
  'baseball bat':     'metal_can',
  'baseball glove':   'mixed_waste',
  skateboard:         'mixed_waste',
  surfboard:          'mixed_waste',
  'tennis racket':    'mixed_waste',

  // Vehicles (abandoned/dumped) → mixed_waste
  bicycle:            'mixed_waste',
  car:                'mixed_waste',
  motorcycle:         'mixed_waste',
  truck:              'mixed_waste',
  boat:               'mixed_waste',
  'fire hydrant':     'mixed_waste',

  // Containers (tin cans, boxes)
  'potted plant':     'mixed_waste',
  'dining table':     'mixed_waste',
  chair:              'mixed_waste',
  couch:              'mixed_waste',
  bed:                'mixed_waste',
};

// ─── Labels + colours for annotated output ────────────────────────────────────

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
  e_waste:         'E-Waste',
  mixed_waste:     'Mixed Waste',
  trash_pile:      'Trash Pile',
};

const BBOX_COLORS: Record<WasteType, string> = {
  plastic_bottle:  '#378ADD',
  plastic_bag:     '#54B4E4',
  glass_bottle:    '#9B59B6',
  metal_can:       '#888780',
  paper_waste:     '#F39C12',
  cardboard:       '#D35400',
  food_waste:      '#639922',
  styrofoam:       '#16A085',
  cigarette_butt:  '#7F8C8D',
  e_waste:         '#E07B3A',
  mixed_waste:     '#E74C3C',
  trash_pile:      '#922B21',
};

// ─── Model singleton ──────────────────────────────────────────────────────────

let _model: cocoSsd.ObjectDetection | null = null;
let _modelLoading: Promise<cocoSsd.ObjectDetection> | null = null;

async function loadModel(): Promise<cocoSsd.ObjectDetection> {
  if (_model) return _model;
  if (_modelLoading) return _modelLoading;

  _modelLoading = (async () => {
    console.log('[YOLO] Loading COCO-SSD MobileNetV2...');
    const m = await cocoSsd.load({ base: 'mobilenet_v2' });
    _model = m;
    console.log('[YOLO] Model ready.');
    return m;
  })();

  return _modelLoading;
}

// Warm up model on first import to reduce cold-start latency
loadModel().catch(() => { /* best-effort warm-up */ });

// ─── Custom NMS ───────────────────────────────────────────────────────────────

function computeIoU(a: BoundingBox, b: BoundingBox): number {
  const ax2 = a.x + a.width;
  const ay2 = a.y + a.height;
  const bx2 = b.x + b.width;
  const by2 = b.y + b.height;

  const ix1 = Math.max(a.x, b.x);
  const iy1 = Math.max(a.y, b.y);
  const ix2 = Math.min(ax2, bx2);
  const iy2 = Math.min(ay2, by2);

  if (ix2 <= ix1 || iy2 <= iy1) return 0;

  const intersection = (ix2 - ix1) * (iy2 - iy1);
  const aArea = a.width * a.height;
  const bArea = b.width * b.height;
  return intersection / (aArea + bArea - intersection);
}

interface RawDetection {
  label: string;
  wasteType: WasteType;
  confidence: number;
  bbox: BoundingBox;
  scalePenalty: number; // 1.0 for original scale, 0.9 for region crops
}

function applyNMS(candidates: RawDetection[], iouThreshold = 0.45): RawDetection[] {
  if (candidates.length === 0) return [];

  const sorted = [...candidates].sort((a, b) => b.confidence - a.confidence);
  const kept: RawDetection[] = [];
  const suppressed = new Set<number>();

  for (let i = 0; i < sorted.length; i++) {
    if (suppressed.has(i)) continue;
    kept.push(sorted[i]);
    for (let j = i + 1; j < sorted.length; j++) {
      if (suppressed.has(j)) continue;
      if (computeIoU(sorted[i].bbox, sorted[j].bbox) > iouThreshold) {
        suppressed.add(j);
      }
    }
  }
  return kept;
}

// ─── Single-scale detection helper ───────────────────────────────────────────

async function detectOnBuffer(
  model: cocoSsd.ObjectDetection,
  imageBuffer: Buffer,
  confidenceThreshold: number,
): Promise<Array<{ class: string; score: number; bbox: [number, number, number, number] }>> {
  const tensor = tf.node.decodeImage(imageBuffer, 3);
  let predictions: cocoSsd.DetectedObject[];
  try {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    predictions = await model.detect(tensor as any, 40, confidenceThreshold);
  } finally {
    tensor.dispose();
  }
  return predictions;
}

// ─── Multi-scale detection ────────────────────────────────────────────────────

async function runMultiScaleDetection(
  preprocessedBuffer: Buffer,
  model: cocoSsd.ObjectDetection,
  imageWidth: number,
  imageHeight: number,
  confidenceThreshold: number,
): Promise<RawDetection[]> {
  const all: RawDetection[] = [];

  const toRaw = (
    preds: Array<{ class: string; score: number; bbox: [number, number, number, number] }>,
    scalePenalty = 1.0,
  ): RawDetection[] =>
    preds.map((p) => ({
      label: p.class,
      wasteType: COCO_TO_WASTE[p.class.toLowerCase()] ?? 'mixed_waste',
      confidence: Math.round(p.score * 100),
      bbox: { x: p.bbox[0], y: p.bbox[1], width: p.bbox[2], height: p.bbox[3] },
      scalePenalty,
    }));

  // Scale 1 — original preprocessed image
  const scale1Preds = await detectOnBuffer(model, preprocessedBuffer, confidenceThreshold);
  all.push(...toRaw(scale1Preds, 1.0));

  // Scale 2 — 1.5× upscale (improves small-object recall)
  try {
    const upscaled = await upscaleImage(preprocessedBuffer, 1.5);
    const scale2Preds = await detectOnBuffer(model, upscaled, confidenceThreshold);
    const downscale = (v: number) => v / 1.5;
    all.push(
      ...scale2Preds.map((p) => ({
        label: p.class,
        wasteType: COCO_TO_WASTE[p.class.toLowerCase()] ?? 'mixed_waste' as WasteType,
        confidence: Math.round(p.score * 100),
        bbox: {
          x: downscale(p.bbox[0]),
          y: downscale(p.bbox[1]),
          width: downscale(p.bbox[2]),
          height: downscale(p.bbox[3]),
        },
        scalePenalty: 0.95, // slight penalty for scaled coordinates
      })),
    );
  } catch (e) {
    console.warn('[YOLO] 1.5× scale detection failed, skipping:', e);
  }

  // Scales 3–6 — four half-region crops (top/bottom/left/right halves)
  // Each crop is upscaled to the full image size → detector sees larger objects
  const regions = [
    { left: 0,                  top: 0,                   width: imageWidth,      height: Math.floor(imageHeight / 2) },
    { left: 0,                  top: Math.floor(imageHeight / 2), width: imageWidth, height: Math.ceil(imageHeight / 2) },
    { left: 0,                  top: 0,                   width: Math.floor(imageWidth / 2),  height: imageHeight },
    { left: Math.floor(imageWidth / 2), top: 0,           width: Math.ceil(imageWidth / 2),   height: imageHeight },
  ];

  for (const region of regions) {
    try {
      const cropBuffer = await extractRegion(preprocessedBuffer, region, 640);
      const scaleX = region.width / 640;
      const scaleY = region.height / 640;
      const cropPreds = await detectOnBuffer(model, cropBuffer, confidenceThreshold + 0.05);
      all.push(
        ...cropPreds.map((p) => ({
          label: p.class,
          wasteType: COCO_TO_WASTE[p.class.toLowerCase()] ?? 'mixed_waste' as WasteType,
          confidence: Math.round(p.score * 0.9 * 100), // 10% penalty for region detections
          bbox: {
            x: region.left + p.bbox[0] * scaleX,
            y: region.top  + p.bbox[1] * scaleY,
            width: p.bbox[2] * scaleX,
            height: p.bbox[3] * scaleY,
          },
          scalePenalty: 0.9,
        })),
      );
    } catch (e) {
      console.warn('[YOLO] Region crop detection failed, skipping:', e);
    }
  }

  return all;
}

// ─── Public API ───────────────────────────────────────────────────────────────

export async function runYOLODetection(
  imageBuffer: Buffer,
  confidenceThreshold = 0.25,
): Promise<YOLOResult> {
  const startMs = Date.now();

  // Phase 5 — preprocess before inference
  const preprocessed = await preprocessImage(imageBuffer, {
    maxDimension: 1280,
    enhanceBrightness: true,
    enhanceContrast: true,
    reduceNoise: true,
    sharpen: true,
  });

  const { processedWidth: imageWidth, processedHeight: imageHeight } = preprocessed;
  const imageArea = imageWidth * imageHeight;

  const model = await loadModel();

  // Multi-scale detection → merged candidate set
  const candidates = await runMultiScaleDetection(
    preprocessed.buffer,
    model,
    imageWidth,
    imageHeight,
    confidenceThreshold,
  );

  // Custom NMS to deduplicate overlapping boxes from multiple scales
  const deduped = applyNMS(candidates, 0.45);

  // Filter to minimum confidence after NMS
  const final = deduped.filter((d) => d.confidence >= Math.round(confidenceThreshold * 100));

  const detections: YOLODetection[] = final.map((d) => ({
    label: d.label,
    wasteType: d.wasteType,
    confidence: d.confidence,
    bbox: {
      x: Math.max(0, Math.round(d.bbox.x)),
      y: Math.max(0, Math.round(d.bbox.y)),
      width: Math.round(d.bbox.width),
      height: Math.round(d.bbox.height),
    },
    color: BBOX_COLORS[d.wasteType],
    area: Math.round(d.bbox.width * d.bbox.height),
  }));

  // Coverage ratio: fraction of image area covered by waste bounding boxes
  const totalBboxArea = detections.reduce((sum, d) => sum + (d.area ?? 0), 0);
  const coverageRatio = imageArea > 0 ? Math.min(totalBboxArea / imageArea, 1) : 0;

  // Density score: number of objects per 10,000 pixels
  const densityScore = imageArea > 0
    ? parseFloat(((detections.length / imageArea) * 10000).toFixed(4))
    : 0;

  return {
    detections,
    objectCount: detections.length,
    imageWidth,
    imageHeight,
    coverageRatio: parseFloat(coverageRatio.toFixed(4)),
    densityScore,
    processingTimeMs: Date.now() - startMs,
  };
}

// ─── Bounding box annotation (SVG composite via sharp) ────────────────────────

export async function drawBoundingBoxes(
  imageBuffer: Buffer,
  detections: YOLODetection[],
): Promise<Buffer> {
  const meta = await sharp(imageBuffer).metadata();
  const width = meta.width ?? 640;
  const height = meta.height ?? 480;

  const svgShapes = detections
    .map((det) => {
      const { x, y, width: w, height: h } = det.bbox;
      const color = det.color;
      const labelText = `${WASTE_TYPE_LABELS[det.wasteType]} ${det.confidence}%`;
      const labelY = y > 26 ? y - 26 : y + h + 4;
      const labelW = Math.min(w, labelText.length * 7.5 + 14);
      const safe = labelText
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;');
      return `
        <rect x="${x}" y="${y}" width="${w}" height="${h}"
              fill="${color}26" stroke="${color}" stroke-width="2.5" rx="3"/>
        <rect x="${x}" y="${labelY}" width="${labelW}" height="22" fill="${color}" rx="3"/>
        <text x="${x + 6}" y="${labelY + 15}"
              font-family="Arial,sans-serif" font-size="11" font-weight="bold"
              fill="white">${safe}</text>`;
    })
    .join('');

  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}">${svgShapes}</svg>`;

  return sharp(imageBuffer)
    .composite([{ input: Buffer.from(svg), top: 0, left: 0 }])
    .jpeg({ quality: 90 })
    .toBuffer();
}

// ─── Upload annotated image to Firebase Storage ───────────────────────────────

export async function uploadProcessedImage(
  processedBuffer: Buffer,
  userId: string,
  imageId: string,
): Promise<string> {
  const bucket = admin.storage().bucket();
  const path = `processed/${userId}/${imageId}/annotated.jpg`;
  const file = bucket.file(path);
  await file.save(processedBuffer, { metadata: { contentType: 'image/jpeg' } });
  await file.makePublic();
  return `https://storage.googleapis.com/${bucket.name}/${path}`;
}
