import React, { useState, useEffect } from 'react';
import { View, Text, ScrollView, TouchableOpacity, StyleSheet, ActivityIndicator } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { collection, query, where, orderBy, onSnapshot, limit } from 'firebase/firestore';
import { db } from '../../services/firebase';
import { Colors } from '../../constants/colors';
import { useAppSelector } from '../../store/hooks';

const FILTER_OPTIONS = ['All', 'Verified', 'Pending review', 'Flagged'];

const COND_COLORS: Record<string, string> = {
  Clean: Colors.teal,
  Mild: Colors.green,
  Moderate: Colors.amber,
  Heavy: Colors.red,
  Critical: Colors.critical,
};

const STATUS_COLORS: Record<string, string> = {
  verified: Colors.teal,
  pending: Colors.amber,
  flagged: Colors.red,
};

interface FieldCheckpoint {
  id: string;
  type: string;
  condition: string;
  barangay: string;
  officer: string;
  date: string;
  status: 'verified' | 'pending' | 'flagged';
}

export default function BarangayHistoryScreen() {
  const { user } = useAppSelector((s) => s.auth);
  const [checkpoints, setCheckpoints] = useState<FieldCheckpoint[]>([]);
  const [loading, setLoading] = useState(true);
  const [filter, setFilter] = useState('All');

  useEffect(() => {
    if (!user?.uid) return;
    const q = query(
      collection(db, 'fieldCheckpoints'),
      where('userId', '==', user.uid),
      orderBy('createdAt', 'desc'),
      limit(50),
    );
    const unsub = onSnapshot(q, (snap) => {
      setCheckpoints(
        snap.docs.map((d) => {
          const data = d.data();
          const ts = data.createdAt?.toDate?.() ?? new Date(data.createdAt ?? Date.now());
          return {
            id: d.id,
            type: data.type || '—',
            condition: data.condition || 'Moderate',
            barangay: data.barangay || user?.barangay || '—',
            officer: data.userName || `${user?.firstName} ${user?.lastName}`,
            date: ts.toLocaleString('en-US', { month: 'short', day: 'numeric', year: 'numeric', hour: '2-digit', minute: '2-digit' }),
            status: (data.status || 'pending') as 'verified' | 'pending' | 'flagged',
          };
        }),
      );
      setLoading(false);
    });
    return unsub;
  }, [user?.uid]);

  const filtered = filter === 'All'
    ? checkpoints
    : checkpoints.filter((c) => {
        if (filter === 'Verified') return c.status === 'verified';
        if (filter === 'Pending review') return c.status === 'pending';
        if (filter === 'Flagged') return c.status === 'flagged';
        return true;
      });

  const verified = checkpoints.filter((c) => c.status === 'verified').length;
  const pending = checkpoints.filter((c) => c.status === 'pending').length;
  const flagged = checkpoints.filter((c) => c.status === 'flagged').length;

  return (
    <SafeAreaView style={styles.container}>
      <View style={styles.header}>
        <Text style={styles.headerTitle}>Checkpoint History</Text>
      </View>

      <ScrollView contentContainerStyle={styles.body} showsVerticalScrollIndicator={false}>
        {/* Stats */}
        <View style={styles.statsRow}>
          {[
            { val: checkpoints.length, label: 'Total', color: Colors.brgy },
            { val: verified, label: 'Verified', color: Colors.green },
            { val: pending, label: 'Pending', color: Colors.amber },
            { val: flagged, label: 'Flagged', color: Colors.red },
          ].map((s) => (
            <View key={s.label} style={styles.statCard}>
              <Text style={[styles.statVal, { color: s.color }]}>{s.val}</Text>
              <Text style={styles.statLabel}>{s.label}</Text>
            </View>
          ))}
        </View>

        {/* Filters */}
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

        {loading && (
          <ActivityIndicator size="small" color={Colors.brgy} style={{ alignSelf: 'center', marginVertical: 16 }} />
        )}

        {/* Checkpoint cards */}
        {filtered.map((item) => (
          <View key={item.id} style={[styles.checkCard, item.status === 'flagged' && styles.checkCardFlagged]}>
            <View style={styles.checkTop}>
              <View style={[styles.condBadge, { backgroundColor: (COND_COLORS[item.condition] ?? Colors.grayMid) + '20', borderColor: (COND_COLORS[item.condition] ?? Colors.grayMid) + '40' }]}>
                <Text style={[styles.condText, { color: COND_COLORS[item.condition] ?? Colors.textMuted }]}>{item.condition}</Text>
              </View>
              <View style={{ flex: 1 }}>
                <Text style={styles.checkType}>{item.type}</Text>
                <Text style={styles.checkBarangay}>{item.barangay} · {item.officer}</Text>
              </View>
              <View style={[styles.statusDot, { backgroundColor: STATUS_COLORS[item.status] ?? Colors.grayMid }]} />
            </View>
            <View style={styles.checkMeta}>
              <Text style={styles.checkDate}>{item.date}</Text>
              <Text style={[styles.checkStatus, { color: STATUS_COLORS[item.status] ?? Colors.textMuted }]}>
                {item.status === 'pending' ? 'Pending review' : item.status.charAt(0).toUpperCase() + item.status.slice(1)}
              </Text>
            </View>
          </View>
        ))}

        {!loading && filtered.length === 0 && (
          <View style={styles.emptyCard}>
            <Text style={styles.emptyText}>{checkpoints.length === 0 ? 'No checkpoints submitted yet' : 'No checkpoints match this filter'}</Text>
          </View>
        )}
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: Colors.grayBg },
  header: {
    backgroundColor: Colors.white, paddingHorizontal: 16, paddingVertical: 12,
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
    borderBottomWidth: 0.5, borderBottomColor: Colors.border,
  },
  headerTitle: { fontSize: 16, fontWeight: '500', color: Colors.textPrimary },
  body: { padding: 14, gap: 8, paddingBottom: 24 },
  statsRow: { flexDirection: 'row', gap: 7 },
  statCard: { flex: 1, backgroundColor: Colors.white, borderRadius: 12, padding: 10, alignItems: 'center', borderWidth: 0.5, borderColor: Colors.border },
  statVal: { fontSize: 18, fontWeight: '500' },
  statLabel: { fontSize: 9, color: Colors.textMuted, marginTop: 2 },
  filterRow: { gap: 6, paddingVertical: 2 },
  filterChip: { paddingHorizontal: 12, paddingVertical: 5, borderRadius: 20, borderWidth: 0.5, borderColor: Colors.border, backgroundColor: Colors.white },
  filterChipActive: { backgroundColor: Colors.brgy, borderColor: Colors.brgy },
  filterChipText: { fontSize: 11, color: Colors.textMuted },
  filterChipTextActive: { color: '#fff', fontWeight: '500' },
  checkCard: {
    backgroundColor: Colors.white, borderRadius: 13, padding: 12,
    borderWidth: 0.5, borderColor: Colors.border, gap: 7,
  },
  checkCardFlagged: { borderLeftWidth: 3, borderLeftColor: Colors.red },
  checkTop: { flexDirection: 'row', alignItems: 'flex-start', gap: 9 },
  condBadge: { borderRadius: 8, paddingHorizontal: 7, paddingVertical: 3, borderWidth: 0.5, alignSelf: 'flex-start' },
  condText: { fontSize: 10, fontWeight: '500' },
  checkType: { fontSize: 12, fontWeight: '500', color: Colors.textPrimary },
  checkBarangay: { fontSize: 10, color: Colors.textMuted, marginTop: 2 },
  statusDot: { width: 9, height: 9, borderRadius: 4.5, marginTop: 3 },
  checkMeta: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  checkDate: { fontSize: 10, color: Colors.textHint },
  checkStatus: { fontSize: 11, fontWeight: '500' },
  emptyCard: { backgroundColor: Colors.white, borderRadius: 12, padding: 32, alignItems: 'center', borderWidth: 0.5, borderColor: Colors.border },
  emptyText: { fontSize: 12, color: Colors.textHint },
});
