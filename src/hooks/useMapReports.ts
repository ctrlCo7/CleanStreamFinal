import { useState, useEffect, useMemo } from 'react';
import { subscribeToMapReports, subscribeToMyReports } from '../services/reportsService';
import { useAppSelector } from '../store/hooks';
import { WasteReport } from '../types';
import { countBySeverity, reportSeverity, SeverityCount, ZERO_COUNTS } from '../utils/mapUtils';

export interface UseMapReportsResult {
  reports: WasteReport[];
  loading: boolean;
  counts: SeverityCount;
  total: number;
  /** Why the reports couldn't be loaded, in plain words (shown on the map). */
  error: string | null;
  /** Reports received that aren't on the map (cleaned up, or without a GPS position). */
  hiddenCount: number;
}

const explain = (e: Error & { code?: string }): string => {
  const code = String(e.code ?? '').replace(/^firestore\//, '');
  if (code === 'permission-denied') return "Your account isn't allowed to read this barangay's reports. Ask the Super Admin to check your barangay.";
  if (code === 'failed-precondition') return 'The database is still being set up for the map (an index is missing or building). Try again in a few minutes.';
  if (code === 'unavailable') return 'No connection. Reports will appear when you are back online.';
  return `Reports couldn't be loaded (${e.message || code || 'unknown error'}).`;
};

/**
 * Real-time Firestore subscription for map markers: the barangay's open reports, plus the
 * person's own reports wherever they were filed (older reports may carry no barangay, and
 * would otherwise never show). Only reports with a GPS position are mapped, and cleaned-up
 * ones (confirmed by the Captain) drop off. A failed query is reported, never shown as
 * "0 reports".
 */
export function useMapReports(): UseMapReportsResult {
  const [area, setArea] = useState<WasteReport[]>([]);
  const [mine, setMine] = useState<WasteReport[]>([]);
  const [areaLoaded, setAreaLoaded] = useState(false);
  const [mineLoaded, setMineLoaded] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const barangayId = useAppSelector((s) => s.auth.user?.barangayId);
  const uid = useAppSelector((s) => s.auth.user?.uid);

  useEffect(() => {
    setError(null);
    if (!barangayId) { setArea([]); setAreaLoaded(true); return undefined; }
    setAreaLoaded(false);
    return subscribeToMapReports(barangayId, (r) => { setArea(r); setAreaLoaded(true); }, (e) => setError(explain(e)));
  }, [barangayId]);

  useEffect(() => {
    if (!uid) { setMine([]); setMineLoaded(true); return undefined; }
    setMineLoaded(false);
    return subscribeToMyReports(uid, (r) => { setMine(r); setMineLoaded(true); });
  }, [uid]);

  const raw = useMemo(() => {
    const byId = new Map<string, WasteReport>();
    [...area, ...mine].forEach((r) => byId.set(r.id, r));
    return [...byId.values()];
  }, [area, mine]);

  // Only mappable reports (with a GPS position), each with a proper severity so its pin is coloured.
  const reports = useMemo(
    () =>
      raw
        .filter(
          (r) =>
            // Cleaned up and confirmed: off the map.
            r.status !== 'completed' &&
            typeof r.location?.latitude === 'number' &&
            typeof r.location?.longitude === 'number' &&
            !isNaN(r.location.latitude) &&
            !isNaN(r.location.longitude),
        )
        .map((r) => {
          const severity = reportSeverity(r);
          return severity === r.severity ? r : { ...r, severity };
        }),
    [raw],
  );

  const counts = useMemo(
    () => (reports.length > 0 ? countBySeverity(reports.map((r) => r.severity)) : ZERO_COUNTS),
    [reports],
  );

  return {
    reports,
    loading: !(areaLoaded && mineLoaded),
    counts,
    total: reports.length,
    error,
    hiddenCount: raw.length - reports.length,
  };
}
