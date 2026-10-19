import React, { useEffect, useMemo, useState } from 'react';
import { View, Text, ScrollView, TouchableOpacity, StyleSheet, ActivityIndicator, Alert } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { NativeStackScreenProps } from '@react-navigation/native-stack';
import { useTheme } from '../../hooks/useTheme';
import { ThemeColors } from '../../constants/theme';
import { CleanupEvent, CleanupEventStatus, EventParticipant, RootStackParamList } from '../../types';
import { BackIcon } from '../../components/common/TabIcons';
import { useAppSelector } from '../../store/hooks';
import { markAttendance, updateEventStatus } from '../../services/cleanupEventService';
import { subscribeToEvent, subscribeToParticipants } from '../../services/cleanupEventLive';
import { sendBulkNotification } from '../../services/notificationService';
import { formatDateKey, formatDayAndTime, formatHHmm } from '../../utils/dates';

type Props = NativeStackScreenProps<RootStackParamList, 'BarangayEventDetail'>;

const STATUS_LABEL: Record<CleanupEventStatus, string> = {
  upcoming: 'Upcoming',
  ongoing: 'Happening now',
  completed: 'Finished',
  cancelled: 'Cancelled',
};

export default function BarangayEventDetailScreen({ navigation, route }: Props) {
  const { colors } = useTheme();
  const styles = useMemo(() => createStyles(colors), [colors]);
  const { eventId } = route.params;
  const user = useAppSelector((s) => s.auth.user);

  const [event, setEvent] = useState<CleanupEvent | null>(null);
  const [loading, setLoading] = useState(true);
  const [participants, setParticipants] = useState<EventParticipant[]>([]);
  const [busy, setBusy] = useState(false);
  const [markingId, setMarkingId] = useState<string | null>(null);

  useEffect(() => {
    const unsubEvent = subscribeToEvent(eventId, (e) => {
      setEvent(e);
      setLoading(false);
    });
    const unsubPeople = subscribeToParticipants(eventId, setParticipants);
    return () => {
      unsubEvent();
      unsubPeople();
    };
  }, [eventId]);

  const canManage = !!user && !!event && (
    user.role === 'admin' || user.role === 'superadmin' ||
    (user.role === 'barangay' && !!user.barangayId && user.barangayId === event.barangayId)
  );

  const sorted = useMemo(
    () => [...participants].sort((a, b) => a.userName.localeCompare(b.userName)),
    [participants],
  );
  const attended = participants.filter((p) => p.attendanceStatus === 'attended').length;

  const changeStatus = async (status: CleanupEventStatus) => {
    setBusy(true);
    try {
      await updateEventStatus(eventId, status);
    } catch (err) {
      Alert.alert('Could not update the event', err instanceof Error ? err.message : 'Please try again.');
    } finally {
      setBusy(false);
    }
  };

  const cancelEvent = async (ev: CleanupEvent) => {
    setBusy(true);
    try {
      await updateEventStatus(eventId, 'cancelled');
      // The event is already cancelled; telling people is best effort.
      try {
        const ids = (ev.participantIds ?? []).length > 0 ? ev.participantIds : participants.map((p) => p.userId);
        for (let i = 0; i < ids.length; i += 400) {
          await sendBulkNotification(
            ids.slice(i, i + 400),
            'Cleanup cancelled',
            `"${ev.title}" on ${formatDateKey(ev.eventDate)} was cancelled.`,
            'event_reminder',
            { eventId },
          );
        }
      } catch {
        // Ignore: the cancelled status is still visible on the event.
      }
    } catch (err) {
      Alert.alert('Could not cancel the event', err instanceof Error ? err.message : 'Please try again.');
    } finally {
      setBusy(false);
    }
  };

  const confirmStart = () => changeStatus('ongoing');

  const confirmFinish = () =>
    Alert.alert(
      'Finish this event?',
      'Please mark who was present first. You can still change it afterwards.',
      [
        { text: 'Not yet', style: 'cancel' },
        { text: 'Finish event', onPress: () => changeStatus('completed') },
      ],
    );

  const confirmCancel = (ev: CleanupEvent) =>
    Alert.alert(
      'Cancel this event?',
      'Volunteers who joined will be told it was cancelled.',
      [
        { text: 'Keep event', style: 'cancel' },
        { text: 'Cancel event', style: 'destructive', onPress: () => cancelEvent(ev) },
      ],
    );

  const mark = async (userId: string, status: EventParticipant['attendanceStatus']) => {
    setMarkingId(userId);
    try {
      await markAttendance(eventId, userId, status);
    } catch (err) {
      Alert.alert('Could not save', err instanceof Error ? err.message : 'Please try again.');
    } finally {
      setMarkingId(null);
    }
  };

  const header = (
    <View style={styles.header}>
      <TouchableOpacity style={styles.backBtn} onPress={() => navigation.goBack()}><BackIcon size={18} /></TouchableOpacity>
      <Text style={styles.headerTitle}>Cleanup event</Text>
      <View style={{ width: 38 }} />
    </View>
  );

  if (loading) {
    return (
      <SafeAreaView style={styles.container}>
        {header}
        <View style={styles.centerBox}><ActivityIndicator size="small" color={colors.brgy} /></View>
      </SafeAreaView>
    );
  }

  if (!event) {
    return (
      <SafeAreaView style={styles.container}>
        {header}
        <View style={styles.centerBox}>
          <Text style={styles.centerText}>This event could not be found. It may have been removed.</Text>
        </View>
      </SafeAreaView>
    );
  }

  const needed = event.volunteersNeeded || event.maxParticipants || 1;
  const joined = event.currentParticipants ?? 0;
  const pct = Math.min(100, Math.round((joined / needed) * 100));
  const active = event.status === 'upcoming' || event.status === 'ongoing';

  return (
    <SafeAreaView style={styles.container}>
      {header}
      <ScrollView contentContainerStyle={styles.body} showsVerticalScrollIndicator={false}>
        <View style={styles.card}>
          <View style={styles.titleRow}>
            <Text style={styles.title}>{event.title}</Text>
            <View style={[styles.statusPill, event.status === 'cancelled' && styles.statusPillBad]}>
              <Text style={[styles.statusText, event.status === 'cancelled' && styles.statusTextBad]}>
                {STATUS_LABEL[event.status]}
              </Text>
            </View>
          </View>
          {event.description ? <Text style={styles.desc}>{event.description}</Text> : null}
          <InfoRow label="Date" value={formatDateKey(event.eventDate)} styles={styles} />
          <InfoRow label="Time" value={`${formatHHmm(event.startTime)} to ${formatHHmm(event.endTime)}`} styles={styles} />
          <InfoRow label="Meet at" value={event.locationAddress || '-'} styles={styles} />
          <InfoRow label="Barangay" value={event.barangay} styles={styles} />
          {event.requirements?.length > 0 ? (
            <View style={styles.chipRow}>
              {event.requirements.map((r) => (
                <View key={r} style={styles.chip}><Text style={styles.chipText}>{r}</Text></View>
              ))}
            </View>
          ) : null}
        </View>

        <View style={styles.card}>
          <Text style={styles.sectionTitle}>Volunteers</Text>
          <Text style={styles.progressText}>{joined} of {needed} volunteers joined</Text>
          <View style={styles.track}><View style={[styles.fill, { width: `${pct}%` }]} /></View>
          {event.status === 'completed' ? (
            <Text style={styles.summary}>{attended} of {participants.length} volunteers came.</Text>
          ) : null}
        </View>

        {canManage && active ? (
          <View style={styles.card}>
            <Text style={styles.sectionTitle}>Manage event</Text>
            {event.status === 'upcoming' ? (
              <TouchableOpacity style={[styles.primaryBtn, busy && styles.btnOff]} onPress={confirmStart} disabled={busy}>
                {busy ? <ActivityIndicator size="small" color="#fff" /> : <Text style={styles.primaryBtnText}>Start event</Text>}
              </TouchableOpacity>
            ) : (
              <TouchableOpacity style={[styles.primaryBtn, busy && styles.btnOff]} onPress={confirmFinish} disabled={busy}>
                {busy ? <ActivityIndicator size="small" color="#fff" /> : <Text style={styles.primaryBtnText}>Finish event</Text>}
              </TouchableOpacity>
            )}
            <TouchableOpacity style={[styles.dangerBtn, busy && styles.btnOff]} onPress={() => confirmCancel(event)} disabled={busy}>
              <Text style={styles.dangerBtnText}>Cancel event</Text>
            </TouchableOpacity>
          </View>
        ) : null}

        <Text style={styles.sectionTitle}>Who joined ({participants.length})</Text>
        {sorted.length === 0 ? (
          <View style={styles.card}>
            <Text style={styles.emptyText}>No one has joined yet. Residents are notified when you publish.</Text>
          </View>
        ) : (
          sorted.map((p) => {
            const isMarking = markingId === p.userId;
            const present = p.attendanceStatus === 'attended';
            const absent = p.attendanceStatus === 'no_show';
            return (
              <View key={p.userId} style={styles.card}>
                <View style={styles.personRow}>
                  <View style={{ flex: 1 }}>
                    <Text style={styles.personName}>{p.userName}</Text>
                    <Text style={styles.personMeta}>
                      Joined {formatDayAndTime(p.joinedAt)}
                      {present ? ' - Present' : absent ? ' - Absent' : ' - Registered'}
                    </Text>
                  </View>
                </View>
                {canManage ? (
                  <View style={styles.markRow}>
                    <TouchableOpacity
                      style={[styles.markBtn, present && styles.markBtnPresent, isMarking && styles.btnOff]}
                      onPress={() => mark(p.userId, 'attended')}
                      disabled={isMarking}
                    >
                      <Text style={[styles.markText, present && styles.markTextOn]}>Present</Text>
                    </TouchableOpacity>
                    <TouchableOpacity
                      style={[styles.markBtn, absent && styles.markBtnAbsent, isMarking && styles.btnOff]}
                      onPress={() => mark(p.userId, 'no_show')}
                      disabled={isMarking}
                    >
                      <Text style={[styles.markText, absent && styles.markTextOn]}>Absent</Text>
                    </TouchableOpacity>
                  </View>
                ) : null}
              </View>
            );
          })
        )}
      </ScrollView>
    </SafeAreaView>
  );
}

function InfoRow({ label, value, styles }: { label: string; value: string; styles: ReturnType<typeof createStyles> }) {
  return (
    <View style={styles.infoRow}>
      <Text style={styles.infoLabel}>{label}</Text>
      <Text style={styles.infoValue}>{value}</Text>
    </View>
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
  backBtn: { width: 38, height: 38, borderRadius: 19, backgroundColor: Colors.grayBg, alignItems: 'center', justifyContent: 'center' },
  body: { padding: 16, gap: 12, paddingBottom: 32 },
  centerBox: { flex: 1, alignItems: 'center', justifyContent: 'center', padding: 24 },
  centerText: { fontSize: 14, color: Colors.textMuted, textAlign: 'center', lineHeight: 21 },
  card: {
    backgroundColor: Colors.white, borderRadius: 16, padding: 16, gap: 10,
    shadowColor: Colors.shadow, shadowOffset: { width: 0, height: 2 }, shadowOpacity: 0.05, shadowRadius: 8, elevation: 1,
  },
  titleRow: { flexDirection: 'row', alignItems: 'flex-start', justifyContent: 'space-between', gap: 10 },
  title: { flex: 1, fontSize: 17, fontWeight: '600', color: Colors.textPrimary },
  statusPill: { backgroundColor: Colors.brgyLight, paddingHorizontal: 10, paddingVertical: 4, borderRadius: 20 },
  statusPillBad: { backgroundColor: Colors.redBg },
  statusText: { fontSize: 11, fontWeight: '600', color: Colors.brgyDark },
  statusTextBad: { color: Colors.redText },
  desc: { fontSize: 13, color: Colors.textMuted, lineHeight: 19 },
  infoRow: { flexDirection: 'row', gap: 10 },
  infoLabel: { width: 70, fontSize: 12, color: Colors.textHint },
  infoValue: { flex: 1, fontSize: 13, color: Colors.textPrimary },
  chipRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  chip: { backgroundColor: Colors.brgyLight, borderRadius: 16, paddingHorizontal: 12, paddingVertical: 6 },
  chipText: { fontSize: 12, color: Colors.brgyDark },
  sectionTitle: { fontSize: 14, fontWeight: '600', color: Colors.textPrimary },
  progressText: { fontSize: 13, color: Colors.textMuted },
  track: { height: 8, borderRadius: 4, backgroundColor: Colors.grayBg, overflow: 'hidden' },
  fill: { height: 8, borderRadius: 4, backgroundColor: Colors.brgy },
  summary: { fontSize: 13, fontWeight: '600', color: Colors.greenText },
  emptyText: { fontSize: 13, color: Colors.textHint, textAlign: 'center', lineHeight: 19 },
  personRow: { flexDirection: 'row', alignItems: 'center' },
  personName: { fontSize: 14, fontWeight: '500', color: Colors.textPrimary },
  personMeta: { fontSize: 11, color: Colors.textMuted, marginTop: 2 },
  markRow: { flexDirection: 'row', gap: 10 },
  markBtn: {
    flex: 1, minHeight: 44, borderRadius: 12, backgroundColor: Colors.grayBg,
    alignItems: 'center', justifyContent: 'center',
  },
  markBtnPresent: { backgroundColor: Colors.green },
  markBtnAbsent: { backgroundColor: Colors.red },
  markText: { fontSize: 13, fontWeight: '600', color: Colors.textPrimary },
  markTextOn: { color: '#fff' },
  primaryBtn: { backgroundColor: Colors.brgy, borderRadius: 14, minHeight: 48, alignItems: 'center', justifyContent: 'center' },
  primaryBtnText: { color: '#fff', fontSize: 15, fontWeight: '600' },
  dangerBtn: { backgroundColor: Colors.redBg, borderRadius: 14, minHeight: 48, alignItems: 'center', justifyContent: 'center' },
  dangerBtnText: { color: Colors.redText, fontSize: 15, fontWeight: '600' },
  btnOff: { opacity: 0.5 },
});
