import React, { useEffect, useMemo, useState } from 'react';
import {
  View, Text, ScrollView, TouchableOpacity, StyleSheet, TextInput, ActivityIndicator, Alert,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { RouteProp, useNavigation, useRoute } from '@react-navigation/native';
import { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { useTheme } from '../../hooks/useTheme';
import { ThemeColors } from '../../constants/theme';
import { CleanupTask, RootStackParamList } from '../../types';
import { BackIcon } from '../../components/common/TabIcons';
import { useAppSelector } from '../../store/hooks';
import { subscribeToBarangayTasks } from '../../services/cleanupTaskService';
import { approveCleanup, rejectCleanup } from '../../services/crewService';
import { APPROVED_STATUSES, describeConflict, findScheduleConflicts } from '../../services/scheduleConflicts';
import { formatDateKey, formatHHmm } from '../../utils/dates';
import { phDateKey } from '../../utils/phTime';
import { explainWriteError } from '../../utils/firestoreErrors';

type Nav = NativeStackNavigationProp<RootStackParamList>;
type Tab = 'pending' | 'approved' | 'rejected' | 'declined' | 'completed';

const TABS: { key: Tab; label: string }[] = [
  { key: 'pending', label: 'Pending' },
  { key: 'approved', label: 'Approved' },
  { key: 'rejected', label: 'Rejected' },
  { key: 'declined', label: 'Auto-declined' },
  { key: 'completed', label: 'Completed' },
];

const inTab = (t: CleanupTask, tab: Tab) => {
  switch (tab) {
    case 'pending': return t.status === 'proposed';
    case 'approved': return (APPROVED_STATUSES as readonly string[]).includes(t.status);
    case 'rejected': return t.status === 'rejected' || t.status === 'cancelled';
    case 'declined': return t.status === 'declined';
    case 'completed': return t.status === 'completed';
  }
};

const EMPTY: Record<Tab, string> = {
  pending: 'No cleanup schedules are waiting for your approval.',
  approved: 'No approved cleanups coming up.',
  rejected: 'No rejected schedules.',
  declined: 'No schedules were declined for conflicts.',
  completed: 'No completed cleanups yet.',
};

/**
 * The Barangay Captain's cleanup schedule approvals: every proposed schedule in the barangay
 * (pending, approved, rejected, declined automatically for conflicts, completed). Only the
 * Captain can approve or reject; each approval re-runs the automatic conflict check.
 */
export default function ApprovalsScreen() {
  const { colors } = useTheme();
  const styles = useMemo(() => createStyles(colors), [colors]);
  const navigation = useNavigation<Nav>();
  const user = useAppSelector((s) => s.auth.user);
  const barangayId = user?.barangayId ?? '';
  const [tasks, setTasks] = useState<CleanupTask[] | null>(null);
  const [error, setError] = useState('');
  const route = useRoute<RouteProp<RootStackParamList, 'AdminApprovals'>>();
  const [tab, setTab] = useState<Tab>(route.params?.tab ?? 'pending');
  const [busyId, setBusyId] = useState<string | null>(null);
  const [rejectingId, setRejectingId] = useState<string | null>(null);
  const [remarks, setRemarks] = useState('');

  useEffect(() => {
    if (!barangayId) { setTasks([]); return undefined; }
    return subscribeToBarangayTasks(barangayId, setTasks, (e) => { setError(e.message || 'Could not load the schedules.'); setTasks([]); });
  }, [barangayId]);

  const list = useMemo(() => {
    const items = (tasks ?? []).filter((t) => inTab(t, tab));
    // Pending and approved: soonest first; the rest: most recent first.
    return tab === 'pending' || tab === 'approved'
      ? items.sort((a, b) => `${a.scheduledDate}${a.startTime}`.localeCompare(`${b.scheduledDate}${b.startTime}`))
      : items;
  }, [tasks, tab]);
  const counts = useMemo(() => Object.fromEntries(TABS.map((t) => [t.key, (tasks ?? []).filter((x) => inTab(x, t.key)).length])) as Record<Tab, number>, [tasks]);
  const approved = useMemo(() => (tasks ?? []).filter((t) => inTab(t, 'approved')), [tasks]);
  const today = phDateKey();

  if (user?.role !== 'admin') {
    return (
      <SafeAreaView style={styles.container}>
        <View style={styles.center}><Text style={styles.muted}>Only the Barangay Captain can approve cleanup schedules.</Text></View>
      </SafeAreaView>
    );
  }

  const approve = (t: CleanupTask) => {
    Alert.alert('Approve this cleanup?', `${t.assignedTeamName} on ${formatDateKey(t.scheduledDate)}, ${formatHHmm(t.startTime)}–${formatHHmm(t.endTime)}. The crew, the official and the reporter will be notified.`, [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'Approve',
        onPress: async () => {
          setBusyId(t.id);
          try {
            const result = await approveCleanup(t, user);
            if (result === 'declined') {
              Alert.alert('Declined automatically', 'Another cleanup was approved for the same crew, place or equipment at that time, so this one clashes. The official has been told and can propose a different time.');
            }
          } catch (e) {
            Alert.alert('Could not approve', e instanceof Error && !(e as { code?: string }).code ? e.message : explainWriteError(e, 'approve this schedule'));
          } finally {
            setBusyId(null);
          }
        },
      },
    ]);
  };

  const reject = async (t: CleanupTask) => {
    if (!remarks.trim()) { Alert.alert('Remarks needed', 'Say why, or what to change, so the official can propose a better schedule.'); return; }
    setBusyId(t.id);
    try {
      await rejectCleanup(t, user, remarks);
      setRejectingId(null);
      setRemarks('');
    } catch (e) {
      Alert.alert('Could not reject', e instanceof Error && !(e as { code?: string }).code ? e.message : explainWriteError(e, 'reject this schedule'));
    } finally {
      setBusyId(null);
    }
  };

  return (
    <SafeAreaView style={styles.container} edges={['top']}>
      <View style={styles.header}>
        <TouchableOpacity style={styles.backBtn} onPress={() => navigation.goBack()} accessibilityLabel="Go back"><BackIcon size={18} /></TouchableOpacity>
        <Text style={styles.headerTitle}>Cleanup approvals</Text>
        <View style={{ width: 38 }} />
      </View>

      <ScrollView horizontal showsHorizontalScrollIndicator={false} style={styles.tabBar} contentContainerStyle={styles.tabRow}>
        {TABS.map((t) => (
          <TouchableOpacity key={t.key} style={[styles.tab, tab === t.key && styles.tabOn]} onPress={() => setTab(t.key)}>
            <Text style={[styles.tabText, tab === t.key && styles.tabTextOn]}>{t.label}{counts[t.key] ? ` · ${counts[t.key]}` : ''}</Text>
          </TouchableOpacity>
        ))}
      </ScrollView>

      <ScrollView contentContainerStyle={styles.body} keyboardShouldPersistTaps="handled">
        {tasks === null ? <ActivityIndicator color={colors.teal} style={{ marginTop: 30 }} />
          : error ? <Text style={styles.error}>{error}</Text>
            : list.length === 0 ? <View style={styles.card}><Text style={styles.muted}>{EMPTY[tab]}</Text></View>
              : list.map((t) => {
                // Pending ones are checked live against what's approved now.
                const clashes = t.status === 'proposed' ? findScheduleConflicts({ ...t }, approved).map(describeConflict) : [];
                const past = t.scheduledDate < today && t.status === 'proposed';
                return (
                  <View key={t.id} style={styles.card}>
                    <TouchableOpacity onPress={() => navigation.navigate('CleanupTaskDetail', { taskId: t.id } as never)} activeOpacity={0.8}>
                      <Text style={styles.title}>{t.title}</Text>
                      <Text style={styles.when}>📅 {formatDateKey(t.scheduledDate)} · {formatHHmm(t.startTime)}–{formatHHmm(t.endTime)}</Text>
                      <Text style={styles.line}>📍 {t.location?.address || t.barangay}</Text>
                      <Text style={styles.line}>👷 {t.assignedTeamName}{t.personnelCount ? ` · ${t.personnelCount} workers` : ''}</Text>
                      {!!t.equipmentNeeded?.length && <Text style={styles.line}>🧰 {t.equipmentNeeded.join(', ')}</Text>}
                      <Text style={styles.meta}>Proposed by {t.assignedByName}</Text>
                    </TouchableOpacity>

                    {t.status === 'declined' && (
                      <View style={styles.redBox}>
                        <Text style={styles.redTitle}>Declined automatically: schedule conflict</Text>
                        {(t.conflicts ?? []).map((c) => <Text key={c.taskId + c.message} style={styles.redText}>{c.message}</Text>)}
                        {!!t.suggestedSlot && (
                          <Text style={styles.redText}>Free time suggested: {formatDateKey(t.suggestedSlot.scheduledDate)}, {formatHHmm(t.suggestedSlot.startTime)}–{formatHHmm(t.suggestedSlot.endTime)}</Text>
                        )}
                      </View>
                    )}
                    {t.status === 'rejected' && (
                      <View style={styles.redBox}><Text style={styles.redText}>Rejected by {t.rejectedByName}: {t.rejectionRemarks}</Text></View>
                    )}
                    {(APPROVED_STATUSES as readonly string[]).includes(t.status) && (
                      <Text style={styles.okText}>✓ Approved by {t.approvedByName ?? 'the Captain'} · crew status: {t.status.replace('_', ' ')}</Text>
                    )}

                    {t.status === 'proposed' && (
                      <>
                        {clashes.length > 0 ? (
                          <View style={styles.redBox}>
                            <Text style={styles.redTitle}>⚠️ Clashes with an approved cleanup</Text>
                            {clashes.map((m) => <Text key={m} style={styles.redText}>{m}</Text>)}
                            <Text style={styles.redText}>Approving will decline it automatically.</Text>
                          </View>
                        ) : (
                          <Text style={styles.okText}>✓ No clash with approved cleanups</Text>
                        )}
                        {past && <Text style={styles.warn}>This date has already passed. Reject it so a new date can be proposed.</Text>}
                        {rejectingId === t.id ? (
                          <View style={{ gap: 8 }}>
                            <TextInput
                              style={styles.input}
                              value={remarks}
                              onChangeText={setRemarks}
                              placeholder="Why, or what should change (required)"
                              placeholderTextColor={colors.textHint}
                              multiline
                            />
                            <View style={styles.row}>
                              <TouchableOpacity style={[styles.btn, styles.btnGhost]} onPress={() => { setRejectingId(null); setRemarks(''); }}>
                                <Text style={styles.btnGhostText}>Cancel</Text>
                              </TouchableOpacity>
                              <TouchableOpacity style={[styles.btn, styles.btnRed]} onPress={() => reject(t)} disabled={busyId === t.id}>
                                {busyId === t.id ? <ActivityIndicator color="#fff" size="small" /> : <Text style={styles.btnText}>Reject schedule</Text>}
                              </TouchableOpacity>
                            </View>
                          </View>
                        ) : (
                          <View style={styles.row}>
                            <TouchableOpacity style={[styles.btn, styles.btnGhost]} onPress={() => { setRejectingId(t.id); setRemarks(''); }} disabled={busyId === t.id}>
                              <Text style={styles.btnGhostText}>Reject</Text>
                            </TouchableOpacity>
                            <TouchableOpacity style={[styles.btn, styles.btnTeal, past && { opacity: 0.5 }]} onPress={() => approve(t)} disabled={busyId === t.id || past}>
                              {busyId === t.id ? <ActivityIndicator color="#fff" size="small" /> : <Text style={styles.btnText}>Approve</Text>}
                            </TouchableOpacity>
                          </View>
                        )}
                      </>
                    )}
                  </View>
                );
              })}
      </ScrollView>
    </SafeAreaView>
  );
}

const createStyles = (C: ThemeColors) => StyleSheet.create({
  container: { flex: 1, backgroundColor: C.grayBg },
  center: { flex: 1, alignItems: 'center', justifyContent: 'center', padding: 24 },
  header: {
    backgroundColor: C.white, paddingHorizontal: 16, paddingVertical: 12, flexDirection: 'row', alignItems: 'center',
    justifyContent: 'space-between', borderBottomWidth: 0.5, borderBottomColor: C.border,
  },
  headerTitle: { fontSize: 16, fontWeight: '600', color: C.textPrimary },
  backBtn: { width: 38, height: 38, borderRadius: 19, backgroundColor: C.grayBg, alignItems: 'center', justifyContent: 'center' },
  tabBar: { flexGrow: 0, backgroundColor: C.white, borderBottomWidth: 0.5, borderBottomColor: C.border },
  tabRow: { gap: 6, paddingHorizontal: 12, paddingVertical: 8 },
  tab: { paddingHorizontal: 12, paddingVertical: 6, borderRadius: 16, backgroundColor: C.grayBg },
  tabOn: { backgroundColor: C.teal },
  tabText: { fontSize: 12, fontWeight: '600', color: C.textSecondary },
  tabTextOn: { color: '#fff' },
  body: { padding: 14, gap: 12, paddingBottom: 30 },
  card: { backgroundColor: C.white, borderRadius: 16, padding: 14, gap: 8, borderWidth: 0.5, borderColor: C.border },
  title: { fontSize: 14, fontWeight: '700', color: C.textPrimary },
  when: { fontSize: 13, fontWeight: '600', color: C.tealDark, marginTop: 4 },
  line: { fontSize: 12, color: C.textSecondary, marginTop: 3 },
  meta: { fontSize: 11, color: C.textMuted, marginTop: 4 },
  muted: { fontSize: 13, color: C.textMuted, textAlign: 'center' },
  error: { fontSize: 13, color: C.redText },
  redBox: { backgroundColor: C.redBg, borderRadius: 10, padding: 10, gap: 4 },
  redTitle: { fontSize: 12, fontWeight: '700', color: C.redText },
  redText: { fontSize: 12, color: C.redText, lineHeight: 17 },
  okText: { fontSize: 12, fontWeight: '600', color: C.tealDark },
  warn: { fontSize: 12, color: C.amberText, backgroundColor: C.amberBg, borderRadius: 8, padding: 8 },
  row: { flexDirection: 'row', gap: 8 },
  btn: { flex: 1, borderRadius: 12, paddingVertical: 11, alignItems: 'center', justifyContent: 'center' },
  btnTeal: { backgroundColor: C.teal },
  btnRed: { backgroundColor: C.red },
  btnGhost: { borderWidth: 1, borderColor: C.borderMid },
  btnText: { color: '#fff', fontWeight: '700', fontSize: 13 },
  btnGhostText: { color: C.textPrimary, fontWeight: '600', fontSize: 13 },
  input: { borderWidth: 1, borderColor: C.borderMid, borderRadius: 10, padding: 10, minHeight: 60, color: C.textPrimary, fontSize: 13, textAlignVertical: 'top' },
});
