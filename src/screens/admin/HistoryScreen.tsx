import React, { useState } from 'react';
import { View, Text, ScrollView, TouchableOpacity, StyleSheet, SafeAreaView } from 'react-native';
import { Colors } from '../../constants/colors';
import { Badge } from '../../components/common/Badge';
import { useAppSelector } from '../../store/hooks';

const FILTER_OPTIONS = ['All', 'Resolved', 'In progress', 'Pending'];

const MOCK_HISTORY = [
  { id: 'h1', barangay: 'Guadalupe', type: 'Hazardous waste', severity: 'critical' as const, status: 'resolved' as const, team: 'Team B', date: 'Apr 3, 2026', duration: '6h 20m', confidence: '99.1%' },
  { id: 'h2', barangay: 'Punta Princesa', type: 'Plastic surge', severity: 'high' as const, status: 'resolved' as const, team: 'Team A', date: 'Apr 2, 2026', duration: '4h 45m', confidence: '97.4%' },
  { id: 'h3', barangay: 'Labangon River', type: 'Metal debris', severity: 'high' as const, status: 'in_progress' as const, team: 'Team C', date: 'Apr 2, 2026', duration: '—', confidence: '91.2%' },
  { id: 'h4', barangay: 'Mambaling', type: 'Organic waste', severity: 'moderate' as const, status: 'resolved' as const, team: 'Team A', date: 'Apr 1, 2026', duration: '3h 10m', confidence: '88.5%' },
  { id: 'h5', barangay: 'Kinasang-an', type: 'Mixed waste', severity: 'moderate' as const, status: 'pending' as const, team: '—', date: 'Mar 31, 2026', duration: '—', confidence: '83.0%' },
  { id: 'h6', barangay: 'Basak Pardo', type: 'Plastic waste', severity: 'low' as const, status: 'resolved' as const, team: 'Team D', date: 'Mar 30, 2026', duration: '2h 00m', confidence: '79.3%' },
];

const SEVERITY_DOT: Record<string, string> = {
  critical: Colors.critical,
  high: Colors.red,
  moderate: Colors.amber,
  low: Colors.teal,
};

export default function AdminHistoryScreen() {
  const { reports } = useAppSelector((s) => s.reports);
  const [filter, setFilter] = useState('All');

  const liveHistory = reports.map((r) => ({
    id: r.id,
    barangay: r.location?.barangay || 'Unknown',
    type: r.aiAnalysis?.wasteTypes[0]?.label || 'Waste',
    severity: (r.severity || 'moderate') as 'critical' | 'high' | 'moderate' | 'low',
    status: (r.status || 'pending') as 'resolved' | 'in_progress' | 'pending' | 'cancelled',
    team: '—',
    date: r.createdAt ? new Date(r.createdAt as any).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' }) : '—',
    duration: '—',
    confidence: `${r.aiAnalysis?.confidence || '—'}%`,
  }));

  const combined = [...MOCK_HISTORY, ...liveHistory];

  const filtered = filter === 'All'
    ? combined
    : combined.filter((h) => {
        if (filter === 'Resolved') return h.status === 'resolved';
        if (filter === 'In progress') return h.status === 'in_progress';
        if (filter === 'Pending') return h.status === 'pending';
        return true;
      });

  const totalResolved = combined.filter((h) => h.status === 'resolved').length;
  const totalInProgress = combined.filter((h) => h.status === 'in_progress').length;
  const totalPending = combined.filter((h) => h.status === 'pending').length;

  return (
    <SafeAreaView style={styles.container}>
      <View style={styles.header}>
        <Text style={styles.headerTitle}>Cleanup History</Text>
      </View>

      <ScrollView contentContainerStyle={styles.body} showsVerticalScrollIndicator={false}>
        {/* Summary stats */}
        <View style={styles.statsRow}>
          {[
            { val: combined.length, label: 'Total', color: Colors.teal },
            { val: totalResolved, label: 'Resolved', color: Colors.green },
            { val: totalInProgress, label: 'In progress', color: Colors.amber },
            { val: totalPending, label: 'Pending', color: Colors.red },
          ].map((s) => (
            <View key={s.label} style={styles.statCard}>
              <Text style={[styles.statVal, { color: s.color }]}>{s.val}</Text>
              <Text style={styles.statLabel}>{s.label}</Text>
            </View>
          ))}
        </View>

        {/* Filter chips */}
        <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.filterRow}>
          {FILTER_OPTIONS.map((opt) => (
            <TouchableOpacity
              key={opt}
              style={[styles.filterChip, filter === opt && styles.filterChipActive]}
              onPress={() => setFilter(opt)}
            >
              <Text style={[styles.filterChipText, filter === opt && styles.filterChipTextActive]}>{opt}</Text>
            </TouchableOpacity>
          ))}
        </ScrollView>

        {/* History items */}
        {filtered.map((item) => (
          <View key={item.id} style={styles.historyCard}>
            <View style={styles.historyTop}>
              <View style={[styles.dot, { backgroundColor: SEVERITY_DOT[item.severity] }]} />
              <View style={{ flex: 1 }}>
                <Text style={styles.historyBarangay}>{item.barangay}</Text>
                <Text style={styles.historyType}>{item.type}</Text>
              </View>
              <Badge variant={item.status === 'resolved' ? 'resolved' : item.status === 'in_progress' ? 'in_progress' : 'pending'} label={item.status === 'in_progress' ? 'In progress' : item.status.charAt(0).toUpperCase() + item.status.slice(1)} />
            </View>
            <View style={styles.historyMeta}>
              {[
                { k: 'Date', v: item.date },
                { k: 'Team', v: item.team },
                { k: 'Duration', v: item.duration },
                { k: 'CNN', v: item.confidence },
              ].map((m) => (
                <View key={m.k} style={styles.metaPair}>
                  <Text style={styles.metaKey}>{m.k}</Text>
                  <Text style={styles.metaVal}>{m.v}</Text>
                </View>
              ))}
            </View>
            <View style={styles.historyBadgeRow}>
              <Badge variant={item.severity} label={item.severity.charAt(0).toUpperCase() + item.severity.slice(1)} />
            </View>
          </View>
        ))}

        {filtered.length === 0 && (
          <View style={styles.emptyCard}>
            <Text style={styles.emptyText}>No records found</Text>
          </View>
        )}
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
  body: { padding: 14, gap: 8, paddingBottom: 24 },
  statsRow: { flexDirection: 'row', gap: 7 },
  statCard: { flex: 1, backgroundColor: Colors.white, borderRadius: 12, padding: 10, alignItems: 'center', borderWidth: 0.5, borderColor: Colors.border },
  statVal: { fontSize: 18, fontWeight: '500' },
  statLabel: { fontSize: 9, color: Colors.textMuted, marginTop: 2 },
  filterRow: { gap: 6, paddingVertical: 2 },
  filterChip: { paddingHorizontal: 12, paddingVertical: 5, borderRadius: 20, borderWidth: 0.5, borderColor: Colors.border, backgroundColor: Colors.white },
  filterChipActive: { backgroundColor: Colors.blue, borderColor: Colors.blue },
  filterChipText: { fontSize: 11, color: Colors.textMuted },
  filterChipTextActive: { color: '#fff', fontWeight: '500' },
  historyCard: {
    backgroundColor: Colors.white, borderRadius: 13, padding: 12,
    borderWidth: 0.5, borderColor: Colors.border, gap: 8,
  },
  historyTop: { flexDirection: 'row', alignItems: 'flex-start', gap: 9 },
  dot: { width: 9, height: 9, borderRadius: 4.5, marginTop: 3 },
  historyBarangay: { fontSize: 12, fontWeight: '500', color: Colors.textPrimary },
  historyType: { fontSize: 10, color: Colors.textMuted, marginTop: 1 },
  historyMeta: { flexDirection: 'row', flexWrap: 'wrap', gap: 6 },
  metaPair: { backgroundColor: Colors.grayBg, borderRadius: 8, paddingHorizontal: 8, paddingVertical: 4, minWidth: '45%' },
  metaKey: { fontSize: 9, color: Colors.textMuted },
  metaVal: { fontSize: 11, fontWeight: '500', color: Colors.textPrimary, marginTop: 1 },
  historyBadgeRow: { flexDirection: 'row' },
  emptyCard: { backgroundColor: Colors.white, borderRadius: 12, padding: 32, alignItems: 'center', borderWidth: 0.5, borderColor: Colors.border },
  emptyText: { fontSize: 12, color: Colors.textHint },
});
