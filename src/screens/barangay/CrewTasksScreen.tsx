import React, { useEffect, useMemo, useState } from 'react';
import { View, Text, ScrollView, TouchableOpacity, StyleSheet, ActivityIndicator, Alert, Linking } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { NativeStackScreenProps } from '@react-navigation/native-stack';
import { useTheme } from '../../hooks/useTheme';
import { ThemeColors } from '../../constants/theme';
import { CleanupTask, RootStackParamList } from '../../types';
import { BackIcon } from '../../components/common/TabIcons';
import { TaskStatusPill } from '../../components/common/TaskStatusPill';
import { useAppSelector } from '../../store/hooks';
import { subscribeToBarangayTasks } from '../../services/cleanupTaskService';
import { formatDateKey, formatHHmm } from '../../utils/dates';
import { telUrl } from '../../utils/phone';

type Props = NativeStackScreenProps<RootStackParamList, 'BarangayCrewTasks'>;
type Segment = 'needs' | 'progress' | 'done';

const needsOfficial = (t: CleanupTask) => t.status === 'cancelled' || (t.status === 'completed' && !t.confirmedAt);
const isDone = (t: CleanupTask) => t.status === 'completed' && !!t.confirmedAt;

const SEGMENTS: { key: Segment; label: string }[] = [
  { key: 'needs', label: 'Needs you' },
  { key: 'progress', label: 'In progress' },
  { key: 'done', label: 'Done' },
];

const EMPTY: Record<Segment, { title: string; body: string }> = {
  needs: { title: 'Nothing needs you right now', body: 'Declined tasks and finished work waiting for your confirmation will show up here.' },
  progress: { title: 'No tasks in progress', body: 'Once you assign a crew to a verified report, the task shows up here.' },
  done: { title: 'No finished tasks yet', body: 'Tasks you have confirmed will be listed here.' },
};

export default function CrewTasksScreen({ navigation }: Props) {
  const { colors } = useTheme();
  const styles = useMemo(() => createStyles(colors), [colors]);
  const user = useAppSelector((s) => s.auth.user);
  const barangayId = user?.barangayId ?? '';

  const [tasks, setTasks] = useState<CleanupTask[] | null>(null);
  const [error, setError] = useState('');
  const [segment, setSegment] = useState<Segment>('needs');
  const [retryKey, setRetryKey] = useState(0);

  useEffect(() => {
    if (!barangayId) { setTasks([]); return; }
    setTasks(null);
    setError('');
    try {
      return subscribeToBarangayTasks(barangayId, setTasks, (e) => {
        setError(e.message || 'Could not load the tasks.');
        setTasks([]);
      });
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not load the tasks.');
    }
  }, [barangayId, retryKey]);

  const groups = useMemo(() => {
    const list = tasks ?? [];
    return {
      needs: list.filter(needsOfficial),
      progress: list.filter((t) => t.status === 'assigned' || t.status === 'accepted' || t.status === 'in_progress'),
      done: list.filter(isDone),
    };
  }, [tasks]);

  const call = async (phone: string) => {
    try {
      await Linking.openURL(telUrl(phone));
    } catch {
      Alert.alert("Can't call", "This phone couldn't open the dialer.");
    }
  };

  const shown = groups[segment];

  return (
    <SafeAreaView style={styles.container}>
      <View style={styles.header}>
        <TouchableOpacity style={styles.backBtn} onPress={() => navigation.goBack()} accessibilityLabel="Go back">
          <BackIcon size={18} />
        </TouchableOpacity>
        <Text style={styles.headerTitle}>Crews & cleanup tasks</Text>
        <View style={{ width: 38 }} />
      </View>

      <ScrollView contentContainerStyle={styles.body} showsVerticalScrollIndicator={false}>
        <TouchableOpacity style={styles.shortcut} onPress={() => navigation.navigate('BarangayVerify')} activeOpacity={0.85}>
          <Text style={styles.shortcutText}>Verify reports to assign crews</Text>
          <Text style={styles.shortcutArrow}>›</Text>
        </TouchableOpacity>

        <View style={styles.segmentRow}>
          {SEGMENTS.map((s) => {
            const on = segment === s.key;
            const count = groups[s.key].length;
            return (
              <TouchableOpacity key={s.key} style={[styles.segment, on && styles.segmentOn]} onPress={() => setSegment(s.key)} accessibilityState={{ selected: on }}>
                <Text style={[styles.segmentText, on && styles.segmentTextOn]} numberOfLines={1}>{s.label}</Text>
                <View style={[styles.count, on && styles.countOn]}>
                  <Text style={[styles.countText, on && styles.countTextOn]}>{count}</Text>
                </View>
              </TouchableOpacity>
            );
          })}
        </View>

        {error ? (
          <View style={styles.card}>
            <Text style={styles.emptyTitle}>Could not load the tasks</Text>
            <Text style={styles.emptyBody}>{error}</Text>
            <TouchableOpacity style={styles.retryBtn} onPress={() => setRetryKey((k) => k + 1)}>
              <Text style={styles.retryText}>Try again</Text>
            </TouchableOpacity>
          </View>
        ) : tasks === null ? (
          <View style={styles.card}><ActivityIndicator size="small" color={colors.brgy} /></View>
        ) : shown.length === 0 ? (
          <View style={styles.card}>
            <Text style={styles.emptyTitle}>{EMPTY[segment].title}</Text>
            <Text style={styles.emptyBody}>{EMPTY[segment].body}</Text>
          </View>
        ) : (
          shown.map((t) => (
            <TouchableOpacity
              key={t.id}
              style={styles.card}
              onPress={() => navigation.navigate('CleanupTaskDetail', { taskId: t.id })}
              activeOpacity={0.85}
            >
              <View style={styles.cardTop}>
                <Text style={styles.title} numberOfLines={2}>{t.title}</Text>
                <TaskStatusPill task={t} />
              </View>
              <Text style={styles.sub}>Crew: {t.assignedTeamName || 'Not set'}</Text>
              <Text style={styles.sub}>{formatDateKey(t.scheduledDate)}, {formatHHmm(t.startTime)} to {formatHHmm(t.endTime)}</Text>
              {t.status === 'cancelled' && !!t.declineReason && (
                <Text style={styles.decline} numberOfLines={2}>Reason: {t.declineReason}</Text>
              )}
              {!!t.assignedTeamPhone && (
                <TouchableOpacity
                  style={styles.callBtn}
                  onPress={() => call(t.assignedTeamPhone as string)}
                  accessibilityLabel={`Call ${t.assignedTeamName}`}
                >
                  <Text style={styles.callText}>Call</Text>
                </TouchableOpacity>
              )}
            </TouchableOpacity>
          ))
        )}
      </ScrollView>
    </SafeAreaView>
  );
}

const createStyles = (Colors: ThemeColors) => StyleSheet.create({
  container: { flex: 1, backgroundColor: Colors.grayBg },
  header: {
    backgroundColor: Colors.white, paddingHorizontal: 16, paddingVertical: 12,
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
  },
  headerTitle: { fontSize: 16, fontWeight: '500', color: Colors.textPrimary },
  backBtn: { width: 38, height: 38, borderRadius: 19, backgroundColor: Colors.grayBg, alignItems: 'center', justifyContent: 'center' },
  body: { padding: 16, gap: 12, paddingBottom: 32 },
  shortcut: {
    minHeight: 48, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
    backgroundColor: Colors.brgyLight, borderRadius: 14, paddingHorizontal: 14,
  },
  shortcutText: { fontSize: 13, fontWeight: '600', color: Colors.brgy },
  shortcutArrow: { fontSize: 20, color: Colors.brgy },
  segmentRow: { flexDirection: 'row', gap: 8 },
  segment: {
    flex: 1, minHeight: 44, borderRadius: 22, backgroundColor: Colors.white, paddingHorizontal: 6,
    flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 6,
  },
  segmentOn: { backgroundColor: Colors.brgy },
  segmentText: { fontSize: 12, fontWeight: '600', color: Colors.textPrimary, flexShrink: 1 },
  segmentTextOn: { color: '#fff' },
  count: { minWidth: 20, paddingHorizontal: 5, height: 20, borderRadius: 10, backgroundColor: Colors.grayBg, alignItems: 'center', justifyContent: 'center' },
  countOn: { backgroundColor: Colors.white },
  countText: { fontSize: 11, fontWeight: '700', color: Colors.textMuted },
  countTextOn: { color: Colors.brgy },
  card: {
    backgroundColor: Colors.white, borderRadius: 16, padding: 14, gap: 6,
    shadowColor: Colors.shadow, shadowOffset: { width: 0, height: 2 }, shadowOpacity: 0.05, shadowRadius: 8, elevation: 1,
  },
  cardTop: { flexDirection: 'row', alignItems: 'flex-start', justifyContent: 'space-between', gap: 8 },
  title: { flex: 1, fontSize: 14, fontWeight: '600', color: Colors.textPrimary },
  sub: { fontSize: 12, color: Colors.textMuted },
  decline: { fontSize: 12, color: Colors.redText },
  callBtn: { alignSelf: 'flex-start', minHeight: 44, minWidth: 72, paddingHorizontal: 18, borderRadius: 12, backgroundColor: Colors.teal, alignItems: 'center', justifyContent: 'center', marginTop: 4 },
  callText: { fontSize: 13, fontWeight: '600', color: '#fff' },
  emptyTitle: { fontSize: 14, fontWeight: '600', color: Colors.textPrimary, textAlign: 'center' },
  emptyBody: { fontSize: 12, color: Colors.textMuted, textAlign: 'center', lineHeight: 18 },
  retryBtn: { alignSelf: 'center', minHeight: 44, paddingHorizontal: 20, borderRadius: 12, backgroundColor: Colors.brgyLight, alignItems: 'center', justifyContent: 'center' },
  retryText: { fontSize: 13, fontWeight: '600', color: Colors.brgy },
});
