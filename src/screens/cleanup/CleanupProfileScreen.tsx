import React, { useMemo } from 'react';
import { View, Text, ScrollView, TouchableOpacity, StyleSheet, Alert, Switch } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useTheme } from '../../hooks/useTheme';
import { ThemeColors } from '../../constants/theme';
import { useAppSelector, useAppDispatch } from '../../store/hooks';
import { logout } from '../../store/authSlice';
import { formatPhone } from '../../utils/phone';

export default function CleanupProfileScreen() {
  const dispatch = useAppDispatch();
  const { colors, isDark, setMode } = useTheme();
  const styles = useMemo(() => createStyles(colors), [colors]);
  const user = useAppSelector((s) => s.auth.user);

  const displayName = user ? `${user.firstName} ${user.lastName}`.trim() : 'Cleanup crew';
  const initials = displayName.split(' ').filter(Boolean).map((n) => n[0]).join('').slice(0, 2).toUpperCase();

  const handleSignOut = () => {
    Alert.alert('Sign out', 'Are you sure you want to sign out?', [
      { text: 'Cancel', style: 'cancel' },
      { text: 'Sign out', style: 'destructive', onPress: () => dispatch(logout()) },
    ]);
  };

  const rows = [
    { k: 'Full name', v: displayName },
    { k: 'Barangay', v: user?.barangay || '-' },
    { k: 'Phone', v: user?.phone ? formatPhone(user.phone) : '-' },
    { k: 'Email', v: user?.email || '-' },
  ];

  return (
    <SafeAreaView style={styles.container}>
      <View style={styles.header}>
        <Text style={styles.headerTitle}>Profile</Text>
      </View>

      <ScrollView contentContainerStyle={styles.body} showsVerticalScrollIndicator={false}>
        <View style={styles.card}>
          <View style={styles.avatar}>
            <Text style={styles.avatarText}>{initials}</Text>
          </View>
          <Text style={styles.displayName}>{displayName}</Text>
          <View style={styles.rolePill}>
            <Text style={styles.rolePillText}>Cleanup crew</Text>
          </View>
        </View>

        <View style={styles.card2}>
          <Text style={styles.cardTitle}>Account information</Text>
          {rows.map((row, i) => (
            <View key={row.k} style={[styles.infoRow, i === rows.length - 1 && { borderBottomWidth: 0 }]}>
              <Text style={styles.infoKey}>{row.k}</Text>
              <Text style={styles.infoVal}>{row.v}</Text>
            </View>
          ))}
          <Text style={styles.note}>
            Your phone number and barangay are set by the Super Admin. Ask them if something is wrong.
          </Text>
        </View>

        <View style={styles.card2}>
          <View style={styles.settingsRow}>
            <Text style={styles.settingsLabel}>Dark mode</Text>
            <Switch
              value={isDark}
              onValueChange={(v) => setMode(v ? 'dark' : 'light')}
              trackColor={{ false: colors.grayMid, true: colors.green }}
              thumbColor="#fff"
            />
          </View>
        </View>

        <TouchableOpacity style={styles.signOutBtn} onPress={handleSignOut} activeOpacity={0.8}>
          <Text style={styles.signOutText}>Sign out</Text>
        </TouchableOpacity>
      </ScrollView>
    </SafeAreaView>
  );
}

const shadow = (Colors: ThemeColors) => ({
  shadowColor: Colors.shadow, shadowOffset: { width: 0, height: 2 }, shadowOpacity: 0.05, shadowRadius: 8, elevation: 1,
});

const createStyles = (Colors: ThemeColors) => StyleSheet.create({
  container: { flex: 1, backgroundColor: Colors.grayBg },
  header: { backgroundColor: Colors.white, paddingHorizontal: 16, paddingVertical: 14 },
  headerTitle: { fontSize: 16, fontWeight: '600', color: Colors.textPrimary },
  body: { padding: 16, gap: 14, paddingBottom: 28 },
  card: { backgroundColor: Colors.white, borderRadius: 16, padding: 20, alignItems: 'center', gap: 6, ...shadow(Colors) },
  avatar: { width: 68, height: 68, borderRadius: 34, backgroundColor: Colors.greenBg, alignItems: 'center', justifyContent: 'center', marginBottom: 4 },
  avatarText: { fontSize: 22, fontWeight: '600', color: Colors.greenText },
  displayName: { fontSize: 17, fontWeight: '600', color: Colors.textPrimary },
  rolePill: { backgroundColor: Colors.greenBg, paddingHorizontal: 12, paddingVertical: 4, borderRadius: 20 },
  rolePillText: { fontSize: 12, color: Colors.greenText, fontWeight: '600' },
  card2: { backgroundColor: Colors.white, borderRadius: 16, padding: 16, ...shadow(Colors) },
  cardTitle: { fontSize: 14, fontWeight: '600', color: Colors.textPrimary, marginBottom: 8 },
  infoRow: {
    flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', gap: 12,
    paddingVertical: 10, borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: Colors.border,
  },
  infoKey: { fontSize: 13, color: Colors.textMuted },
  infoVal: { fontSize: 13, fontWeight: '500', color: Colors.textPrimary, flexShrink: 1, textAlign: 'right' },
  note: { fontSize: 12, color: Colors.textMuted, marginTop: 12, lineHeight: 17 },
  settingsRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', minHeight: 44 },
  settingsLabel: { fontSize: 14, color: Colors.textPrimary },
  signOutBtn: { backgroundColor: Colors.redBg, borderRadius: 14, minHeight: 48, alignItems: 'center', justifyContent: 'center' },
  signOutText: { fontSize: 14, fontWeight: '600', color: Colors.red },
});
