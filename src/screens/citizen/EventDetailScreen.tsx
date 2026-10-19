import React, { useEffect, useMemo, useState } from 'react';
import { View, Text, ScrollView, TouchableOpacity, StyleSheet, ActivityIndicator, Alert } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { NativeStackScreenProps } from '@react-navigation/native-stack';
import { useTheme } from '../../hooks/useTheme';
import { ThemeColors } from '../../constants/theme';
import { CleanupEvent, EventParticipant, RootStackParamList } from '../../types';
import { BackIcon } from '../../components/common/TabIcons';
import { useAppSelector } from '../../store/hooks';
import { joinEvent, leaveEvent } from '../../services/cleanupEventService';
import { subscribeToEvent, subscribeToParticipants } from '../../services/cleanupEventLive';
import { fullName } from '../../services/crewService';
import { formatDateKey, formatHHmm } from '../../utils/dates';

type Props = NativeStackScreenProps<RootStackParamList, 'CitizenEventDetail'>;

export default function CitizenEventDetailScreen({ navigation, route }: Props) {
  const { colors } = useTheme();
  const styles = useMemo(() => createStyles(colors), [colors]);
  const { eventId } = route.params;
  const user = useAppSelector((s) => s.auth.user);

  const [event, setEvent] = useState<CleanupEvent | null>(null);
  const [loading, setLoading] = useState(true);
  const [participants, setParticipants] = useState<EventParticipant[]>([]);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    const unsubEvent = subscribeToEvent(eventId, (e) => {
      setEvent(e);
      setLoading(false);
    });
    // Residents may not be allowed to list everyone; an empty list then simply hides the status line.
    const unsubPeople = subscribeToParticipants(eventId, setParticipants);
    return () => {
      unsubEvent();
      unsubPeople();
    };
  }, [eventId]);

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
        <View style={styles.centerBox}><ActivityIndicator size="small" color={colors.teal} /></View>
      </SafeAreaView>
    );
  }

  if (!event || !user) {
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
  const isJoined = (event.participantIds ?? []).includes(user.uid);
  const open = event.status === 'upcoming' || event.status === 'ongoing';
  const full = joined >= event.maxParticipants;
  const mine = participants.find((p) => p.userId === user.uid);

  let blockReason = '';
  if (event.status === 'cancelled') blockReason = 'This event was cancelled.';
  else if (event.status === 'completed') blockReason = 'This event is finished.';
  else if (!isJoined && full) blockReason = 'This event is full.';

  const join = async () => {
    setBusy(true);
    try {
      await joinEvent(eventId, { userId: user.uid, userName: fullName(user), userPhotoURL: user.photoURL });
    } catch (err) {
      Alert.alert('Could not join', err instanceof Error ? err.message : 'Please try again.');
    } finally {
      setBusy(false);
    }
  };

  const leave = () =>
    Alert.alert('Leave this event?', 'You can join again later if there is still room.', [
      { text: 'Stay', style: 'cancel' },
      {
        text: 'Leave event',
        style: 'destructive',
        onPress: async () => {
          setBusy(true);
          try {
            await leaveEvent(eventId, user.uid);
          } catch (err) {
            Alert.alert('Could not leave', err instanceof Error ? err.message : 'Please try again.');
          } finally {
            setBusy(false);
          }
        },
      },
    ]);

  const showButton = isJoined ? open : open && !blockReason;

  return (
    <SafeAreaView style={styles.container}>
      {header}
      <ScrollView contentContainerStyle={styles.body} showsVerticalScrollIndicator={false}>
        {event.status === 'cancelled' ? (
          <View style={styles.notice}><Text style={styles.noticeText}>This event was cancelled.</Text></View>
        ) : null}

        <View style={styles.card}>
          <Text style={styles.title}>{event.title}</Text>
          <Text style={styles.organizer}>Organized by {event.organizerName}</Text>
          {event.description ? <Text style={styles.desc}>{event.description}</Text> : null}
          <InfoRow label="Date" value={formatDateKey(event.eventDate)} styles={styles} />
          <InfoRow label="Time" value={`${formatHHmm(event.startTime)} to ${formatHHmm(event.endTime)}`} styles={styles} />
          <InfoRow label="Meet at" value={event.locationAddress || '-'} styles={styles} />
          <InfoRow label="Barangay" value={event.barangay} styles={styles} />
        </View>

        {event.requirements?.length > 0 ? (
          <View style={styles.card}>
            <Text style={styles.sectionTitle}>What to bring</Text>
            <View style={styles.chipRow}>
              {event.requirements.map((r) => (
                <View key={r} style={styles.chip}><Text style={styles.chipText}>{r}</Text></View>
              ))}
            </View>
          </View>
        ) : null}

        <View style={styles.card}>
          <Text style={styles.sectionTitle}>Volunteers</Text>
          <Text style={styles.progressText}>{joined} of {needed} volunteers joined</Text>
          <View style={styles.track}><View style={[styles.fill, { width: `${pct}%` }]} /></View>
        </View>

        {isJoined ? (
          <View style={styles.statusCard}>
            {mine?.attendanceStatus === 'attended' ? (
              <Text style={styles.statusGood}>Thank you for helping!</Text>
            ) : mine?.attendanceStatus === 'no_show' ? (
              <Text style={styles.statusMuted}>You were marked as not present.</Text>
            ) : (
              <Text style={styles.statusText}>You are registered. See you there!</Text>
            )}
          </View>
        ) : null}

        {showButton ? (
          <TouchableOpacity
            style={[isJoined ? styles.leaveBtn : styles.joinBtn, busy && styles.btnOff]}
            onPress={isJoined ? leave : join}
            disabled={busy}
            activeOpacity={0.85}
          >
            {busy ? (
              <ActivityIndicator size="small" color={isJoined ? colors.textMuted : '#fff'} />
            ) : (
              <Text style={isJoined ? styles.leaveText : styles.joinText}>{isJoined ? 'Leave event' : 'Join this cleanup'}</Text>
            )}
          </TouchableOpacity>
        ) : null}
        {!isJoined && blockReason ? (
          <View style={styles.disabledBtn}><Text style={styles.disabledText}>{blockReason}</Text></View>
        ) : null}
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
  notice: { backgroundColor: Colors.redBg, borderRadius: 14, padding: 14 },
  noticeText: { fontSize: 14, fontWeight: '600', color: Colors.redText, textAlign: 'center' },
  title: { fontSize: 17, fontWeight: '600', color: Colors.textPrimary },
  organizer: { fontSize: 12, color: Colors.textMuted },
  desc: { fontSize: 13, color: Colors.textMuted, lineHeight: 19 },
  infoRow: { flexDirection: 'row', gap: 10 },
  infoLabel: { width: 70, fontSize: 12, color: Colors.textHint },
  infoValue: { flex: 1, fontSize: 13, color: Colors.textPrimary },
  sectionTitle: { fontSize: 14, fontWeight: '600', color: Colors.textPrimary },
  chipRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  chip: { backgroundColor: Colors.tealLight, borderRadius: 16, paddingHorizontal: 12, paddingVertical: 6 },
  chipText: { fontSize: 12, color: Colors.tealDark },
  progressText: { fontSize: 13, color: Colors.textMuted },
  track: { height: 8, borderRadius: 4, backgroundColor: Colors.grayBg, overflow: 'hidden' },
  fill: { height: 8, borderRadius: 4, backgroundColor: Colors.teal },
  statusCard: { backgroundColor: Colors.tealLight, borderRadius: 14, padding: 14 },
  statusText: { fontSize: 14, color: Colors.tealDark, textAlign: 'center' },
  statusGood: { fontSize: 14, fontWeight: '600', color: Colors.greenText, textAlign: 'center' },
  statusMuted: { fontSize: 14, color: Colors.textMuted, textAlign: 'center' },
  joinBtn: { backgroundColor: Colors.teal, borderRadius: 14, minHeight: 50, alignItems: 'center', justifyContent: 'center' },
  joinText: { color: '#fff', fontSize: 15, fontWeight: '600' },
  leaveBtn: { backgroundColor: Colors.white, borderRadius: 14, minHeight: 50, alignItems: 'center', justifyContent: 'center' },
  leaveText: { color: Colors.redText, fontSize: 15, fontWeight: '600' },
  disabledBtn: { backgroundColor: Colors.grayBg, borderRadius: 14, minHeight: 50, alignItems: 'center', justifyContent: 'center', paddingHorizontal: 12 },
  disabledText: { color: Colors.textMuted, fontSize: 14, fontWeight: '500' },
  btnOff: { opacity: 0.5 },
});
