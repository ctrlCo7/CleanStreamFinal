import React, { useEffect, useState, useMemo } from 'react';
import { View, Text, ScrollView, TouchableOpacity, StyleSheet, Alert } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useNavigation } from '@react-navigation/native';
import { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { useTheme } from '../../hooks/useTheme';
import { ThemeColors } from '../../constants/theme';
import { Badge } from '../../components/common/Badge';
import { MapPreview } from '../../components/common/MapPreview';
import { useAppSelector } from '../../store/hooks';
import { RootStackParamList, WasteReport, CleanupEvent, Announcement } from '../../types';
import { subscribeToBarangayReports } from '../../services/reportsService';
import { subscribeToUpcomingEvents } from '../../services/cleanupEventService';
import { getOrCreateAdminConversation } from '../../services/messagingService';
import { subscribeToAnnouncements } from '../../services/announcementService';

type Nav = NativeStackNavigationProp<RootStackParamList>;

export default function BarangayDashboardScreen() {
  const navigation = useNavigation<Nav>();
  const { colors } = useTheme();
  const styles = useMemo(() => createStyles(colors), [colors]);
  const { user } = useAppSelector((s) => s.auth);
  const { reports: allReports } = useAppSelector((s) => s.reports);

  const myBarangay = user?.barangay || 'Guadalupe';
  const myBarangayId = user?.barangayId || '';

  const [barangayReports, setBarangayReports] = useState<WasteReport[]>([]);
  const [events, setEvents] = useState<CleanupEvent[]>([]);
  const [messagingAdmin, setMessagingAdmin] = useState(false);
  const [announcements, setAnnouncements] = useState<Announcement[]>([]);

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

  // Admin instructions/announcements targeted at this barangay official (or all barangays)
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
      const result = await getOrCreateAdminConversation(user.uid, `${user.firstName} ${user.lastName}`, 'barangay');
      if (!result) {
        Alert.alert('No admin available', 'No admin account was found to message right now.');
        return;
      }
      navigation.navigate('BarangayChat', { conversationId: result.conversationId, participantName: result.adminName });
    } catch {
      Alert.alert('Couldn’t open chat', 'Please try again.');
    } finally {
      setMessagingAdmin(false);
    }
  };

  return (
    <SafeAreaView style={styles.container}>
      <View style={styles.header}>
        <View>
          <Text style={styles.greeting}>Barangay Dashboard</Text>
          <Text style={styles.subGreeting}>{myBarangay} BSP · {user ? `${user.firstName} ${user.lastName}` : 'Barangay Official'}</Text>
        </View>
        <View style={styles.rolePill}>
          <Text style={styles.rolePillText}>BSP</Text>
        </View>
      </View>

      <ScrollView contentContainerStyle={styles.body} showsVerticalScrollIndicator={false}>
        {/* Latest instructions from Admin */}
        {announcements.length > 0 && (
          <View style={styles.announceCard}>
            <Text style={styles.announceHeader}>Latest from Admin</Text>
            {announcements.map((a) => (
              <View key={a.id} style={styles.announceItem}>
                <View style={[styles.dot, { backgroundColor: a.priority === 'urgent' ? colors.critical : colors.blue }]} />
                <View style={{ flex: 1 }}>
                  <Text style={styles.announceTitle}>{a.title}</Text>
                  <Text style={styles.announceBody} numberOfLines={2}>{a.content}</Text>
                </View>
              </View>
            ))}
          </View>
        )}

        {/* Stats row */}
        <View style={styles.statsRow}>
          {[
            { val: myReports.length || 0, label: 'Total', color: colors.brgy },
            { val: activeReports.length || 0, label: 'Active', color: colors.amber },
            { val: criticalCount || 0, label: 'Critical', color: colors.critical },
            { val: resolvedCount || 0, label: 'Resolved', color: colors.green },
          ].map((s) => (
            <View key={s.label} style={styles.statCard}>
              <Text style={[styles.statVal, { color: s.color }]}>{s.val}</Text>
              <Text style={styles.statLabel}>{s.label}</Text>
            </View>
          ))}
        </View>

        {/* Map */}
        <MapPreview
          pins={hotspots}
          onPress={() => navigation.navigate('Map', {})}
          tagText={`${myBarangay} Hotspots`}
        />

        {/* Active alerts */}
        {criticalCount > 0 && (
          <TouchableOpacity style={styles.criticalBanner} onPress={() => navigation.navigate('BarangayVerify')} activeOpacity={0.85}>
            <View style={[styles.dot, { backgroundColor: colors.critical }]} />
            <View style={{ flex: 1 }}>
              <Text style={styles.criticalTitle}>Critical alert — {myBarangay}</Text>
              <Text style={styles.criticalSub}>Immediate specialist response required</Text>
            </View>
            <Badge variant="critical" label="Urgent" />
          </TouchableOpacity>
        )}

        {pendingReviewCount > 0 && (
          <TouchableOpacity style={styles.pendingBanner} onPress={() => navigation.navigate('BarangayVerify')} activeOpacity={0.85}>
            <View style={[styles.dot, { backgroundColor: colors.amber }]} />
            <View style={{ flex: 1 }}>
              <Text style={styles.pendingTitle}>{pendingReviewCount} report{pendingReviewCount > 1 ? 's' : ''} awaiting review</Text>
              <Text style={styles.pendingSub}>Tap to verify or reject submitted reports</Text>
            </View>
            <Text style={styles.pendingArrow}>›</Text>
          </TouchableOpacity>
        )}

        {/* Upcoming tasks */}
        <View style={styles.sectionHeader}>
          <Text style={styles.sectionTitle}>Upcoming cleanup events</Text>
        </View>

        {upcomingTasks.length === 0 ? (
          <View style={styles.emptyCard}>
            <Text style={styles.emptyText}>No upcoming events scheduled</Text>
          </View>
        ) : (
          upcomingTasks.map((task) => {
            const eventDate = task.eventDate
              ? new Date(task.eventDate).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })
              : '—';
            const isJoined = task.participantIds?.includes(user?.uid ?? '');
            return (
              <TouchableOpacity
                key={task.id}
                style={styles.taskCard}
                onPress={() => navigation.navigate('BarangaySchedule', {})}
                activeOpacity={0.85}
              >
                <View style={styles.taskLeft}>
                  <View style={[styles.taskDot, { backgroundColor: isJoined ? colors.teal : colors.amber }]} />
                </View>
                <View style={{ flex: 1 }}>
                  <Text style={styles.taskTitle}>{task.title}</Text>
                  <Text style={styles.taskDate}>{eventDate}</Text>
                  <Text style={styles.taskTeam}>{task.startTime} – {task.endTime}</Text>
                </View>
                <Badge variant={isJoined ? 'low' : 'pending'} label={isJoined ? 'Joined' : 'Upcoming'} />
              </TouchableOpacity>
            );
          })
        )}

        {/* Quick actions */}
        <View style={styles.sectionHeader}>
          <Text style={styles.sectionTitle}>Quick actions</Text>
        </View>
        <View style={styles.actionsRow}>
          <TouchableOpacity style={[styles.actionBtn, { backgroundColor: colors.amberBg, borderColor: colors.amber }]} onPress={() => navigation.navigate('BarangayVerify')}>
            <Text style={[styles.actionBtnText, { color: colors.amberText }]}>Review reports</Text>
          </TouchableOpacity>
          <TouchableOpacity style={[styles.actionBtn, { backgroundColor: colors.brgyLight, borderColor: colors.brgyMid }]} onPress={() => navigation.navigate('BarangaySchedule', {})}>
            <Text style={[styles.actionBtnText, { color: colors.brgyDark }]}>View schedule</Text>
          </TouchableOpacity>
          <TouchableOpacity style={[styles.actionBtn, { backgroundColor: colors.tealLight, borderColor: colors.tealMid }]} onPress={handleMessageAdmin} disabled={messagingAdmin}>
            <Text style={[styles.actionBtnText, { color: colors.tealDark }]}>{messagingAdmin ? 'Opening…' : 'Message admin'}</Text>
          </TouchableOpacity>
        </View>
        <TouchableOpacity
          style={[styles.actionBtn, { backgroundColor: colors.brgyLight, borderColor: colors.brgyMid, marginTop: 6 }]}
          onPress={() => navigation.navigate('BarangayAlarms')}
        >
          <Text style={[styles.actionBtnText, { color: colors.brgyDark }]}>⏰ Set waterway check alarms</Text>
        </TouchableOpacity>
      </ScrollView>
    </SafeAreaView>
  );
}

const createStyles = (Colors: ThemeColors) => StyleSheet.create({
  container: { flex: 1, backgroundColor: Colors.grayBg },
  header: {
    backgroundColor: Colors.white, paddingHorizontal: 16, paddingVertical: 13,
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
    borderBottomWidth: 0.5, borderBottomColor: Colors.border,
  },
  greeting: { fontSize: 15, fontWeight: '500', color: Colors.textPrimary },
  subGreeting: { fontSize: 10, color: Colors.textMuted, marginTop: 2 },
  rolePill: { backgroundColor: Colors.brgyLight, paddingHorizontal: 10, paddingVertical: 4, borderRadius: 20 },
  rolePillText: { fontSize: 10, color: Colors.brgyDark, fontWeight: '500' },
  body: { padding: 14, gap: 10, paddingBottom: 24 },
  announceCard: {
    backgroundColor: Colors.brgyLight, borderRadius: 13, padding: 12,
    borderWidth: 0.5, borderColor: Colors.brgyMid, gap: 8,
  },
  announceHeader: { fontSize: 11, fontWeight: '500', color: Colors.brgyDark, textTransform: 'uppercase', letterSpacing: 0.03 },
  announceItem: { flexDirection: 'row', alignItems: 'flex-start', gap: 8 },
  announceTitle: { fontSize: 12, fontWeight: '500', color: Colors.textPrimary },
  announceBody: { fontSize: 11, color: Colors.textMuted, marginTop: 2, lineHeight: 15 },
  statsRow: { flexDirection: 'row', gap: 7 },
  statCard: { flex: 1, backgroundColor: Colors.white, borderRadius: 12, padding: 10, alignItems: 'center', borderWidth: 0.5, borderColor: Colors.border },
  statVal: { fontSize: 18, fontWeight: '500' },
  statLabel: { fontSize: 9, color: Colors.textMuted, marginTop: 2 },
  criticalBanner: {
    backgroundColor: Colors.criticalBg, borderRadius: 12, padding: 11, paddingHorizontal: 13,
    borderWidth: 0.5, borderColor: 'rgba(192,57,43,0.2)', borderLeftWidth: 3, borderLeftColor: Colors.critical,
    flexDirection: 'row', alignItems: 'center', gap: 10,
  },
  dot: { width: 9, height: 9, borderRadius: 4.5 },
  criticalTitle: { fontSize: 12, fontWeight: '500', color: Colors.criticalText },
  criticalSub: { fontSize: 10, color: Colors.criticalText, opacity: 0.8, marginTop: 2 },
  pendingBanner: {
    backgroundColor: Colors.amberBg, borderRadius: 12, padding: 11, paddingHorizontal: 13,
    borderWidth: 0.5, borderColor: 'rgba(217,164,65,0.3)', borderLeftWidth: 3, borderLeftColor: Colors.amber,
    flexDirection: 'row', alignItems: 'center', gap: 10,
  },
  pendingTitle: { fontSize: 12, fontWeight: '500', color: Colors.amberText },
  pendingSub: { fontSize: 10, color: Colors.amberText, opacity: 0.8, marginTop: 2 },
  pendingArrow: { fontSize: 18, color: Colors.amberText },
  sectionHeader: { marginTop: 4 },
  sectionTitle: { fontSize: 12, fontWeight: '500', color: Colors.textPrimary },
  emptyCard: { backgroundColor: Colors.white, borderRadius: 12, padding: 16, alignItems: 'center', borderWidth: 0.5, borderColor: Colors.border },
  emptyText: { fontSize: 12, color: Colors.textHint },
  taskCard: {
    backgroundColor: Colors.white, borderRadius: 13, padding: 11,
    flexDirection: 'row', alignItems: 'center', gap: 10,
    borderWidth: 0.5, borderColor: Colors.border,
  },
  taskLeft: { width: 20, alignItems: 'center' },
  taskDot: { width: 9, height: 9, borderRadius: 4.5 },
  taskTitle: { fontSize: 12, fontWeight: '500', color: Colors.textPrimary },
  taskDate: { fontSize: 10, color: Colors.textMuted, marginTop: 2 },
  taskTeam: { fontSize: 10, color: Colors.textHint, marginTop: 1 },
  actionsRow: { flexDirection: 'row', gap: 6 },
  actionBtn: { flex: 1, borderRadius: 12, paddingVertical: 11, paddingHorizontal: 4, alignItems: 'center', justifyContent: 'center', borderWidth: 0.5 },
  actionBtnText: { fontSize: 10.5, fontWeight: '500', textAlign: 'center' },
});
