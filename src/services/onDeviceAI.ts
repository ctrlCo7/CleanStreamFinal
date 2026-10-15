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
import { AIAnalysisResult } from '../types';
import { buildAnalysisResult } from './wasteAnalysis';

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

  let predictions: cocoSsd.DetectedObject[] = [];
  let classifications: Array<{ className: string; probability: number }> = [];

  // coco-ssd/mobilenet are supposed to tidy their own intermediate tensors, but
  // tfjs-react-native's stale rn-webgl backend paired with a much newer tfjs core
  // is not trusted to interoperate cleanly here -- wrap the whole inference call
  // in an explicit engine scope so anything either library leaves behind still
  // gets force-disposed the moment this function returns, rather than slowly
  // accumulating GPU-texture memory across report submissions in the same session.
  tf.engine().startScope();
  try {
    [predictions, classifications] = await Promise.all([
      cocoModel.detect(tensor, 20, 0.25),
      mobileNetModel.classify(tensor, 5),
    ]);
  } finally {
    tf.engine().endScope();
    tensor.dispose();
  }

  const result = buildAnalysisResult(predictions, classifications, imageWidth, imageHeight);

  const mem = tf.memory() as tf.MemoryInfo & { numBytesInGPU?: number };
  console.log(
    `[onDeviceAI] Done in ${Date.now() - startMs}ms — ${result.objectCount} objects, severity=${result.severityLevel} — ` +
      `tensors=${mem.numTensors} gpuBytes=${mem.numBytesInGPU ?? 'n/a'}`,
  );
  return result;
}
