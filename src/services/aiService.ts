/**
 * AI Service — CleanStream CNN Waste Classifier
 *
 * Production integration points:
 *   - Replace runLocalModel() with TensorFlow Lite inference
 *   - Replace runCloudModel() with your hosted YOLO/CNN API endpoint
 *   - Model: CNN v2.4, 5 waste classes, 94%+ accuracy
 *
 * Current state: returns realistic mock results for UI/UX development.
 * Swap the analyze() function body for real inference when the model is ready.
 */

import { AIAnalysisResult, SeverityLevel, WasteClassification } from '../types';

const WASTE_COLORS: Record<string, string> = {
  plastic: '#378ADD',
  organic: '#639922',
  hazardous: '#C0392B',
  metal: '#888780',
  electronic: '#E07B3A',
};

const WASTE_LABELS: Record<string, string> = {
  plastic: '🧴 Plastic',
  organic: '🌿 Organic',
  hazardous: '⚠️ Hazardous',
  metal: '🔩 Metal',
  electronic: '📱 Electronic',
};

const getSeverityLevel = (score: number): SeverityLevel => {
  if (score >= 85) return 'critical';
  if (score >= 65) return 'high';
  if (score >= 40) return 'moderate';
  return 'low';
};

const getCleanupPriority = (severity: SeverityLevel): string => {
  switch (severity) {
    case 'critical': return 'CRITICAL — Specialist team, immediate dispatch';
    case 'high': return 'HIGH — Standard team, same-day dispatch';
    case 'moderate': return 'MODERATE — Schedule within 48 hours';
    case 'low': return 'LOW — Routine cleanup schedule';
  }
};

const getTeamNeeded = (volume: number, hazardous: boolean): string => {
  if (hazardous) return '8–10 workers (hazmat)';
  if (volume > 4) return '6–8 workers';
  if (volume > 2) return '4–6 workers';
  return '2–4 workers';
};

// Simulates CNN model inference — replace with real TFLite / API call
const simulateModelInference = (photoUri: string): Promise<{
  classes: { plastic: number; organic: number; hazardous: number; metal: number; electronic: number };
  volumeM3: number;
  spreadAreaM2: number;
  severityScore: number;
  confidence: number;
}> => {
  return new Promise((resolve) => {
    // Simulate 1.5s processing time
    setTimeout(() => {
      // Randomised but realistic outputs for demo
      const seed = photoUri.length % 100;
      const plastic = Math.max(35, Math.min(80, 50 + (seed % 30)));
      const organic = Math.max(5, Math.min(25, 15 - (seed % 10)));
      const hazardous = seed > 60 ? Math.max(5, Math.min(18, seed % 15)) : 0;
      const metal = Math.max(2, Math.min(10, seed % 8));
      const electronic = Math.max(1, Math.min(5, (seed % 4) + 1));
      const total = plastic + organic + hazardous + metal + electronic;

      resolve({
        classes: {
          plastic: Math.round((plastic / total) * 100),
          organic: Math.round((organic / total) * 100),
          hazardous: Math.round((hazardous / total) * 100),
          metal: Math.round((metal / total) * 100),
          electronic: Math.round((electronic / total) * 100),
        },
        volumeM3: parseFloat((1.5 + (seed % 40) / 10).toFixed(1)),
        spreadAreaM2: parseFloat((8 + (seed % 25)).toFixed(0)),
        severityScore: hazardous > 0 ? 72 + (seed % 20) : 30 + (seed % 45),
        confidence: parseFloat((91 + (seed % 8)).toFixed(1)),
      });
    }, 1500);
  });
};

export const analyzeWastePhoto = async (
  photoUri: string,
): Promise<AIAnalysisResult> => {
  const result = await simulateModelInference(photoUri);
  const { classes, volumeM3, spreadAreaM2, severityScore, confidence } = result;

  const wasteTypes: WasteClassification[] = Object.entries(classes)
    .filter(([, pct]) => pct > 0)
    .sort(([, a], [, b]) => b - a)
    .map(([type, pct]) => ({
      type: type as WasteClassification['type'],
      percentage: pct,
      label: WASTE_LABELS[type],
      color: WASTE_COLORS[type],
    }));

  const severityLevel = getSeverityLevel(severityScore);

  return {
    modelVersion: 'CNN v2.4',
    confidence,
    severityScore,
    severityLevel,
    wasteTypes,
    estimatedVolume: volumeM3,
    spreadArea: spreadAreaM2,
    hazardousDetected: (classes.hazardous || 0) > 0,
    teamNeeded: getTeamNeeded(volumeM3, (classes.hazardous || 0) > 0),
    cleanupPriority: getCleanupPriority(severityLevel),
    timestamp: new Date().toISOString(),
  };
};

// Placeholder for future TensorFlow Lite on-device inference
export const loadLocalModel = async (): Promise<void> => {
  // TODO: Load TFLite model from assets/models/waste_classifier_v24.tflite
  // const model = await tf.loadLayersModel('...');
  console.log('[AI] Local model placeholder — integrate TFLite here');
};
