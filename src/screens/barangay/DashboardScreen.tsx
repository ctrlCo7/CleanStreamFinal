import { NotificationBell } from '../../components/common/NotificationBell';
import React, { useEffect, useState, useMemo } from 'react';
import { View, Text, ScrollView, TouchableOpacity, StyleSheet, Alert } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useNavigation } from '@react-navigation/native';
import { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { useTheme } from '../../hooks/useTheme';
import { useAppSettings } from '../../services/appSettings';
import { ThemeColors } from '../../constants/theme';
import { Badge } from '../../components/common/Badge';
import { ActionGrid, AlertStrip, Card, EmptyNote, ListRow, Pill, ScreenHeader, SectionHead, StatStrip, greetingFor } from '../../components/ui/Kit';
import { MapPreview } from '../../components/common/MapPreview';
import { useAppSelector } from '../../store/hooks';
import { BottomTabNavigationProp } from '@react-navigation/bottom-tabs';
import { BarangayTabParamList, RootStackParamList, WasteReport, CleanupEvent, Announcement } from '../../types';
import { subscribeToBarangayReports } from '../../services/reportsService';
import { subscribeToUpcomingEvents } from '../../services/cleanupEventService';
import { getOrCreateAdminConversation } from '../../services/messagingService';
import { subscribeToAnnouncements } from '../../services/announcementService';
import { subscribeToBarangayTasks } from '../../services/cleanupTaskService';
import {
  ManagedCheckpoint, formatCheckpointTime, isInspectedToday, subscribeToBarangayCheckpoints, todayCheckpointDay,
} from '../../services/checkpointService';
import { CHECKPOINT_STATUS_LABELS, checkpointDayStatus } from '../../services/checkpointStatus';

type Nav = NativeStackNavigationProp<RootStackParamList>;

export default function BarangayDashboardScreen() {
  const navigation = useNavigation<Nav>();
  const tabNav = useNavigation<BottomTabNavigationProp<BarangayTabParamList>>();
  const { colors } = useTheme();
  const styles = useMemo(() => createStyles(colors), [colors]);
  const { features } = useAppSettings();
  const { user } = useAppSelector((s) => s.auth);
  const { reports: allReports } = useAppSelector((s) => s.reports);

  const myBarangay = user?.barangay || 'Guadalupe';
  const myBarangayId = user?.barangayId || '';

  const [barangayReports, setBarangayReports] = useState<WasteReport[]>([]);
  const [events, setEvents] = useState<CleanupEvent[]>([]);
  const [messagingAdmin, setMessagingAdmin] = useState(false);
  const [announcements, setAnnouncements] = useState<Announcement[]>([]);
  // Tasks that wait on this official: declined by the crew, or finished but not yet confirmed.
  const [needsYouCount, setNeedsYouCount] = useState(0);
  const [checkpoints, setCheckpoints] = useState<ManagedCheckpoint[]>([]);

  useEffect(() => {
    if (!myBarangayId || !user?.uid) return;
    return subscribeToBarangayCheckpoints(myBarangayId, user.uid, setCheckpoints);
  }, [myBarangayId, user?.uid]);

  // This official's inspections due today (all of today's, if nobody is assigned anywhere).
  const today = todayCheckpointDay();
  const dueToday = checkpoints.filter((c) => c.days.includes(today));
  const mineToday = dueToday.filter((c) => !!user?.uid && c.assignedUserIds.includes(user.uid));
  const todayList = mineToday.length > 0 ? mineToday : dueToday;

  useEffect(() => {
    if (!myBarangayId) return;
    const unsub = subscribeToBarangayTasks(myBarangayId, (tasks) => {
      // Schedules that need a new proposal: declined for a conflict, rejected by the Captain, or turned down by the crew.
      setNeedsYouCount(tasks.filter((t) => t.status === 'declined' || t.status === 'rejected' || t.status === 'cancelled').length);
    });
    return unsub;
  }, [myBarangayId]);

  // Real-time barangay reports subscription
  useEffect(() => {
    if (!myBarangayId) {
      // Fall back to filtering all reports by barangay name
      const filtered = allReports.filter(
        (r) => r.location?.barangay === myBarangay || r.barangay === myBarangay,
      );
      setBarangayReports(filtered);
      return;
    }
    const unsub = subscribeToBarangayReports(myBarangayId, setBarangayReports);
    return unsub;
  }, [myBarangayId, myBarangay, allReports]);

  // Real-time upcoming cleanup events
  useEffect(() => {
    const unsub = subscribeToUpcomingEvents(setEvents);
    return unsub;
  }, []);

  // The Barangay Captain's instructions to this barangay's officials (older ones may target all barangays)
  useEffect(() => {
    const unsub = subscribeToAnnouncements('barangay', (all) => {
      const relevant = myBarangayId
        ? all.filter((a) => a.targetBarangayIds.length === 0 || a.targetBarangayIds.includes(myBarangayId))
        : all;
      setAnnouncements(relevant.slice(0, 3));
    });
    return unsub;
  }, [myBarangayId]);

  const myReports = barangayReports;
  const activeReports = myReports.filter((r) => r.status !== 'completed' && r.status !== 'rejected' && r.status !== 'cancelled');
  const criticalCount = myReports.filter((r) => r.severity === 'critical' && r.status !== 'completed').length;
  const resolvedCount = myReports.filter((r) => r.status === 'completed').length;
  const pendingReviewCount = myReports.filter((r) => r.status === 'pending').length;

  const hotspots = myReports
    .filter((r) => typeof r.location?.latitude === 'number' && typeof r.location?.longitude === 'number')
    .slice(0, 6)
    .map((r) => ({
      id: r.id,
      latitude: r.location.latitude,
      longitude: r.location.longitude,
      severity: (r.severity || 'moderate') as 'critical' | 'high' | 'moderate' | 'low',
    }));

  // Filter events for this barangay or show all upcoming
  const upcomingTasks = events
    .filter((e) => !myBarangayId || e.barangayId === myBarangayId || e.barangay === myBarangay)
    .slice(0, 3);

  const handleMessageAdmin = async () => {
    if (!user?.uid || messagingAdmin) return;
    setMessagingAdmin(true);
    try {
      const result = await getOrCreateAdminConversation(user.uid, `${user.firstName} ${user.lastName}`, 'barangay', user.barangayId);
      if (!result) {
        Alert.alert('No Barangay Captain yet', 'Your barangay has no Barangay Captain account yet. Ask the Super Admin to add one.');
        return;
      }
      navigation.navigate('BarangayChat', { conversationId: result.conversationId, participantName: result.adminName });
    } catch {
      Alert.alert('Couldn’t open chat', 'Please try again.');
    } finally {
      setMessagingAdmin(false);
    }
  };

  const doneToday = todayList.filter((c) => isInspectedToday(c)).length;
  const attention = criticalCount + pendingReviewCount + needsYouCount;

  return (
    <SafeAreaView style={styles.container} edges={['top']}>
      <ScreenHeader
        title={`${greetingFor()}, ${user?.firstName || 'Official'}`}
        subtitle={`Brgy. ${myBarangay} · Barangay official`}
        right={<NotificationBell />}
      />

      <ScrollView contentContainerStyle={styles.body} showsVerticalScrollIndicator={false}>
        {/* What needs the official now */}
        {attention === 0 ? (
          <View style={styles.allClear}>
            <Text style={styles.allClearIcon}>✓</Text>
            <View style={{ flex: 1 }}>
              <Text style={styles.allClearTitle}>All caught up</Text>
              <Text style={styles.allClearSub}>No reports waiting for review and no urgent alerts in {myBarangay}.</Text>
            </View>
          </View>
        ) : (
          <View style={{ gap: 8 }}>
            {criticalCount > 0 && (
              <AlertStrip
                icon="🚨"
                title={`${criticalCount} critical report${criticalCount === 1 ? '' : 's'} open`}
                sub="Needs an immediate cleanup response"
                color={colors.criticalText}
                bg={colors.criticalBg}
                onPress={() => navigation.navigate('BarangayVerify')}
              />
            )}
            {pendingReviewCount > 0 && (
              <AlertStrip
                icon="📝"
                title={`${pendingReviewCount} report${pendingReviewCount === 1 ? '' : 's'} waiting for review`}
                sub="Verify or reject what residents sent"
                color={colors.amberText}
                bg={colors.amberBg}
                onPress={() => navigation.navigate('BarangayVerify')}
              />
            )}
            {needsYouCount > 0 && (
              <AlertStrip
                icon="🚛"
                title={`${needsYouCount} cleanup schedule${needsYouCount === 1 ? '' : 's'} need${needsYouCount === 1 ? 's' : ''} a new proposal`}
                sub="Declined for a conflict, rejected by the Captain, or turned down by the crew"
                color={colors.tealDark}
                bg={colors.tealLight}
                onPress={() => navigation.navigate('BarangayCrewTasks')}
              />
            )}
          </View>
        )}

        <StatStrip
          items={[
            { value: myReports.length, label: 'Reports', color: colors.brgy },
            { value: activeReports.length, label: 'Active', color: colors.amber },
            { value: criticalCount, label: 'Critical', color: colors.critical },
            { value: resolvedCount, label: 'Resolved', color: colors.green },
          ]}
        />

        {/* Today's checkpoint inspections */}
        {checkpoints.length > 0 && (
          <>
            <SectionHead title={`Today's inspections · ${doneToday}/${todayList.length}`} action="File one" onAction={() => tabNav.navigate('BarangayReport')} />
            {todayList.length === 0 ? (
              <EmptyNote title="No inspections scheduled today" text={`${checkpoints.length} checkpoint${checkpoints.length === 1 ? '' : 's'} in ${myBarangay}.`} />
            ) : (
              <Card style={styles.listCard}>
                {todayList.map((c, i) => {
                  // Pending inspection · Inspection ongoing · Completed · Issue detected · Missed checkpoint
                  const st = checkpointDayStatus(c);
                  const done = st === 'completed' || st === 'issue';
                  const tint = { not_today: colors.textMuted, pending: colors.amber, ongoing: colors.blue, completed: colors.green, issue: colors.redText, missed: colors.red }[st];
                  return (
                    <ListRow
                      key={c.id}
                      first={i === 0}
                      accent={tint}
                      title={c.name}
                      meta={`${formatCheckpointTime(c.time)}${c.waterway ? ` · ${c.waterway}` : ''}${done && c.lastInspectedByName ? ` · by ${c.lastInspectedByName}` : ''}`}
                      right={<Text style={[styles.rowStatus, { color: tint }]}>{done ? CHECKPOINT_STATUS_LABELS[st] : `${CHECKPOINT_STATUS_LABELS[st]} ›`}</Text>}
                      onPress={() => tabNav.navigate('BarangayReport')}
                    />
                  );
                })}
              </Card>
            )}
          </>
        )}

        <SectionHead title="Quick actions" />
        <ActionGrid
          tiles={[
            { icon: '📝', label: 'Review reports', sub: pendingReviewCount ? `${pendingReviewCount} waiting` : 'Verify what residents sent', tint: colors.amberText, tintBg: colors.amberBg, onPress: () => navigation.navigate('BarangayVerify'), badge: pendingReviewCount },
            { icon: '🚛', label: 'Cleanup schedules', sub: 'Propose and follow', tint: colors.tealDark, tintBg: colors.tealLight, onPress: () => navigation.navigate('BarangayCrewTasks'), badge: needsYouCount },
            { icon: '📅', label: 'Schedule', sub: 'Cleanups and events', tint: colors.brgyDark, tintBg: colors.brgyLight, onPress: () => navigation.navigate('BarangaySchedule', {}) },
            { icon: '⏰', label: 'Daily alarm', sub: 'Waterway check reminder', tint: colors.brgyDark, tintBg: colors.brgyLight, onPress: () => navigation.navigate('BarangayAlarms') },
            ...(features.cleanupEvents ? [{ icon: '🤝', label: 'Plan a volunteer cleanup', sub: 'Invite residents', tint: colors.greenText, tintBg: colors.greenBg, onPress: () => navigation.navigate('BarangayCreateEvent') }] : []),
            ...(features.messaging ? [{ icon: '💬', label: messagingAdmin ? 'Opening…' : 'Message your Captain', sub: 'Ask or report a problem', tint: colors.blueText, tintBg: colors.blueBg, onPress: handleMessageAdmin, disabled: messagingAdmin }] : []),
          ]}
        />

        {/* Map */}
        {features.mapView && (
          <>
            <SectionHead title={`${myBarangay} hotspots`} action="Open map" onAction={() => navigation.navigate('Map', {})} />
            <MapPreview pins={hotspots} onPress={() => navigation.navigate('Map', {})} tagText="Tap to expand" />
          </>
        )}

        {/* Latest instructions from the Admin */}
        {features.announcements && announcements.length > 0 && (
          <>
            <SectionHead title="From your Barangay Captain" />
            <Card style={styles.listCard}>
              {announcements.map((a, i) => (
                <ListRow
                  key={a.id}
                  first={i === 0}
                  accent={a.priority === 'urgent' ? colors.critical : colors.blue}
                  title={a.title}
                  meta={a.content}
                />
              ))}
            </Card>
          </>
        )}

        {/* Upcoming events */}
        {features.cleanupEvents && (
          <>
            <SectionHead title="Upcoming cleanup events" action={upcomingTasks.length ? 'Schedule' : undefined} onAction={() => navigation.navigate('BarangaySchedule', {})} />
            {upcomingTasks.length === 0 ? (
              <EmptyNote title="No upcoming events" text="Plan a volunteer cleanup to involve residents." />
            ) : (
              <Card style={styles.listCard}>
                {upcomingTasks.map((task, i) => {
                  const eventDate = task.eventDate
                    ? new Date(task.eventDate).toLocaleDateString('en-PH', { timeZone: 'Asia/Manila', month: 'short', day: 'numeric', year: 'numeric' })
                    : '—';
                  const isJoined = task.participantIds?.includes(user?.uid ?? '');
                  return (
                    <ListRow
                      key={task.id}
                      first={i === 0}
                      accent={isJoined ? colors.teal : colors.amber}
                      title={task.title}
                      meta={`${eventDate} · ${task.startTime} – ${task.endTime}`}
                      right={<Badge variant={isJoined ? 'low' : 'pending'} label={isJoined ? 'Joined' : 'Upcoming'} />}
                      onPress={() => navigation.navigate('BarangayEventDetail', { eventId: task.id })}
                    />
                  );
                })}
              </Card>
            )}
          </>
        )}
      </ScrollView>
    </SafeAreaView>
  );
}

const createStyles = (Colors: ThemeColors) => StyleSheet.create({
  container: { flex: 1, backgroundColor: Colors.grayBg },
  body: { padding: 16, gap: 12, paddingBottom: 32 },
  allClear: { flexDirection: 'row', alignItems: 'center', gap: 12, borderRadius: 16, padding: 14, backgroundColor: Colors.tealLight },
  allClearIcon: { fontSize: 20, fontWeight: '800', color: Colors.tealDark, width: 36, height: 36, borderRadius: 18, textAlign: 'center', lineHeight: 36, backgroundColor: Colors.surface, overflow: 'hidden' },
  allClearTitle: { fontSize: 15, fontWeight: '700', color: Colors.tealDark },
  allClearSub: { fontSize: 12, color: Colors.tealDark, marginTop: 2, lineHeight: 17 },
  listCard: { paddingVertical: 2 },
  rowStatus: { fontSize: 13, fontWeight: '700' },
});
