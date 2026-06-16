"use strict";
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
var __createBinding = (this && this.__createBinding) || (Object.create ? (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    var desc = Object.getOwnPropertyDescriptor(m, k);
    if (!desc || ("get" in desc ? !m.__esModule : desc.writable || desc.configurable)) {
      desc = { enumerable: true, get: function() { return m[k]; } };
    }
    Object.defineProperty(o, k2, desc);
}) : (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    o[k2] = m[k];
}));
var __setModuleDefault = (this && this.__setModuleDefault) || (Object.create ? (function(o, v) {
    Object.defineProperty(o, "default", { enumerable: true, value: v });
}) : function(o, v) {
    o["default"] = v;
});
var __importStar = (this && this.__importStar) || (function () {
    var ownKeys = function(o) {
        ownKeys = Object.getOwnPropertyNames || function (o) {
            var ar = [];
            for (var k in o) if (Object.prototype.hasOwnProperty.call(o, k)) ar[ar.length] = k;
            return ar;
        };
        return ownKeys(o);
    };
    return function (mod) {
        if (mod && mod.__esModule) return mod;
        var result = {};
        if (mod != null) for (var k = ownKeys(mod), i = 0; i < k.length; i++) if (k[i] !== "default") __createBinding(result, mod, k[i]);
        __setModuleDefault(result, mod);
        return result;
    };
})();
Object.defineProperty(exports, "__esModule", { value: true });
exports.analyzeImage = analyzeImage;
const admin = __importStar(require("firebase-admin"));
const uuid_1 = require("uuid");
const cnnClassification_1 = require("./cnnClassification");
const environmentalScoring_1 = require("./environmentalScoring");
const recommendationEngine_1 = require("./recommendationEngine");
const yoloDetection_1 = require("./yoloDetection");
const db = () => admin.firestore();
// ─── Retry helper ─────────────────────────────────────────────────────────────
async function withRetry(label, fn, maxAttempts = 3, delayMs = 800) {
    let lastError;
    for (let attempt = 1; attempt <= maxAttempts; attempt++) {
        try {
            return await fn();
        }
        catch (err) {
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
async function downloadImage(storagePath) {
    return withRetry('downloadImage', async () => {
        const bucket = admin.storage().bucket();
        const file = bucket.file(storagePath);
        const [buffer] = await file.download();
        return buffer;
    });
}
// ─── Waste type distribution for the mobile result view ───────────────────────
const WASTE_LABELS = {
    plastic_bottle: 'Plastic Bottle',
    plastic_bag: 'Plastic Bag',
    glass_bottle: 'Glass Bottle',
    metal_can: 'Metal / Can',
    paper_waste: 'Paper Waste',
    cardboard: 'Cardboard',
    food_waste: 'Food Waste',
    styrofoam: 'Styrofoam',
    cigarette_butt: 'Cigarette Butt',
    e_waste: 'E-Waste',
    mixed_waste: 'Mixed Waste',
    trash_pile: 'Trash Pile',
};
const WASTE_COLORS = {
    plastic_bottle: '#378ADD',
    plastic_bag: '#54B4E4',
    glass_bottle: '#9B59B6',
    metal_can: '#888780',
    paper_waste: '#F39C12',
    cardboard: '#D35400',
    food_waste: '#639922',
    styrofoam: '#16A085',
    cigarette_butt: '#7F8C8D',
    e_waste: '#E07B3A',
    mixed_waste: '#E74C3C',
    trash_pile: '#922B21',
};
function buildWasteTypeDistribution(detections) {
    if (detections.length === 0) {
        return [{ type: 'mixed_waste', percentage: 100, label: 'Mixed Waste', color: '#E74C3C' }];
    }
    const counts = {};
    detections.forEach((d) => {
        counts[d.wasteType] = (counts[d.wasteType] ?? 0) + 1;
    });
    const total = detections.length;
    return Object.entries(counts)
        .sort(([, a], [, b]) => b - a)
        .map(([type, count]) => ({
        type,
        percentage: Math.round((count / total) * 100),
        label: WASTE_LABELS[type],
        color: WASTE_COLORS[type],
    }));
}
// ─── Update report in Firestore (guaranteed, with retry) ─────────────────────
async function updateReportWithResults(reportId, result, predictionId) {
    if (!reportId)
        return;
    await withRetry('updateReport', () => db().collection('reports').doc(reportId).update({
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
    }));
    console.log(`[imageProcessor] Report ${reportId} updated with AI results.`);
}
// ─── Main pipeline ────────────────────────────────────────────────────────────
async function analyzeImage(request) {
    const { storagePath, reportId, userId } = request;
    const predictionId = (0, uuid_1.v4)();
    const pipelineStart = Date.now();
    console.log(`[imageProcessor] START predictionId=${predictionId} reportId=${reportId} userId=${userId}`);
    try {
        // 1. Download + decode (with retry)
        console.log(`[imageProcessor] Downloading ${storagePath}`);
        const imageBuffer = await downloadImage(storagePath);
        console.log(`[imageProcessor] Downloaded ${imageBuffer.length} bytes in ${Date.now() - pipelineStart}ms`);
        // 2. Multi-scale YOLO detection (includes Phase 5 preprocessing internally)
        console.log('[imageProcessor] Running YOLO detection...');
        const yoloResult = await (0, yoloDetection_1.runYOLODetection)(imageBuffer);
        console.log(`[imageProcessor] YOLO: ${yoloResult.objectCount} objects, coverage=${(yoloResult.coverageRatio * 100).toFixed(1)}%, ${yoloResult.processingTimeMs}ms`);
        // 3. Annotated image → Storage
        const annotatedBuffer = await (0, yoloDetection_1.drawBoundingBoxes)(imageBuffer, yoloResult.detections);
        const processedImageURL = await (0, yoloDetection_1.uploadProcessedImage)(annotatedBuffer, userId, predictionId);
        console.log(`[imageProcessor] Annotated image uploaded: ${processedImageURL}`);
        // 4. CNN classification (passes full yoloResult for density-based severity)
        console.log('[imageProcessor] Running CNN classification...');
        const cnnResult = await (0, cnnClassification_1.runCNNClassification)(imageBuffer, yoloResult.detections, yoloResult);
        console.log(`[imageProcessor] CNN: primary=${cnnResult.primary.category} (${cnnResult.primary.confidence}%), pollutionSeverity=${cnnResult.pollutionSeverity}, ${cnnResult.processingTimeMs}ms`);
        // 5. Environmental risk score (Phase 6)
        const environmental = (0, environmentalScoring_1.computeEnvironmentalScore)(yoloResult);
        console.log(`[imageProcessor] Environmental risk: ${environmental.riskScore}/100 (${environmental.severityLevel})`);
        // 6. Recommendations + legacy severity
        const recommendations = (0, recommendationEngine_1.buildRecommendations)(yoloResult.detections);
        const { score: severityScore, level: severityLevel } = (0, recommendationEngine_1.computeSeverity)(yoloResult.detections, yoloResult.objectCount);
        // Hazardous = e_waste OR cigarette_butt OR any environmental factor
        const hazardousDetected = yoloResult.detections.some((d) => d.wasteType === 'e_waste' || d.wasteType === 'cigarette_butt')
            || environmental.hazardousPresent;
        // 7. Build FullAIResult
        const result = {
            yolo: yoloResult,
            cnn: cnnResult,
            environmental,
            recommendations,
            modelVersion: `COCO-SSD/MobileNetV2-CNN v2.0`,
            confidence: cnnResult.primary.confidence,
            severityScore,
            severityLevel,
            wasteTypes: buildWasteTypeDistribution(yoloResult.detections),
            estimatedVolume: (0, recommendationEngine_1.estimateVolume)(yoloResult.objectCount, environmental),
            spreadArea: (0, recommendationEngine_1.estimateSpreadArea)(yoloResult.objectCount, yoloResult.coverageRatio),
            hazardousDetected,
            teamNeeded: (0, recommendationEngine_1.estimateTeamNeeded)(severityScore),
            cleanupPriority: severityLevel === 'critical'
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
        const doc = {
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
        await withRetry('savePrediction', () => db().collection('aiPredictions').doc(predictionId).set(doc));
        console.log(`[imageProcessor] AIPredictionDoc saved: ${predictionId}`);
        // 9. Update report with AI results (GUARANTEED — awaited with retry)
        await updateReportWithResults(reportId, result, predictionId);
        const totalMs = Date.now() - pipelineStart;
        console.log(`[imageProcessor] DONE in ${totalMs}ms — predictionId=${predictionId}`);
        return { success: true, predictionId, result };
    }
    catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        console.error(`[imageProcessor] FAILED predictionId=${predictionId}: ${message}`);
        // Best-effort: mark report with error state so the app doesn't spin forever
        if (reportId) {
            db()
                .collection('reports')
                .doc(reportId)
                .update({ aiError: message, updatedAt: admin.firestore.FieldValue.serverTimestamp() })
                .catch(() => { });
        }
        return {
            success: false,
            predictionId,
            result: {},
            error: message,
        };
    }
}
//# sourceMappingURL=imageProcessor.js.map