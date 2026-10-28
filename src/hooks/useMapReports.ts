import { useState, useEffect, useMemo } from 'react';
import { subscribeToBarangayReports, subscribeToReports } from '../services/reportsService';
import { isBarangayBound } from '../services/assignmentRules';
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
 * Barangay officials and cleanup crews only get their own barangay's reports.
 */
export function useMapReports(): UseMapReportsResult {
  const [raw, setRaw] = useState<WasteReport[]>([]);
  const [loading, setLoading] = useState(true);
  const role = useAppSelector((s) => s.auth.user?.role);
  const barangayId = useAppSelector((s) => s.auth.user?.barangayId);

  useEffect(() => {
    const onReports = (incoming: WasteReport[]) => {
      setRaw(incoming);
      setLoading(false);
    };
    if (isBarangayBound(role)) {
      if (!barangayId) { onReports([]); return undefined; }
      return subscribeToBarangayReports(barangayId, onReports);
    }
    // No userId arg → subscribes to all reports (public map view)
    return subscribeToReports(onReports);
  }, [role, barangayId]);

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
