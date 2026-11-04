import React, { useEffect, useCallback, useState, useMemo } from 'react';
import { View, Text, ScrollView, TouchableOpacity, StyleSheet, RefreshControl } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useNavigation } from '@react-navigation/native';
import { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { useTheme } from '../../hooks/useTheme';
import { ThemeColors } from '../../constants/theme';
import { RootStackParamList, SeverityLevel } from '../../types';
import { useAppDispatch, useAppSelector } from '../../store/hooks';
import { fetchUserReports } from '../../store/reportsSlice';
import { Badge } from '../../components/common/Badge';
import { MapPreview } from '../../components/common/MapPreview';
import { BellIcon, CameraIcon } from '../../components/common/TabIcons';
import { subscribeToNotifications } from '../../services/notificationService';
import { isRainySeason } from '../../services/waterwayAssessment';
import { syncOfflineReports } from '../../services/offlineQueue';
import { useOfflineQueue } from '../../hooks/useOfflineQueue';
import { useT } from '../../hooks/useT';
import { useAppSettings } from '../../services/appSettings';
import Svg, { Path, Circle } from 'react-native-svg';

type Nav = NativeStackNavigationProp<RootStackParamList>;

export default function CitizenHomeScreen() {
  const navigation = useNavigation<Nav>();
  const dispatch = useAppDispatch();
  const { colors } = useTheme();
  const styles = useMemo(() => createStyles(colors), [colors]);
  const { user } = useAppSelector((s) => s.auth);
  const { userReports, loading } = useAppSelector((s) => s.reports);
  const [hasUnreadNotifs, setHasUnreadNotifs] = useState(false);
  const { t } = useT();
  const { features } = useAppSettings();
  const queue = useOfflineQueue();
  const myQueued = queue.items.filter((i) => i.userId === user?.uid);
  const uploadNow = () => {
    if (!user?.uid) return;
    syncOfflineReports(user.uid, true).then((n) => { if (n > 0) load(); });
  };

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
  const inProgress = userReports.filter((r) => !['completed', 'rejected', 'cancelled'].includes(r.status)).length;
  const resolved = userReports.filter((r) => r.status === 'completed').length;
  const recentReports = userReports.slice(0, 3);

  const hotspots = recentReports
    .filter((r) => typeof r.location?.latitude === 'number' && typeof r.location?.longitude === 'number')
    .map((r) => ({ id: r.id, latitude: r.location.latitude, longitude: r.location.longitude, severity: r.severity }));

  const hour = new Date().getHours();
  const greeting = t(hour < 12 ? 'home.morning' : hour < 18 ? 'home.afternoon' : 'home.evening');
  const rainy = isRainySeason(new Date());

  const sevColor = (s: SeverityLevel) =>
    s === 'critical' ? colors.critical : s === 'high' ? colors.red : s === 'moderate' ? colors.amber : colors.teal;

  return (
    <SafeAreaView style={styles.container} edges={['top']}>
      <View style={styles.header}>
        <View style={{ flex: 1 }}>
          <Text style={styles.greeting}>{greeting}, {user?.firstName || t('home.there')}</Text>
          <Text style={styles.headerSub}>{user?.barangay ? `Brgy. ${user.barangay} · Cebu City` : t('home.cityWaterways')}</Text>
        </View>
        {features.mapView && (
        <TouchableOpacity style={styles.iconBtn} onPress={() => navigation.navigate('Map', {})} accessibilityLabel="Open map">
          <Svg width={18} height={18} viewBox="0 0 16 16" fill="none">
            <Path d="M8 2a5 5 0 0 1 5 5c0 3.5-5 8-5 8S3 10 3 7a5 5 0 0 1 5-5z" stroke={colors.textSecondary} strokeWidth="1.6" strokeLinecap="round" />
            <Circle cx="8" cy="7" r="1.5" stroke={colors.textSecondary} strokeWidth="1.6" />
          </Svg>
        </TouchableOpacity>
        )}
        <TouchableOpacity style={styles.iconBtn} onPress={() => navigation.navigate('CitizenNotifications')} accessibilityLabel="Notifications">
          <BellIcon color={colors.textSecondary} size={18} />
          {hasUnreadNotifs && <View style={styles.notifDot} />}
        </TouchableOpacity>
      </View>

      <ScrollView
        contentContainerStyle={styles.body}
        showsVerticalScrollIndicator={false}
        refreshControl={<RefreshControl refreshing={loading} onRefresh={load} tintColor={colors.teal} />}
      >
        {/* Primary action */}
        <TouchableOpacity style={styles.cta} onPress={() => navigation.navigate('CitizenReport')} activeOpacity={0.9}>
          <View style={styles.ctaIcon}><CameraIcon color="#fff" size={24} /></View>
          <View style={{ flex: 1 }}>
            <Text style={styles.ctaTitle}>{t('home.ctaTitle')}</Text>
            <Text style={styles.ctaSub}>{t('home.ctaSub')}</Text>
          </View>
          <Svg width={18} height={18} viewBox="0 0 16 16" fill="none">
            <Path d="M6 3l5 5-5 5" stroke="#fff" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
          </Svg>
        </TouchableOpacity>

        {/* Seasonal guidance, tied to the waterway risk the AI scores */}
        <View style={[styles.tip, rainy ? { backgroundColor: colors.blueBg } : { backgroundColor: colors.tealLight }]}>
          <Text style={[styles.tipTitle, { color: rainy ? colors.blueText : colors.tealDark }]}>
            {t(rainy ? 'home.rainyTitle' : 'home.dryTitle')}
          </Text>
          <Text style={[styles.tipText, { color: rainy ? colors.blueText : colors.tealDark }]}>
            {t(rainy ? 'home.rainyText' : 'home.dryText')}
          </Text>
        </View>

        {/* Reports filed without signal, waiting to upload */}
        {myQueued.length > 0 && (
          <View style={styles.queueCard}>
            <View style={{ flex: 1 }}>
              <Text style={styles.queueTitle}>
                {myQueued.length === 1 ? t('offline.one') : t('offline.many', { n: myQueued.length })}
              </Text>
              <Text style={styles.queueSub}>
                {myQueued.some((i) => i.attempts >= 3) ? t('offline.stuck') : t('offline.auto')}
              </Text>
            </View>
            <TouchableOpacity style={styles.queueBtn} onPress={uploadNow} disabled={queue.syncing}>
              <Text style={styles.queueBtnText}>{queue.syncing ? t('offline.uploading') : t('offline.uploadNow')}</Text>
            </TouchableOpacity>
          </View>
        )}

        {/* My activity */}
        <View style={styles.statsCard}>
          {[
            { v: totalReports, l: t('home.statFiled'), c: colors.textPrimary },
            { v: inProgress, l: t('home.statProgress'), c: colors.amber },
            { v: resolved, l: t('home.statCleaned'), c: colors.teal },
          ].map((s, i) => (
            <React.Fragment key={s.l}>
              {i > 0 && <View style={styles.statDivider} />}
              <View style={styles.stat}>
                <Text style={[styles.statValue, { color: s.c }]}>{s.v}</Text>
                <Text style={styles.statLabel}>{s.l}</Text>
              </View>
            </React.Fragment>
          ))}
        </View>

        {features.mapView && (
          <>
        {/* Map */}
        <View style={styles.sectionHead}>
          <Text style={styles.sectionTitle}>{t('home.map')}</Text>
          <TouchableOpacity onPress={() => navigation.navigate('Map', {})}><Text style={styles.link}>{t('home.openMap')}</Text></TouchableOpacity>
        </View>
        <MapPreview pins={hotspots} onPress={() => navigation.navigate('Map', {})} tagText={t('home.mapTag')} />
        <View style={styles.legend}>
          {(['critical', 'high', 'moderate', 'low'] as SeverityLevel[]).map((s) => (
            <View key={s} style={styles.legendItem}>
              <View style={[styles.legendDot, { backgroundColor: sevColor(s) }]} />
              <Text style={styles.legendText}>{t(`level.${s}` as const)}</Text>
            </View>
          ))}
        </View>
          </>
        )}

        {features.cleanupEvents && (
          <>
        {/* Community */}
        <TouchableOpacity style={styles.rowCard} onPress={() => navigation.navigate('CitizenEvents')} activeOpacity={0.85}>
          <View style={[styles.rowIcon, { backgroundColor: colors.greenBg }]}>
            <Svg width={18} height={18} viewBox="0 0 16 16" fill="none">
              <Circle cx="6" cy="5" r="2.2" stroke={colors.greenText} strokeWidth="1.5" />
              <Circle cx="11" cy="6" r="1.8" stroke={colors.greenText} strokeWidth="1.5" />
              <Path d="M2 13c.5-2.3 2-3.6 4-3.6s3.5 1.3 4 3.6M10 9.6c1.8 0 3.2 1.1 3.6 3.4" stroke={colors.greenText} strokeWidth="1.5" strokeLinecap="round" />
            </Svg>
          </View>
          <View style={{ flex: 1 }}>
            <Text style={styles.rowTitle}>{t('home.volunteerTitle')}</Text>
            <Text style={styles.rowSub}>{t('home.volunteerSub')}</Text>
          </View>
          <Text style={styles.chevron}>›</Text>
        </TouchableOpacity>
          </>
        )}

        {/* Recent reports */}
        <View style={styles.sectionHead}>
          <Text style={styles.sectionTitle}>{t('home.recent')}</Text>
          {totalReports > 3 && (
            <TouchableOpacity onPress={() => navigation.navigate('CitizenTabs', { screen: 'CitizenHistory' } as never)}>
              <Text style={styles.link}>{t('home.seeAll')}</Text>
            </TouchableOpacity>
          )}
        </View>
        {recentReports.length === 0 ? (
          <View style={styles.empty}>
            <Text style={styles.emptyTitle}>{t('home.emptyTitle')}</Text>
            <Text style={styles.emptyText}>{t('home.emptyText')}</Text>
          </View>
        ) : (
          <View style={styles.listCard}>
            {recentReports.map((report, i) => (
              <TouchableOpacity
                key={report.id}
                style={[styles.reportRow, i > 0 && styles.reportDivider]}
                onPress={() => navigation.navigate('CitizenDetail', { reportId: report.id })}
                activeOpacity={0.8}
              >
                <View style={[styles.sevBar, { backgroundColor: sevColor(report.severity) }]} />
                <View style={{ flex: 1, gap: 3 }}>
                  <Text style={styles.reportTitle} numberOfLines={1}>
                    {report.aiAnalysis?.wasteTypes?.[0]?.label ?? t('home.wasteReport')} · {report.location?.barangay || 'Unknown'}
                  </Text>
                  <Text style={styles.reportMeta} numberOfLines={1}>
                    {report.reportNumber} · {new Date(report.createdAt).toLocaleDateString('en-PH', { timeZone: 'Asia/Manila', month: 'short', day: 'numeric' })}
                  </Text>
                </View>
                <Badge variant={report.status} />
              </TouchableOpacity>
            ))}
          </View>
        )}
      </ScrollView>
    </SafeAreaView>
  );
}

const shadow = (Colors: ThemeColors) => ({
  borderWidth: StyleSheet.hairlineWidth,
  borderColor: Colors.border,
  shadowColor: Colors.shadow,
  shadowOffset: { width: 0, height: 4 },
  shadowOpacity: 0.05,
  shadowRadius: 12,
  elevation: 1,
});

const createStyles = (Colors: ThemeColors) => StyleSheet.create({
  container: { flex: 1, backgroundColor: Colors.grayBg },
  header: {
    backgroundColor: Colors.surface, paddingHorizontal: 16, paddingTop: 10, paddingBottom: 12,
    flexDirection: 'row', alignItems: 'center', gap: 8,
    borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: Colors.border,
  },
  greeting: { fontSize: 20, fontWeight: '700', color: Colors.textPrimary },
  headerSub: { fontSize: 12, color: Colors.textMuted, marginTop: 2 },
  iconBtn: { width: 40, height: 40, borderRadius: 20, backgroundColor: Colors.grayBg, alignItems: 'center', justifyContent: 'center' },
  notifDot: {
    position: 'absolute', top: 8, right: 9, width: 8, height: 8, borderRadius: 4,
    backgroundColor: Colors.red, borderWidth: 1.5, borderColor: Colors.surface,
  },
  body: { padding: 16, gap: 14, paddingBottom: 32 },

  cta: {
    backgroundColor: Colors.teal, borderRadius: 20, padding: 18,
    flexDirection: 'row', alignItems: 'center', gap: 14,
    shadowColor: Colors.teal, shadowOffset: { width: 0, height: 8 }, shadowOpacity: 0.25, shadowRadius: 16, elevation: 4,
  },
  ctaIcon: { width: 48, height: 48, borderRadius: 14, backgroundColor: 'rgba(255,255,255,0.2)', alignItems: 'center', justifyContent: 'center' },
  ctaTitle: { fontSize: 16, fontWeight: '700', color: '#fff' },
  ctaSub: { fontSize: 12, color: 'rgba(255,255,255,0.85)', marginTop: 3, lineHeight: 17 },

  tip: { borderRadius: 14, padding: 12, gap: 2 },
  tipTitle: { fontSize: 12, fontWeight: '700' },
  tipText: { fontSize: 12, lineHeight: 17 },

  queueCard: {
    flexDirection: 'row', alignItems: 'center', gap: 12, borderRadius: 14, padding: 12,
    backgroundColor: Colors.amberBg, borderWidth: 1, borderColor: Colors.amber,
  },
  queueTitle: { fontSize: 13, fontWeight: '700', color: Colors.amberText },
  queueSub: { fontSize: 12, color: Colors.amberText, marginTop: 2, lineHeight: 16 },
  queueBtn: { backgroundColor: Colors.amber, borderRadius: 10, paddingHorizontal: 12, paddingVertical: 8 },
  queueBtnText: { fontSize: 12, fontWeight: '700', color: '#fff' },

  statsCard: { flexDirection: 'row', backgroundColor: Colors.surface, borderRadius: 18, paddingVertical: 14, ...shadow(Colors) },
  stat: { flex: 1, alignItems: 'center' },
  statValue: { fontSize: 24, fontWeight: '800' },
  statLabel: { fontSize: 11, color: Colors.textMuted, marginTop: 2 },
  statDivider: { width: StyleSheet.hairlineWidth, backgroundColor: Colors.borderMid, marginVertical: 4 },

  sectionHead: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginTop: 4 },
  sectionTitle: { fontSize: 15, fontWeight: '700', color: Colors.textPrimary },
  link: { fontSize: 13, fontWeight: '600', color: Colors.teal },
  legend: { flexDirection: 'row', gap: 14, marginTop: -4 },
  legendItem: { flexDirection: 'row', alignItems: 'center', gap: 5 },
  legendDot: { width: 8, height: 8, borderRadius: 4 },
  legendText: { fontSize: 11, color: Colors.textMuted },

  rowCard: { flexDirection: 'row', alignItems: 'center', gap: 12, backgroundColor: Colors.surface, borderRadius: 18, padding: 14, ...shadow(Colors) },
  rowIcon: { width: 40, height: 40, borderRadius: 12, alignItems: 'center', justifyContent: 'center' },
  rowTitle: { fontSize: 14, fontWeight: '600', color: Colors.textPrimary },
  rowSub: { fontSize: 12, color: Colors.textMuted, marginTop: 2 },
  chevron: { fontSize: 22, color: Colors.textHint, marginTop: -2 },

  empty: { backgroundColor: Colors.surface, borderRadius: 18, padding: 20, alignItems: 'center', gap: 4, ...shadow(Colors) },
  emptyTitle: { fontSize: 14, fontWeight: '700', color: Colors.textPrimary },
  emptyText: { fontSize: 12, color: Colors.textMuted, textAlign: 'center', lineHeight: 18 },
  listCard: { backgroundColor: Colors.surface, borderRadius: 18, paddingHorizontal: 14, ...shadow(Colors) },
  reportRow: { flexDirection: 'row', alignItems: 'center', gap: 12, paddingVertical: 13 },
  reportDivider: { borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: Colors.border },
  sevBar: { width: 4, alignSelf: 'stretch', borderRadius: 2 },
  reportTitle: { fontSize: 14, fontWeight: '600', color: Colors.textPrimary },
  reportMeta: { fontSize: 12, color: Colors.textMuted },
});
