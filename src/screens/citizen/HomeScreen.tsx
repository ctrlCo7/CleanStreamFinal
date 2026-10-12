import React, { useEffect, useCallback, useState, useMemo } from 'react';
import {
  View, Text, ScrollView, TouchableOpacity, StyleSheet, SafeAreaView, RefreshControl,
} from 'react-native';
import { useNavigation } from '@react-navigation/native';
import { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { useTheme } from '../../hooks/useTheme';
import { ThemeColors } from '../../constants/theme';
import { RootStackParamList } from '../../types';
import { useAppDispatch, useAppSelector } from '../../store/hooks';
import { fetchUserReports } from '../../store/reportsSlice';
import { logout } from '../../store/authSlice';
import { Badge } from '../../components/common/Badge';
import { StatCard } from '../../components/common/StatCard';
import { MapPreview } from '../../components/common/MapPreview';
import { BellIcon } from '../../components/common/TabIcons';
import { subscribeToNotifications } from '../../services/notificationService';
import Svg, { Path, Circle, Rect } from 'react-native-svg';

type Nav = NativeStackNavigationProp<RootStackParamList>;

export default function CitizenHomeScreen() {
  const navigation = useNavigation<Nav>();
  const dispatch = useAppDispatch();
  const { colors } = useTheme();
  const styles = useMemo(() => createStyles(colors), [colors]);
  const { user } = useAppSelector((s) => s.auth);
  const { userReports, loading } = useAppSelector((s) => s.reports);
  const [hasUnreadNotifs, setHasUnreadNotifs] = useState(false);

  const load = useCallback(() => {
    if (user?.uid) dispatch(fetchUserReports(user.uid));
  }, [user?.uid, dispatch]);

  useEffect(() => { load(); }, [load]);

  useEffect(() => {
    if (!user?.uid) return;
    const unsub = subscribeToNotifications(user.uid, (notifs) => {
      setHasUnreadNotifs(notifs.some((n) => !n.read));
    });
    return unsub;
  }, [user?.uid]);

  const totalReports = userReports.length;
  const pending = userReports.filter((r) => r.status === 'pending').length;
  const resolved = userReports.filter((r) => r.status === 'completed').length;

  const recentReports = userReports.slice(0, 3);

  const hotspots = recentReports
    .filter((r) => typeof r.location?.latitude === 'number' && typeof r.location?.longitude === 'number')
    .map((r) => ({
      id: r.id,
      latitude: r.location.latitude,
      longitude: r.location.longitude,
      severity: r.severity,
    }));

  const hour = new Date().getHours();
  const greeting =
    hour < 12 ? 'Good morning' : hour < 18 ? 'Good afternoon' : 'Good evening';

  return (
    <SafeAreaView style={styles.container}>
      {/* Header */}
      <View style={styles.header}>
        <View>
          <Text style={styles.headerTitle}>CleanStream</Text>
          <Text style={styles.headerSub}>{greeting}, {user?.firstName || 'User'}</Text>
        </View>
        <View style={styles.headerActions}>
          <TouchableOpacity style={styles.iconBtn} onPress={() => navigation.navigate('Map', {})}>
            <Svg width={18} height={18} viewBox="0 0 16 16" fill="none">
              <Path d="M8 2a5 5 0 0 1 5 5c0 3.5-5 8-5 8S3 10 3 7a5 5 0 0 1 5-5z" stroke={colors.textMuted} strokeWidth="1.8" strokeLinecap="round" />
              <Circle cx="8" cy="7" r="1.5" stroke={colors.textMuted} strokeWidth="1.8" />
            </Svg>
          </TouchableOpacity>
          <TouchableOpacity style={[styles.iconBtn, styles.iconBtnRelative]} onPress={() => navigation.navigate('CitizenNotifications')}>
            <BellIcon color={colors.textMuted} size={18} />
            {hasUnreadNotifs && <View style={styles.notifDot} />}
          </TouchableOpacity>
        </View>
      </View>

      <ScrollView
        style={styles.body}
        contentContainerStyle={styles.bodyContent}
        showsVerticalScrollIndicator={false}
        refreshControl={<RefreshControl refreshing={loading} onRefresh={load} tintColor={colors.teal} />}
      >
        {/* Role pill + sign out */}
        <View style={styles.roleRow}>
          <View style={styles.rolePill}>
            <Circle cx="6" cy="4" r="2.5" />
            <Text style={styles.rolePillText}>Citizen</Text>
          </View>
          <TouchableOpacity onPress={() => dispatch(logout())}>
            <Text style={styles.signOut}>Sign out</Text>
          </TouchableOpacity>
        </View>

        {/* Report CTA */}
        <TouchableOpacity
          style={styles.reportCta}
          onPress={() => navigation.navigate('CitizenReport')}
          activeOpacity={0.88}
        >
          <View style={styles.reportCtaRow}>
            <Svg width={16} height={16} viewBox="0 0 16 16" fill="none">
              <Path d="M8 3v10M3 8h10" stroke="#fff" strokeWidth="2" strokeLinecap="round" />
            </Svg>
            <Text style={styles.reportCtaTitle}>Report waterway waste</Text>
            <View style={styles.reportCtaBadge}>
              <Text style={styles.reportCtaBadgeText}>24/7</Text>
            </View>
          </View>
          <Text style={styles.reportCtaSub}>📸 Live camera · 📍 GPS auto-tag · 🕐 Timestamp — Anytime</Text>
        </TouchableOpacity>

        {/* Map preview */}
        <MapPreview
          pins={hotspots}
          onPress={() => navigation.navigate('Map', {})}
          tagText="Live hotspot map · Tap to expand"
        />

        {/* Legend */}
        <View style={styles.legend}>
          {[
            { label: 'Critical', color: colors.critical },
            { label: 'High', color: colors.red },
            { label: 'Moderate', color: colors.amber },
            { label: 'Low', color: colors.teal },
          ].map((item) => (
            <View key={item.label} style={styles.legendItem}>
              <View style={[styles.legendDot, { backgroundColor: item.color }]} />
              <Text style={styles.legendText}>{item.label}</Text>
            </View>
          ))}
        </View>

        {/* Stats */}
        <View style={styles.statsRow}>
          <StatCard value={totalReports} label="My reports" valueColor={colors.teal} />
          <StatCard value={pending} label="Pending" valueColor={colors.amber} />
          <StatCard value={resolved} label="Resolved" valueColor={colors.green} />
        </View>

        {/* Recent reports */}
        <Text style={styles.sectionTitle}>Recent reports</Text>
        {recentReports.length === 0 && (
          <View style={styles.emptyCard}>
            <Text style={styles.emptyText}>No reports yet. Tap the button above to report waste.</Text>
          </View>
        )}
        {recentReports.map((report) => (
          <TouchableOpacity
            key={report.id}
            style={styles.reportCard}
            onPress={() => navigation.navigate('CitizenDetail', { reportId: report.id })}
            activeOpacity={0.85}
          >
            <View style={styles.reportCardRow}>
              <Text style={styles.reportLocation} numberOfLines={1}>
                {report.location?.barangay || 'Unknown location'}
              </Text>
              <Badge variant={report.severity} />
            </View>
            <Text style={styles.reportMeta}>
              📍 {report.location?.address || '—'} · {new Date(report.createdAt).toLocaleDateString()}
            </Text>
            <View style={styles.reportCardRow}>
              <Badge variant={report.status} />
              <Text style={styles.viewLink}>View →</Text>
            </View>
          </TouchableOpacity>
        ))}
      </ScrollView>
    </SafeAreaView>
  );
}

const createStyles = (Colors: ThemeColors) => StyleSheet.create({
  container: { flex: 1, backgroundColor: Colors.grayBg },
  header: {
    backgroundColor: Colors.white,
    paddingHorizontal: 16,
    paddingVertical: 12,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    borderBottomWidth: 0.5,
    borderBottomColor: Colors.border,
  },
  headerTitle: { fontSize: 16, fontWeight: '500', color: Colors.textPrimary },
  headerSub: { fontSize: 11, color: Colors.textMuted, marginTop: 1 },
  headerActions: { flexDirection: 'row', gap: 7 },
  iconBtn: {
    width: 38, height: 38, borderRadius: 19, backgroundColor: Colors.grayBg,
    alignItems: 'center', justifyContent: 'center',
  },
  iconBtnRelative: { position: 'relative' },
  notifDot: {
    position: 'absolute', top: 6, right: 6,
    width: 7, height: 7, borderRadius: 3.5,
    backgroundColor: Colors.red, borderWidth: 1.5, borderColor: Colors.white,
  },
  body: { flex: 1 },
  bodyContent: { padding: 16, gap: 14, paddingBottom: 24 },
  roleRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  rolePill: {
    flexDirection: 'row', alignItems: 'center', gap: 5,
    paddingHorizontal: 9, paddingVertical: 3, borderRadius: 20,
    backgroundColor: Colors.tealLight,
  },
  rolePillText: { fontSize: 10, fontWeight: '500', color: Colors.tealDark },
  signOut: { fontSize: 10, color: Colors.textMuted },
  reportCta: {
    backgroundColor: Colors.teal, borderRadius: 18,
    padding: 16, paddingHorizontal: 18, gap: 7,
  },
  reportCtaRow: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  reportCtaTitle: { fontSize: 13, fontWeight: '500', color: '#fff', flex: 1 },
  reportCtaBadge: {
    backgroundColor: 'rgba(255,255,255,0.25)',
    paddingHorizontal: 7, paddingVertical: 2, borderRadius: 10,
  },
  reportCtaBadgeText: { fontSize: 9, fontWeight: '600', color: '#fff', letterSpacing: 0.4 },
  reportCtaSub: { fontSize: 10, color: 'rgba(255,255,255,0.78)', paddingLeft: 24 },
  legend: { flexDirection: 'row', gap: 11 },
  legendItem: { flexDirection: 'row', alignItems: 'center', gap: 4 },
  legendDot: { width: 9, height: 9, borderRadius: 4.5 },
  legendText: { fontSize: 11, color: Colors.textMuted },
  statsRow: { flexDirection: 'row', gap: 10 },
  sectionTitle: { fontSize: 14, fontWeight: '600', color: Colors.textPrimary },
  emptyCard: {
    backgroundColor: Colors.white, borderRadius: 18, padding: 20,
    alignItems: 'center', shadowColor: Colors.shadow,
    shadowOffset: { width: 0, height: 2 }, shadowOpacity: 0.05, shadowRadius: 8, elevation: 1,
  },
  emptyText: { fontSize: 12, color: Colors.textHint, textAlign: 'center', lineHeight: 18 },
  reportCard: {
    backgroundColor: Colors.white, borderRadius: 18, padding: 14,
    paddingHorizontal: 16, gap: 8, shadowColor: Colors.shadow,
    shadowOffset: { width: 0, height: 2 }, shadowOpacity: 0.05, shadowRadius: 8, elevation: 1,
  },
  reportCardRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  reportLocation: { fontSize: 13, fontWeight: '500', color: Colors.textPrimary, flex: 1, marginRight: 8 },
  reportMeta: { fontSize: 11, color: Colors.textHint },
  viewLink: { fontSize: 11, color: Colors.textHint },
});
