import React from 'react';
import { View, Text, ScrollView, TouchableOpacity, StyleSheet, SafeAreaView, Alert } from 'react-native';
import { Colors } from '../../constants/colors';
import { useAppSelector } from '../../store/hooks';
import { BarChart } from '../../components/charts/BarChart';
import { DonutChart } from '../../components/charts/DonutChart';

export default function AdminAnalyticsScreen() {
  const { reports } = useAppSelector((s) => s.reports);

  const total = reports.length;
  const resolved = reports.filter((r) => r.status === 'resolved').length;
  const resolutionRate = total > 0 ? Math.round((resolved / total) * 100) : 0;
  const hazardous = reports.filter((r) => r.aiAnalysis?.hazardousDetected).length;

  const monthlyData = [
    { label: 'Jan', value: 28, color: Colors.blueBg },
    { label: 'Feb', value: 36, color: Colors.blueBg },
    { label: 'Mar', value: 42, color: Colors.blueBg },
    { label: 'Apr', value: total > 0 ? total : 60, color: Colors.teal },
    { label: 'May', value: 18, color: Colors.grayMid },
    { label: 'Jun', value: 12, color: Colors.grayMid },
  ];

  const wasteTypes = [
    { label: 'Plastic', percentage: 68, color: Colors.blue },
    { label: 'Organic', percentage: 16, color: Colors.green },
    { label: 'Hazardous', percentage: 10, color: Colors.critical },
  ];

  const barangays = [
    { name: 'Guadalupe', pct: 94, color: Colors.critical },
    { name: 'Punta Princesa', pct: 87, color: Colors.red },
    { name: 'Labangon', pct: 62, color: Colors.amber },
    { name: 'Mambaling', pct: 41, color: Colors.blue },
    { name: 'Kinasang-an', pct: 28, color: Colors.teal },
  ];

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
        {/* KPIs */}
        <View style={styles.kpiGrid}>
          {[
            { val: total > 0 ? total : 142, label: 'Total reports', color: Colors.teal, trend: '↑ 23% vs last month', trendUp: true },
            { val: `${resolutionRate || 78}%`, label: 'Resolution rate', color: Colors.green, trend: '↑ 12% improvement', trendUp: true },
            { val: '14h', label: 'Avg response', color: Colors.amber, trend: '↓ 3h slower', trendUp: false },
            { val: hazardous > 0 ? hazardous : 23, label: 'Hazardous', color: Colors.red, trend: '↑ 4 this week', trendUp: false },
          ].map((kpi) => (
            <View key={kpi.label} style={styles.kpiCard}>
              <Text style={[styles.kpiVal, { color: kpi.color }]}>{kpi.val}</Text>
              <Text style={styles.kpiLabel}>{kpi.label}</Text>
              <Text style={[styles.kpiTrend, kpi.trendUp ? styles.trendUp : styles.trendDn]}>{kpi.trend}</Text>
            </View>
          ))}
        </View>

        {/* Bar chart */}
        <BarChart title="Monthly reports (2026)" data={monthlyData} />

        {/* Donut chart */}
        <DonutChart title="Waste type distribution" segments={wasteTypes} total={total > 0 ? total : 142} />

        {/* Barangay bars */}
        <View style={styles.chartCard}>
          <Text style={styles.chartTitle}>Most polluted barangays</Text>
          {barangays.map((b) => (
            <View key={b.name} style={styles.brgyRow}>
              <Text style={styles.brgyName}>{b.name}</Text>
              <View style={styles.brgyBarWrap}>
                <View style={[styles.brgyBar, { width: `${b.pct}%` as never, backgroundColor: b.color }]} />
              </View>
              <Text style={styles.brgyPct}>{b.pct}%</Text>
            </View>
          ))}
        </View>

        {/* AI summary */}
        <View style={styles.chartCard}>
          <Text style={styles.chartTitle}>AI classification summary</Text>
          {[
            { k: 'Total CNN scans', v: `${total > 0 ? total : 142}` },
            { k: 'Avg confidence', v: '94.7%', color: Colors.teal },
            { k: 'Hazardous flags', v: `${hazardous > 0 ? hazardous : 23}`, color: Colors.red },
            { k: 'Model version', v: 'CNN v2.4' },
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
