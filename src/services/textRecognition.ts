import { withTimeout } from '../utils/async';

/**
 * Reads text from a photo on-device (Google ML Kit, bundled model -- no network and
 * no Google Play Services needed). Returns '' if the native module isn't available
 * (e.g. a build made before it was added) or recognition fails or is slow, so hazard
 * label detection is always optional and can never block report analysis.
 */
export async function recognizeText(photoUri: string): Promise<string> {
  try {
    // Required lazily so a missing native module only disables OCR instead of crashing
    // the app at import time.
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const mod = require('@react-native-ml-kit/text-recognition');
    const TextRecognition = mod.default ?? mod;
    const result = await withTimeout<{ text?: string }>(TextRecognition.recognize(photoUri), 8000, 'Text recognition');
    return typeof result?.text === 'string' ? result.text : '';
  } catch (e) {
    console.warn('[OCR] Text recognition unavailable:', e);
    return '';
  }
}
