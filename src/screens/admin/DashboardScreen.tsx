import React, { useEffect, useCallback, useMemo, useState } from 'react';
import { View, Text, ScrollView, TouchableOpacity, StyleSheet, RefreshControl } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useNavigation } from '@react-navigation/native';
import { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { BottomTabNavigationProp } from '@react-navigation/bottom-tabs';
import { useTheme } from '../../hooks/useTheme';
import { useAppSettings } from '../../services/appSettings';
import { ThemeColors } from '../../constants/theme';
import { AdminTabParamList, CrewTracking, RootStackParamList, SeverityLevel } from '../../types';
import { useAppDispatch, useAppSelector } from '../../store/hooks';
import { fetchAllReports } from '../../store/reportsSlice';
import { MapPreview } from '../../components/common/MapPreview';
import { BellIcon } from '../../components/common/TabIcons';
import { ActionGrid, AlertStrip, Card, EmptyNote, ListRow, ScreenHeader, SectionHead, StatStrip, greetingFor } from '../../components/ui/Kit';
import { subscribeActiveTrips } from '../../services/crewTrackingService';
import { formatEta } from '../../services/routeMath';

type Nav = NativeStackNavigationProp<RootStackParamList>;

const OPEN = (status: string) => !['completed', 'rejected', 'cancelled'].includes(status);

export default function AdminDashboardScreen() {
  const navigation = useNavigation<Nav>();
  const tabNav = useNavigation<BottomTabNavigationProp<AdminTabParamList>>();
  const dispatch = useAppDispatch();
  const { colors } = useTheme();
  const styles = useMemo(() => createStyles(colors), [colors]);
  const { features } = useAppSettings();
  const { reports, loading } = useAppSelector((s) => s.reports);
  const user = useAppSelector((s) => s.auth.user);
  const [trips, setTrips] = useState<CrewTracking[]>([]);

  const barangayId = user?.barangayId;
  const load = useCallback(() => dispatch(fetchAllReports(barangayId)), [dispatch, barangayId]);
  useEffect(() => { load(); }, [load]);
  useEffect(() => subscribeActiveTrips({ role: 'admin', barangayId }, setTrips), [barangayId]);

  const open = reports.filter((r) => OPEN(r.status));
  const critical = open.filter((r) => r.severity === 'critical').length;
  const high = open.filter((r) => r.severity === 'high').length;
  const pending = reports.filter((r) => r.status === 'pending').length;
  const inProgress = reports.filter((r) => r.status === 'assigned' || r.status === 'in_progress').length;
  const resolved = reports.filter((r) => r.status === 'completed').length;

  const rank: Record<SeverityLevel, number> = { critical: 0, high: 1, moderate: 2, low: 3 };
  const priorityReports = open
    .filter((r) => r.severity === 'critical' || r.severity === 'high')
    .sort((a, b) => rank[a.severity] - rank[b.severity] || (b.createdAt > a.createdAt ? 1 : -1))
    .slice(0, 5);

  // Barangays with the most open reports.
  const busiest = useMemo(() => {
    const byBrgy = new Map<string, { name: string; open: number; critical: number }>();
    for (const r of open) {
      const name = r.location?.barangay || r.barangay || 'Unknown';
      const e = byBrgy.get(name) ?? { name, open: 0, critical: 0 };
      e.open++;
      if (r.severity === 'critical') e.critical++;
      byBrgy.set(name, e);
    }
    return [...byBrgy.values()].sort((a, b) => b.open - a.open).slice(0, 4);
  }, [open]);
  const maxOpen = Math.max(1, ...busiest.map((b) => b.open));

  const hotspots = open
    .filter((r) => typeof r.location?.latitude === 'number' && typeof r.location?.longitude === 'number')
    .slice(0, 12)
    .map((r) => ({ id: r.id, latitude: r.location.latitude, longitude: r.location.longitude, severity: r.severity }));

  const sevColor = (s: SeverityLevel) => (s === 'critical' ? colors.critical : s === 'high' ? colors.red : s === 'moderate' ? colors.amber : colors.teal);

  return (
    <SafeAreaView style={styles.container} edges={['top']}>
      <ScreenHeader
        title={`${greetingFor()}, ${user?.firstName || 'Captain'}`}
        subtitle="Administrator · Cebu City"
        right={(
          <TouchableOpacity style={styles.iconBtn} onPress={() => navigation.navigate('AdminAlerts')} accessibilityLabel="Alerts">
            <BellIcon color={colors.textSecondary} size={18} />
            {(critical > 0 || high > 0) && <View style={styles.notifDot} />}
          </TouchableOpacity>
        )}
      />

      <ScrollView
        contentContainerStyle={styles.body}
        showsVerticalScrollIndicator={false}
        refreshControl={<RefreshControl refreshing={loading} onRefresh={load} tintColor={colors.blue} />}
      >
        {!barangayId && (
          <AlertStrip
            icon="📍"
            title="No barangay on your account"
            sub="Admins only see their own barangay's reports. Ask the Super Admin to set your barangay."
            color={colors.amberText}
            bg={colors.amberBg}
          />
        )}
        {critical > 0 && (
          <AlertStrip
            icon="🚨"
            title={`${critical} critical report${critical === 1 ? '' : 's'} open`}
            sub="Check that each one has a crew assigned"
            color={colors.criticalText}
            bg={colors.criticalBg}
            onPress={() => navigation.navigate('AdminAlerts')}
          />
        )}
        {trips.length > 0 && (
          <AlertStrip
            icon="🚚"
            title={`${trips.length} crew${trips.length === 1 ? '' : 's'} on the way`}
            sub={trips.slice(0, 2).map((t) => `${t.crewName} · ${formatEta(t.etaSeconds)}`).join('  ·  ')}
            color={colors.tealDark}
            bg={colors.tealLight}
            onPress={features.mapView ? () => navigation.navigate('Map', {}) : undefined}
          />
        )}

        <StatStrip
          items={[
            { value: pending, label: 'To review', color: colors.amber },
            { value: inProgress, label: 'In progress', color: colors.blue },
            { value: critical + high, label: 'Urgent', color: colors.critical, onPress: () => navigation.navigate('AdminAlerts') },
            { value: resolved, label: 'Resolved', color: colors.green },
          ]}
        />

        <SectionHead title="Priority reports" action={priorityReports.length ? 'All alerts' : undefined} onAction={() => navigation.navigate('AdminAlerts')} />
        {priorityReports.length === 0 ? (
          <EmptyNote title="Nothing urgent" text="No open critical or high severity reports right now." />
        ) : (
          <Card style={styles.listCard}>
            {priorityReports.map((r, i) => (
              <ListRow
                key={r.id}
                first={i === 0}
                accent={sevColor(r.severity)}
                title={`${r.location?.barangay || 'Unknown'} · ${r.aiAnalysis?.wasteTypes?.[0]?.label || 'Waste'}`}
                meta={`${r.severity[0].toUpperCase()}${r.severity.slice(1)} · ${r.status === 'pending' ? 'Waiting for review' : r.status === 'verified' ? 'Verified, no crew yet' : r.status.replace('_', ' ')} · ${r.reportNumber}`}
                right={<Text style={styles.rowAction}>Schedule ›</Text>}
                onPress={() => navigation.navigate('AdminSchedule', { reportId: r.id })}
              />
            ))}
          </Card>
        )}

        {busiest.length > 0 && (
          <>
            <SectionHead title="Open reports by barangay" action="Analytics" onAction={() => tabNav.navigate('AdminAnalytics')} />
            <Card style={{ gap: 12 }}>
              {busiest.map((b) => (
                <View key={b.name} style={styles.barRow}>
                  <Text style={styles.barLabel} numberOfLines={1}>{b.name}</Text>
                  <View style={styles.barTrack}>
                    <View style={[styles.barFill, { width: `${(b.open / maxOpen) * 100}%` as never, backgroundColor: b.critical ? colors.critical : colors.blue }]} />
                  </View>
                  <Text style={styles.barValue}>{b.open}</Text>
                </View>
              ))}
            </Card>
          </>
        )}

        {features.mapView && (
          <>
            <SectionHead title="Hotspot map" action="Open map" onAction={() => navigation.navigate('Map', {})} />
            <MapPreview pins={hotspots} onPress={() => navigation.navigate('Map', {})} tagText="Open reports · tap to expand" />
          </>
        )}

        <SectionHead title="Manage" />
        <ActionGrid
          tiles={[
            { icon: '🔔', label: 'Alerts', sub: 'High and critical reports', tint: colors.redText, tintBg: colors.redBg, onPress: () => navigation.navigate('AdminAlerts'), badge: critical + high },
            { icon: '📊', label: 'Analytics', sub: 'Trends and export', tint: colors.blueText, tintBg: colors.blueBg, onPress: () => tabNav.navigate('AdminAnalytics') },
            { icon: '✅', label: 'Checkpoint reports', sub: 'Verify barangay inspections', tint: colors.tealDark, tintBg: colors.tealLight, onPress: () => tabNav.navigate('AdminHistory') },
            { icon: '⏰', label: 'Checkpoint alarms', sub: 'Daily reminder per barangay', tint: colors.brgyDark, tintBg: colors.brgyLight, onPress: () => navigation.navigate('AdminCheckpointAlarms') },
          ]}
        />
      </ScrollView>
    </SafeAreaView>
  );
}

const createStyles = (Colors: ThemeColors) => StyleSheet.create({
  container: { flex: 1, backgroundColor: Colors.grayBg },
  body: { padding: 16, gap: 12, paddingBottom: 32 },
  iconBtn: { width: 40, height: 40, borderRadius: 20, backgroundColor: Colors.grayBg, alignItems: 'center', justifyContent: 'center' },
  notifDot: { position: 'absolute', top: 8, right: 9, width: 8, height: 8, borderRadius: 4, backgroundColor: Colors.red, borderWidth: 1.5, borderColor: Colors.surface },
  listCard: { paddingVertical: 2 },
  rowAction: { fontSize: 13, fontWeight: '700', color: Colors.blue },
  barRow: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  barLabel: { width: 110, fontSize: 13, fontWeight: '600', color: Colors.textPrimary },
  barTrack: { flex: 1, height: 8, borderRadius: 4, backgroundColor: Colors.grayBg, overflow: 'hidden' },
  barFill: { height: '100%', borderRadius: 4 },
  barValue: { width: 28, textAlign: 'right', fontSize: 13, fontWeight: '700', color: Colors.textPrimary },
});
