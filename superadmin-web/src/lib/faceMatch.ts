/**
 * Compares the face on an applicant's ID with their selfies, entirely inside the reviewer's
 * browser (the photos are never sent to a third-party service). Uses face-api's open models,
 * served from this site's own /models folder, and is loaded only when a review is opened so
 * the rest of the portal stays small and fast.
 */
import { FaceMatchResult, SelfieKey, SelfieMatch, summarizeMatch } from './faceVerdict';
import { Verification } from './types';

type FaceApi = typeof import('@vladmandic/face-api');

const MODEL_URL = `${import.meta.env.BASE_URL}models`;
// Only set by the automated browser tests, which have no GPU.
const FORCED_BACKEND = import.meta.env.VITE_FACE_BACKEND as string | undefined;
const OVERALL_TIMEOUT_MS = 150_000;

let loading: Promise<{ faceapi: FaceApi; backend: string }> | null = null;

async function load(): Promise<{ faceapi: FaceApi; backend: string }> {
  if (!loading) {
    loading = (async () => {
      const faceapi = await import('@vladmandic/face-api');
      // The library's bundled TensorFlow.js is only partly typed, so describe the three calls used.
      const tf = faceapi.tf as unknown as { setBackend(name: string): Promise<boolean>; ready(): Promise<void>; getBackend(): string };
      let backend = '';
      for (const candidate of FORCED_BACKEND ? [FORCED_BACKEND] : ['webgl', 'cpu']) {
        try {
          if (await tf.setBackend(candidate)) {
            await tf.ready();
            backend = tf.getBackend();
            break;
          }
        } catch {
          // try the next backend
        }
      }
      if (!backend) throw new Error("This browser can't run the face comparison. Try a recent Chrome, Edge or Firefox.");
      await Promise.all([
        faceapi.nets.ssdMobilenetv1.loadFromUri(MODEL_URL),
        faceapi.nets.faceLandmark68Net.loadFromUri(MODEL_URL),
        faceapi.nets.faceRecognitionNet.loadFromUri(MODEL_URL),
      ]);
      return { faceapi, backend };
    })().catch((e) => { loading = null; throw e; });
  }
  return loading;
}

const loadImage = (dataUri: string): Promise<HTMLImageElement> =>
  new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => resolve(img);
    img.onerror = () => reject(new Error('A photo could not be displayed.'));
    img.src = dataUri;
  });

/** The descriptor of the largest face in the image (the ID's main portrait, not a small ghost image), or null. */
async function mainFaceDescriptor(faceapi: FaceApi, dataUri: string): Promise<Float32Array | null> {
  const img = await loadImage(dataUri);
  const faces = await faceapi
    .detectAllFaces(img, new faceapi.SsdMobilenetv1Options({ minConfidence: 0.4 }))
    .withFaceLandmarks()
    .withFaceDescriptors();
  if (faces.length === 0) return null;
  const area = (f: (typeof faces)[number]) => f.detection.box.width * f.detection.box.height;
  return faces.reduce((a, b) => (area(b) > area(a) ? b : a)).descriptor;
}

export async function compareIdToSelfies(v: Verification, onProgress: (message: string) => void): Promise<FaceMatchResult> {
  const work = async (): Promise<FaceMatchResult> => {
    onProgress('Loading the face model…');
    const { faceapi, backend } = await load();

    onProgress('Reading the face on the ID…');
    const idDescriptor = await mainFaceDescriptor(faceapi, v.idImage);

    const selfieSources: Array<[SelfieKey, string]> = [['neutral', v.selfieNeutral], ['smile', v.selfieSmile], ['turn', v.selfieTurn]];
    const descriptors: Array<Float32Array | null> = [];
    const selfies: SelfieMatch[] = [];
    for (const [step, uri] of selfieSources) {
      onProgress(`Comparing selfie ${selfies.length + 1} of ${selfieSources.length}…`);
      const d = uri ? await mainFaceDescriptor(faceapi, uri) : null;
      descriptors.push(d);
      selfies.push({ step, faceFound: d !== null, distance: d && idDescriptor ? faceapi.euclideanDistance(idDescriptor, d) : null });
    }

    let spread: number | null = null;
    const found = descriptors.filter((d): d is Float32Array => d !== null);
    for (let i = 0; i < found.length; i++) {
      for (let j = i + 1; j < found.length; j++) {
        const dist = faceapi.euclideanDistance(found[i], found[j]);
        spread = spread === null ? dist : Math.max(spread, dist);
      }
    }
    return summarizeMatch(idDescriptor !== null, selfies, spread, backend);
  };

  return Promise.race([
    work(),
    new Promise<never>((_, reject) => setTimeout(() => reject(new Error('The comparison took too long. You can still review the photos by eye.')), OVERALL_TIMEOUT_MS)),
  ]);
}
