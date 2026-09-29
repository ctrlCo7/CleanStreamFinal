import React, { useEffect, useState, useCallback, useMemo } from 'react';
import { useNavigation, useFocusEffect } from '@react-navigation/native';
import {
  View, Text, ScrollView, TouchableOpacity, StyleSheet, SafeAreaView, RefreshControl,
} from 'react-native';
import { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { useTheme } from '../../hooks/useTheme';
import { ThemeColors } from '../../constants/theme';
import { RootStackParamList, WasteReport } from '../../types';
import { useAppDispatch, useAppSelector } from '../../store/hooks';
import { fetchUserReports } from '../../store/reportsSlice';
import { Badge } from '../../components/common/Badge';
import { StatCard } from '../../components/common/StatCard';
import { BarChart } from '../../components/charts/BarChart';

type Nav = NativeStackNavigationProp<RootStackParamList>;
type FilterType = 'All' | 'Pending' | 'In progress' | 'Resolved';

export default function CitizenHistoryScreen() {
  const { colors } = useTheme();
  const styles = useMemo(() => createStyles(colors), [colors]);
  const navigation = useNavigation<Nav>();
  const dispatch = useAppDispatch();
  const { user } = useAppSelector((s) => s.auth);
  const { userReports, loading } = useAppSelector((s) => s.reports);
  const [filter, setFilter] = useState<FilterType>('All');

  useEffect(() => {
    if (user?.uid) dispatch(fetchUserReports(user.uid));
  }, [user?.uid, dispatch]);

  // Re-fetch every time the tab comes into focus so newly submitted reports appear immediately
  useFocusEffect(
    useCallback(() => {
      if (user?.uid) dispatch(fetchUserReports(user.uid));
    }, [user?.uid, dispatch]),
  );

  const filtered = userReports.filter((r) => {
    if (filter === 'All') return true;
    if (filter === 'Pending') return r.status === 'pending';
    if (filter === 'In progress') return r.status === 'in_progress';
    if (filter === 'Resolved') return r.status === 'completed';
    return true;
  });

  const total = userReports.length;
  const resolved = userReports.filter((r) => r.status === 'completed').length;
  const pending = userReports.filter((r) => r.status === 'pending').length;

  const wasteCounts = new Map<string, { count: number; color: string }>();
  userReports.forEach((r) => {
    const primary = r.aiAnalysis?.wasteTypes?.[0];
    if (!primary) return;
    const existing = wasteCounts.get(primary.label);
    wasteCounts.set(primary.label, { count: (existing?.count ?? 0) + 1, color: primary.color || colors.grayMuted });
  });
  const wasteChartData = Array.from(wasteCounts.entries())
    .map(([label, { count, color }]) => ({ label, value: count, color }))
    .sort((a, b) => b.value - a.value)
    .slice(0, 5);

  const filters: FilterType[] = ['All', 'Pending', 'In progress', 'Resolved'];

  return (
    <SafeAreaView style={styles.container}>
      <View style={styles.header}>
        <Text style={styles.headerTitle}>Report history</Text>
      </View>

      <ScrollView
        contentContainerStyle={styles.body}
        showsVerticalScrollIndicator={false}
        refreshControl={<RefreshControl refreshing={loading} onRefresh={() => user?.uid && dispatch(fetchUserReports(user.uid))} tintColor={colors.teal} />}
      >
        {/* Stats */}
        <View style={styles.statsRow}>
          <StatCard value={total} label="Total" valueColor={colors.teal} />
          <StatCard value={resolved} label="Resolved" valueColor={colors.green} />
          <StatCard value={pending} label="Pending" valueColor={colors.amber} />
        </View>

        {/* Chart */}
        {wasteChartData.length > 0 && (
          <BarChart title="Reports by waste type" data={wasteChartData} />
        )}

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
              <View style={[styles.tlDot, { backgroundColor: getStatusColor(report.status, colors) }]} />
              {i < filtered.length - 1 && <View style={styles.tlLine} />}
            </View>
            <View style={styles.tlBody}>
              <Text style={styles.tlTitle}>{report.location?.barangay || 'Unknown'}</Text>
              <Text style={styles.tlSub}>
                {new Date(report.createdAt).toLocaleDateString()} · {report.severity} ·{' '}
                {report.aiAnalysis?.wasteTypes[0]?.label || ''} ·{' '}
                <Text style={{ color: getStatusColor(report.status, colors), fontWeight: '500' }}>
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

function getStatusColor(status: WasteReport['status'], colors: ThemeColors): string {
  switch (status) {
    case 'completed': return colors.teal;
    case 'in_progress': return colors.amber;
    case 'pending': return colors.blue;
    case 'verified': return colors.green;
    case 'assigned': return colors.blue;
    case 'rejected': return colors.red;
    default: return colors.grayMuted;
  }
}

const createStyles = (Colors: ThemeColors) => StyleSheet.create({
  container: { flex: 1, backgroundColor: Colors.grayBg },
  header: {
    backgroundColor: Colors.white, paddingHorizontal: 16, paddingVertical: 12,
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
    borderBottomWidth: 0.5, borderBottomColor: Colors.border,
  },
  headerTitle: { fontSize: 16, fontWeight: '500', color: Colors.textPrimary },
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
