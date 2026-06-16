import { SeverityLevel } from '../types';

// ─── Spec-exact severity colours ─────────────────────────────────────────────
// AI Score 0–25 → low | 26–50 → moderate | 51–75 → high | 76–100 → critical

export const SEVERITY_COLORS: Record<SeverityLevel, string> = {
  low:      '#22C55E',
  moderate: '#EAB308',
  high:     '#F97316',
  critical: '#EF4444',
};

export const SEVERITY_BG: Record<SeverityLevel, string> = {
  low:      '#F0FDF4',
  moderate: '#FEFCE8',
  high:     '#FFF7ED',
  critical: '#FEF2F2',
};

export const SEVERITY_EMOJIS: Record<SeverityLevel, string> = {
  low:      '🟢',
  moderate: '🟡',
  high:     '🟠',
  critical: '🔴',
};

export const SEVERITY_LABELS: Record<SeverityLevel, string> = {
  low:      'Low Risk',
  moderate: 'Moderate Risk',
  high:     'High Risk',
  critical: 'Critical Risk',
};

const SEVERITY_RANK: Record<SeverityLevel, number> = {
  low: 0, moderate: 1, high: 2, critical: 3,
};

/**
 * Returns the hex marker colour for a severity level.
 * Falls back to low (green) for unknown/missing values.
 */
export function getMarkerColor(severity: SeverityLevel | string | undefined): string {
  if (!severity) return SEVERITY_COLORS.low;
  return SEVERITY_COLORS[severity as SeverityLevel] ?? SEVERITY_COLORS.low;
}

/**
 * Derives the AI severity level from a numeric score (0–100).
 * Matches Cloud Functions computeSeverity thresholds.
 */
export function severityFromScore(score: number): SeverityLevel {
  if (score >= 76) return 'critical';
  if (score >= 51) return 'high';
  if (score >= 26) return 'moderate';
  return 'low';
}

/**
 * For a cluster of reports, returns the colour of the highest-severity member.
 * Ensures a cluster containing any critical report is always red.
 */
export function getClusterColor(severities: Array<SeverityLevel | string | undefined>): string {
  if (severities.length === 0) return SEVERITY_COLORS.low;
  const highest = severities.reduce<SeverityLevel>((acc, sev) => {
    const s = (sev as SeverityLevel) || 'low';
    return (SEVERITY_RANK[s] ?? 0) > (SEVERITY_RANK[acc] ?? 0) ? s : acc;
  }, 'low');
  return SEVERITY_COLORS[highest];
}

// ─── Analytics helpers ────────────────────────────────────────────────────────

export interface SeverityCount {
  low:      number;
  moderate: number;
  high:     number;
  critical: number;
}

export const ZERO_COUNTS: SeverityCount = { low: 0, moderate: 0, high: 0, critical: 0 };

export function countBySeverity(
  severities: Array<SeverityLevel | string | undefined>,
): SeverityCount {
  const counts: SeverityCount = { ...ZERO_COUNTS };
  severities.forEach((s) => {
    const level = (s || 'low') as SeverityLevel;
    if (level in counts) counts[level]++;
  });
  return counts;
}

export const ORDERED_SEVERITIES: SeverityLevel[] = ['critical', 'high', 'moderate', 'low'];
