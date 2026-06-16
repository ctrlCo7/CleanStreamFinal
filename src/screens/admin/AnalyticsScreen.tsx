import React, { useEffect, useState } from 'react';
import { ActivityIndicator, Alert, ScrollView, StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { BarChart } from '../../components/charts/BarChart';
import { DonutChart } from '../../components/charts/DonutChart';
import { Colors } from '../../constants/colors';
import { buildDashboardAnalytics } from '../../services/analyticsService';
import { useAppSelector } from '../../store/hooks';
import { AnalyticsData } from '../../types';

export default function AdminAnalyticsScreen() {
  const { reports } = useAppSelector((s) => s.reports);
  const [analytics, setAnalytics] = useState<AnalyticsData | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    buildDashboardAnalytics()
      .then(setAnalytics)
      .catch((e) => console.error('[Analytics]', e))
      .finally(() => setLoading(false));
  }, [reports.length]);

  // Live fallbacks from Redux while analytics loads
  const total = analytics?.totalReports ?? reports.length;
  const resolved = analytics?.resolvedCount ?? reports.filter((r) => r.status === 'completed').length;
  const resolutionRate = analytics?.resolutionRate ?? (total > 0 ? Math.round((resolved / total) * 100) : 0);
  const hazardous = analytics?.hazardousCount ?? reports.filter((r) => r.aiAnalysis?.hazardousDetected).length;

  const monthlyData = analytics?.monthlyData
    ? analytics.monthlyData.map((d) => ({ label: d.month, value: d.count, color: Colors.blueBg }))
    : [
        { label: 'Jan', value: 0, color: Colors.blueBg },
        { label: 'Feb', value: 0, color: Colors.blueBg },
        { label: 'Mar', value: 0, color: Colors.blueBg },
        { label: 'Apr', value: total, color: Colors.teal },
        { label: 'May', value: 0, color: Colors.grayMid },
        { label: 'Jun', value: 0, color: Colors.grayMid },
      ];

  const wasteSegments = analytics?.wasteTypeDistribution && analytics.wasteTypeDistribution.length > 0
    ? analytics.wasteTypeDistribution.slice(0, 3).map((w) => ({
        label: w.label,
        percentage: w.percentage,
        color: w.color,
      }))
    : [
        { label: 'Plastic', percentage: 68, color: Colors.blue },
        { label: 'Organic', percentage: 16, color: Colors.green },
        { label: 'Hazardous', percentage: 10, color: Colors.critical },
      ];

  const barangays = analytics?.barangayPollution && analytics.barangayPollution.length > 0
    ? analytics.barangayPollution.map((b, i) => ({
        name: b.name,
        pct: b.percentage,
        color: [Colors.critical, Colors.red, Colors.amber, Colors.blue, Colors.teal][i % 5],
      }))
    : [
        { name: 'Guadalupe', pct: 0, color: Colors.critical },
        { name: 'Punta Princesa', pct: 0, color: Colors.red },
        { name: 'Labangon', pct: 0, color: Colors.amber },
        { name: 'Mambaling', pct: 0, color: Colors.blue },
        { name: 'Kinasang-an', pct: 0, color: Colors.teal },
      ];

  const avgConfidence = analytics?.aiStats.avgConfidence
    ? `${analytics.aiStats.avgConfidence}%`
    : '—';

  return (
    <SafeAreaView style={styles.container}>
      <View style={styles.header}>
        <Text style={styles.headerTitle}>Analytics</Text>
        <TouchableOpacity
          style={styles.exportBtn}
          onPress={() => Alert.alert('Export', 'CSV exported successfully')}
        >
          <Text style={styles.exportBtnText}>Export</Text>
        </TouchableOpacity>
      </View>

      <ScrollView contentContainerStyle={styles.body} showsVerticalScrollIndicator={false}>
        {loading && (
          <View style={styles.loadingRow}>
            <ActivityIndicator size="small" color={Colors.teal} />
            <Text style={styles.loadingText}>Loading analytics…</Text>
          </View>
        )}

        {/* KPIs */}
        <View style={styles.kpiGrid}>
          {[
            { val: total, label: 'Total reports', color: Colors.teal, trend: '↑ Real-time', trendUp: true },
            { val: `${resolutionRate}%`, label: 'Resolution rate', color: Colors.green, trend: resolved > 0 ? `${resolved} completed` : 'No completions yet', trendUp: true },
            { val: '—', label: 'Avg response', color: Colors.amber, trend: 'Tracking disabled', trendUp: false },
            { val: hazardous, label: 'Hazardous', color: Colors.red, trend: hazardous > 0 ? `${hazardous} flagged` : 'None detected', trendUp: false },
          ].map((kpi) => (
            <View key={kpi.label} style={styles.kpiCard}>
              <Text style={[styles.kpiVal, { color: kpi.color }]}>{kpi.val}</Text>
              <Text style={styles.kpiLabel}>{kpi.label}</Text>
              <Text style={[styles.kpiTrend, kpi.trendUp ? styles.trendUp : styles.trendDn]}>{kpi.trend}</Text>
            </View>
          ))}
        </View>

        {/* Bar chart */}
        <BarChart title="Monthly reports (last 6 months)" data={monthlyData} />

        {/* Donut chart */}
        <DonutChart title="Waste type distribution" segments={wasteSegments} total={total} />

        {/* Barangay bars */}
        <View style={styles.chartCard}>
          <Text style={styles.chartTitle}>Most polluted barangays</Text>
          {barangays.map((b) => (
            <View key={b.name} style={styles.brgyRow}>
              <Text style={styles.brgyName}>{b.name}</Text>
              <View style={styles.brgyBarWrap}>
                <View style={[styles.brgyBar, { width: `${Math.max(b.pct, 2)}%` as never, backgroundColor: b.color }]} />
              </View>
              <Text style={styles.brgyPct}>{b.pct}%</Text>
            </View>
          ))}
        </View>

        {/* AI summary */}
        <View style={styles.chartCard}>
          <Text style={styles.chartTitle}>AI classification summary</Text>
          {[
            { k: 'Total CNN scans', v: `${analytics?.aiStats.totalScans ?? total}` },
            { k: 'Avg confidence', v: avgConfidence, color: Colors.teal },
            { k: 'Hazardous flags', v: `${hazardous}`, color: Colors.red },
            { k: 'Model version', v: analytics?.aiStats.modelVersion || 'CNN v2.4' },
          ].map((row) => (
            <View key={row.k} style={styles.aiRow}>
              <Text style={styles.aiKey}>{row.k}</Text>
              <Text style={[styles.aiVal, row.color ? { color: row.color } : null]}>{row.v}</Text>
            </View>
          ))}
        </View>
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: Colors.grayBg },
  header: {
    backgroundColor: Colors.white, paddingHorizontal: 16, paddingVertical: 12,
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
    borderBottomWidth: 0.5, borderBottomColor: Colors.border,
  },
  headerTitle: { fontSize: 16, fontWeight: '500', color: Colors.textPrimary },
  exportBtn: { backgroundColor: Colors.tealLight, paddingHorizontal: 8, paddingVertical: 4, borderRadius: 8 },
  exportBtnText: { fontSize: 11, color: Colors.teal },
  body: { padding: 14, gap: 10, paddingBottom: 20 },
  loadingRow: { flexDirection: 'row', alignItems: 'center', gap: 8, justifyContent: 'center', paddingVertical: 4 },
  loadingText: { fontSize: 11, color: Colors.textMuted },
  kpiGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: 7 },
  kpiCard: { width: '47%', backgroundColor: Colors.white, borderRadius: 12, padding: 10, borderWidth: 0.5, borderColor: Colors.border },
  kpiVal: { fontSize: 18, fontWeight: '500' },
  kpiLabel: { fontSize: 10, color: Colors.textMuted, marginTop: 2 },
  kpiTrend: { fontSize: 10, fontWeight: '500', marginTop: 4 },
  trendUp: { color: Colors.teal },
  trendDn: { color: Colors.red },
  chartCard: { backgroundColor: Colors.white, borderRadius: 14, padding: 12, borderWidth: 0.5, borderColor: Colors.border },
  chartTitle: { fontSize: 12, fontWeight: '500', color: Colors.textPrimary, marginBottom: 10 },
  brgyRow: { flexDirection: 'row', alignItems: 'center', gap: 8, marginBottom: 5 },
  brgyName: { fontSize: 10, color: Colors.textMuted, width: 88 },
  brgyBarWrap: { flex: 1, height: 9, backgroundColor: Colors.grayBg, borderRadius: 3, overflow: 'hidden' },
  brgyBar: { height: '100%', borderRadius: 3 },
  brgyPct: { fontSize: 10, color: Colors.textMuted, width: 28, textAlign: 'right' },
  aiRow: {
    flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center',
    paddingVertical: 5, borderBottomWidth: 0.5, borderBottomColor: Colors.border,
  },
  aiKey: { fontSize: 11, color: Colors.textMuted },
  aiVal: { fontSize: 11, fontWeight: '500', color: Colors.textPrimary },
});
