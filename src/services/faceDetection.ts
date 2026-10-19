import { withTimeout } from '../utils/async';
import { FaceReading } from './identityChecks';

interface MlKitFace {
  frame: { width: number; height: number };
  rotationY: number;
  smilingProbability?: number;
  leftEyeOpenProbability?: number;
  rightEyeOpenProbability?: number;
}

/**
 * Finds faces in a photo on-device (Google ML Kit, bundled model: no network, no Google Play
 * Services needed). Returns null when detection isn't available (e.g. an app build made before
 * the native module was added, or the detector failed), so callers can fall back to leaving
 * the check to the human reviewer instead of blocking sign-up.
 */
export async function detectFaces(uri: string, imageWidth: number, imageHeight: number): Promise<FaceReading[] | null> {
  try {
    // Required lazily so a missing native module only disables the check instead of crashing at import.
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const mod = require('@react-native-ml-kit/face-detection');
    const FaceDetection = mod.default ?? mod;
    const faces = await withTimeout<MlKitFace[]>(
      FaceDetection.detect(uri, {
        performanceMode: 'accurate',
        classificationMode: 'all',
        landmarkMode: 'none',
        contourMode: 'none',
        minFaceSize: 0.05,
      }),
      15000,
      'Face detection',
    );
    const imageArea = imageWidth * imageHeight;
    return faces.map((f) => {
      const left = f.leftEyeOpenProbability;
      const right = f.rightEyeOpenProbability;
      return {
        areaRatio: imageArea > 0 ? (f.frame.width * f.frame.height) / imageArea : 0,
        yaw: f.rotationY,
        smile: typeof f.smilingProbability === 'number' ? f.smilingProbability : null,
        eyesOpen: typeof left === 'number' && typeof right === 'number' ? Math.min(left, right) : null,
      };
    });
  } catch (e) {
    console.warn('[Identity] Face detection unavailable:', e);
    return null;
  }
}
