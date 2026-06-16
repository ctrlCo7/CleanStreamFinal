/**
 * PHASE 8 — Improved AI Pipeline Orchestrator
 *
 * Changes from baseline:
 *   • Preprocessing step added before YOLO (Phase 5)
 *   • Environmental scoring integrated (Phase 6)
 *   • Storage download has 3-attempt retry with exponential back-off
 *   • Firestore report update is AWAITED and retried — not fire-and-forget
 *   • Structured console.log with a consistent [imageProcessor] prefix on every message
 *   • FullAIResult now includes environmental, coverageRatio, environmentalImpact
 *   • runCNNClassification receives the full YOLOResult for density-based severity
 */

import * as admin from 'firebase-admin';
import { v4 as uuidv4 } from 'uuid';
import { runCNNClassification } from './cnnClassification';
import { computeEnvironmentalScore } from './environmentalScoring';
import {
  buildRecommendations,
  computeSeverity,
  estimateSpreadArea,
  estimateTeamNeeded,
  estimateVolume,
} from './recommendationEngine';
import {
  AIPredictionDoc,
  AnalyzeImageRequest,
  AnalyzeImageResponse,
  FullAIResult,
  WasteType,
} from './types';
import { drawBoundingBoxes, runYOLODetection, uploadProcessedImage } from './yoloDetection';

const db = () => admin.firestore();

// ─── Retry helper ─────────────────────────────────────────────────────────────

async function withRetry<T>(
  label: string,
  fn: () => Promise<T>,
  maxAttempts = 3,
  delayMs = 800,
): Promise<T> {
  let lastError: unknown;
  for (let attempt = 1; attempt <= maxAttempts; attempt++) {
    try {
      return await fn();
    } catch (err) {
      lastError = err;
      const msg = err instanceof Error ? err.message : String(err);
      console.warn(`[imageProcessor] ${label} attempt ${attempt}/${maxAttempts} failed: ${msg}`);
      if (attempt < maxAttempts) {
        await new Promise((res) => setTimeout(res, delayMs * attempt));
      }
    }
  }
  throw lastError;
}

// ─── Download image from Storage ──────────────────────────────────────────────

async function downloadImage(storagePath: string): Promise<Buffer> {
  return withRetry('downloadImage', async () => {
    const bucket = admin.storage().bucket();
    const file = bucket.file(storagePath);
    const [buffer] = await file.download();
    return buffer;
  });
}

// ─── Waste type distribution for the mobile result view ───────────────────────

const WASTE_LABELS: Record<WasteType, string> = {
  plastic_bottle:  'Plastic Bottle',
  plastic_bag:     'Plastic Bag',
  glass_bottle:    'Glass Bottle',
  metal_can:       'Metal / Can',
  paper_waste:     'Paper Waste',
  cardboard:       'Cardboard',
  food_waste:      'Food Waste',
  styrofoam:       'Styrofoam',
  cigarette_butt:  'Cigarette Butt',
  e_waste:         'E-Waste',
  mixed_waste:     'Mixed Waste',
  trash_pile:      'Trash Pile',
};

const WASTE_COLORS: Record<WasteType, string> = {
  plastic_bottle:  '#378ADD',
  plastic_bag:     '#54B4E4',
  glass_bottle:    '#9B59B6',
  metal_can:       '#888780',
  paper_waste:     '#F39C12',
  cardboard:       '#D35400',
  food_waste:      '#639922',
  styrofoam:       '#16A085',
  cigarette_butt:  '#7F8C8D',
  e_waste:         '#E07B3A',
  mixed_waste:     '#E74C3C',
  trash_pile:      '#922B21',
};

function buildWasteTypeDistribution(
  detections: Array<{ wasteType: WasteType; confidence: number }>,
): FullAIResult['wasteTypes'] {
  if (detections.length === 0) {
    return [{ type: 'mixed_waste', percentage: 100, label: 'Mixed Waste', color: '#E74C3C' }];
  }

  const counts: Partial<Record<WasteType, number>> = {};
  detections.forEach((d) => {
    counts[d.wasteType] = (counts[d.wasteType] ?? 0) + 1;
  });

  const total = detections.length;
  return (Object.entries(counts) as [WasteType, number][])
    .sort(([, a], [, b]) => b - a)
    .map(([type, count]) => ({
      type,
      percentage: Math.round((count / total) * 100),
      label: WASTE_LABELS[type],
      color: WASTE_COLORS[type],
    }));
}

// ─── Update report in Firestore (guaranteed, with retry) ─────────────────────

async function updateReportWithResults(
  reportId: string,
  result: FullAIResult,
  predictionId: string,
): Promise<void> {
  if (!reportId) return;
  await withRetry('updateReport', () =>
    db().collection('reports').doc(reportId).update({
      aiAnalysis: {
        confidence: result.confidence,
        severityScore: result.severityScore,
        severityLevel: result.severityLevel,
        wasteTypes: result.wasteTypes,
        estimatedVolume: result.estimatedVolume,
        spreadArea: result.spreadArea,
        hazardousDetected: result.hazardousDetected,
        teamNeeded: result.teamNeeded,
        cleanupPriority: result.cleanupPriority,
        objectCount: result.objectCount,
        coverageRatio: result.coverageRatio,
        environmentalImpact: result.environmentalImpact,
        environmental: result.environmental,
        processedImageURL: result.processedImageURL,
        predictionId,
        modelVersion: result.modelVersion,
        timestamp: result.timestamp,
      },
      severity: result.severityLevel,
      updatedAt: admin.firestore.FieldValue.serverTimestamp(),
    }),
  );
  console.log(`[imageProcessor] Report ${reportId} updated with AI results.`);
}

// ─── Main pipeline ────────────────────────────────────────────────────────────

export async function analyzeImage(
  request: AnalyzeImageRequest,
): Promise<AnalyzeImageResponse> {
  const { storagePath, reportId, userId } = request;
  const predictionId = uuidv4();
  const pipelineStart = Date.now();

  console.log(`[imageProcessor] START predictionId=${predictionId} reportId=${reportId} userId=${userId}`);

  try {
    // 1. Download + decode (with retry)
    console.log(`[imageProcessor] Downloading ${storagePath}`);
    const imageBuffer = await downloadImage(storagePath);
    console.log(`[imageProcessor] Downloaded ${imageBuffer.length} bytes in ${Date.now() - pipelineStart}ms`);

    // 2. Multi-scale YOLO detection (includes Phase 5 preprocessing internally)
    console.log('[imageProcessor] Running YOLO detection...');
    const yoloResult = await runYOLODetection(imageBuffer);
    console.log(`[imageProcessor] YOLO: ${yoloResult.objectCount} objects, coverage=${(yoloResult.coverageRatio * 100).toFixed(1)}%, ${yoloResult.processingTimeMs}ms`);

    // 3. Annotated image → Storage
    const annotatedBuffer = await drawBoundingBoxes(imageBuffer, yoloResult.detections);
    const processedImageURL = await uploadProcessedImage(annotatedBuffer, userId, predictionId);
    console.log(`[imageProcessor] Annotated image uploaded: ${processedImageURL}`);

    // 4. CNN classification (passes full yoloResult for density-based severity)
    console.log('[imageProcessor] Running CNN classification...');
    const cnnResult = await runCNNClassification(imageBuffer, yoloResult.detections, yoloResult);
    console.log(`[imageProcessor] CNN: primary=${cnnResult.primary.category} (${cnnResult.primary.confidence}%), pollutionSeverity=${cnnResult.pollutionSeverity}, ${cnnResult.processingTimeMs}ms`);

    // 5. Environmental risk score (Phase 6)
    const environmental = computeEnvironmentalScore(yoloResult);
    console.log(`[imageProcessor] Environmental risk: ${environmental.riskScore}/100 (${environmental.severityLevel})`);

    // 6. Recommendations + legacy severity
    const recommendations = buildRecommendations(yoloResult.detections);
    const { score: severityScore, level: severityLevel } = computeSeverity(
      yoloResult.detections,
      yoloResult.objectCount,
    );

    // Hazardous = e_waste OR cigarette_butt OR any environmental factor
    const hazardousDetected =
      yoloResult.detections.some((d) => d.wasteType === 'e_waste' || d.wasteType === 'cigarette_butt')
      || environmental.hazardousPresent;

    // 7. Build FullAIResult
    const result: FullAIResult = {
      yolo: yoloResult,
      cnn: cnnResult,
      environmental,
      recommendations,
      modelVersion: `COCO-SSD/MobileNetV2-CNN v2.0`,
      confidence: cnnResult.primary.confidence,
      severityScore,
      severityLevel,
      wasteTypes: buildWasteTypeDistribution(yoloResult.detections),
      estimatedVolume: estimateVolume(yoloResult.objectCount, environmental),
      spreadArea: estimateSpreadArea(yoloResult.objectCount, yoloResult.coverageRatio),
      hazardousDetected,
      teamNeeded: estimateTeamNeeded(severityScore),
      cleanupPriority:
        severityLevel === 'critical'
          ? 'CRITICAL — Immediate dispatch required'
          : severityLevel === 'high'
            ? 'HIGH — Schedule within 24 hours'
            : severityLevel === 'moderate'
              ? 'MODERATE — Schedule within 48 hours'
              : 'LOW — Routine cleanup schedule',
      timestamp: new Date().toISOString(),
      objectCount: yoloResult.objectCount,
      coverageRatio: yoloResult.coverageRatio,
      environmentalImpact: cnnResult.environmentalImpact,
      originalImagePath: storagePath,
      processedImagePath: `processed/${userId}/${predictionId}/annotated.jpg`,
      processedImageURL,
    };

    // 8. Persist AIPredictionDoc to Firestore
    const doc: AIPredictionDoc = {
      predictionId,
      reportId,
      userId,
      originalImagePath: storagePath,
      processedImageURL,
      yolo: yoloResult,
      cnn: cnnResult,
      environmental,
      recommendations,
      severityScore,
      severityLevel,
      wasteCategory: cnnResult.primary.category,
      confidence: cnnResult.primary.confidence,
      objectCount: yoloResult.objectCount,
      coverageRatio: yoloResult.coverageRatio,
      hazardousDetected,
      createdAt: admin.firestore.Timestamp.now(),
    };

    await withRetry('savePrediction', () =>
      db().collection('aiPredictions').doc(predictionId).set(doc),
    );
    console.log(`[imageProcessor] AIPredictionDoc saved: ${predictionId}`);

    // 9. Update report with AI results (GUARANTEED — awaited with retry)
    await updateReportWithResults(reportId, result, predictionId);

    const totalMs = Date.now() - pipelineStart;
    console.log(`[imageProcessor] DONE in ${totalMs}ms — predictionId=${predictionId}`);

    return { success: true, predictionId, result };
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    console.error(`[imageProcessor] FAILED predictionId=${predictionId}: ${message}`);

    // Best-effort: mark report with error state so the app doesn't spin forever
    if (reportId) {
      db()
        .collection('reports')
        .doc(reportId)
        .update({ aiError: message, updatedAt: admin.firestore.FieldValue.serverTimestamp() })
        .catch(() => { /* ignore update failure in error path */ });
    }

    return {
      success: false,
      predictionId,
      result: {} as FullAIResult,
      error: message,
    };
  }
}
