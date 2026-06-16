import React, { useEffect, useCallback } from 'react';
import {
  View, Text, ScrollView, TouchableOpacity, StyleSheet, RefreshControl,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useNavigation } from '@react-navigation/native';
import { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { Colors } from '../../constants/colors';
import { RootStackParamList } from '../../types';
import { useAppDispatch, useAppSelector } from '../../store/hooks';
import { fetchAllReports } from '../../store/reportsSlice';
import { logout } from '../../store/authSlice';
import { Badge } from '../../components/common/Badge';
import { MapPreview } from '../../components/common/MapPreview';
import { BellIcon } from '../../components/common/TabIcons';

type Nav = NativeStackNavigationProp<RootStackParamList>;

export default function AdminDashboardScreen() {
  const navigation = useNavigation<Nav>();
  const dispatch = useAppDispatch();
  const { user } = useAppSelector((s) => s.auth);
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

  const hotspots = reports.slice(0, 6).map((r, i) => ({
    id: r.id,
    latitude: r.location?.latitude || 10.3157 + i * 0.003,
    longitude: r.location?.longitude || 123.8854 + i * 0.004,
    severity: r.severity,
  }));

  return (
    <SafeAreaView style={styles.container}>
      <View style={styles.header}>
        <View>
          <Text style={styles.headerTitle}>Admin dashboard</Text>
          <Text style={styles.headerSub}>CleanStream · Cebu City</Text>
        </View>
        <TouchableOpacity style={[styles.iconBtn, styles.iconBtnRelative]} onPress={() => navigation.navigate('AdminTabs', {} as never)}>
          <BellIcon color={Colors.textMuted} size={16} />
          <View style={styles.notifDot} />
        </TouchableOpacity>
      </View>

      <ScrollView
        contentContainerStyle={styles.body}
        showsVerticalScrollIndicator={false}
        refreshControl={<RefreshControl refreshing={loading} onRefresh={load} tintColor={Colors.blue} />}
      >
        {/* Role pill */}
        <View style={styles.roleRow}>
          <View style={[styles.rolePill, { backgroundColor: Colors.blueBg }]}>
            <Text style={[styles.rolePillText, { color: Colors.blueText }]}>Administrator</Text>
          </View>
          <TouchableOpacity onPress={() => navigation.navigate('AdminProfile' as never)}>
            <Text style={[styles.profileLink, { color: Colors.blueText }]}>My profile →</Text>
          </TouchableOpacity>
        </View>

        {/* Stats */}
        <View style={styles.statsGrid}>
          {[
            { val: reports.length, label: 'Reports', color: Colors.textPrimary },
            { val: critical, label: 'Critical', color: Colors.critical },
            { val: high, label: 'High', color: Colors.red },
            { val: pending, label: 'Pending', color: Colors.amber },
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
            { label: 'Critical', color: Colors.critical },
            { label: 'High', color: Colors.red },
            { label: 'Mod', color: Colors.amber },
            { label: 'Low', color: Colors.teal },
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
              report.severity === 'critical' && { backgroundColor: Colors.criticalBg, borderColor: 'rgba(192,57,43,0.2)' },
            ]}
            onPress={() => navigation.navigate('AdminSchedule', { reportId: report.id })}
            activeOpacity={0.85}
          >
            <View style={[styles.alertDot, { backgroundColor: report.severity === 'critical' ? Colors.critical : Colors.red }]} />
            <View style={{ flex: 1 }}>
              <Text style={[styles.alertTitle, report.severity === 'critical' && { color: Colors.criticalText }]}>
                {report.severity.toUpperCase()} — {report.location?.barangay || 'Unknown'}
              </Text>
              <Text style={[styles.alertBody, report.severity === 'critical' && { color: Colors.criticalText, opacity: 0.7 }]}>
                {report.aiAnalysis?.wasteTypes[0]?.label || 'Waste detected'} · CNN: {report.aiAnalysis?.confidence || '—'}%
              </Text>
              <View style={{ marginTop: 5 }}>
                <Badge variant={report.severity === 'critical' ? 'specialist' : 'dispatch'} />
              </View>
            </View>
          </TouchableOpacity>
        ))}
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
  headerSub: { fontSize: 11, color: Colors.textMuted, marginTop: 1 },
  iconBtn: { width: 34, height: 34, borderRadius: 17, backgroundColor: Colors.grayBg, alignItems: 'center', justifyContent: 'center' },
  iconBtnRelative: { position: 'relative' },
  notifDot: { position: 'absolute', top: 6, right: 6, width: 7, height: 7, borderRadius: 3.5, backgroundColor: Colors.red, borderWidth: 1.5, borderColor: Colors.white },
  body: { padding: 14, gap: 10, paddingBottom: 20 },
  roleRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  rolePill: { paddingHorizontal: 9, paddingVertical: 3, borderRadius: 20 },
  rolePillText: { fontSize: 10, fontWeight: '500' },
  profileLink: { fontSize: 10, fontWeight: '500' },
  statsGrid: { flexDirection: 'row', gap: 7 },
  statCard: { flex: 1, backgroundColor: Colors.white, borderRadius: 12, padding: 11, alignItems: 'center', borderWidth: 0.5, borderColor: Colors.border },
  statVal: { fontSize: 16, fontWeight: '500' },
  statLabel: { fontSize: 10, color: Colors.textMuted, marginTop: 2 },
  legend: { flexDirection: 'row', gap: 11 },
  legendItem: { flexDirection: 'row', alignItems: 'center', gap: 4 },
  legendDot: { width: 9, height: 9, borderRadius: 4.5 },
  legendText: { fontSize: 11, color: Colors.textMuted },
  sectionTitle: { fontSize: 13, fontWeight: '500', color: Colors.textPrimary },
  emptyCard: { backgroundColor: Colors.white, borderRadius: 12, padding: 16, alignItems: 'center', borderWidth: 0.5, borderColor: Colors.border },
  emptyText: { fontSize: 12, color: Colors.textHint },
  alertCard: {
    flexDirection: 'row', gap: 10, padding: 11, paddingHorizontal: 13,
    backgroundColor: Colors.redBg, borderWidth: 0.5, borderColor: 'rgba(226,75,74,0.22)',
    borderRadius: 12, alignItems: 'flex-start',
  },
  alertDot: { width: 9, height: 9, borderRadius: 4.5, marginTop: 3 },
  alertTitle: { fontSize: 12, fontWeight: '500', color: Colors.textPrimary },
  alertBody: { fontSize: 11, color: Colors.textMuted, marginTop: 2 },
});
