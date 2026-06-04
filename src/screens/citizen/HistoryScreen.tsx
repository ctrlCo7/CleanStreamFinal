import React, { useEffect, useState } from 'react';
import {
  View, Text, ScrollView, TouchableOpacity, StyleSheet, SafeAreaView, RefreshControl,
} from 'react-native';
import { useNavigation } from '@react-navigation/native';
import { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { Colors } from '../../constants/colors';
import { RootStackParamList, WasteReport } from '../../types';
import { useAppDispatch, useAppSelector } from '../../store/hooks';
import { fetchUserReports } from '../../store/reportsSlice';
import { Badge } from '../../components/common/Badge';
import { StatCard } from '../../components/common/StatCard';
import { BarChart } from '../../components/charts/BarChart';
import { FilterIcon } from '../../components/common/TabIcons';

type Nav = NativeStackNavigationProp<RootStackParamList>;
type FilterType = 'All' | 'Pending' | 'In progress' | 'Resolved';

export default function CitizenHistoryScreen() {
  const navigation = useNavigation<Nav>();
  const dispatch = useAppDispatch();
  const { user } = useAppSelector((s) => s.auth);
  const { userReports, loading } = useAppSelector((s) => s.reports);
  const [filter, setFilter] = useState<FilterType>('All');

  useEffect(() => {
    if (user?.uid) dispatch(fetchUserReports(user.uid));
  }, [user?.uid, dispatch]);

  const filtered = userReports.filter((r) => {
    if (filter === 'All') return true;
    if (filter === 'Pending') return r.status === 'pending';
    if (filter === 'In progress') return r.status === 'in_progress';
    if (filter === 'Resolved') return r.status === 'resolved';
    return true;
  });

  const total = userReports.length;
  const resolved = userReports.filter((r) => r.status === 'resolved').length;
  const pending = userReports.filter((r) => r.status === 'pending').length;

  const wasteChartData = [
    { label: 'Plastic', value: 58, color: Colors.blue },
    { label: 'Organic', value: 28, color: Colors.green },
    { label: 'Hazard', value: 18, color: Colors.critical },
    { label: 'Metal', value: 8, color: Colors.amber },
    { label: 'Other', value: 6, color: Colors.grayMuted },
  ];

  const filters: FilterType[] = ['All', 'Pending', 'In progress', 'Resolved'];

  return (
    <SafeAreaView style={styles.container}>
      <View style={styles.header}>
        <Text style={styles.headerTitle}>Report history</Text>
        <TouchableOpacity style={styles.iconBtn}>
          <FilterIcon />
        </TouchableOpacity>
      </View>

      <ScrollView
        contentContainerStyle={styles.body}
        showsVerticalScrollIndicator={false}
        refreshControl={<RefreshControl refreshing={loading} onRefresh={() => user?.uid && dispatch(fetchUserReports(user.uid))} tintColor={Colors.teal} />}
      >
        {/* Stats */}
        <View style={styles.statsRow}>
          <StatCard value={total} label="Total" valueColor={Colors.teal} />
          <StatCard value={resolved} label="Resolved" valueColor={Colors.green} />
          <StatCard value={pending} label="Pending" valueColor={Colors.amber} />
        </View>

        {/* Chart */}
        <BarChart title="Reports by waste type" data={wasteChartData} />

        {/* Filter chips */}
        <ScrollView horizontal showsHorizontalScrollIndicator={false}>
          <View style={styles.filterRow}>
            {filters.map((f) => (
              <TouchableOpacity
                key={f}
                style={[styles.chip, filter === f && styles.chipActive]}
                onPress={() => setFilter(f)}
              >
                <Text style={[styles.chipText, filter === f && styles.chipTextActive]}>{f}</Text>
              </TouchableOpacity>
            ))}
          </View>
        </ScrollView>

        {/* Timeline */}
        <Text style={styles.sectionTitle}>Timeline</Text>
        {filtered.length === 0 && (
          <View style={styles.emptyCard}>
            <Text style={styles.emptyText}>No reports match this filter.</Text>
          </View>
        )}
        {filtered.map((report, i) => (
          <TouchableOpacity
            key={report.id}
            style={styles.timelineItem}
            onPress={() => navigation.navigate('CitizenDetail', { reportId: report.id })}
          >
            <View style={styles.tlDotCol}>
              <View style={[styles.tlDot, { backgroundColor: getStatusColor(report.status) }]} />
              {i < filtered.length - 1 && <View style={styles.tlLine} />}
            </View>
            <View style={styles.tlBody}>
              <Text style={styles.tlTitle}>{report.location?.barangay || 'Unknown'}</Text>
              <Text style={styles.tlSub}>
                {new Date(report.createdAt).toLocaleDateString()} · {report.severity} ·{' '}
                {report.aiAnalysis?.wasteTypes[0]?.label || ''} ·{' '}
                <Text style={{ color: getStatusColor(report.status), fontWeight: '500' }}>
                  {report.status.replace('_', ' ')}
                </Text>
              </Text>
            </View>
          </TouchableOpacity>
        ))}
      </ScrollView>
    </SafeAreaView>
  );
}

function getStatusColor(status: WasteReport['status']): string {
  switch (status) {
    case 'resolved': return Colors.teal;
    case 'in_progress': return Colors.amber;
    case 'pending': return Colors.blue;
    default: return Colors.grayMuted;
  }
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: Colors.grayBg },
  header: {
    backgroundColor: Colors.white, paddingHorizontal: 16, paddingVertical: 12,
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
    borderBottomWidth: 0.5, borderBottomColor: Colors.border,
  },
  headerTitle: { fontSize: 16, fontWeight: '500', color: Colors.textPrimary },
  iconBtn: { width: 34, height: 34, borderRadius: 17, backgroundColor: Colors.grayBg, alignItems: 'center', justifyContent: 'center' },
  body: { padding: 14, gap: 10, paddingBottom: 20 },
  statsRow: { flexDirection: 'row', gap: 7 },
  filterRow: { flexDirection: 'row', gap: 6, paddingVertical: 2 },
  chip: {
    paddingHorizontal: 10, paddingVertical: 5, borderRadius: 20,
    borderWidth: 0.5, borderColor: Colors.borderMid, backgroundColor: Colors.white,
  },
  chipActive: { backgroundColor: Colors.teal, borderColor: Colors.teal },
  chipText: { fontSize: 11, color: Colors.textMuted },
  chipTextActive: { color: '#fff' },
  sectionTitle: { fontSize: 13, fontWeight: '500', color: Colors.textPrimary },
  emptyCard: {
    backgroundColor: Colors.white, borderRadius: 12, padding: 16,
    alignItems: 'center', borderWidth: 0.5, borderColor: Colors.border,
  },
  emptyText: { fontSize: 12, color: Colors.textHint },
  timelineItem: { flexDirection: 'row', gap: 10, alignItems: 'flex-start' },
  tlDotCol: { alignItems: 'center', gap: 2, width: 12 },
  tlDot: { width: 10, height: 10, borderRadius: 5, flexShrink: 0 },
  tlLine: { width: 1.5, flex: 1, backgroundColor: Colors.border, minHeight: 24 },
  tlBody: { flex: 1, paddingBottom: 12 },
  tlTitle: { fontSize: 12, fontWeight: '500', color: Colors.textPrimary },
  tlSub: { fontSize: 10, color: Colors.textMuted, marginTop: 2 },
});
