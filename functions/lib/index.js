"use strict";
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
exports.onReportPhotoUploaded = exports.analyzeWasteImage = void 0;
const admin = __importStar(require("firebase-admin"));
const https_1 = require("firebase-functions/v2/https");
const storage_1 = require("firebase-functions/v2/storage");
const imageProcessor_1 = require("./imageProcessor");
admin.initializeApp();
// ─── Callable: analyzeWasteImage ──────────────────────────────────────────────
// Called from the mobile app via httpsCallable('analyzeWasteImage')
// Request: { storagePath: string; reportId: string; userId: string }
// Response: AnalyzeImageResponse
exports.analyzeWasteImage = (0, https_1.onCall)({ timeoutSeconds: 120, memory: '2GiB' }, async (request) => {
    if (!request.auth) {
        throw new https_1.HttpsError('unauthenticated', 'Must be signed in.');
    }
    const { storagePath, reportId, userId } = request.data;
    if (!storagePath || !userId) {
        throw new https_1.HttpsError('invalid-argument', 'storagePath and userId are required.');
    }
    console.log(`[analyzeWasteImage] uid=${request.auth.uid} storagePath=${storagePath}`);
    return (0, imageProcessor_1.analyzeImage)({ storagePath, reportId: reportId ?? '', userId });
});
// ─── Storage trigger: auto-analyze on upload ──────────────────────────────────
// Fires when a file is uploaded to reports/{reportId}/photo.jpg
// Automatically runs the AI pipeline without needing a callable invocation.
exports.onReportPhotoUploaded = (0, storage_1.onObjectFinalized)(async (event) => {
    const filePath = event.data.name ?? '';
    // Only process report photos (reports/{reportId}/photo.jpg)
    if (!filePath.startsWith('reports/') || !filePath.match(/\.(jpg|jpeg|png|webp)$/i)) {
        return;
    }
    // Path: reports/{reportId}/{filename}
    const parts = filePath.split('/');
    if (parts.length < 3)
        return;
    const reportId = parts[1];
    // Fetch the userId from Firestore — it's not in the storage path
    const reportSnap = await admin.firestore().collection('reports').doc(reportId).get();
    if (!reportSnap.exists) {
        console.warn(`[onReportPhotoUploaded] Report ${reportId} not found in Firestore`);
        return;
    }
    const userId = reportSnap.data().userId;
    if (!userId) {
        console.warn(`[onReportPhotoUploaded] No userId on report ${reportId}`);
        return;
    }
    console.log(`[onReportPhotoUploaded] Processing ${filePath} for user ${userId}`);
    await (0, imageProcessor_1.analyzeImage)({ storagePath: filePath, reportId, userId });
});
//# sourceMappingURL=index.js.map