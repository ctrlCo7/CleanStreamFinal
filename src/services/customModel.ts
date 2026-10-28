/**
 * CleanStream's own waste classifier, trained on labelled report photos with
 * ml/train_waste_classifier.py and switched on in the Super Admin portal (System
 * settings → Custom waste model). The phone downloads model.json + metadata.json once
 * per app session; nothing changes in the app when it's off.
 */
import * as tf from '@tensorflow/tfjs';
import { AIWasteType } from '../types';
import { getSystemSettings } from './systemSettingsService';
import type { CustomModelOutput } from './wasteAnalysis';

interface Metadata {
  labels: AIWasteType[];
  inputSize: number;
  version?: string;
}

interface Loaded { model: tf.GraphModel; meta: Metadata; version: string }

const CONFIG_TTL_MS = 10 * 60 * 1000;
let config: { at: number; value: { url: string; version: string } | null } | null = null;
let loaded: { url: string; promise: Promise<Loaded> } | null = null;

async function currentConfig(): Promise<{ url: string; version: string } | null> {
  if (config && Date.now() - config.at < CONFIG_TTL_MS) return config.value;
  let value: { url: string; version: string } | null = null;
  try {
    const cm = (await getSystemSettings())?.customModel;
    if (cm?.enabled && /^https:\/\/.+\/model\.json$/.test(cm.url ?? '')) value = { url: cm.url, version: cm.version || 'custom' };
  } catch (e) {
    console.warn('[CustomModel] Could not read settings:', e);
  }
  config = { at: Date.now(), value };
  return value;
}

function load(url: string, version: string): Promise<Loaded> {
  if (loaded?.url === url) return loaded.promise;
  const promise = (async () => {
    const metaUrl = url.replace(/model\.json$/, 'metadata.json');
    const meta = (await (await fetch(metaUrl)).json()) as Metadata;
    if (!Array.isArray(meta.labels) || meta.labels.length < 2) throw new Error('metadata.json has no labels');
    const model = await tf.loadGraphModel(url);
    return { model, meta: { ...meta, inputSize: meta.inputSize || 224 }, version: meta.version || version };
  })();
  loaded = { url, promise };
  // A failed download is retried on the next analysis instead of being cached forever.
  promise.catch(() => { if (loaded?.url === url) loaded = null; });
  return promise;
}

export type PreparedCustomModel = Loaded;

/**
 * Loads the custom model if it is switched on (cached for the session), or returns
 * undefined. Call this OUTSIDE any tf.engine() scope: weights created inside one would be
 * disposed when the scope ends.
 */
export async function prepareCustomModel(): Promise<PreparedCustomModel | undefined> {
  const cfg = await currentConfig();
  if (!cfg) return undefined;
  try {
    return await load(cfg.url, cfg.version);
  } catch (e) {
    console.warn('[CustomModel] Could not load (non-fatal):', e);
    return undefined;
  }
}

/**
 * Class probabilities for an RGB image tensor from a prepared model. Uses MobileNetV2
 * preprocessing (pixels scaled to -1..1), matching the training script.
 */
export async function classifyWithCustomModel(image: tf.Tensor3D, prepared: PreparedCustomModel | undefined): Promise<CustomModelOutput | undefined> {
  if (!prepared) return undefined;
  try {
    const { model, meta, version } = prepared;
    const probs = tf.tidy(() => {
      const input = tf.image.resizeBilinear(tf.cast(image, 'float32'), [meta.inputSize, meta.inputSize])
        .div(127.5).sub(1).expandDims(0);
      const out = model.predict(input) as tf.Tensor;
      return out.squeeze();
    });
    const values = Array.from(await probs.data());
    probs.dispose();
    const predictions = meta.labels
      .map((wasteType, i) => ({ wasteType, probability: values[i] ?? 0 }))
      .sort((a, b) => b.probability - a.probability);
    return { version, predictions };
  } catch (e) {
    console.warn('[CustomModel] Classification failed (non-fatal):', e);
    return undefined;
  }
}
