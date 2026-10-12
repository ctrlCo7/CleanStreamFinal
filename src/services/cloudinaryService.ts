/**
 * Cloudinary replaces Firebase Storage for every photo/image upload in this
 * app. Firebase's default Storage bucket now requires linking a billing
 * account (the Blaze plan) just to provision it at all, even though usage
 * within the free quota costs $0 -- Cloudinary's free tier needs no card on
 * file, so it's the actual no-cost option for a project that otherwise runs
 * entirely on Firebase's free Spark plan (Firestore + Auth).
 *
 * Uses Cloudinary's unsigned upload endpoint directly from the client, with
 * no backend involved -- matching this app's architecture (no Cloud
 * Functions).
 */
const CLOUD_NAME = 'qqnsh2cn';
const UPLOAD_PRESET = 'tzacbvdk';

// React Native's FormData {uri, type, name} shorthand throws "Unsupported
// FormDataPart implementation" under this app's New Architecture setup --
// reading the file into a real Blob first (same approach this codebase
// already relied on for the Firebase Storage uploads this replaces) avoids
// that native-module incompatibility entirely.
const localUriToBlob = (uri: string): Promise<Blob> =>
  new Promise((resolve, reject) => {
    const xhr = new XMLHttpRequest();
    xhr.onload = () => resolve(xhr.response as Blob);
    xhr.onerror = () => reject(new Error('Failed to read local file'));
    xhr.responseType = 'blob';
    xhr.open('GET', uri, true);
    xhr.send(null);
  });

/**
 * Uploads a local file URI to Cloudinary under the given folder path and
 * returns its public HTTPS URL.
 */
export const uploadToCloudinary = async (
  uri: string,
  folder: string,
  fileName = 'photo.jpg',
): Promise<string> => {
  const blob = await localUriToBlob(uri);
  const formData = new FormData();
  formData.append('file', blob, fileName);
  formData.append('upload_preset', UPLOAD_PRESET);
  formData.append('folder', folder);

  const response = await fetch(`https://api.cloudinary.com/v1_1/${CLOUD_NAME}/image/upload`, {
    method: 'POST',
    body: formData,
  });

  const data = await response.json();
  if (!response.ok) {
    throw new Error(data?.error?.message ?? 'Cloudinary upload failed');
  }
  return data.secure_url as string;
};
