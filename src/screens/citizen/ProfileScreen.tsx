import React from 'react';
import { View, Text, ScrollView, TouchableOpacity, StyleSheet, SafeAreaView, Alert } from 'react-native';
import { Colors } from '../../constants/colors';
import { useAppDispatch, useAppSelector } from '../../store/hooks';
import { logout } from '../../store/authSlice';
import { BackIcon } from '../../components/common/TabIcons';
import { useNavigation } from '@react-navigation/native';

const ACHIEVEMENTS = [
  { emoji: '🌊', label: 'First Report', bg: Colors.tealLight, color: Colors.tealDark, border: Colors.tealMid },
  { emoji: '⚡', label: '10 Reports', bg: Colors.amberBg, color: Colors.amberText, border: '#FAC775' },
  { emoji: '🗺️', label: 'Map Explorer', bg: Colors.blueBg, color: Colors.blueText, border: '#85B7EB' },
];

export default function CitizenProfileScreen() {
  const dispatch = useAppDispatch();
  const navigation = useNavigation();
  const { user } = useAppSelector((s) => s.auth);
  const { userReports } = useAppSelector((s) => s.reports);

  const total = userReports.length;
  const resolved = userReports.filter((r) => r.status === 'resolved').length;
  const pending = userReports.filter((r) => r.status === 'pending').length;
  const initials = `${user?.firstName?.[0] || ''}${user?.lastName?.[0] || ''}`.toUpperCase();

  const handleLogout = () => {
    Alert.alert('Sign out', 'Are you sure you want to sign out?', [
      { text: 'Cancel', style: 'cancel' },
      { text: 'Sign out', style: 'destructive', onPress: () => dispatch(logout()) },
    ]);
  };

  return (
    <SafeAreaView style={styles.container}>
      <View style={styles.header}>
        <TouchableOpacity style={styles.backBtn} onPress={() => navigation.goBack()}><BackIcon /></TouchableOpacity>
        <Text style={styles.headerTitle}>My profile</Text>
        <View style={{ width: 34 }} />
      </View>

      <ScrollView contentContainerStyle={styles.body} showsVerticalScrollIndicator={false}>
        {/* Avatar */}
        <View style={styles.avatarSection}>
          <View style={[styles.avatar, { backgroundColor: Colors.tealLight }]}>
            <Text style={[styles.avatarText, { color: Colors.tealDeep }]}>{initials}</Text>
          </View>
          <Text style={styles.name}>{user?.firstName} {user?.lastName}</Text>
          <View style={styles.rolePill}>
            <Text style={styles.rolePillText}>Citizen</Text>
          </View>
        </View>

        {/* Stats */}
        <View style={styles.statsRow}>
          <View style={styles.stat}><Text style={[styles.statVal, { color: Colors.teal }]}>{total}</Text><Text style={styles.statLabel}>Reports</Text></View>
          <View style={styles.stat}><Text style={[styles.statVal, { color: Colors.green }]}>{resolved}</Text><Text style={styles.statLabel}>Resolved</Text></View>
          <View style={styles.stat}><Text style={[styles.statVal, { color: Colors.amber }]}>{pending}</Text><Text style={styles.statLabel}>Pending</Text></View>
        </View>

        {/* Account info */}
        <Text style={styles.sectionLabel}>Account info</Text>
        <View style={styles.card}>
          {[
            { icon: '📧', label: 'Email', val: user?.email || '—' },
            { icon: '📍', label: 'Barangay', val: user?.barangay ? `${user.barangay}, Cebu City` : 'Not set' },
            { icon: '📅', label: 'Member since', val: user?.createdAt ? new Date(user.createdAt).toLocaleDateString('en-US', { month: 'long', year: 'numeric' }) : '—' },
          ].map((row) => (
            <View key={row.label} style={styles.infoRow}>
              <View style={[styles.infoIcon, { backgroundColor: Colors.tealLight }]}>
                <Text>{row.icon}</Text>
              </View>
              <View>
                <Text style={styles.infoLabel}>{row.label}</Text>
                <Text style={styles.infoVal}>{row.val}</Text>
              </View>
            </View>
          ))}
        </View>

        {/* Achievements */}
        <Text style={styles.sectionLabel}>Achievements</Text>
        <View style={styles.card}>
          <View style={styles.achieveRow}>
            {ACHIEVEMENTS.map((a) => (
              <View key={a.label} style={[styles.achieveBadge, { backgroundColor: a.bg, borderColor: a.border }]}>
                <Text style={[styles.achieveText, { color: a.color }]}>{a.emoji} {a.label}</Text>
              </View>
            ))}
          </View>
        </View>

        {/* Settings */}
        <Text style={styles.sectionLabel}>Settings</Text>
        <View style={styles.card}>
          {[
            { icon: '🔔', label: 'Notification preferences' },
            { icon: '🔒', label: 'Privacy & security' },
          ].map((row) => (
            <TouchableOpacity key={row.label} style={styles.settingsRow} onPress={() => Alert.alert(row.label)}>
              <View style={[styles.infoIcon, { backgroundColor: Colors.grayBg }]}>
                <Text>{row.icon}</Text>
              </View>
              <Text style={styles.settingsLabel}>{row.label}</Text>
              <Text style={{ color: Colors.textHint, fontSize: 14 }}>›</Text>
            </TouchableOpacity>
          ))}
        </View>

        <TouchableOpacity
          style={[styles.editBtn, { backgroundColor: Colors.tealLight }]}
          onPress={() => Alert.alert('Edit profile')}
        >
          <Text style={[styles.editBtnText, { color: Colors.tealDark }]}>✏️ Edit profile</Text>
        </TouchableOpacity>

        <TouchableOpacity style={styles.logoutBtn} onPress={handleLogout}>
          <Text style={styles.logoutBtnText}>Sign out</Text>
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
  backBtn: { width: 34, height: 34, borderRadius: 17, backgroundColor: Colors.grayBg, alignItems: 'center', justifyContent: 'center' },
  body: { padding: 14, gap: 8, paddingBottom: 24 },
  avatarSection: { alignItems: 'center', paddingVertical: 8 },
  avatar: { width: 72, height: 72, borderRadius: 36, alignItems: 'center', justifyContent: 'center' },
  avatarText: { fontSize: 24, fontWeight: '500' },
  name: { fontSize: 18, fontWeight: '500', color: Colors.textPrimary, marginTop: 10 },
  rolePill: { backgroundColor: Colors.tealLight, paddingHorizontal: 12, paddingVertical: 4, borderRadius: 20, marginTop: 4 },
  rolePillText: { fontSize: 11, fontWeight: '500', color: Colors.tealDark },
  statsRow: { flexDirection: 'row', backgroundColor: Colors.white, borderRadius: 14, padding: 12, borderWidth: 0.5, borderColor: Colors.border },
  stat: { flex: 1, backgroundColor: Colors.grayBg, borderRadius: 10, padding: 8, alignItems: 'center' },
  statVal: { fontSize: 18, fontWeight: '500' },
  statLabel: { fontSize: 9, color: Colors.textMuted, marginTop: 2 },
  sectionLabel: { fontSize: 11, fontWeight: '500', color: Colors.textMuted, letterSpacing: 0.04, textTransform: 'uppercase', marginTop: 2 },
  card: { backgroundColor: Colors.white, borderRadius: 14, padding: 12, borderWidth: 0.5, borderColor: Colors.border, gap: 2 },
  infoRow: { flexDirection: 'row', alignItems: 'center', gap: 10, paddingVertical: 10, borderBottomWidth: 0.5, borderBottomColor: Colors.border },
  infoIcon: { width: 30, height: 30, borderRadius: 10, alignItems: 'center', justifyContent: 'center' },
  infoLabel: { fontSize: 11, color: Colors.textMuted, marginBottom: 1 },
  infoVal: { fontSize: 13, color: Colors.textPrimary },
  achieveRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 5 },
  achieveBadge: { paddingHorizontal: 9, paddingVertical: 4, borderRadius: 20, borderWidth: 0.5 },
  achieveText: { fontSize: 10, fontWeight: '500' },
  settingsRow: { flexDirection: 'row', alignItems: 'center', gap: 10, paddingVertical: 10, borderBottomWidth: 0.5, borderBottomColor: Colors.border },
  settingsLabel: { flex: 1, fontSize: 13, color: Colors.textPrimary },
  editBtn: { borderRadius: 10, paddingVertical: 11, alignItems: 'center' },
  editBtnText: { fontSize: 13, fontWeight: '500' },
  logoutBtn: { borderWidth: 0.5, borderColor: Colors.borderMid, borderRadius: 10, paddingVertical: 11, alignItems: 'center' },
  logoutBtnText: { fontSize: 13, fontWeight: '500', color: Colors.red },
});
