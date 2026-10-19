import * as ImagePicker from 'expo-image-picker';
import { SaveFormat, manipulateAsync } from 'expo-image-manipulator';

export interface CapturedPhoto { uri: string; width: number; height: number }

/** Opens the camera (never the gallery: the photos must be taken live). Null if the user cancels. */
async function launchCamera(front: boolean): Promise<CapturedPhoto | null> {
  const permission = await ImagePicker.requestCameraPermissionsAsync();
  if (!permission.granted) {
    throw new Error('Camera permission is needed to verify your identity. Allow it in your phone settings and try again.');
  }
  const result = await ImagePicker.launchCameraAsync({
    mediaTypes: 'images',
    quality: 0.9,
    allowsEditing: false,
    cameraType: front ? ImagePicker.CameraType.front : ImagePicker.CameraType.back,
  });
  if (result.canceled) return null;
  const asset = result.assets[0];
  return { uri: asset.uri, width: asset.width, height: asset.height };
}

export const captureIdPhoto = () => launchCamera(false);
export const captureSelfie = () => launchCamera(true);

/**
 * Downscales a photo and encodes it as a JPEG data URI no longer than `maxChars`, lowering the
 * quality step by step if needed. The limits keep every image (and so the whole submission)
 * inside Firestore's 1 MiB document size.
 */
export async function toDataUri(photo: CapturedPhoto, maxSide: number, maxChars: number): Promise<string> {
  const scale = maxSide / Math.max(photo.width, photo.height);
  const actions = scale < 1
    ? [{ resize: photo.width >= photo.height ? { width: Math.round(photo.width * scale) } : { height: Math.round(photo.height * scale) } }]
    : [];
  for (const quality of [0.6, 0.5, 0.4, 0.3]) {
    const out = await manipulateAsync(photo.uri, actions, { compress: quality, format: SaveFormat.JPEG, base64: true });
    if (out.base64 && out.base64.length <= maxChars) return `data:image/jpeg;base64,${out.base64}`;
  }
  throw new Error('That photo is too large to upload. Try again with the camera a little further away.');
}
