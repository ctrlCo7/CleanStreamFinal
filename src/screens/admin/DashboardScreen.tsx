import React, { useEffect, useCallback, useMemo } from 'react';
import {
  View, Text, ScrollView, TouchableOpacity, StyleSheet, RefreshControl,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useNavigation } from '@react-navigation/native';
import { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { useTheme } from '../../hooks/useTheme';
import { ThemeColors } from '../../constants/theme';
import { RootStackParamList } from '../../types';
import { useAppDispatch, useAppSelector } from '../../store/hooks';
import { fetchAllReports } from '../../store/reportsSlice';
import { Badge } from '../../components/common/Badge';
import { MapPreview } from '../../components/common/MapPreview';
import { BellIcon } from '../../components/common/TabIcons';

type Nav = NativeStackNavigationProp<RootStackParamList>;

export default function AdminDashboardScreen() {
  const navigation = useNavigation<Nav>();
  const dispatch = useAppDispatch();
  const { colors } = useTheme();
  const styles = useMemo(() => createStyles(colors), [colors]);
  const { reports, loading } = useAppSelector((s) => s.reports);

  const load = useCallback(() => dispatch(fetchAllReports()), [dispatch]);
  useEffect(() => { load(); }, [load]);

  const critical = reports.filter((r) => r.severity === 'critical').length;
  const high = reports.filter((r) => r.severity === 'high').length;
  const pending = reports.filter((r) => r.status === 'pending').length;

  const priorityReports = reports
    .filter((r) => r.severity === 'critical' || r.severity === 'high')
    .filter((r) => r.status !== 'completed')
    .slice(0, 3);

  const hotspots = reports
    .filter((r) => typeof r.location?.latitude === 'number' && typeof r.location?.longitude === 'number')
    .slice(0, 6)
    .map((r) => ({
      id: r.id,
      latitude: r.location.latitude,
      longitude: r.location.longitude,
      severity: r.severity,
    }));

  return (
    <SafeAreaView style={styles.container}>
      <View style={styles.header}>
        <View>
          <Text style={styles.headerTitle}>Admin dashboard</Text>
          <Text style={styles.headerSub}>CleanStream · Cebu City</Text>
        </View>
        <TouchableOpacity style={[styles.iconBtn, styles.iconBtnRelative]} onPress={() => navigation.navigate('AdminAlerts')}>
          <BellIcon color={colors.textMuted} size={18} />
          {(critical > 0 || high > 0) && <View style={styles.notifDot} />}
        </TouchableOpacity>
      </View>

      <ScrollView
        contentContainerStyle={styles.body}
        showsVerticalScrollIndicator={false}
        refreshControl={<RefreshControl refreshing={loading} onRefresh={load} tintColor={colors.blue} />}
      >
        {/* Role pill */}
        <View style={styles.roleRow}>
          <View style={[styles.rolePill, { backgroundColor: colors.blueBg }]}>
            <Text style={[styles.rolePillText, { color: colors.blueText }]}>Administrator</Text>
          </View>
          <TouchableOpacity onPress={() => navigation.navigate('AdminProfile' as never)}>
            <Text style={[styles.profileLink, { color: colors.blueText }]}>My profile →</Text>
          </TouchableOpacity>
        </View>

        {/* Stats */}
        <View style={styles.statsGrid}>
          {[
            { val: reports.length, label: 'Reports', color: colors.textPrimary },
            { val: critical, label: 'Critical', color: colors.critical },
            { val: high, label: 'High', color: colors.red },
            { val: pending, label: 'Pending', color: colors.amber },
          ].map((s) => (
            <View key={s.label} style={styles.statCard}>
              <Text style={[styles.statVal, { color: s.color }]}>{s.val}</Text>
              <Text style={styles.statLabel}>{s.label}</Text>
            </View>
          ))}
        </View>

        {/* Map */}
        <MapPreview pins={hotspots} onPress={() => navigation.navigate('Map', {})} tagText="Waste hotspots · Multiple zones" />

        {/* Legend */}
        <View style={styles.legend}>
          {[
            { label: 'Critical', color: colors.critical },
            { label: 'High', color: colors.red },
            { label: 'Mod', color: colors.amber },
            { label: 'Low', color: colors.teal },
          ].map((item) => (
            <View key={item.label} style={styles.legendItem}>
              <View style={[styles.legendDot, { backgroundColor: item.color }]} />
              <Text style={styles.legendText}>{item.label}</Text>
            </View>
          ))}
        </View>

        {/* Priority alerts */}
        <Text style={styles.sectionTitle}>Priority alerts</Text>
        {priorityReports.length === 0 && (
          <View style={styles.emptyCard}>
            <Text style={styles.emptyText}>No critical or high priority reports right now.</Text>
          </View>
        )}
        {priorityReports.map((report) => (
          <TouchableOpacity
            key={report.id}
            style={[
              styles.alertCard,
              report.severity === 'critical' && { backgroundColor: colors.criticalBg, borderColor: 'rgba(192,57,43,0.2)' },
            ]}
            onPress={() => navigation.navigate('AdminSchedule', { reportId: report.id })}
            activeOpacity={0.85}
          >
            <View style={[styles.alertDot, { backgroundColor: report.severity === 'critical' ? colors.critical : colors.red }]} />
            <View style={{ flex: 1 }}>
              <Text style={[styles.alertTitle, report.severity === 'critical' && { color: colors.criticalText }]}>
                {report.severity.toUpperCase()} — {report.location?.barangay || 'Unknown'}
              </Text>
              <Text style={[styles.alertBody, report.severity === 'critical' && { color: colors.criticalText, opacity: 0.7 }]}>
                {report.aiAnalysis?.wasteTypes[0]?.label || 'Waste detected'} · CNN: {report.aiAnalysis?.confidence || '—'}%
              </Text>
              <View style={{ marginTop: 5 }}>
                <Badge variant={report.severity === 'critical' ? 'specialist' : 'dispatch'} />
              </View>
            </View>
          </TouchableOpacity>
        ))}

        <TouchableOpacity
          style={[styles.actionBtn, { backgroundColor: colors.blueBg, borderColor: colors.blue }]}
          onPress={() => navigation.navigate('AdminCheckpointAlarms')}
        >
          <Text style={[styles.actionBtnText, { color: colors.blueText }]}>⏰ Set barangay checkpoint alarms</Text>
        </TouchableOpacity>
        <TouchableOpacity
          style={[styles.actionBtn, { backgroundColor: colors.purpleBg, borderColor: colors.purple, marginTop: 6 }]}
          onPress={() => navigation.navigate('AdminUserManagement')}
        >
          <Text style={[styles.actionBtnText, { color: colors.purpleText }]}>👤 Manage user accounts</Text>
        </TouchableOpacity>
      </ScrollView>
    </SafeAreaView>
  );
}

const createStyles = (Colors: ThemeColors) => StyleSheet.create({
  container: { flex: 1, backgroundColor: Colors.grayBg },
  header: {
    backgroundColor: Colors.white, paddingHorizontal: 16, paddingVertical: 12,
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
    borderBottomWidth: 0.5, borderBottomColor: Colors.border,
  },
  headerTitle: { fontSize: 16, fontWeight: '500', color: Colors.textPrimary },
  headerSub: { fontSize: 11, color: Colors.textMuted, marginTop: 1 },
  iconBtn: { width: 38, height: 38, borderRadius: 19, backgroundColor: Colors.grayBg, alignItems: 'center', justifyContent: 'center' },
  iconBtnRelative: { position: 'relative' },
  notifDot: { position: 'absolute', top: 6, right: 6, width: 7, height: 7, borderRadius: 3.5, backgroundColor: Colors.red, borderWidth: 1.5, borderColor: Colors.white },
  body: { padding: 16, gap: 14, paddingBottom: 20 },
  roleRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  rolePill: { paddingHorizontal: 9, paddingVertical: 3, borderRadius: 20 },
  rolePillText: { fontSize: 10, fontWeight: '500' },
  profileLink: { fontSize: 10, fontWeight: '500' },
  statsGrid: { flexDirection: 'row', gap: 7 },
  statCard: {
    flex: 1, backgroundColor: Colors.white, borderRadius: 16, padding: 14, alignItems: 'center',
    shadowColor: Colors.shadow, shadowOffset: { width: 0, height: 2 }, shadowOpacity: 0.05, shadowRadius: 8, elevation: 1,
  },
  statVal: { fontSize: 16, fontWeight: '500' },
  statLabel: { fontSize: 10, color: Colors.textMuted, marginTop: 2 },
  legend: { flexDirection: 'row', gap: 11 },
  legendItem: { flexDirection: 'row', alignItems: 'center', gap: 4 },
  legendDot: { width: 9, height: 9, borderRadius: 4.5 },
  legendText: { fontSize: 11, color: Colors.textMuted },
  sectionTitle: { fontSize: 14, fontWeight: '600', color: Colors.textPrimary },
  emptyCard: {
    backgroundColor: Colors.white, borderRadius: 18, padding: 18, alignItems: 'center',
    shadowColor: Colors.shadow, shadowOffset: { width: 0, height: 2 }, shadowOpacity: 0.05, shadowRadius: 8, elevation: 1,
  },
  emptyText: { fontSize: 12, color: Colors.textHint },
  alertCard: {
    flexDirection: 'row', gap: 10, padding: 11, paddingHorizontal: 13,
    backgroundColor: Colors.redBg, borderWidth: 0.5, borderColor: 'rgba(226,75,74,0.22)',
    borderRadius: 12, alignItems: 'flex-start',
  },
  alertDot: { width: 9, height: 9, borderRadius: 4.5, marginTop: 3 },
  alertTitle: { fontSize: 12, fontWeight: '500', color: Colors.textPrimary },
  alertBody: { fontSize: 11, color: Colors.textMuted, marginTop: 2 },
  actionBtn: { borderRadius: 12, paddingVertical: 11, alignItems: 'center', justifyContent: 'center', borderWidth: 0.5 },
  actionBtnText: { fontSize: 11, fontWeight: '500', textAlign: 'center' },
});
