import React, { useEffect, useMemo, useState } from 'react';
import { View, Text, ScrollView, TouchableOpacity, StyleSheet, ActivityIndicator } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { NativeStackScreenProps } from '@react-navigation/native-stack';
import { useTheme } from '../../hooks/useTheme';
import { ThemeColors } from '../../constants/theme';
import { CleanupEvent, RootStackParamList } from '../../types';
import { BackIcon } from '../../components/common/TabIcons';
import { useAppSelector } from '../../store/hooks';
import { subscribeToUpcomingEvents } from '../../services/cleanupEventService';
import { formatDateKey, formatHHmm } from '../../utils/dates';

type Props = NativeStackScreenProps<RootStackParamList, 'CitizenEvents'>;
type Segment = 'mine' | 'all';

export default function CitizenEventsScreen({ navigation }: Props) {
  const { colors } = useTheme();
  const styles = useMemo(() => createStyles(colors), [colors]);
  const user = useAppSelector((s) => s.auth.user);

  const [events, setEvents] = useState<CleanupEvent[]>([]);
  const [loading, setLoading] = useState(true);
  const [segment, setSegment] = useState<Segment>('mine');

  useEffect(() => {
    const unsub = subscribeToUpcomingEvents((incoming) => {
      setEvents(incoming);
      setLoading(false);
    });
    return unsub;
  }, []);

  const shown = useMemo(
    () => (segment === 'mine' ? events.filter((e) => !!user?.barangayId && e.barangayId === user.barangayId) : events),
    [events, segment, user?.barangayId],
  );

  return (
    <SafeAreaView style={styles.container}>
      <View style={styles.header}>
        <TouchableOpacity style={styles.backBtn} onPress={() => navigation.goBack()}><BackIcon size={18} /></TouchableOpacity>
        <Text style={styles.headerTitle}>Cleanup events</Text>
        <View style={{ width: 38 }} />
      </View>

      <View style={styles.segmentRow}>
        {([['mine', 'My barangay'], ['all', 'All']] as const).map(([key, label]) => (
          <TouchableOpacity
            key={key}
            style={[styles.segment, segment === key && styles.segmentOn]}
            onPress={() => setSegment(key)}
          >
            <Text style={[styles.segmentText, segment === key && styles.segmentTextOn]}>{label}</Text>
          </TouchableOpacity>
        ))}
      </View>

      <ScrollView contentContainerStyle={styles.body} showsVerticalScrollIndicator={false}>
        {loading ? <ActivityIndicator size="small" color={colors.teal} style={{ marginVertical: 20 }} /> : null}

        {!loading && shown.length === 0 ? (
          <View style={styles.card}>
            <Text style={styles.emptyText}>
              No cleanups planned yet. When your barangay plans one, you'll get a notification.
            </Text>
          </View>
        ) : null}

        {shown.map((ev) => {
          const needed = ev.volunteersNeeded || ev.maxParticipants || 1;
          const joined = ev.currentParticipants ?? 0;
          const pct = Math.min(100, Math.round((joined / needed) * 100));
          const isJoined = !!user && (ev.participantIds ?? []).includes(user.uid);
          return (
            <TouchableOpacity
              key={ev.id}
              style={styles.card}
              onPress={() => navigation.navigate('CitizenEventDetail', { eventId: ev.id })}
              activeOpacity={0.85}
            >
              <View style={styles.titleRow}>
                <Text style={styles.title}>{ev.title}</Text>
                {isJoined ? (
                  <View style={styles.joinedTag}><Text style={styles.joinedText}>Joined</Text></View>
                ) : null}
              </View>
              <Text style={styles.when}>
                {formatDateKey(ev.eventDate)}, {formatHHmm(ev.startTime)} to {formatHHmm(ev.endTime)}
              </Text>
              <Text style={styles.meta} numberOfLines={1}>{ev.locationAddress} - {ev.barangay}</Text>
              <View style={styles.track}><View style={[styles.fill, { width: `${pct}%` }]} /></View>
              <Text style={styles.meta}>{joined} of {needed} volunteers</Text>
            </TouchableOpacity>
          );
        })}
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
  backBtn: { width: 38, height: 38, borderRadius: 19, backgroundColor: Colors.grayBg, alignItems: 'center', justifyContent: 'center' },
  segmentRow: { flexDirection: 'row', gap: 8, paddingHorizontal: 16, paddingTop: 12 },
  segment: { flex: 1, minHeight: 44, borderRadius: 22, backgroundColor: Colors.white, alignItems: 'center', justifyContent: 'center' },
  segmentOn: { backgroundColor: Colors.teal },
  segmentText: { fontSize: 14, color: Colors.textPrimary },
  segmentTextOn: { color: '#fff', fontWeight: '600' },
  body: { padding: 16, gap: 12, paddingBottom: 32 },
  card: {
    backgroundColor: Colors.white, borderRadius: 16, padding: 16, gap: 8,
    shadowColor: Colors.shadow, shadowOffset: { width: 0, height: 2 }, shadowOpacity: 0.05, shadowRadius: 8, elevation: 1,
  },
  titleRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 8 },
  title: { flex: 1, fontSize: 15, fontWeight: '600', color: Colors.textPrimary },
  joinedTag: { backgroundColor: Colors.greenBg, paddingHorizontal: 10, paddingVertical: 4, borderRadius: 20 },
  joinedText: { fontSize: 11, fontWeight: '600', color: Colors.greenText },
  when: { fontSize: 13, color: Colors.textPrimary },
  meta: { fontSize: 12, color: Colors.textMuted },
  track: { height: 6, borderRadius: 3, backgroundColor: Colors.grayBg, overflow: 'hidden' },
  fill: { height: 6, borderRadius: 3, backgroundColor: Colors.teal },
  emptyText: { fontSize: 13, color: Colors.textHint, textAlign: 'center', lineHeight: 19 },
});
