import React, { useEffect, useMemo, useState } from 'react';
import {
  View, Text, ScrollView, TouchableOpacity, StyleSheet, SafeAreaView,
  TextInput, ActivityIndicator, Alert,
} from 'react-native';
import { useNavigation } from '@react-navigation/native';
import { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { useTheme } from '../../hooks/useTheme';
import { ThemeColors } from '../../constants/theme';
import { RootStackParamList, User, UserRole } from '../../types';
import { BackIcon } from '../../components/common/TabIcons';
import { subscribeToAllUsers, setUserActive, setUserVerified } from '../../services/userManagementService';

type Nav = NativeStackNavigationProp<RootStackParamList>;

const ROLE_FILTERS: Array<{ key: UserRole | 'all'; label: string }> = [
  { key: 'all', label: 'All' },
  { key: 'citizen', label: 'Citizens' },
  { key: 'barangay', label: 'Barangay' },
  { key: 'cleanup_team', label: 'Cleanup team' },
];

const ROLE_LABELS: Record<UserRole, string> = {
  citizen: 'Citizen',
  barangay: 'Barangay official',
  cleanup_team: 'Cleanup team',
  admin: 'Admin',
};

export default function AdminUserManagementScreen() {
  const { colors } = useTheme();
  const styles = useMemo(() => createStyles(colors), [colors]);
  const navigation = useNavigation<Nav>();

  const [users, setUsers] = useState<User[]>([]);
  const [loading, setLoading] = useState(true);
  const [roleFilter, setRoleFilter] = useState<UserRole | 'all'>('all');
  const [search, setSearch] = useState('');
  const [busyId, setBusyId] = useState<string | null>(null);

  useEffect(() => {
    const unsub = subscribeToAllUsers((list) => {
      setUsers(list);
      setLoading(false);
    });
    return unsub;
  }, []);

  // Admins aren't managed here -- only citizen/barangay/cleanup_team personnel.
  const manageable = users.filter((u) => u.role !== 'admin');

  const filtered = manageable.filter((u) => {
    if (roleFilter !== 'all' && u.role !== roleFilter) return false;
    if (!search.trim()) return true;
    const q = search.trim().toLowerCase();
    return (
      `${u.firstName} ${u.lastName}`.toLowerCase().includes(q) ||
      u.email.toLowerCase().includes(q) ||
      (u.barangay ?? '').toLowerCase().includes(q)
    );
  });

  const pendingCount = manageable.filter((u) => !u.isVerified).length;

  const handleVerify = async (u: User) => {
    setBusyId(u.uid);
    try {
      await setUserVerified(u.uid, true);
    } catch {
      Alert.alert('Error', 'Could not verify this account. Please try again.');
    } finally {
      setBusyId(null);
    }
  };

  const handleToggleActive = (u: User) => {
    const next = !u.isActive;
    Alert.alert(
      next ? 'Reactivate account' : 'Deactivate account',
      next
        ? `Restore access for ${u.firstName} ${u.lastName}?`
        : `${u.firstName} ${u.lastName} will no longer be able to sign in. This can be reversed later.`,
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: next ? 'Reactivate' : 'Deactivate',
          style: next ? 'default' : 'destructive',
          onPress: async () => {
            setBusyId(u.uid);
            try {
              await setUserActive(u.uid, next);
            } catch {
              Alert.alert('Error', 'Could not update this account. Please try again.');
            } finally {
              setBusyId(null);
            }
          },
        },
      ],
    );
  };

  return (
    <SafeAreaView style={styles.container}>
      <View style={styles.header}>
        <TouchableOpacity style={styles.backBtn} onPress={() => navigation.goBack()}>
          <BackIcon size={18} />
        </TouchableOpacity>
        <Text style={styles.headerTitle}>User management</Text>
        <View style={{ width: 38 }} />
      </View>

      <View style={styles.searchBar}>
        <TextInput
          style={styles.searchInput}
          placeholder="Search name, email, or barangay"
          placeholderTextColor={colors.textHint}
          value={search}
          onChangeText={setSearch}
        />
      </View>

      <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.filterRow}>
        {ROLE_FILTERS.map((opt) => (
          <TouchableOpacity
            key={opt.key}
            style={[styles.filterChip, roleFilter === opt.key && styles.filterChipActive]}
            onPress={() => setRoleFilter(opt.key)}
          >
            <Text style={[styles.filterChipText, roleFilter === opt.key && styles.filterChipTextActive]}>
              {opt.label}{opt.key === 'all' && pendingCount > 0 ? ` (${pendingCount} pending)` : ''}
            </Text>
          </TouchableOpacity>
        ))}
      </ScrollView>

      <ScrollView contentContainerStyle={styles.body} showsVerticalScrollIndicator={false}>
        {loading && <ActivityIndicator size="small" color={colors.blue} style={{ marginVertical: 16 }} />}

        {!loading && filtered.length === 0 && (
          <View style={styles.emptyCard}>
            <Text style={styles.emptyText}>No accounts match.</Text>
          </View>
        )}

        {filtered.map((u) => (
          <View key={u.uid} style={styles.card}>
            <View style={styles.cardTop}>
              <View style={{ flex: 1 }}>
                <Text style={styles.name}>{u.firstName} {u.lastName}</Text>
                <Text style={styles.email}>{u.email}</Text>
              </View>
              <View style={[styles.roleBadge, { backgroundColor: colors.blueBg }]}>
                <Text style={[styles.roleBadgeText, { color: colors.blueText }]}>{ROLE_LABELS[u.role]}</Text>
              </View>
            </View>

            {!!u.barangay && <Text style={styles.meta}>📍 {u.barangay}</Text>}

            <View style={styles.statusRow}>
              <View style={[styles.statusPill, { backgroundColor: u.isVerified ? colors.tealLight : colors.amberBg }]}>
                <Text style={[styles.statusPillText, { color: u.isVerified ? colors.tealDark : colors.amberText }]}>
                  {u.isVerified ? 'Verified' : 'Pending verification'}
                </Text>
              </View>
              <View style={[styles.statusPill, { backgroundColor: u.isActive ? colors.tealLight : colors.redBg }]}>
                <Text style={[styles.statusPillText, { color: u.isActive ? colors.tealDark : colors.redText }]}>
                  {u.isActive ? 'Active' : 'Deactivated'}
                </Text>
              </View>
            </View>

            {busyId === u.uid ? (
              <ActivityIndicator size="small" color={colors.blue} style={{ marginTop: 8 }} />
            ) : (
              <View style={styles.actionsRow}>
                {!u.isVerified && (
                  <TouchableOpacity style={[styles.actionBtn, { backgroundColor: colors.tealLight }]} onPress={() => handleVerify(u)}>
                    <Text style={[styles.actionBtnText, { color: colors.tealDark }]}>Verify</Text>
                  </TouchableOpacity>
                )}
                <TouchableOpacity
                  style={[styles.actionBtn, { backgroundColor: u.isActive ? colors.redBg : colors.tealLight }]}
                  onPress={() => handleToggleActive(u)}
                >
                  <Text style={[styles.actionBtnText, { color: u.isActive ? colors.redText : colors.tealDark }]}>
                    {u.isActive ? 'Deactivate' : 'Reactivate'}
                  </Text>
                </TouchableOpacity>
              </View>
            )}
          </View>
        ))}
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
  backBtn: {
    width: 38, height: 38, borderRadius: 19, backgroundColor: Colors.grayBg,
    alignItems: 'center', justifyContent: 'center',
  },
  searchBar: { backgroundColor: Colors.white, paddingHorizontal: 16, paddingVertical: 10, borderBottomWidth: 0.5, borderBottomColor: Colors.border },
  searchInput: {
    backgroundColor: Colors.grayBg, borderRadius: 12, paddingHorizontal: 14, paddingVertical: 10,
    fontSize: 13, color: Colors.textPrimary,
  },
  filterRow: {
    gap: 6, paddingHorizontal: 16, paddingVertical: 10,
    backgroundColor: Colors.white, borderBottomWidth: 0.5, borderBottomColor: Colors.border,
  },
  filterChip: { paddingHorizontal: 12, paddingVertical: 6, borderRadius: 20, backgroundColor: Colors.grayBg },
  filterChipActive: { backgroundColor: Colors.blue },
  filterChipText: { fontSize: 11, color: Colors.textMuted },
  filterChipTextActive: { color: '#fff', fontWeight: '600' },
  body: { padding: 16, gap: 12, paddingBottom: 28 },
  emptyCard: {
    backgroundColor: Colors.white, borderRadius: 18, padding: 28, alignItems: 'center',
    shadowColor: Colors.shadow, shadowOffset: { width: 0, height: 2 }, shadowOpacity: 0.05, shadowRadius: 8, elevation: 1,
  },
  emptyText: { fontSize: 12, color: Colors.textHint },
  card: {
    backgroundColor: Colors.white, borderRadius: 18, padding: 15, gap: 8,
    shadowColor: Colors.shadow, shadowOffset: { width: 0, height: 2 }, shadowOpacity: 0.05, shadowRadius: 8, elevation: 1,
  },
  cardTop: { flexDirection: 'row', alignItems: 'flex-start', gap: 8 },
  name: { fontSize: 14, fontWeight: '600', color: Colors.textPrimary },
  email: { fontSize: 11, color: Colors.textMuted, marginTop: 1 },
  roleBadge: { paddingHorizontal: 9, paddingVertical: 4, borderRadius: 20 },
  roleBadgeText: { fontSize: 10, fontWeight: '600' },
  meta: { fontSize: 11, color: Colors.textMuted },
  statusRow: { flexDirection: 'row', gap: 6 },
  statusPill: { paddingHorizontal: 9, paddingVertical: 4, borderRadius: 20 },
  statusPillText: { fontSize: 10, fontWeight: '600' },
  actionsRow: { flexDirection: 'row', gap: 8, marginTop: 2 },
  actionBtn: { flex: 1, borderRadius: 10, paddingVertical: 9, alignItems: 'center' },
  actionBtnText: { fontSize: 11, fontWeight: '600' },
});
