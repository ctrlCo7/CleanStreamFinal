/**
 * Turns face-embedding distances into the advice shown to the reviewer.
 *
 * The distance is the Euclidean distance between two 128-number face descriptors (smaller =
 * more alike). The bands come from measuring this model on real portraits and on simulated
 * ID-card photos: at 0.60 the right person was accepted ~85% of the time per photo (97% when the
 * best of three selfies counts) while a different person was accepted ~0.1% of the time per
 * photo. Real IDs (glare, holograms, worn print) are harder than the simulation, so the result
 * is a prompt for the human reviewer, never a decision.
 */
import { Verification } from './types';

export type FaceVerdict = 'strong' | 'likely' | 'uncertain' | 'mismatch' | 'no-face';
export type SelfieKey = 'neutral' | 'smile' | 'turn';

export const STRONG_MAX = 0.5;
export const LIKELY_MAX = 0.6;
export const UNCERTAIN_MAX = 0.7;
/** Selfies of one person (even turned) should stay below this; above it they may be different people. */
export const SELFIE_CONSISTENCY_MAX = 0.75;

export interface SelfieMatch { step: SelfieKey; faceFound: boolean; distance: number | null }

export interface FaceMatchResult {
  idFaceFound: boolean;
  selfies: SelfieMatch[];
  /** Closest selfie to the ID photo. */
  bestDistance: number | null;
  verdict: FaceVerdict;
  /** Largest distance between any two of the selfies; null if fewer than two had a face. */
  selfieSpread: number | null;
  selfiesConsistent: boolean | null;
  backend: string;
}

export const verdictForDistance = (distance: number): Exclude<FaceVerdict, 'no-face'> => {
  if (distance <= STRONG_MAX) return 'strong';
  if (distance <= LIKELY_MAX) return 'likely';
  if (distance <= UNCERTAIN_MAX) return 'uncertain';
  return 'mismatch';
};

export const summarizeMatch = (
  idFaceFound: boolean,
  selfies: SelfieMatch[],
  selfieSpread: number | null,
  backend: string,
): FaceMatchResult => {
  const distances = selfies.map((s) => s.distance).filter((d): d is number => d !== null);
  const bestDistance = distances.length ? Math.min(...distances) : null;
  return {
    idFaceFound,
    selfies,
    bestDistance,
    verdict: !idFaceFound || bestDistance === null ? 'no-face' : verdictForDistance(bestDistance),
    selfieSpread,
    selfiesConsistent: selfieSpread === null ? null : selfieSpread <= SELFIE_CONSISTENCY_MAX,
    backend,
  };
};

export const VERDICT_TEXT: Record<FaceVerdict, { label: string; detail: string }> = {
  strong: { label: 'Strong match', detail: 'The face on the ID is very similar to the selfies.' },
  likely: { label: 'Likely match', detail: 'The faces are similar. Compare the photos yourself before approving.' },
  uncertain: { label: 'Uncertain', detail: 'The faces are only somewhat alike (age, glare or a worn ID can cause this). Look closely, or reject and ask for clearer photos.' },
  mismatch: { label: 'Does not match', detail: 'The face on the ID does not look like the selfies.' },
  'no-face': { label: 'Could not compare', detail: "A face wasn't found in the ID photo or the selfies, so there is no automatic comparison. Review by eye or ask for clearer photos." },
};

/** Compact record of the automatic comparison, saved with the decision for the audit trail. */
export const matchSummaryForRecord = (r: FaceMatchResult | null) =>
  r
    ? { verdict: r.verdict, bestDistance: r.bestDistance === null ? null : Math.round(r.bestDistance * 100) / 100, selfiesConsistent: r.selfiesConsistent }
    : { verdict: 'not-run' as const, bestDistance: null, selfiesConsistent: null };

export const hasEvidence = (v: Verification | null): v is Verification =>
  !!v && typeof v.idImage === 'string' && v.idImage.length > 0;
