import React from 'react';
import { View, Text, ScrollView, TouchableOpacity, StyleSheet, SafeAreaView, Alert } from 'react-native';
import { Colors } from '../../constants/colors';
import { useAppSelector, useAppDispatch } from '../../store/hooks';
import { logout } from '../../store/authSlice';

export default function BarangayProfileScreen() {
  const dispatch = useAppDispatch();
  const { user } = useAppSelector((s) => s.auth);

  const displayName = user ? `${user.firstName} ${user.lastName}` : 'Leni Reyes';
  const initials = displayName.split(' ').map((n) => n[0]).join('').slice(0, 2).toUpperCase();
  const barangay = user?.barangay || 'Guadalupe';
  const employeeId = user?.employeeId || 'BHW-GLG-007';

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
            <Text style={styles.rolePillText}>BHW OFFICER · {barangay.toUpperCase()}</Text>
          </View>
          <Text style={styles.empId}>{employeeId}</Text>
        </View>

        {/* Stats */}
        <View style={styles.statsRow}>
          {[
            { val: 24, label: 'Checkpoints', color: Colors.brgy },
            { val: 18, label: 'Verified', color: Colors.green },
            { val: 4, label: 'Cleanups', color: Colors.teal },
            { val: 2, label: 'Flagged', color: Colors.red },
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
            { k: 'Email', v: user?.email || 'leni.reyes@bhw.gov.ph' },
            { k: 'Barangay', v: barangay },
            { k: 'Employee ID', v: employeeId },
            { k: 'Role', v: 'BHW Officer' },
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
            { k: 'Last checkpoint', v: 'Apr 3, 2026 · 2:14 PM' },
            { k: 'Cleanup attended', v: '4 operations' },
            { k: 'Volunteers rallied', v: '48 total' },
            { k: 'Community alerts', v: '6 issued' },
            { k: 'Active since', v: 'March 2024' },
          ].map((row) => (
            <View key={row.k} style={styles.infoRow}>
              <Text style={styles.infoKey}>{row.k}</Text>
              <Text style={styles.infoVal}>{row.v}</Text>
            </View>
          ))}
        </View>

        {/* Achievements */}
        <View style={styles.infoCard}>
          <Text style={styles.cardTitle}>Achievements</Text>
          <View style={styles.achievementsRow}>
            {[
              { emoji: '🏅', label: 'First responder' },
              { emoji: '🌿', label: 'Eco guardian' },
              { emoji: '📋', label: 'Field analyst' },
              { emoji: '⭐', label: 'Top officer' },
            ].map((a) => (
              <View key={a.label} style={styles.achieveCard}>
                <Text style={styles.achieveEmoji}>{a.emoji}</Text>
                <Text style={styles.achieveLabel}>{a.label}</Text>
              </View>
            ))}
          </View>
        </View>

        {/* Settings */}
        <View style={styles.settingsCard}>
          {[
            { label: 'Edit profile', onPress: () => Alert.alert('Edit profile', 'Coming soon') },
            { label: 'Notification settings', onPress: () => Alert.alert('Notifications', 'All alerts enabled') },
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

const styles = StyleSheet.create({
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
  achievementsRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginTop: 4 },
  achieveCard: { width: '47%', backgroundColor: Colors.brgyLight, borderRadius: 12, padding: 10, alignItems: 'center', gap: 4 },
  achieveEmoji: { fontSize: 22 },
  achieveLabel: { fontSize: 10, color: Colors.brgyDark, fontWeight: '500', textAlign: 'center' },
  settingsCard: { backgroundColor: Colors.white, borderRadius: 14, borderWidth: 0.5, borderColor: Colors.border, overflow: 'hidden' },
  settingsRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: 13, paddingVertical: 13, borderBottomWidth: 0.5, borderBottomColor: Colors.border },
  settingsLabel: { fontSize: 12, color: Colors.textPrimary },
  settingsArrow: { fontSize: 18, color: Colors.grayHint },
  signOutBtn: { backgroundColor: Colors.redBg, borderRadius: 13, paddingVertical: 12, alignItems: 'center', borderWidth: 0.5, borderColor: 'rgba(226,75,74,0.2)' },
  signOutText: { fontSize: 13, fontWeight: '500', color: Colors.red },
});
