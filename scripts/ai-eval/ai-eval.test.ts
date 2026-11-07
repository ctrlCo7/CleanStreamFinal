/**
 * Measures the on-device waste AI against photos whose waste type an official confirmed.
 * Nothing is trained: the labelled photos are only used to score the AI.
 *
 * Runs the same models and the same app code as phones (aiInference.ts + wasteAnalysis.ts),
 * on this PC's CPU. Label-text reading (ML Kit, phone-only) is not available here, so hazard
 * words on labels are not counted; everything else is.
 *
 *   cd superadmin-web
 *   npx vitest run --root .. scripts/ai-eval
 *
 * Settings (environment variables):
 *   AI_EVAL_MANIFEST  the Training data export (default: the 2026-11-05 export in Downloads)
 *   AI_EVAL_CONFIGS   comma list of baseline,improved (default: both)
 *   AI_EVAL_OUT       folder for the per-photo results (default: builds/ai-eval)
 */
import { describe, it } from 'vitest';
import fs from 'fs';
import path from 'path';
import * as tf from '@tensorflow/tfjs';
import * as cocoSsd from '@tensorflow-models/coco-ssd';
import * as mobilenet from '@tensorflow-models/mobilenet';
import jpeg from 'jpeg-js';
import { BASELINE_OPTIONS, IMPROVED_OPTIONS, InferenceOptions, runInference } from '../../src/services/aiInference';
import { buildAnalysisResult } from '../../src/services/wasteAnalysis';
import { detectHazardPictograms } from '../../src/services/hazardDetection';
import { computeSceneStats } from '../../src/services/waterwayAssessment';
import type { WaterContext } from '../../src/types';

const ROOT = path.resolve(__dirname, '../..');
const MANIFEST = process.env.AI_EVAL_MANIFEST ?? path.join(process.env.USERPROFILE ?? '', 'Downloads', 'cleanstream-training-2026-11-05.json');
const OUT = process.env.AI_EVAL_OUT ?? path.join(ROOT, 'builds', 'ai-eval');
const CACHE = path.join(OUT, 'photos');
const CONFIGS: Record<string, InferenceOptions> = { baseline: BASELINE_OPTIONS, improved: IMPROVED_OPTIONS };
const RUN = (process.env.AI_EVAL_CONFIGS ?? 'baseline,improved').split(',').map((s) => s.trim()).filter((s) => s in CONFIGS);

interface Item { id: string; url: string; label: string; waterContext?: string }

/** The connection here drops now and then: try a few times before giving up. */
async function retry<T>(what: string, fn: () => Promise<T>, tries = 4): Promise<T> {
  for (let i = 1; ; i++) {
    try { return await fn(); } catch (e) {
      if (i >= tries || /HTTP 404/.test(String(e))) throw e;
      console.log(`  retrying ${what} (${(e as Error).message})`);
      await new Promise((ok) => setTimeout(ok, 3000 * i));
    }
  }
}

async function photo(item: Item): Promise<Buffer> {
  const file = path.join(CACHE, `${item.id}.jpg`);
  if (fs.existsSync(file)) return fs.readFileSync(file);
  const buf = await retry(`photo ${item.id}`, async () => {
    const res = await fetch(item.url);
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    return Buffer.from(await res.arrayBuffer());
  });
  fs.writeFileSync(file, buf);
  return buf;
}

/**
 * The same model files the app downloads, saved on this PC after the first successful
 * download, so a flaky connection can't spoil a run. Returns a loader TensorFlow.js accepts
 * in place of a URL.
 */
async function cachedModel(name: string, modelJsonUrl: string, suffix = ''): Promise<tf.io.IOHandler> {
  const dir = path.join(OUT, 'models', name);
  const jsonFile = path.join(dir, 'model.json');
  if (!fs.existsSync(jsonFile)) {
    fs.mkdirSync(dir, { recursive: true });
    const { json, base } = await retry(`${name} model.json`, async () => {
      const res = await fetch(modelJsonUrl + suffix);
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      // Weights sit next to model.json at the ORIGINAL address (TF Hub redirects model.json elsewhere).
      return { json: await res.text(), base: modelJsonUrl.replace(/[^/]+$/, '') };
    });
    const manifest = JSON.parse(json) as tf.io.ModelJSON;
    for (const group of manifest.weightsManifest) {
      for (const p of group.paths) {
        const buf = await retry(`${name} ${p}`, async () => {
          const res = await fetch(base + p + suffix);
          if (!res.ok) throw new Error(`HTTP ${res.status}`);
          return Buffer.from(await res.arrayBuffer());
        });
        fs.writeFileSync(path.join(dir, path.basename(p)), buf);
      }
    }
    fs.writeFileSync(jsonFile, json);
  }
  return {
    load: async () => {
      const manifest = JSON.parse(fs.readFileSync(jsonFile, 'utf8')) as tf.io.ModelJSON;
      return tf.io.getModelArtifactsForJSON(manifest, async (weights) => {
        const specs = weights.flatMap((g) => g.weights);
        const parts = weights.flatMap((g) => g.paths).map((p) => fs.readFileSync(path.join(dir, path.basename(p))));
        const all = Buffer.concat(parts);
        return [specs, all.buffer.slice(all.byteOffset, all.byteOffset + all.byteLength)];
      });
    },
  };
}

/** Same as the app: decode, shrink to at most 640 px, keep int32 for COCO-SSD. */
function toTensor(buf: Buffer): tf.Tensor3D {
  const img = jpeg.decode(buf, { useTArray: true, formatAsRGBA: false, maxMemoryUsageInMB: 1024 });
  const full = tf.tensor3d(Int32Array.from(img.data), [img.height, img.width, 3], 'int32');
  const side = Math.max(img.height, img.width);
  if (side <= 640) return full;
  const s = 640 / side;
  const resized = tf.tidy(() => tf.cast(tf.image.resizeBilinear(full, [Math.round(img.height * s), Math.round(img.width * s)]), 'int32')) as tf.Tensor3D;
  full.dispose();
  return resized;
}

describe('waste AI accuracy on official-labelled photos', () => {
  it('scores each configuration', async () => {
    const manifest = JSON.parse(fs.readFileSync(MANIFEST, 'utf8')) as { items: Item[] };
    const items = manifest.items.filter((i) => i.url && i.label);
    fs.mkdirSync(CACHE, { recursive: true });
    // Optional: TensorFlow's WebAssembly engine, about 10x faster than plain JavaScript.
    // AI_EVAL_WASM = the installed @tensorflow/tfjs-backend-wasm folder (same version as tfjs).
    if (process.env.AI_EVAL_WASM) {
      const { createRequire } = await import('module');
      const req = createRequire(path.join(process.env.AI_EVAL_WASM, 'package.json'));
      const wasm = req(process.env.AI_EVAL_WASM) as { setWasmPaths: (p: string) => void };
      wasm.setWasmPaths(path.join(process.env.AI_EVAL_WASM, 'dist') + path.sep);
      await tf.setBackend('wasm');
    }
    await tf.ready();
    console.log(`TensorFlow backend: ${tf.getBackend()}`);
    // The same models the app loads (COCO-SSD mobilenet_v2, MobileNetV2 1.0), from the local cache.
    const cocoFiles = await cachedModel('coco-ssd', 'https://storage.googleapis.com/tfjs-models/savedmodel/ssd_mobilenet_v2/model.json');
    const netFiles = await cachedModel('mobilenet-v2', 'https://tfhub.dev/google/imagenet/mobilenet_v2_100_224/classification/2/model.json', '?tfjs-format=file');
    const coco = await cocoSsd.load({ base: 'mobilenet_v2', modelUrl: cocoFiles as unknown as string });
    const net = await mobilenet.load({ version: 2, alpha: 1.0, modelUrl: netFiles as unknown as string, inputRange: [0, 1] });
    const models = {
      detect: (img: tf.Tensor3D, n: number, s: number) => coco.detect(img, n, s),
      classify: (img: tf.Tensor3D, k: number) => net.classify(img, k),
    };

    const summary: string[] = [];
    for (const name of RUN) {
      const rows: Array<{ id: string; label: string; predicted: string; correct: boolean; seen?: unknown }> = [];
      const perClass: Record<string, { n: number; ok: number }> = {};
      let missing = 0;
      for (const item of items) {
        let predicted = 'error';
        let seen: unknown;
        try {
          const image = toTensor(await photo(item));
          try {
            const [h, w] = image.shape;
            const { predictions, classifications } = await runInference(tf, image, models, CONFIGS[name]);
            const pixels = await image.data();
            const result = buildAnalysisResult(predictions, classifications, w, h,
              { pictograms: detectHazardPictograms(pixels, w, h) },
              { scene: computeSceneStats(pixels, w, h), reporterContext: (item.waterContext ?? 'unknown') as WaterContext });
            predicted = result.wasteTypes[0]?.type ?? 'none';
            // What the models saw, to understand the misses.
            seen = {
              objects: predictions.map((d) => `${d.class} ${Math.round(d.score * 100)}`),
              guesses: classifications.slice(0, 8).map((c) => `${c.className.split(',')[0]} ${Math.round(c.probability * 100)}`),
              types: result.wasteTypes.map((t) => `${t.type} ${t.percentage}`),
            };
          } finally {
            image.dispose();
          }
        } catch (e) {
          predicted = `error: ${(e as Error).message}`;
        }
        // A photo that no longer exists can't be scored either way.
        if (predicted.startsWith('error: HTTP 404')) { missing += 1; continue; }
        const correct = predicted === item.label;
        rows.push({ id: item.id, label: item.label, predicted, correct, seen });
        perClass[item.label] ??= { n: 0, ok: 0 };
        perClass[item.label].n += 1;
        if (correct) perClass[item.label].ok += 1;
      }
      const ok = rows.filter((r) => r.correct).length;
      fs.writeFileSync(path.join(OUT, `${name}.json`), JSON.stringify({ config: CONFIGS[name], ok, total: rows.length, rows }, null, 2));
      summary.push(`\n== ${name}: ${ok}/${rows.length} correct (${Math.round((ok / rows.length) * 1000) / 10}%)${missing ? `, ${missing} photos no longer online (not scored)` : ''}`);
      for (const [label, c] of Object.entries(perClass).sort()) summary.push(`   ${label.padEnd(16)} ${c.ok}/${c.n}`);
    }
    console.log(summary.join('\n'));
  }, 60 * 60 * 1000);
});
