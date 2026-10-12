import React, { useEffect, useState, useMemo } from 'react';
import { View, Text, ScrollView, TouchableOpacity, StyleSheet, Alert, ActivityIndicator, Image } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useTheme } from '../../hooks/useTheme';
import { ThemeColors } from '../../constants/theme';
import { Badge } from '../../components/common/Badge';
import { useAppSelector } from '../../store/hooks';
import { ReportStatus } from '../../types';
import {
  FieldCheckpointRecord,
  subscribeToAllCheckpoints,
  verifyCheckpoint,
} from '../../services/checkpointService';

type DisplayStatus = 'resolved' | 'in_progress' | 'pending' | 'cancelled';

const FILTER_OPTIONS = ['All', 'Resolved', 'In progress', 'Pending', 'Cancelled'];

function buildSeverityDot(colors: ThemeColors): Record<string, string> {
  return {
    critical: colors.critical,
    high: colors.red,
    moderate: colors.amber,
    low: colors.teal,
  };
}

function toDisplayStatus(status: ReportStatus): DisplayStatus {
  if (status === 'completed') return 'resolved';
  if (status === 'in_progress' || status === 'assigned' || status === 'verified') return 'in_progress';
  if (status === 'rejected' || status === 'cancelled') return 'cancelled';
  return 'pending';
}

export default function AdminHistoryScreen() {
  const { colors } = useTheme();
  const styles = useMemo(() => createStyles(colors), [colors]);
  const SEVERITY_DOT = useMemo(() => buildSeverityDot(colors), [colors]);
  const { reports } = useAppSelector((s) => s.reports);
  const { user } = useAppSelector((s) => s.auth);
  const [filter, setFilter] = useState('All');
  const [view, setView] = useState<'reports' | 'checkpoints'>('reports');
  const [checkpoints, setCheckpoints] = useState<FieldCheckpointRecord[]>([]);
  const [checkpointsLoaded, setCheckpointsLoaded] = useState(false);
  const [verifyingId, setVerifyingId] = useState<string | null>(null);

  useEffect(() => {
    const unsub = subscribeToAllCheckpoints((records) => {
      setCheckpoints(records);
      setCheckpointsLoaded(true);
    });
    return unsub;
  }, []);

  const handleVerifyCheckpoint = async (checkpointId: string) => {
    if (!user || verifyingId) return;
    setVerifyingId(checkpointId);
    try {
      await verifyCheckpoint(checkpointId, user.uid, `${user.firstName} ${user.lastName}`);
    } catch {
      Alert.alert('Error', 'Failed to verify this checkpoint. Please try again.');
    } finally {
      setVerifyingId(null);
    }
  };

  const history = reports.map((r) => ({
    id: r.id,
    barangay: r.location?.barangay || r.barangay || 'Unknown',
    type: r.aiAnalysis?.wasteTypes[0]?.label || 'Waste',
    severity: (r.severity || 'moderate') as 'critical' | 'high' | 'moderate' | 'low',
    displayStatus: toDisplayStatus(r.status),
    team: r.assignedTeamName || '—',
    date: r.createdAt
      ? new Date(r.createdAt as unknown as string).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })
      : '—',
    duration:
      r.resolvedAt && r.createdAt
        ? `${Math.max(1, Math.round((new Date(r.resolvedAt as unknown as string).getTime() - new Date(r.createdAt as unknown as string).getTime()) / 3600000))}h`
        : '—',
    confidence: r.aiAnalysis?.confidence != null ? `${Number(r.aiAnalysis.confidence).toFixed(1)}%` : '—',
  }));

  const filtered = filter === 'All'
    ? history
    : history.filter((h) => {
        if (filter === 'Resolved') return h.displayStatus === 'resolved';
        if (filter === 'In progress') return h.displayStatus === 'in_progress';
        if (filter === 'Pending') return h.displayStatus === 'pending';
        if (filter === 'Cancelled') return h.displayStatus === 'cancelled';
        return true;
      });

  const totalResolved = history.filter((h) => h.displayStatus === 'resolved').length;
  const totalInProgress = history.filter((h) => h.displayStatus === 'in_progress').length;
  const totalPending = history.filter((h) => h.displayStatus === 'pending').length;

  const pendingCheckpointCount = checkpoints.filter((c) => c.status === 'pending').length;

  return (
    <SafeAreaView style={styles.container}>
      <View style={styles.header}>
        <Text style={styles.headerTitle}>Cleanup History</Text>
      </View>

      {/* View toggle: waste reports vs. barangay checkpoint submissions */}
      <View style={styles.viewToggleRow}>
        {([
          { key: 'reports' as const, label: 'Reports' },
          { key: 'checkpoints' as const, label: `Checkpoints${pendingCheckpointCount > 0 ? ` (${pendingCheckpointCount})` : ''}` },
        ]).map((opt) => (
          <TouchableOpacity
            key={opt.key}
            style={[styles.viewToggleBtn, view === opt.key && styles.viewToggleBtnActive]}
            onPress={() => setView(opt.key)}
          >
            <Text style={[styles.viewToggleText, view === opt.key && styles.viewToggleTextActive]}>{opt.label}</Text>
          </TouchableOpacity>
        ))}
      </View>

      {view === 'checkpoints' ? (
        <ScrollView contentContainerStyle={styles.body} showsVerticalScrollIndicator={false}>
          {!checkpointsLoaded && (
            <ActivityIndicator size="small" color={colors.blue} style={{ alignSelf: 'center', marginVertical: 16 }} />
          )}
          {checkpointsLoaded && checkpoints.length === 0 && (
            <View style={styles.emptyCard}>
              <Text style={styles.emptyText}>No checkpoint submissions yet</Text>
            </View>
          )}
          {checkpoints.map((cp) => (
            <View key={cp.id} style={styles.historyCard}>
              <View style={styles.historyTop}>
                <View style={[styles.dot, { backgroundColor: cp.status === 'verified' ? colors.green : colors.amber }]} />
                <View style={{ flex: 1 }}>
                  <Text style={styles.historyBarangay}>{cp.barangay}</Text>
                  <Text style={styles.historyType}>{cp.type} · {cp.userName}</Text>
                </View>
                <Badge variant={cp.status === 'verified' ? 'completed' : 'pending'} label={cp.status === 'verified' ? 'Verified' : 'Pending'} />
              </View>
              {!!cp.photoURL && <Image source={{ uri: cp.photoURL }} style={styles.checkpointPhoto} />}
              {!!cp.location && (
                <Text style={styles.checkpointGps}>
                  📍 {cp.location.latitude.toFixed(5)}, {cp.location.longitude.toFixed(5)}
                </Text>
              )}
              <View style={styles.historyMeta}>
                {[
                  { k: 'Condition', v: cp.condition },
                  { k: 'Waste type', v: cp.wasteType },
                  { k: 'Submitted', v: cp.createdAt.toLocaleDateString('en-US', { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' }) },
                  { k: 'Verified by', v: cp.verifiedByName || '—' },
                ].map((m) => (
                  <View key={m.k} style={styles.metaPair}>
                    <Text style={styles.metaKey}>{m.k}</Text>
                    <Text style={styles.metaVal}>{m.v}</Text>
                  </View>
                ))}
              </View>
              {!!cp.notes && <Text style={styles.checkpointNotes}>{cp.notes}</Text>}
              {cp.status === 'pending' && (
                <TouchableOpacity
                  style={styles.verifyBtn}
                  onPress={() => handleVerifyCheckpoint(cp.id)}
                  disabled={verifyingId === cp.id}
                >
                  {verifyingId === cp.id
                    ? <ActivityIndicator size="small" color="#fff" />
                    : <Text style={styles.verifyBtnText}>Verify checkpoint</Text>}
                </TouchableOpacity>
              )}
            </View>
          ))}
        </ScrollView>
      ) : (
      <ScrollView contentContainerStyle={styles.body} showsVerticalScrollIndicator={false}>
        {/* Summary stats */}
        <View style={styles.statsRow}>
          {[
            { val: history.length, label: 'Total', color: colors.teal },
            { val: totalResolved, label: 'Resolved', color: colors.green },
            { val: totalInProgress, label: 'In progress', color: colors.amber },
            { val: totalPending, label: 'Pending', color: colors.red },
          ].map((s) => (
            <View key={s.label} style={styles.statCard}>
              <Text style={[styles.statVal, { color: s.color }]}>{s.val}</Text>
              <Text style={styles.statLabel}>{s.label}</Text>
            </View>
          ))}
        </View>

        {/* Filter chips */}
        <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.filterRow}>
          {FILTER_OPTIONS.map((opt) => (
            <TouchableOpacity
              key={opt}
              style={[styles.filterChip, filter === opt && styles.filterChipActive]}
              onPress={() => setFilter(opt)}
            >
              <Text style={[styles.filterChipText, filter === opt && styles.filterChipTextActive]}>{opt}</Text>
            </TouchableOpacity>
          ))}
        </ScrollView>

        {/* History items */}
        {filtered.map((item) => {
          const badgeVariant = item.displayStatus === 'resolved' ? 'completed'
            : item.displayStatus === 'in_progress' ? 'in_progress'
            : item.displayStatus === 'cancelled' ? 'cancelled'
            : 'pending';
          const badgeLabel = item.displayStatus === 'resolved' ? 'Resolved'
            : item.displayStatus === 'in_progress' ? 'In progress'
            : item.displayStatus === 'cancelled' ? 'Cancelled'
            : 'Pending';
          return (
            <View key={item.id} style={styles.historyCard}>
              <View style={styles.historyTop}>
                <View style={[styles.dot, { backgroundColor: SEVERITY_DOT[item.severity] }]} />
                <View style={{ flex: 1 }}>
                  <Text style={styles.historyBarangay}>{item.barangay}</Text>
                  <Text style={styles.historyType}>{item.type}</Text>
                </View>
                <Badge variant={badgeVariant} label={badgeLabel} />
              </View>
              <View style={styles.historyMeta}>
                {[
                  { k: 'Date', v: item.date },
                  { k: 'Team', v: item.team },
                  { k: 'Duration', v: item.duration },
                  { k: 'CNN', v: item.confidence },
                ].map((m) => (
                  <View key={m.k} style={styles.metaPair}>
                    <Text style={styles.metaKey}>{m.k}</Text>
                    <Text style={styles.metaVal}>{m.v}</Text>
                  </View>
                ))}
              </View>
              <View style={styles.historyBadgeRow}>
                <Badge variant={item.severity} label={item.severity.charAt(0).toUpperCase() + item.severity.slice(1)} />
              </View>
            </View>
          );
        })}

        {filtered.length === 0 && (
          <View style={styles.emptyCard}>
            <Text style={styles.emptyText}>{history.length === 0 ? 'No reports yet' : 'No records match this filter'}</Text>
          </View>
        )}
      </ScrollView>
      )}
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
  viewToggleRow: {
    flexDirection: 'row', gap: 8, backgroundColor: Colors.white, paddingHorizontal: 14, paddingVertical: 8,
    borderBottomWidth: 0.5, borderBottomColor: Colors.border,
  },
  viewToggleBtn: { flex: 1, borderRadius: 10, paddingVertical: 8, alignItems: 'center', backgroundColor: Colors.grayBg },
  viewToggleBtnActive: { backgroundColor: Colors.blue },
  viewToggleText: { fontSize: 12, fontWeight: '500', color: Colors.textMuted },
  viewToggleTextActive: { color: '#fff' },
  checkpointNotes: { fontSize: 11, color: Colors.textMuted, lineHeight: 16 },
  checkpointPhoto: { width: '100%', height: 160, borderRadius: 12 },
  checkpointGps: { fontSize: 10, color: Colors.textHint },
  verifyBtn: { backgroundColor: Colors.teal, borderRadius: 10, paddingVertical: 9, alignItems: 'center' },
  verifyBtnText: { fontSize: 12, fontWeight: '500', color: '#fff' },
  body: { padding: 16, gap: 14, paddingBottom: 24 },
  statsRow: { flexDirection: 'row', gap: 7 },
  statCard: {
    flex: 1, backgroundColor: Colors.white, borderRadius: 16, padding: 13, alignItems: 'center',
    shadowColor: Colors.shadow, shadowOffset: { width: 0, height: 2 }, shadowOpacity: 0.05, shadowRadius: 8, elevation: 1,
  },
  statVal: { fontSize: 18, fontWeight: '500' },
  statLabel: { fontSize: 9, color: Colors.textMuted, marginTop: 2 },
  filterRow: { gap: 6, paddingVertical: 2 },
  filterChip: { paddingHorizontal: 12, paddingVertical: 5, borderRadius: 20, borderWidth: 0.5, borderColor: Colors.border, backgroundColor: Colors.white },
  filterChipActive: { backgroundColor: Colors.blue, borderColor: Colors.blue },
  filterChipText: { fontSize: 11, color: Colors.textMuted },
  filterChipTextActive: { color: '#fff', fontWeight: '500' },
  historyCard: {
    backgroundColor: Colors.white, borderRadius: 16, padding: 14, gap: 8,
    shadowColor: Colors.shadow, shadowOffset: { width: 0, height: 2 }, shadowOpacity: 0.05, shadowRadius: 8, elevation: 1,
  },
  historyTop: { flexDirection: 'row', alignItems: 'flex-start', gap: 9 },
  dot: { width: 9, height: 9, borderRadius: 4.5, marginTop: 3 },
  historyBarangay: { fontSize: 12, fontWeight: '500', color: Colors.textPrimary },
  historyType: { fontSize: 10, color: Colors.textMuted, marginTop: 1 },
  historyMeta: { flexDirection: 'row', flexWrap: 'wrap', gap: 6 },
  metaPair: { backgroundColor: Colors.grayBg, borderRadius: 8, paddingHorizontal: 8, paddingVertical: 4, minWidth: '45%' },
  metaKey: { fontSize: 9, color: Colors.textMuted },
  metaVal: { fontSize: 11, fontWeight: '500', color: Colors.textPrimary, marginTop: 1 },
  historyBadgeRow: { flexDirection: 'row' },
  emptyCard: {
    backgroundColor: Colors.white, borderRadius: 18, padding: 32, alignItems: 'center',
    shadowColor: Colors.shadow, shadowOffset: { width: 0, height: 2 }, shadowOpacity: 0.05, shadowRadius: 8, elevation: 1,
  },
  emptyText: { fontSize: 12, color: Colors.textHint },
});
