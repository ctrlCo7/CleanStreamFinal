import {
  collection,
  doc,
  getDoc,
  getDocs,
  setDoc,
  updateDoc,
  query,
  where,
  orderBy,
  serverTimestamp,
  limit,
} from 'firebase/firestore';
import { db } from './firebase';
import { AnalyticsSnapshot, AnalyticsPeriodType, AnalyticsData, WasteType } from '../types';

const COL = 'analytics';

// ─── Period helpers ───────────────────────────────────────────────────────────

export const getDailyPeriodId = (date = new Date()): string =>
  `daily_${date.toISOString().slice(0, 10)}`;

export const getMonthlyPeriodId = (date = new Date()): string =>
  `monthly_${date.toISOString().slice(0, 7)}`;

export const getYearlyPeriodId = (date = new Date()): string =>
  `yearly_${date.getFullYear()}`;

// ─── Read ─────────────────────────────────────────────────────────────────────

export const getAnalyticsSnapshot = async (
  periodId: string,
): Promise<AnalyticsSnapshot | null> => {
  const snap = await getDoc(doc(db, COL, periodId));
  if (!snap.exists()) return null;
  return { id: snap.id, ...snap.data() } as AnalyticsSnapshot;
};

export const getAnalyticsByPeriodType = async (
  periodType: AnalyticsPeriodType,
  limitCount = 12,
): Promise<AnalyticsSnapshot[]> => {
  const q = query(
    collection(db, COL),
    where('periodType', '==', periodType),
    orderBy('date', 'desc'),
    limit(limitCount),
  );
  const snap = await getDocs(q);
  return snap.docs.map((d) => ({ id: d.id, ...d.data() } as AnalyticsSnapshot));
};

export const getCurrentMonthAnalytics = (): Promise<AnalyticsSnapshot | null> =>
  getAnalyticsSnapshot(getMonthlyPeriodId());

export const getCurrentYearAnalytics = (): Promise<AnalyticsSnapshot | null> =>
  getAnalyticsSnapshot(getYearlyPeriodId());

// ─── Write / Compute ──────────────────────────────────────────────────────────

export const computeAndSaveDailySnapshot = async (): Promise<void> => {
  const periodId = getDailyPeriodId();
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const tomorrow = new Date(today);
  tomorrow.setDate(today.getDate() + 1);

  const reportsSnap = await getDocs(collection(db, 'reports'));
  const reports = reportsSnap.docs.map((d) => d.data());

  const todayReports = reports.filter((r) => {
    const ts = r.createdAt?.toDate?.() ?? new Date(r.createdAt);
    return ts >= today && ts < tomorrow;
  });

  const wasteTypeBreakdown: Record<WasteType, number> = {
    plastic: 0,
    organic: 0,
    hazardous: 0,
    metal: 0,
    electronic: 0,
    mixed: 0,
  };

  todayReports.forEach((r) => {
    (r.wasteTypes as WasteType[] | undefined)?.forEach((t) => {
      if (t in wasteTypeBreakdown) wasteTypeBreakdown[t]++;
    });
  });

  const completed = todayReports.filter((r) => r.status === 'completed').length;
  const total = todayReports.length;

  const snapshot: Omit<AnalyticsSnapshot, 'id'> = {
    period: periodId,
    periodType: 'daily',
    date: today.toISOString(),
    totalReports: total,
    pendingReports: todayReports.filter((r) => r.status === 'pending').length,
    verifiedReports: todayReports.filter((r) => r.status === 'verified').length,
    assignedReports: todayReports.filter((r) => r.status === 'assigned').length,
    completedReports: completed,
    rejectedReports: todayReports.filter((r) => r.status === 'rejected').length,
    criticalReports: todayReports.filter((r) => r.severity === 'critical').length,
    highReports: todayReports.filter((r) => r.severity === 'high').length,
    moderateReports: todayReports.filter((r) => r.severity === 'moderate').length,
    lowReports: todayReports.filter((r) => r.severity === 'low').length,
    resolutionRate: total > 0 ? Math.round((completed / total) * 100) : 0,
    avgResponseTimeHours: 0,
    totalCleanupTasks: 0,
    completedTasks: 0,
    totalEvents: 0,
    activeUsers: 0,
    newUsers: 0,
    wasteCollectedKg: 0,
    hazardousReports: todayReports.filter((r) => r.aiAnalysis?.hazardousDetected).length,
    barangayStats: [],
    wasteTypeBreakdown,
    aiStats: {
      totalScans: todayReports.filter((r) => r.aiAnalysis).length,
      avgConfidence: 0,
      hazardousFlags: 0,
      modelVersion: '',
    },
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  };

  await setDoc(doc(db, COL, periodId), { ...snapshot, updatedAt: serverTimestamp() });
};

// ─── Dashboard aggregation (for screens) ─────────────────────────────────────

export const buildDashboardAnalytics = async (): Promise<AnalyticsData> => {
  const reportsSnap = await getDocs(collection(db, 'reports'));
  const reports = reportsSnap.docs.map((d) => d.data());

  const totalReports = reports.length;
  const criticalCount = reports.filter((r) => r.severity === 'critical').length;
  const highCount = reports.filter((r) => r.severity === 'high').length;
  const pendingCount = reports.filter((r) => r.status === 'pending').length;
  const resolvedCount = reports.filter((r) => r.status === 'completed').length;
  const hazardousCount = reports.filter((r) => r.aiAnalysis?.hazardousDetected).length;

  const now = new Date();
  const monthlyData = Array.from({ length: 6 }, (_, i) => {
    const d = new Date(now.getFullYear(), now.getMonth() - (5 - i), 1);
    const label = d.toLocaleString('default', { month: 'short' });
    const count = reports.filter((r) => {
      const ts = r.createdAt?.toDate?.() ?? new Date(r.createdAt);
      return ts.getMonth() === d.getMonth() && ts.getFullYear() === d.getFullYear();
    }).length;
    return { month: label, count };
  });

  const wasteTypeCounts: Record<string, number> = {};
  reports.forEach((r) => {
    (r.wasteTypes as string[] | undefined)?.forEach((t) => {
      wasteTypeCounts[t] = (wasteTypeCounts[t] ?? 0) + 1;
    });
  });

  const colors: Record<string, string> = {
    plastic: '#4FC3F7',
    organic: '#81C784',
    hazardous: '#E57373',
    metal: '#9E9E9E',
    electronic: '#BA68C8',
    mixed: '#FFB74D',
  };

  const wasteTypeDistribution = Object.entries(wasteTypeCounts).map(([type, count]) => ({
    type: type as WasteType,
    percentage: totalReports > 0 ? Math.round((count / totalReports) * 100) : 0,
    label: type.charAt(0).toUpperCase() + type.slice(1),
    color: colors[type] ?? '#90A4AE',
  }));

  const barangayCounts: Record<string, { name: string; count: number }> = {};
  reports.forEach((r) => {
    if (r.barangay) {
      barangayCounts[r.barangay] = {
        name: r.barangay,
        count: (barangayCounts[r.barangay]?.count ?? 0) + 1,
      };
    }
  });

  const barangayPollution = Object.values(barangayCounts)
    .sort((a, b) => b.count - a.count)
    .slice(0, 5)
    .map((b) => ({
      name: b.name,
      percentage: totalReports > 0 ? Math.round((b.count / totalReports) * 100) : 0,
    }));

  const scannedReports = reports.filter((r) => r.aiAnalysis);
  const avgConfidence =
    scannedReports.length > 0
      ? Math.round(
          scannedReports.reduce((s, r) => s + (r.aiAnalysis?.confidence ?? 0), 0) /
            scannedReports.length,
        )
      : 0;

  return {
    totalReports,
    criticalCount,
    highCount,
    pendingCount,
    resolvedCount,
    resolutionRate: totalReports > 0 ? Math.round((resolvedCount / totalReports) * 100) : 0,
    avgResponseHours: 0,
    hazardousCount,
    monthlyData,
    wasteTypeDistribution,
    barangayPollution,
    aiStats: {
      totalScans: scannedReports.length,
      avgConfidence,
      hazardousFlags: hazardousCount,
      modelVersion: scannedReports[0]?.aiAnalysis?.modelVersion ?? 'v1',
    },
  };
};

export const updateSnapshotField = async (
  periodId: string,
  field: string,
  value: number | string,
): Promise<void> => {
  await updateDoc(doc(db, COL, periodId), {
    [field]: value,
    updatedAt: serverTimestamp(),
  });
};
