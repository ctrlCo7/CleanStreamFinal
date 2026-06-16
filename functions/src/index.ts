import * as admin from 'firebase-admin';
import { onCall, HttpsError } from 'firebase-functions/v2/https';
import { onObjectFinalized } from 'firebase-functions/v2/storage';
import { analyzeImage } from './imageProcessor';
import { AnalyzeImageRequest } from './types';

admin.initializeApp();

// ─── Callable: analyzeWasteImage ──────────────────────────────────────────────
// Called from the mobile app via httpsCallable('analyzeWasteImage')
// Request: { storagePath: string; reportId: string; userId: string }
// Response: AnalyzeImageResponse

export const analyzeWasteImage = onCall(
  { timeoutSeconds: 120, memory: '2GiB' },
  async (request) => {
    if (!request.auth) {
      throw new HttpsError('unauthenticated', 'Must be signed in.');
    }

    const { storagePath, reportId, userId } = request.data as AnalyzeImageRequest;
    if (!storagePath || !userId) {
      throw new HttpsError('invalid-argument', 'storagePath and userId are required.');
    }

    console.log(`[analyzeWasteImage] uid=${request.auth.uid} storagePath=${storagePath}`);
    return analyzeImage({ storagePath, reportId: reportId ?? '', userId });
  },
);

// ─── Storage trigger: auto-analyze on upload ──────────────────────────────────
// Fires when a file is uploaded to reports/{reportId}/photo.jpg
// Automatically runs the AI pipeline without needing a callable invocation.

export const onReportPhotoUploaded = onObjectFinalized(async (event) => {
  const filePath = event.data.name ?? '';
  // Only process report photos (reports/{reportId}/photo.jpg)
  if (!filePath.startsWith('reports/') || !filePath.match(/\.(jpg|jpeg|png|webp)$/i)) {
    return;
  }

  // Path: reports/{reportId}/{filename}
  const parts = filePath.split('/');
  if (parts.length < 3) return;

  const reportId = parts[1];

  // Fetch the userId from Firestore — it's not in the storage path
  const reportSnap = await admin.firestore().collection('reports').doc(reportId).get();
  if (!reportSnap.exists) {
    console.warn(`[onReportPhotoUploaded] Report ${reportId} not found in Firestore`);
    return;
  }
  const userId = (reportSnap.data() as { userId?: string }).userId;
  if (!userId) {
    console.warn(`[onReportPhotoUploaded] No userId on report ${reportId}`);
    return;
  }

  console.log(`[onReportPhotoUploaded] Processing ${filePath} for user ${userId}`);
  await analyzeImage({ storagePath: filePath, reportId, userId });
});
