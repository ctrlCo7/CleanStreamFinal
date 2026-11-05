import { NotificationBell } from '../../components/common/NotificationBell';
import React, { useEffect, useCallback, useMemo, useState } from 'react';
import { View, Text, ScrollView, TouchableOpacity, StyleSheet, RefreshControl } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useNavigation } from '@react-navigation/native';
import { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { BottomTabNavigationProp } from '@react-navigation/bottom-tabs';
import { useTheme } from '../../hooks/useTheme';
import { useAppSettings } from '../../services/appSettings';
import { ThemeColors } from '../../constants/theme';
import { ActivityLog, AdminTabParamList, CleanupTask, CrewTracking, RootStackParamList, SeverityLevel } from '../../types';
import { useAppDispatch, useAppSelector } from '../../store/hooks';
import { fetchAllReports } from '../../store/reportsSlice';
import { MapPreview } from '../../components/common/MapPreview';
import { BellIcon } from '../../components/common/TabIcons';
import { ActionGrid, AlertStrip, Card, EmptyNote, ListRow, ScreenHeader, SectionHead, StatStrip, greetingFor } from '../../components/ui/Kit';
import { subscribeActiveTrips } from '../../services/crewTrackingService';
import { formatEta } from '../../services/routeMath';
import { subscribeToBarangayTasks } from '../../services/cleanupTaskService';
import { subscribeToBarangayActivity } from '../../services/activityLogService';
import { APPROVED_STATUSES } from '../../services/scheduleConflicts';
import { CHECKPOINT_STATUS_LABELS } from '../../services/checkpointStatus';
import { formatCheckpointTime } from '../../services/checkpointService';
import { useCheckpointMonitor } from '../../hooks/useCheckpointMonitor';
import { formatDateKey, formatHHmm } from '../../utils/dates';
import { formatPH, phDateKey } from '../../utils/phTime';

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
  const [tasks, setTasks] = useState<CleanupTask[]>([]);
  const [activity, setActivity] = useState<ActivityLog[]>([]);
  // Today's waterway checkpoints (statuses refresh every minute).
  const monitor = useCheckpointMonitor(user);

  const barangayId = user?.barangayId;
  const load = useCallback(() => dispatch(fetchAllReports(barangayId)), [dispatch, barangayId]);
  useEffect(() => { load(); }, [load]);
  useEffect(() => subscribeActiveTrips({ role: 'admin', barangayId }, setTrips), [barangayId]);
  useEffect(() => (barangayId ? subscribeToBarangayTasks(barangayId, setTasks, () => setTasks([])) : undefined), [barangayId]);
  useEffect(() => (barangayId ? subscribeToBarangayActivity(barangayId, setActivity, 8) : undefined), [barangayId]);

  // Cleanup schedules
  const today = phDateKey();
  const proposals = tasks.filter((t) => t.status === 'proposed');
  const approvedTasks = tasks.filter((t) => (APPROVED_STATUSES as readonly string[]).includes(t.status));
  const upcoming = approvedTasks.filter((t) => t.scheduledDate >= today)
    .sort((a, b) => `${a.scheduledDate}${a.startTime}`.localeCompare(`${b.scheduledDate}${b.startTime}`)).slice(0, 5);
  const declined = tasks.filter((t) => t.status === 'declined').length;
  const rejectedSchedules = tasks.filter((t) => t.status === 'rejected').length;
  const completedCleanups = tasks.filter((t) => t.status === 'completed').length;
  // Checkpoints
  const cp = monitor.progress;
  const flagged = (monitor.checkpoints ?? []).filter((c) => ['missed', 'issue'].includes(monitor.statuses.get(c.id) ?? ''));

  const open = reports.filter((r) => OPEN(r.status));
  const critical = open.filter((r) => r.severity === 'critical').length;
  const high = open.filter((r) => r.severity === 'high').length;
  const pending = reports.filter((r) => r.status === 'pending').length;
  const verified = reports.filter((r) => r.status === 'verified').length;
  const rejectedReports = reports.filter((r) => r.status === 'rejected').length;
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
        subtitle={`Barangay Captain · ${user?.barangay ? `Brgy. ${user.barangay}` : 'no barangay set'}`}
        right={(
          <View style={{ flexDirection: 'row', gap: 8 }}>
            <TouchableOpacity style={styles.iconBtn} onPress={() => navigation.navigate('AdminAlerts')} accessibilityLabel="Urgent report alerts">
              <Text style={{ fontSize: 16 }}>🚨</Text>
              {(critical > 0 || high > 0) && <View style={styles.notifDot} />}
            </TouchableOpacity>
            <NotificationBell />
          </View>
        )}
      />

      <ScrollView
        contentContainerStyle={styles.body}
        showsVerticalScrollIndicator={false}
        refreshControl={<RefreshControl refreshing={loading} onRefresh={() => { load(); }} tintColor={colors.blue} />}
      >
        {!barangayId && (
          <AlertStrip
            icon="📍"
            title="No barangay on your account"
            sub="A Captain only sees their own barangay. Ask the Super Admin to set your barangay."
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
        {proposals.length > 0 && (
          <AlertStrip
            icon="🗓️"
            title={`${proposals.length} cleanup schedule${proposals.length === 1 ? '' : 's'} awaiting your approval`}
            sub="Each was checked automatically for conflicts"
            color={colors.blueText}
            bg={colors.blueBg}
            onPress={() => navigation.navigate('AdminApprovals')}
          />
        )}
        {cp.missed + cp.issue > 0 && (
          <AlertStrip
            icon="🌊"
            title={[cp.missed ? `${cp.missed} missed checkpoint${cp.missed === 1 ? '' : 's'}` : '', cp.issue ? `${cp.issue} issue${cp.issue === 1 ? '' : 's'} detected` : ''].filter(Boolean).join(' · ') + ' today'}
            sub="See today's checkpoints below"
            color={colors.redText}
            bg={colors.redBg}
            onPress={() => tabNav.navigate('AdminHistory')}
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

        <SectionHead title={`Citizen reports · ${reports.length} total`} />
        <StatStrip
          items={[
            { value: pending, label: 'To verify', color: colors.amber },
            { value: verified, label: 'Verified', color: colors.blue },
            { value: rejectedReports, label: 'Rejected', color: colors.red },
            { value: critical + high, label: 'Urgent', color: colors.critical, onPress: () => navigation.navigate('AdminAlerts') },
          ]}
        />

        <SectionHead title="Cleanup schedules" action="Approvals" onAction={() => navigation.navigate('AdminApprovals')} />
        <StatStrip
          items={[
            { value: proposals.length, label: 'To approve', color: colors.amber, onPress: () => navigation.navigate('AdminApprovals') },
            { value: approvedTasks.length, label: 'Approved', color: colors.blue },
            { value: declined + rejectedSchedules, label: 'Declined', color: colors.red },
            { value: completedCleanups, label: 'Completed', color: colors.green },
          ]}
        />
        {upcoming.length > 0 && (
          <Card style={styles.listCard}>
            {upcoming.map((t, i) => (
              <ListRow
                key={t.id}
                first={i === 0}
                accent={colors.teal}
                title={`${formatDateKey(t.scheduledDate)} · ${formatHHmm(t.startTime)}–${formatHHmm(t.endTime)}`}
                meta={`Upcoming · ${t.assignedTeamName} · ${t.location?.address || t.barangay}`}
                onPress={() => navigation.navigate('CleanupTaskDetail', { taskId: t.id })}
              />
            ))}
          </Card>
        )}

        <SectionHead title={`Today's checkpoints · ${cp.done}/${cp.dueToday} inspected`} action="Reports" onAction={() => tabNav.navigate('AdminHistory')} />
        <StatStrip
          items={[
            { value: cp.pending + cp.ongoing, label: 'Pending', color: colors.amber },
            { value: cp.completed, label: 'Completed', color: colors.green },
            { value: cp.missed, label: 'Missed', color: colors.red },
            { value: cp.issue, label: 'Issues', color: colors.redText },
          ]}
        />
        {flagged.length > 0 && (
          <Card style={styles.listCard}>
            {flagged.map((c, i) => {
              const st = monitor.statuses.get(c.id) ?? 'pending';
              return (
                <ListRow
                  key={c.id}
                  first={i === 0}
                  accent={st === 'missed' ? colors.red : colors.redText}
                  title={`${c.name} · ${CHECKPOINT_STATUS_LABELS[st]}`}
                  meta={st === 'missed'
                    ? `Due ${formatCheckpointTime(c.time)} · ${c.assignedNames.join(', ') || 'any official'}`
                    : `Condition ${c.lastCondition ?? '-'} · by ${c.lastInspectedByName ?? 'an official'}`}
                  onPress={() => tabNav.navigate('AdminHistory')}
                />
              );
            })}
          </Card>
        )}

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

        {features.mapView && (
          <>
            <SectionHead title="Hotspot map" action="Open map" onAction={() => navigation.navigate('Map', {})} />
            <MapPreview pins={hotspots} onPress={() => navigation.navigate('Map', {})} tagText="Open reports · tap to expand" />
          </>
        )}

        <SectionHead title="Activity log" />
        {activity.length === 0 ? (
          <EmptyNote title="No activity yet" text="Verifications, schedule decisions and inspections in your barangay are recorded here." />
        ) : (
          <Card style={styles.listCard}>
            {activity.map((a, i) => (
              <ListRow
                key={a.id}
                first={i === 0}
                accent={colors.grayMid}
                title={String(a.details?.summary ?? a.action.replace(/_/g, ' '))}
                meta={`${a.userName} · ${formatPH(a.timestamp)}`}
              />
            ))}
          </Card>
        )}

        <SectionHead title="Manage" />
        <ActionGrid
          tiles={[
            { icon: '🗓️', label: 'Cleanup approvals', sub: 'Approve or reject schedules', tint: colors.blueText, tintBg: colors.blueBg, onPress: () => navigation.navigate('AdminApprovals'), badge: proposals.length },
            { icon: '🔔', label: 'Alerts', sub: 'High and critical reports', tint: colors.redText, tintBg: colors.redBg, onPress: () => navigation.navigate('AdminAlerts'), badge: critical + high },
            { icon: '📊', label: 'Analytics', sub: 'Trends and export', tint: colors.blueText, tintBg: colors.blueBg, onPress: () => tabNav.navigate('AdminAnalytics') },
            { icon: '✅', label: 'Checkpoint reports', sub: 'Verify barangay inspections', tint: colors.tealDark, tintBg: colors.tealLight, onPress: () => tabNav.navigate('AdminHistory') },
            { icon: '⏰', label: 'Checkpoint alarms', sub: 'Daily reminder for your officials', tint: colors.brgyDark, tintBg: colors.brgyLight, onPress: () => navigation.navigate('AdminCheckpointAlarms') },
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
