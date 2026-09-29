import React, { useEffect, useMemo, useState } from 'react';
import { View, Text, ScrollView, TouchableOpacity, StyleSheet, SafeAreaView, Alert, Switch } from 'react-native';
import { collection, query, where, orderBy, onSnapshot, limit } from 'firebase/firestore';
import { db } from '../../services/firebase';
import { useTheme } from '../../hooks/useTheme';
import { ThemeColors } from '../../constants/theme';
import { useAppSelector, useAppDispatch } from '../../store/hooks';
import { logout } from '../../store/authSlice';

interface FieldCheckpoint {
  id: string;
  type: string;
  status: 'verified' | 'pending' | 'flagged';
  createdAt: Date;
}

export default function BarangayProfileScreen() {
  const dispatch = useAppDispatch();
  const { colors, isDark, setMode } = useTheme();
  const styles = useMemo(() => createStyles(colors), [colors]);
  const { user } = useAppSelector((s) => s.auth);
  const [checkpoints, setCheckpoints] = useState<FieldCheckpoint[]>([]);

  const displayName = user ? `${user.firstName} ${user.lastName}` : 'Barangay Official';
  const initials = displayName.split(' ').map((n) => n[0]).join('').slice(0, 2).toUpperCase();
  const barangay = user?.barangay || '—';
  const employeeId = user?.employeeId || '—';

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
          return {
            id: d.id,
            type: data.type || '—',
            status: (data.status || 'pending') as 'verified' | 'pending' | 'flagged',
            createdAt: data.createdAt?.toDate?.() ?? new Date(data.createdAt ?? Date.now()),
          };
        }),
      );
    });
    return unsub;
  }, [user?.uid]);

  const verifiedCount = checkpoints.filter((c) => c.status === 'verified').length;
  const pendingCount = checkpoints.filter((c) => c.status === 'pending').length;
  const flaggedCount = checkpoints.filter((c) => c.status === 'flagged').length;
  const alertsIssued = checkpoints.filter((c) => c.type === 'Community alert').length;
  const lastCheckpoint = checkpoints[0]
    ? checkpoints[0].createdAt.toLocaleString('en-US', { month: 'short', day: 'numeric', year: 'numeric', hour: '2-digit', minute: '2-digit' })
    : 'No checkpoints yet';
  const activeSince = user?.createdAt
    ? new Date(user.createdAt).toLocaleDateString('en-US', { month: 'long', year: 'numeric' })
    : '—';

  const handleSignOut = () => {
    Alert.alert('Sign out', 'Are you sure you want to sign out?', [
      { text: 'Cancel', style: 'cancel' },
      { text: 'Sign out', style: 'destructive', onPress: () => dispatch(logout()) },
    ]);
  };

  return (
    <SafeAreaView style={styles.container}>
      <View style={styles.header}>
        <Text style={styles.headerTitle}>Profile</Text>
      </View>

      <ScrollView contentContainerStyle={styles.body} showsVerticalScrollIndicator={false}>
        {/* Avatar card */}
        <View style={styles.avatarCard}>
          <View style={styles.avatar}>
            <Text style={styles.avatarText}>{initials}</Text>
          </View>
          <Text style={styles.displayName}>{displayName}</Text>
          <View style={styles.rolePill}>
            <Text style={styles.rolePillText}>BARANGAY OFFICIAL (BSP) · {barangay.toUpperCase()}</Text>
          </View>
          <Text style={styles.empId}>{employeeId}</Text>
        </View>

        {/* Stats */}
        <View style={styles.statsRow}>
          {[
            { val: checkpoints.length, label: 'Checkpoints', color: colors.brgy },
            { val: verifiedCount, label: 'Verified', color: colors.green },
            { val: pendingCount, label: 'Pending', color: colors.teal },
            { val: flaggedCount, label: 'Flagged', color: colors.red },
          ].map((s) => (
            <View key={s.label} style={styles.statCard}>
              <Text style={[styles.statVal, { color: s.color }]}>{s.val}</Text>
              <Text style={styles.statLabel}>{s.label}</Text>
            </View>
          ))}
        </View>

        {/* Account info */}
        <View style={styles.infoCard}>
          <Text style={styles.cardTitle}>Account Information</Text>
          {[
            { k: 'Full name', v: displayName },
            { k: 'Email', v: user?.email || '—' },
            { k: 'Barangay', v: barangay },
            { k: 'Employee ID', v: employeeId },
            { k: 'Role', v: 'Barangay Official (BSP)' },
          ].map((row) => (
            <View key={row.k} style={styles.infoRow}>
              <Text style={styles.infoKey}>{row.k}</Text>
              <Text style={styles.infoVal}>{row.v}</Text>
            </View>
          ))}
        </View>

        {/* Field activity */}
        <View style={styles.infoCard}>
          <Text style={styles.cardTitle}>Field Activity</Text>
          {[
            { k: 'Last checkpoint', v: lastCheckpoint },
            { k: 'Community alerts', v: `${alertsIssued} issued` },
            { k: 'Active since', v: activeSince },
          ].map((row) => (
            <View key={row.k} style={styles.infoRow}>
              <Text style={styles.infoKey}>{row.k}</Text>
              <Text style={styles.infoVal}>{row.v}</Text>
            </View>
          ))}
        </View>

        {/* Settings */}
        <View style={styles.settingsCard}>
          <View style={styles.settingsRow}>
            <Text style={styles.settingsLabel}>Dark mode</Text>
            <Switch
              value={isDark}
              onValueChange={(v) => setMode(v ? 'dark' : 'light')}
              trackColor={{ false: colors.grayMid, true: colors.brgy }}
              thumbColor="#fff"
            />
          </View>
          {[
            { label: 'Edit profile', onPress: () => Alert.alert('Edit profile', 'Coming soon') },
            { label: 'Notification settings', onPress: () => Alert.alert('Notification settings', 'Coming soon') },
            { label: 'Report a problem', onPress: () => Alert.alert('Support', 'Contact CENRO admin') },
          ].map((item, i, arr) => (
            <TouchableOpacity
              key={item.label}
              style={[styles.settingsRow, i === arr.length - 1 && { borderBottomWidth: 0 }]}
              onPress={item.onPress}
              activeOpacity={0.75}
            >
              <Text style={styles.settingsLabel}>{item.label}</Text>
              <Text style={styles.settingsArrow}>›</Text>
            </TouchableOpacity>
          ))}
        </View>

        {/* Sign out */}
        <TouchableOpacity style={styles.signOutBtn} onPress={handleSignOut} activeOpacity={0.8}>
          <Text style={styles.signOutText}>Sign out</Text>
        </TouchableOpacity>
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
  body: { padding: 14, gap: 10, paddingBottom: 28 },
  avatarCard: { backgroundColor: Colors.white, borderRadius: 16, padding: 18, alignItems: 'center', borderWidth: 0.5, borderColor: Colors.border, gap: 5 },
  avatar: { width: 68, height: 68, borderRadius: 34, backgroundColor: Colors.brgyLight, alignItems: 'center', justifyContent: 'center', marginBottom: 4 },
  avatarText: { fontSize: 22, fontWeight: '500', color: Colors.brgyDark },
  displayName: { fontSize: 16, fontWeight: '500', color: Colors.textPrimary },
  rolePill: { backgroundColor: Colors.brgyLight, paddingHorizontal: 10, paddingVertical: 3, borderRadius: 20 },
  rolePillText: { fontSize: 10, color: Colors.brgyDark, fontWeight: '500' },
  empId: { fontSize: 11, color: Colors.textMuted },
  statsRow: { flexDirection: 'row', gap: 7 },
  statCard: { flex: 1, backgroundColor: Colors.white, borderRadius: 12, padding: 10, alignItems: 'center', borderWidth: 0.5, borderColor: Colors.border },
  statVal: { fontSize: 16, fontWeight: '500' },
  statLabel: { fontSize: 9, color: Colors.textMuted, marginTop: 2 },
  infoCard: { backgroundColor: Colors.white, borderRadius: 14, padding: 12, borderWidth: 0.5, borderColor: Colors.border },
  cardTitle: { fontSize: 12, fontWeight: '500', color: Colors.textPrimary, marginBottom: 8 },
  infoRow: {
    flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center',
    paddingVertical: 6, borderBottomWidth: 0.5, borderBottomColor: Colors.border,
  },
  infoKey: { fontSize: 11, color: Colors.textMuted },
  infoVal: { fontSize: 11, fontWeight: '500', color: Colors.textPrimary, maxWidth: '55%', textAlign: 'right' },
  settingsCard: { backgroundColor: Colors.white, borderRadius: 14, borderWidth: 0.5, borderColor: Colors.border, overflow: 'hidden' },
  settingsRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: 13, paddingVertical: 13, borderBottomWidth: 0.5, borderBottomColor: Colors.border },
  settingsLabel: { fontSize: 12, color: Colors.textPrimary },
  settingsArrow: { fontSize: 18, color: Colors.grayHint },
  signOutBtn: { backgroundColor: Colors.redBg, borderRadius: 13, paddingVertical: 12, alignItems: 'center', borderWidth: 0.5, borderColor: 'rgba(226,75,74,0.2)' },
  signOutText: { fontSize: 13, fontWeight: '500', color: Colors.red },
});
