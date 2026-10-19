import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { View, Text, FlatList, TouchableOpacity, StyleSheet, ActivityIndicator, RefreshControl } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useNavigation } from '@react-navigation/native';
import { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { useTheme } from '../../hooks/useTheme';
import { ThemeColors } from '../../constants/theme';
import { CleanupTask, RootStackParamList } from '../../types';
import { useAppSelector } from '../../store/hooks';
import { subscribeToTeamTasks, getTasksByTeam } from '../../services/cleanupTaskService';
import { Badge } from '../../components/common/Badge';
import { TaskStatusPill } from '../../components/common/TaskStatusPill';
import { formatDateKey, formatHHmm, toJsDate } from '../../utils/dates';

type Segment = 'active' | 'done';

const errorText = (err: unknown): string =>
  err instanceof Error && err.message ? err.message : 'Something went wrong. Please try again.';

export default function CleanupTasksScreen() {
  const { colors } = useTheme();
  const styles = useMemo(() => createStyles(colors), [colors]);
  const navigation = useNavigation<NativeStackNavigationProp<RootStackParamList>>();
  const user = useAppSelector((s) => s.auth.user);
  const uid = user?.uid;

  const [segment, setSegment] = useState<Segment>('active');
  const [active, setActive] = useState<CleanupTask[]>([]);
  const [activeLoading, setActiveLoading] = useState(true);
  const [activeError, setActiveError] = useState<string | null>(null);
  const [retryKey, setRetryKey] = useState(0);

  const [done, setDone] = useState<CleanupTask[]>([]);
  const [doneLoading, setDoneLoading] = useState(false);
  const [doneError, setDoneError] = useState<string | null>(null);
  const [refreshing, setRefreshing] = useState(false);

  useEffect(() => {
    if (!uid) return;
    setActiveLoading(true);
    setActiveError(null);
    try {
      return subscribeToTeamTasks(uid, (tasks) => {
        setActive(tasks);
        setActiveLoading(false);
      }, (err) => {
        setActiveError(errorText(err));
        setActiveLoading(false);
      });
    } catch (err) {
      setActiveError(errorText(err));
      setActiveLoading(false);
      return undefined;
    }
  }, [uid, retryKey]);

  const loadDone = useCallback(async () => {
    if (!uid) return;
    setDoneError(null);
    try {
      const all = await getTasksByTeam(uid);
      const finished = all.filter((t) => t.status === 'completed' || t.status === 'cancelled');
      const stamp = (t: CleanupTask) => toJsDate(t.completedAt)?.getTime() ?? toJsDate(t.updatedAt)?.getTime() ?? 0;
      finished.sort((a, b) => stamp(b) - stamp(a));
      setDone(finished);
    } catch (err) {
      setDoneError(errorText(err));
    }
  }, [uid]);

  useEffect(() => {
    if (segment !== 'done') return;
    setDoneLoading(true);
    loadDone().finally(() => setDoneLoading(false));
  }, [segment, loadDone]);

  const onRefresh = async () => {
    setRefreshing(true);
    await loadDone();
    setRefreshing(false);
  };

  const retry = () => {
    if (segment === 'active') {
      setRetryKey((k) => k + 1);
    } else {
      setDoneLoading(true);
      loadDone().finally(() => setDoneLoading(false));
    }
  };

  const sortedActive = useMemo(() => {
    const rank = (t: CleanupTask) => (t.status === 'assigned' ? 0 : 1);
    return [...active].sort((a, b) =>
      rank(a) - rank(b) || a.scheduledDate.localeCompare(b.scheduledDate) || a.startTime.localeCompare(b.startTime));
  }, [active]);

  const newCount = active.filter((t) => t.status === 'assigned').length;
  const firstName = user?.firstName?.trim() || 'there';

  const renderTask = ({ item }: { item: CleanupTask }) => (
    <TouchableOpacity
      style={styles.card}
      activeOpacity={0.8}
      onPress={() => navigation.navigate('CleanupTaskDetail', { taskId: item.id })}
      accessibilityRole="button"
      accessibilityLabel={`Open task ${item.title}`}
    >
      <View style={styles.cardTop}>
        <Text style={styles.cardTitle} numberOfLines={2}>{item.title}</Text>
        <Badge variant={item.priority} />
      </View>
      <Text style={styles.cardMeta}>{item.barangay}</Text>
      <Text style={styles.cardMeta}>
        {formatDateKey(item.scheduledDate)}, {formatHHmm(item.startTime)} - {formatHHmm(item.endTime)}
      </Text>
      <View style={styles.pillRow}>
        <TaskStatusPill task={item} />
      </View>
      {item.status === 'assigned' && (
        <View style={styles.newCue}>
          <Text style={styles.newCueText}>New: tap to accept or decline</Text>
        </View>
      )}
    </TouchableOpacity>
  );

  const isActive = segment === 'active';
  const data = isActive ? sortedActive : done;
  const loading = isActive ? activeLoading : doneLoading && !refreshing;
  const error = isActive ? activeError : doneError;

  const renderEmpty = () => {
    if (loading) {
      return <ActivityIndicator style={{ marginTop: 40 }} color={colors.green} />;
    }
    if (error) {
      return (
        <View style={styles.emptyBox}>
          <Text style={styles.errorText}>{error}</Text>
          <TouchableOpacity style={styles.retryBtn} onPress={retry}>
            <Text style={styles.retryText}>Retry</Text>
          </TouchableOpacity>
        </View>
      );
    }
    return (
      <View style={styles.emptyBox}>
        <Text style={styles.emptyText}>
          {isActive
            ? "No tasks yet. You'll get a notification when an official assigns you one."
            : 'No finished tasks yet. Tasks you complete or decline will show up here.'}
        </Text>
      </View>
    );
  };

  return (
    <SafeAreaView style={styles.container}>
      <View style={styles.header}>
        <Text style={styles.greeting}>Hello, {firstName}</Text>
        <Text style={styles.subGreeting}>
          {user?.barangay ? `${user.barangay} cleanup crew` : 'Cleanup crew'}
          {newCount > 0 ? `  ·  ${newCount} new` : ''}
        </Text>
      </View>

      <View style={styles.segments}>
        {(['active', 'done'] as Segment[]).map((s) => (
          <TouchableOpacity
            key={s}
            style={[styles.segment, segment === s && styles.segmentOn]}
            onPress={() => setSegment(s)}
            accessibilityRole="button"
            accessibilityState={{ selected: segment === s }}
          >
            <Text style={[styles.segmentText, segment === s && styles.segmentTextOn]}>{s === 'active' ? 'Active' : 'Done'}</Text>
          </TouchableOpacity>
        ))}
      </View>

      <FlatList
        data={loading || error ? [] : data}
        keyExtractor={(t) => t.id}
        renderItem={renderTask}
        ListEmptyComponent={renderEmpty}
        contentContainerStyle={styles.list}
        showsVerticalScrollIndicator={false}
        refreshControl={isActive ? undefined : <RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={colors.green} />}
      />
    </SafeAreaView>
  );
}

const createStyles = (Colors: ThemeColors) => StyleSheet.create({
  container: { flex: 1, backgroundColor: Colors.grayBg },
  header: { backgroundColor: Colors.white, paddingHorizontal: 16, paddingTop: 14, paddingBottom: 14, gap: 2 },
  greeting: { fontSize: 18, fontWeight: '600', color: Colors.textPrimary },
  subGreeting: { fontSize: 13, color: Colors.textMuted },
  segments: { flexDirection: 'row', margin: 16, marginBottom: 4, backgroundColor: Colors.white, borderRadius: 14, padding: 4, gap: 4 },
  segment: { flex: 1, minHeight: 44, borderRadius: 11, alignItems: 'center', justifyContent: 'center' },
  segmentOn: { backgroundColor: Colors.green },
  segmentText: { fontSize: 14, fontWeight: '600', color: Colors.textMuted },
  segmentTextOn: { color: '#fff' },
  list: { padding: 16, gap: 12, paddingBottom: 28, flexGrow: 1 },
  card: {
    backgroundColor: Colors.white, borderRadius: 16, padding: 14, gap: 4,
    shadowColor: Colors.shadow, shadowOffset: { width: 0, height: 2 }, shadowOpacity: 0.05, shadowRadius: 8, elevation: 1,
  },
  cardTop: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-start', gap: 8 },
  cardTitle: { flex: 1, fontSize: 15, fontWeight: '600', color: Colors.textPrimary },
  cardMeta: { fontSize: 13, color: Colors.textMuted },
  pillRow: { flexDirection: 'row', marginTop: 6 },
  newCue: { marginTop: 8, backgroundColor: Colors.blueBg, borderRadius: 10, paddingVertical: 10, paddingHorizontal: 12 },
  newCueText: { fontSize: 13, fontWeight: '600', color: Colors.blueText, textAlign: 'center' },
  emptyBox: { alignItems: 'center', paddingVertical: 40, paddingHorizontal: 24, gap: 14 },
  emptyText: { fontSize: 14, color: Colors.textMuted, textAlign: 'center', lineHeight: 20 },
  errorText: { fontSize: 14, color: Colors.redText, textAlign: 'center' },
  retryBtn: { backgroundColor: Colors.green, borderRadius: 12, minHeight: 44, paddingHorizontal: 24, alignItems: 'center', justifyContent: 'center' },
  retryText: { color: '#fff', fontSize: 14, fontWeight: '600' },
});
