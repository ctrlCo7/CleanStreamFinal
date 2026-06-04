import React from 'react';
import { View, Text, ScrollView, TouchableOpacity, StyleSheet, SafeAreaView } from 'react-native';
import { useNavigation } from '@react-navigation/native';
import { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { Colors } from '../../constants/colors';
import { Badge } from '../../components/common/Badge';
import { MapPreview } from '../../components/common/MapPreview';
import { useAppSelector } from '../../store/hooks';
import { RootStackParamList } from '../../types';

type Nav = NativeStackNavigationProp<RootStackParamList>;

const UPCOMING_TASKS = [
  { id: 't1', title: 'Guadalupe cleanup coordination', date: 'Apr 5, 6:00 AM', team: 'Team B (Hazmat)', status: 'confirmed' },
  { id: 't2', title: 'Punta Princesa sweep', date: 'Apr 6, 7:00 AM', team: 'Team A', status: 'pending' },
  { id: 't3', title: 'Labangon River inspection', date: 'Apr 7, 8:00 AM', team: 'Team C', status: 'pending' },
];

export default function BarangayDashboardScreen() {
  const navigation = useNavigation<Nav>();
  const { user } = useAppSelector((s) => s.auth);
  const { reports } = useAppSelector((s) => s.reports);

  const myBarangay = user?.barangay || 'Guadalupe';
  const myReports = reports.filter((r) => r.location?.barangay === myBarangay);
  const activeReports = myReports.filter((r) => r.status !== 'resolved');
  const criticalCount = myReports.filter((r) => r.severity === 'critical' && r.status !== 'resolved').length;

  const hotspots = reports
    .filter((r) => r.location?.lat && r.location?.lng)
    .map((r) => ({ id: r.id, lat: r.location!.lat!, lng: r.location!.lng!, severity: r.severity }));

  return (
    <SafeAreaView style={styles.container}>
      <View style={styles.header}>
        <View>
          <Text style={styles.greeting}>Barangay Dashboard</Text>
          <Text style={styles.subGreeting}>{myBarangay} BHW · {user ? `${user.firstName} ${user.lastName}` : 'BHW Officer'}</Text>
        </View>
        <View style={styles.rolePill}>
          <Text style={styles.rolePillText}>BHW</Text>
        </View>
      </View>

      <ScrollView contentContainerStyle={styles.body} showsVerticalScrollIndicator={false}>
        {/* Stats row */}
        <View style={styles.statsRow}>
          {[
            { val: myReports.length || 12, label: 'Total', color: Colors.brgy },
            { val: activeReports.length || 4, label: 'Active', color: Colors.amber },
            { val: criticalCount || 1, label: 'Critical', color: Colors.critical },
            { val: myReports.filter((r) => r.status === 'resolved').length || 8, label: 'Resolved', color: Colors.green },
          ].map((s) => (
            <View key={s.label} style={styles.statCard}>
              <Text style={[styles.statVal, { color: s.color }]}>{s.val}</Text>
              <Text style={styles.statLabel}>{s.label}</Text>
            </View>
          ))}
        </View>

        {/* Map */}
        <MapPreview
          hotspots={hotspots.length > 0 ? hotspots : [
            { id: 'm1', lat: 10.3095, lng: 123.8973, severity: 'critical' },
            { id: 'm2', lat: 10.3240, lng: 123.9185, severity: 'high' },
          ]}
          onPinPress={(id) => navigation.navigate('CitizenDetail', { reportId: id })}
          tag={`${myBarangay} Hotspots`}
        />

        {/* Active alerts */}
        {criticalCount > 0 && (
          <View style={styles.criticalBanner}>
            <View style={[styles.dot, { backgroundColor: Colors.critical }]} />
            <View style={{ flex: 1 }}>
              <Text style={styles.criticalTitle}>Critical alert — {myBarangay}</Text>
              <Text style={styles.criticalSub}>Immediate specialist response required</Text>
            </View>
            <Badge variant="critical" label="Urgent" />
          </View>
        )}

        {/* Upcoming tasks */}
        <View style={styles.sectionHeader}>
          <Text style={styles.sectionTitle}>Upcoming cleanup tasks</Text>
        </View>

        {UPCOMING_TASKS.map((task) => (
          <TouchableOpacity
            key={task.id}
            style={styles.taskCard}
            onPress={() => navigation.navigate('BarangaySchedule', {})}
            activeOpacity={0.85}
          >
            <View style={styles.taskLeft}>
              <View style={[styles.taskDot, { backgroundColor: task.status === 'confirmed' ? Colors.teal : Colors.amber }]} />
            </View>
            <View style={{ flex: 1 }}>
              <Text style={styles.taskTitle}>{task.title}</Text>
              <Text style={styles.taskDate}>{task.date}</Text>
              <Text style={styles.taskTeam}>{task.team}</Text>
            </View>
            <Badge variant={task.status === 'confirmed' ? 'resolved' : 'pending'} label={task.status === 'confirmed' ? 'Confirmed' : 'Pending'} />
          </TouchableOpacity>
        ))}

        {/* Quick actions */}
        <View style={styles.sectionHeader}>
          <Text style={styles.sectionTitle}>Quick actions</Text>
        </View>
        <View style={styles.actionsRow}>
          <TouchableOpacity style={[styles.actionBtn, { backgroundColor: Colors.brgyLight, borderColor: Colors.brgyMid }]} onPress={() => navigation.navigate('BarangaySchedule', {})}>
            <Text style={[styles.actionBtnText, { color: Colors.brgyDark }]}>View schedule</Text>
          </TouchableOpacity>
          <TouchableOpacity style={[styles.actionBtn, { backgroundColor: Colors.tealLight, borderColor: Colors.tealMid }]} onPress={() => navigation.navigate('BarangayChat', { conversationId: 'admin_main', participantName: 'Admin Office (CENRO)' })}>
            <Text style={[styles.actionBtnText, { color: Colors.tealDark }]}>Message admin</Text>
          </TouchableOpacity>
        </View>
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
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
  sectionHeader: { marginTop: 4 },
  sectionTitle: { fontSize: 12, fontWeight: '500', color: Colors.textPrimary },
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
  actionsRow: { flexDirection: 'row', gap: 8 },
  actionBtn: { flex: 1, borderRadius: 12, paddingVertical: 11, alignItems: 'center', borderWidth: 0.5 },
  actionBtnText: { fontSize: 12, fontWeight: '500' },
});
