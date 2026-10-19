import * as ImagePicker from 'expo-image-picker';
import { SaveFormat, manipulateAsync } from 'expo-image-manipulator';

/**
 * Opens the camera for a cleanup task photo (live camera only, never the gallery, so a "before" or
 * "after" photo is really of the site) and shrinks it to a size that uploads quickly on mobile data.
 * Returns the local file URI, or null if the user cancelled.
 */
export async function captureTaskPhoto(): Promise<string | null> {
  const permission = await ImagePicker.requestCameraPermissionsAsync();
  if (!permission.granted) {
    throw new Error('Camera permission is needed to take cleanup photos. Allow it in your phone settings and try again.');
  }
  const result = await ImagePicker.launchCameraAsync({ mediaTypes: 'images', quality: 0.8, allowsEditing: false });
  if (result.canceled) return null;
  const asset = result.assets[0];
  try {
    const resized = await manipulateAsync(asset.uri, [{ resize: { width: 1280 } }], { compress: 0.7, format: SaveFormat.JPEG });
    return resized.uri;
  } catch {
    return asset.uri;
  }
}
