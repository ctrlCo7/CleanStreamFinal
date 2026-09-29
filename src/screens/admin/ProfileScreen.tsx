import React, { useMemo, useState } from 'react';
import { View, Text, ScrollView, TouchableOpacity, StyleSheet, SafeAreaView, Alert, Switch } from 'react-native';
import { useTheme } from '../../hooks/useTheme';
import { ThemeColors } from '../../constants/theme';
import { useAppSelector, useAppDispatch } from '../../store/hooks';
import { logout } from '../../store/authSlice';
import { rowsToCsv, exportCsv } from '../../utils/csvExport';

export default function AdminProfileScreen() {
  const dispatch = useAppDispatch();
  const { colors, isDark, setMode } = useTheme();
  const styles = useMemo(() => createStyles(colors), [colors]);
  const { user } = useAppSelector((s) => s.auth);
  const { reports } = useAppSelector((s) => s.reports);
  const [exporting, setExporting] = useState(false);

  const totalManaged = reports.length;
  const resolved = reports.filter((r) => r.status === 'completed').length;
  const resolutionRate = totalManaged > 0 ? Math.round((resolved / totalManaged) * 100) : 0;

  const displayName = user ? `${user.firstName} ${user.lastName}` : 'Admin';
  const initials = displayName.split(' ').map((n) => n[0]).join('').slice(0, 2).toUpperCase();
  const agency = user?.agency || '—';
  const employeeId = user?.employeeId || '—';

  const handleSignOut = () => {
    Alert.alert('Sign out', 'Are you sure you want to sign out?', [
      { text: 'Cancel', style: 'cancel' },
      { text: 'Sign out', style: 'destructive', onPress: () => dispatch(logout()) },
    ]);
  };

  const exportMyData = async () => {
    if (exporting) return;
    setExporting(true);
    try {
      const csv = rowsToCsv(
        ['Field', 'Value'],
        [
          ['Full name', displayName],
          ['Email', user?.email || ''],
          ['Agency', agency],
          ['Employee ID', employeeId],
          ['Role', 'Administrator'],
          ['Reports managed', totalManaged],
          ['Reports resolved', resolved],
          ['Resolution rate', `${resolutionRate}%`],
        ],
      );
      await exportCsv(`cleanstream-profile-${employeeId !== '—' ? employeeId : user?.uid || 'admin'}.csv`, csv);
    } finally {
      setExporting(false);
    }
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
            <Text style={styles.rolePillText}>ADMIN · {agency}</Text>
          </View>
          <Text style={styles.empId}>{employeeId}</Text>
        </View>

        {/* Performance stats */}
        <View style={styles.statsRow}>
          {[
            { val: totalManaged, label: 'Managed', color: colors.blue },
            { val: resolved, label: 'Resolved', color: colors.green },
            { val: `${resolutionRate}%`, label: 'Resolution', color: colors.teal },
            { val: '—', label: 'Avg resp.', color: colors.amber },
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
            { k: 'Agency', v: agency },
            { k: 'Employee ID', v: employeeId },
            { k: 'Role', v: 'Administrator' },
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
              trackColor={{ false: colors.grayMid, true: colors.teal }}
              thumbColor="#fff"
            />
          </View>
          {[
            { label: 'Edit profile', onPress: () => Alert.alert('Edit profile', 'Coming soon') },
            { label: 'Notification settings', onPress: () => Alert.alert('Notification settings', 'Coming soon') },
            { label: 'System preferences', onPress: () => Alert.alert('System preferences', 'Coming soon') },
            { label: 'Export my data', onPress: () => exportMyData() },
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
  avatar: { width: 68, height: 68, borderRadius: 34, backgroundColor: Colors.blueBg, alignItems: 'center', justifyContent: 'center', marginBottom: 4 },
  avatarText: { fontSize: 22, fontWeight: '500', color: Colors.blue },
  displayName: { fontSize: 16, fontWeight: '500', color: Colors.textPrimary },
  rolePill: { backgroundColor: Colors.blueBg, paddingHorizontal: 10, paddingVertical: 3, borderRadius: 20 },
  rolePillText: { fontSize: 10, color: Colors.blue, fontWeight: '500' },
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
