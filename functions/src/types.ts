// ─── Shared AI types — Cloud Functions + mobile app ───────────────────────────

// PHASE 2: Expanded waste types — added styrofoam, cigarette_butt, trash_pile
export type WasteType =
  | 'plastic_bottle'
  | 'plastic_bag'
  | 'glass_bottle'
  | 'metal_can'
  | 'paper_waste'
  | 'cardboard'
  | 'food_waste'
  | 'styrofoam'
  | 'cigarette_butt'
  | 'e_waste'
  | 'mixed_waste'
  | 'trash_pile';

// PHASE 3: Expanded CNN categories — added waterway/pollution severity classes
export type WasteCategory =
  | 'recyclable'
  | 'non_recyclable'
  | 'organic'
  | 'hazardous'
  | 'electronic'
  | 'waterway_pollution'
  | 'severe_pollution'
  | 'moderate_pollution'
  | 'low_pollution';

export type SeverityLevel = 'critical' | 'high' | 'moderate' | 'low';

// ─── YOLO Detection ────────────────────────────────────────────────────────────

export interface BoundingBox {
  x: number;
  y: number;
  width: number;
  height: number;
}

export interface YOLODetection {
  label: string;
  wasteType: WasteType;
  confidence: number;
  bbox: BoundingBox;
  color: string;
  area?: number; // bbox area in pixels — used for density scoring
}

export interface YOLOResult {
  detections: YOLODetection[];
  objectCount: number;
  imageWidth: number;
  imageHeight: number;
  coverageRatio: number;   // total bbox area / image area (0–1)
  densityScore: number;    // objects per 10k pixels
  processingTimeMs: number;
}

// ─── CNN Classification ────────────────────────────────────────────────────────

export interface CNNClassScore {
  category: WasteCategory;
  confidence: number;
  label: string;
}

export interface CNNResult {
  primary: CNNClassScore;
  scores: CNNClassScore[];
  pollutionSeverity: SeverityLevel;
  environmentalImpact: 'minimal' | 'low' | 'moderate' | 'high' | 'severe';
  modelVersion: string;
  processingTimeMs: number;
}

// ─── Environmental Scoring ────────────────────────────────────────────────────

export interface EnvironmentalScore {
  riskScore: number;           // 0–100
  severityLevel: SeverityLevel;
  coverageRatio: number;       // 0–1: fraction of image covered by waste
  densityClass: 'sparse' | 'moderate' | 'dense' | 'severe';
  hazardousPresent: boolean;
  estimatedCleanupHours: number;
  waterBodyAffected: boolean;
  factors: {
    objectCountScore: number;   // 0–25
    densityScore: number;       // 0–25
    hazardScore: number;        // 0–25
    coverageScore: number;      // 0–25
  };
}

// ─── Recommendations ──────────────────────────────────────────────────────────

export interface DisposalRecommendation {
  wasteType: WasteType;
  wasteLabel: string;
  category: WasteCategory;
  action: string;
  facility: string;
  urgency: 'immediate' | 'scheduled' | 'routine';
  icon: string;
}

// ─── Preprocessing ────────────────────────────────────────────────────────────

export interface PreprocessingResult {
  buffer: Buffer;
  originalWidth: number;
  originalHeight: number;
  processedWidth: number;
  processedHeight: number;
  processingTimeMs: number;
}

// ─── Full AI Result ───────────────────────────────────────────────────────────

export interface FullAIResult {
  yolo: YOLOResult;
  cnn: CNNResult;
  environmental: EnvironmentalScore;
  recommendations: DisposalRecommendation[];

  // Aggregated fields (mirrored to mobile AIAnalysisResult)
  modelVersion: string;
  confidence: number;
  severityScore: number;
  severityLevel: SeverityLevel;
  wasteTypes: Array<{
    type: string;
    percentage: number;
    label: string;
    color: string;
  }>;
  estimatedVolume: number;
  spreadArea: number;
  hazardousDetected: boolean;
  teamNeeded: string;
  cleanupPriority: string;
  timestamp: string;
  objectCount: number;
  coverageRatio: number;
  environmentalImpact: string;

  // Storage paths
  originalImagePath: string;
  processedImagePath: string;
  processedImageURL: string;
}

// ─── Firestore document ───────────────────────────────────────────────────────

export interface AIPredictionDoc {
  predictionId: string;
  reportId: string;
  userId: string;
  originalImagePath: string;
  processedImageURL: string;
  yolo: YOLOResult;
  cnn: CNNResult;
  environmental: EnvironmentalScore;
  recommendations: DisposalRecommendation[];
  severityScore: number;
  severityLevel: SeverityLevel;
  wasteCategory: WasteCategory;
  confidence: number;
  objectCount: number;
  coverageRatio: number;
  hazardousDetected: boolean;
  createdAt: FirebaseFirestore.Timestamp;
}

// ─── Callable Function I/O ────────────────────────────────────────────────────

export interface AnalyzeImageRequest {
  storagePath: string;
  reportId: string;
  userId: string;
}

export interface AnalyzeImageResponse {
  success: boolean;
  predictionId: string;
  result: FullAIResult;
  error?: string;
}
