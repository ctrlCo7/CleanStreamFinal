import React, { useState } from 'react';
import { View, Text, ScrollView, TouchableOpacity, StyleSheet, SafeAreaView } from 'react-native';
import { Colors } from '../../constants/colors';
import { Badge } from '../../components/common/Badge';
import { useAppSelector } from '../../store/hooks';

const FILTER_OPTIONS = ['All', 'Verified', 'Pending review', 'Flagged'];

const MOCK_CHECKPOINTS = [
  { id: 'c1', type: 'Post-cleanup verification', barangay: 'Guadalupe', condition: 'Clean', date: 'Apr 3, 2026 · 2:14 PM', officer: 'Leni Reyes', status: 'verified' as const },
  { id: 'c2', type: 'Pre-cleanup assessment', barangay: 'Guadalupe', condition: 'Critical', date: 'Apr 2, 2026 · 5:47 AM', officer: 'Leni Reyes', status: 'verified' as const },
  { id: 'c3', type: 'During cleanup progress', barangay: 'Labangon', condition: 'Moderate', date: 'Apr 1, 2026 · 9:30 AM', officer: 'Leni Reyes', status: 'pending' as const },
  { id: 'c4', type: 'Hazmat status update', barangay: 'Guadalupe', condition: 'Heavy', date: 'Mar 31, 2026 · 7:00 AM', officer: 'Leni Reyes', status: 'flagged' as const },
  { id: 'c5', type: 'Community alert', barangay: 'Punta Princesa', condition: 'Moderate', date: 'Mar 30, 2026 · 3:20 PM', officer: 'Leni Reyes', status: 'verified' as const },
];

const COND_COLORS: Record<string, string> = {
  Clean: Colors.teal,
  Mild: Colors.green,
  Moderate: Colors.amber,
  Heavy: Colors.red,
  Critical: Colors.critical,
};

const STATUS_COLORS: Record<string, string> = {
  verified: Colors.teal,
  pending: Colors.amber,
  flagged: Colors.red,
};

export default function BarangayHistoryScreen() {
  const { user } = useAppSelector((s) => s.auth);
  const [filter, setFilter] = useState('All');

  const filtered = filter === 'All'
    ? MOCK_CHECKPOINTS
    : MOCK_CHECKPOINTS.filter((c) => {
        if (filter === 'Verified') return c.status === 'verified';
        if (filter === 'Pending review') return c.status === 'pending';
        if (filter === 'Flagged') return c.status === 'flagged';
        return true;
      });

  const verified = MOCK_CHECKPOINTS.filter((c) => c.status === 'verified').length;
  const pending = MOCK_CHECKPOINTS.filter((c) => c.status === 'pending').length;
  const flagged = MOCK_CHECKPOINTS.filter((c) => c.status === 'flagged').length;

  return (
    <SafeAreaView style={styles.container}>
      <View style={styles.header}>
        <Text style={styles.headerTitle}>Checkpoint History</Text>
      </View>

      <ScrollView contentContainerStyle={styles.body} showsVerticalScrollIndicator={false}>
        {/* Stats */}
        <View style={styles.statsRow}>
          {[
            { val: MOCK_CHECKPOINTS.length, label: 'Total', color: Colors.brgy },
            { val: verified, label: 'Verified', color: Colors.green },
            { val: pending, label: 'Pending', color: Colors.amber },
            { val: flagged, label: 'Flagged', color: Colors.red },
          ].map((s) => (
            <View key={s.label} style={styles.statCard}>
              <Text style={[styles.statVal, { color: s.color }]}>{s.val}</Text>
              <Text style={styles.statLabel}>{s.label}</Text>
            </View>
          ))}
        </View>

        {/* Filters */}
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

        {/* Checkpoint cards */}
        {filtered.map((item) => (
          <View key={item.id} style={[styles.checkCard, item.status === 'flagged' && styles.checkCardFlagged]}>
            <View style={styles.checkTop}>
              <View style={[styles.condBadge, { backgroundColor: COND_COLORS[item.condition] + '20', borderColor: COND_COLORS[item.condition] + '40' }]}>
                <Text style={[styles.condText, { color: COND_COLORS[item.condition] }]}>{item.condition}</Text>
              </View>
              <View style={{ flex: 1 }}>
                <Text style={styles.checkType}>{item.type}</Text>
                <Text style={styles.checkBarangay}>{item.barangay} · {item.officer}</Text>
              </View>
              <View style={[styles.statusDot, { backgroundColor: STATUS_COLORS[item.status] }]} />
            </View>
            <View style={styles.checkMeta}>
              <Text style={styles.checkDate}>{item.date}</Text>
              <Text style={[styles.checkStatus, { color: STATUS_COLORS[item.status] }]}>
                {item.status.charAt(0).toUpperCase() + item.status.slice(1).replace('_', ' ')}
              </Text>
            </View>
          </View>
        ))}

        {filtered.length === 0 && (
          <View style={styles.emptyCard}>
            <Text style={styles.emptyText}>No checkpoints found</Text>
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
  filterChipActive: { backgroundColor: Colors.brgy, borderColor: Colors.brgy },
  filterChipText: { fontSize: 11, color: Colors.textMuted },
  filterChipTextActive: { color: '#fff', fontWeight: '500' },
  checkCard: {
    backgroundColor: Colors.white, borderRadius: 13, padding: 12,
    borderWidth: 0.5, borderColor: Colors.border, gap: 7,
  },
  checkCardFlagged: { borderLeftWidth: 3, borderLeftColor: Colors.red },
  checkTop: { flexDirection: 'row', alignItems: 'flex-start', gap: 9 },
  condBadge: { borderRadius: 8, paddingHorizontal: 7, paddingVertical: 3, borderWidth: 0.5, alignSelf: 'flex-start' },
  condText: { fontSize: 10, fontWeight: '500' },
  checkType: { fontSize: 12, fontWeight: '500', color: Colors.textPrimary },
  checkBarangay: { fontSize: 10, color: Colors.textMuted, marginTop: 2 },
  statusDot: { width: 9, height: 9, borderRadius: 4.5, marginTop: 3 },
  checkMeta: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  checkDate: { fontSize: 10, color: Colors.textHint },
  checkStatus: { fontSize: 11, fontWeight: '500' },
  emptyCard: { backgroundColor: Colors.white, borderRadius: 12, padding: 32, alignItems: 'center', borderWidth: 0.5, borderColor: Colors.border },
  emptyText: { fontSize: 12, color: Colors.textHint },
});
