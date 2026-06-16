/**
 * PHASE 5 — Image Preprocessing Pipeline
 *
 * Applies the following corrections before model inference:
 *   1. EXIF auto-rotation
 *   2. Resolution normalization (max 1280px on longest side)
 *   3. Brightness normalization via gamma correction
 *   4. Saturation/contrast boost for outdoor/waterway scenes
 *   5. Median noise filtering (removes sensor noise from low-light photos)
 *   6. Adaptive sharpening (recovers blur from motion or wet surfaces)
 *
 * Contrast-limited adaptive histogram equalisation (CLAHE) is NOT used here
 * because sharp's .clahe() converts to grayscale; for waste detection we need
 * full-colour output for the CNN stage.
 */

import sharp from 'sharp';
import { PreprocessingResult } from './types';

export interface PreprocessingOptions {
  maxDimension?: number;    // default 1280
  enhanceBrightness?: boolean;
  enhanceContrast?: boolean;
  reduceNoise?: boolean;
  sharpen?: boolean;
}

export async function preprocessImage(
  buffer: Buffer,
  options: PreprocessingOptions = {},
): Promise<PreprocessingResult> {
  const {
    maxDimension = 1280,
    enhanceBrightness = true,
    enhanceContrast = true,
    reduceNoise = true,
    sharpen = true,
  } = options;

  const startMs = Date.now();

  const meta = await sharp(buffer).metadata();
  const origW = meta.width ?? 640;
  const origH = meta.height ?? 480;

  let pipeline = sharp(buffer);

  // 1. Auto-rotate based on EXIF orientation tag
  pipeline = pipeline.rotate();

  // 2. Resize to max dimension while preserving aspect ratio
  const longest = Math.max(origW, origH);
  if (longest > maxDimension) {
    pipeline = pipeline.resize(maxDimension, maxDimension, {
      fit: 'inside',
      withoutEnlargement: true,
    });
  }

  // 3. Gamma correction: compensates for underexposure in outdoor/shaded scenes
  //    gamma > 1 brightens midtones without blowing out highlights
  if (enhanceBrightness) {
    pipeline = pipeline.gamma(1.2);
  }

  // 4. Modulate: slight saturation boost makes plastic/glass more visually distinct
  if (enhanceContrast) {
    pipeline = pipeline.modulate({
      brightness: 1.03,
      saturation: 1.15,
    });
  }

  // 5. Median filter: removes impulse/sensor noise common in phone cameras at ISO>400
  //    radius=3 is a 3×3 window — enough to clean noise without softening edges
  if (reduceNoise) {
    pipeline = pipeline.median(3);
  }

  // 6. Adaptive unsharp mask: recovers blur from camera motion or wet/reflective surfaces
  if (sharpen) {
    pipeline = pipeline.sharpen({ sigma: 0.8, m1: 0.5, m2: 0.2, x1: 2, y2: 10, y3: 20 });
  }

  const processedBuffer = await pipeline.jpeg({ quality: 92, mozjpeg: false }).toBuffer();

  const processedMeta = await sharp(processedBuffer).metadata();

  return {
    buffer: processedBuffer,
    originalWidth: origW,
    originalHeight: origH,
    processedWidth: processedMeta.width ?? origW,
    processedHeight: processedMeta.height ?? origH,
    processingTimeMs: Date.now() - startMs,
  };
}

/**
 * Produce a region crop scaled to targetSize×targetSize.
 * Used by multi-scale detection to zoom into image quadrants.
 */
export async function extractRegion(
  buffer: Buffer,
  region: { left: number; top: number; width: number; height: number },
  targetSize = 640,
): Promise<Buffer> {
  return sharp(buffer)
    .extract(region)
    .resize(targetSize, targetSize, { fit: 'fill' })
    .jpeg({ quality: 88 })
    .toBuffer();
}

/**
 * Upscale the image by scaleFactor and return the new buffer.
 * Detections on the upscaled image must be divided by scaleFactor to
 * get back to original-image coordinates.
 */
export async function upscaleImage(buffer: Buffer, scaleFactor: number): Promise<Buffer> {
  const meta = await sharp(buffer).metadata();
  const newW = Math.round((meta.width ?? 640) * scaleFactor);
  const newH = Math.round((meta.height ?? 480) * scaleFactor);
  return sharp(buffer)
    .resize(newW, newH, { fit: 'fill', kernel: 'lanczos3' })
    .jpeg({ quality: 90 })
    .toBuffer();
}
