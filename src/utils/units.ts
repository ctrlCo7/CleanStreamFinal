/** Waste volume, stored in cubic metres: small amounts read better in litres. */
export const formatVolume = (m3: number | undefined | null): string => {
  if (m3 == null || !Number.isFinite(m3) || m3 <= 0) return '—';
  if (m3 < 1) return `≈ ${Math.max(1, Math.round(m3 * 1000))} L`;
  return `≈ ${m3.toFixed(1)} m³`;
};

export const formatArea = (m2: number | undefined | null): string =>
  m2 == null || !Number.isFinite(m2) || m2 <= 0 ? '—' : `≈ ${m2 < 10 ? m2.toFixed(1) : Math.round(m2)} m²`;
