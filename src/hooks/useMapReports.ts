import { useState, useEffect, useMemo } from 'react';
import { subscribeToBarangayReports } from '../services/reportsService';
import { useAppSelector } from '../store/hooks';
import { WasteReport } from '../types';
import { countBySeverity, SeverityCount, ZERO_COUNTS } from '../utils/mapUtils';

export interface UseMapReportsResult {
  reports: WasteReport[];
  loading: boolean;
  counts: SeverityCount;
  total: number;
}

/**
 * Real-time Firestore subscription for map markers.
 * Only returns reports that have valid GPS coordinates.
 * Automatically updates when any report's severity changes in Firestore.
 * Everyone only gets their own barangay's reports (the rules allow nothing else).
 */
export function useMapReports(): UseMapReportsResult {
  const [raw, setRaw] = useState<WasteReport[]>([]);
  const [loading, setLoading] = useState(true);
  const barangayId = useAppSelector((s) => s.auth.user?.barangayId);

  useEffect(() => {
    const onReports = (incoming: WasteReport[]) => {
      setRaw(incoming);
      setLoading(false);
    };
    if (!barangayId) { onReports([]); return undefined; }
    return subscribeToBarangayReports(barangayId, onReports);
  }, [barangayId]);

  // Filter to only mappable reports (have GPS coords) — memoized to avoid allocation on every render
  const reports = useMemo(
    () =>
      raw.filter(
        (r) =>
          typeof r.location?.latitude === 'number' &&
          typeof r.location?.longitude === 'number' &&
          !isNaN(r.location.latitude) &&
          !isNaN(r.location.longitude),
      ),
    [raw],
  );

  const counts = useMemo(
    () => (reports.length > 0 ? countBySeverity(reports.map((r) => r.severity)) : ZERO_COUNTS),
    [reports],
  );

  return { reports, loading, counts, total: reports.length };
}
