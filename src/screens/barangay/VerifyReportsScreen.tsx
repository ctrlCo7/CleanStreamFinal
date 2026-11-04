import React, { useEffect, useState, useMemo } from 'react';
import { View, Text, ScrollView, TouchableOpacity, StyleSheet, Image, ActivityIndicator } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { NativeStackScreenProps } from '@react-navigation/native-stack';
import { useTheme } from '../../hooks/useTheme';
import { ThemeColors } from '../../constants/theme';
import { Badge } from '../../components/common/Badge';
import { BackIcon } from '../../components/common/TabIcons';
import { useAppSelector } from '../../store/hooks';
import { subscribeToBarangayReports } from '../../services/reportsService';
import { RootStackParamList, SeverityLevel, WasteReport } from '../../types';

type Props = NativeStackScreenProps<RootStackParamList, 'BarangayVerify'>;

const SEV_RANK: Record<SeverityLevel, number> = { critical: 0, high: 1, moderate: 2, low: 3 };
const CONTEXT: Record<string, string> = { in_water: 'In the water', riverbank: 'Riverbank', drainage: 'Drainage canal' };

export default function BarangayVerifyReportsScreen({ navigation }: Props) {
  const { colors } = useTheme();
  const styles = useMemo(() => createStyles(colors), [colors]);
  const { user } = useAppSelector((s) => s.auth);
  const { reports: allReports } = useAppSelector((s) => s.reports);
  const [barangayReports, setBarangayReports] = useState<WasteReport[]>([]);
  const [loading, setLoading] = useState(true);

  const myBarangay = user?.barangay || '';
  const myBarangayId = user?.barangayId || '';

  useEffect(() => {
    if (!myBarangayId) {
      setBarangayReports(allReports.filter((r) => r.location?.barangay === myBarangay || r.barangay === myBarangay));
      setLoading(false);
      return;
    }
    const unsub = subscribeToBarangayReports(myBarangayId, (reports) => {
      setBarangayReports(reports);
      setLoading(false);
    });
    return unsub;
  }, [myBarangayId, myBarangay, allReports]);

  const pending = barangayReports
    .filter((r) => r.status === 'pending')
    .sort((a, b) => SEV_RANK[a.severity] - SEV_RANK[b.severity] || new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());
  const sevColor = (sev: SeverityLevel) => (sev === 'critical' ? colors.critical : sev === 'high' ? colors.red : sev === 'moderate' ? colors.amber : colors.teal);

  return (
    <SafeAreaView style={styles.container}>
      <View style={styles.header}>
        <TouchableOpacity style={styles.backBtn} onPress={() => navigation.goBack()}><BackIcon size={18} /></TouchableOpacity>
        <View style={{ alignItems: 'center' }}>
          <Text style={styles.headerTitle}>Review reports</Text>
          <Text style={styles.headerSub}>{pending.length} waiting · most urgent first</Text>
        </View>
        <View style={{ width: 34 }} />
      </View>

      <ScrollView contentContainerStyle={styles.body} showsVerticalScrollIndicator={false}>
        {loading && (
          <ActivityIndicator size="small" color={colors.brgy} style={{ alignSelf: 'center', marginVertical: 16 }} />
        )}

        {!loading && pending.length === 0 && (
          <View style={styles.emptyCard}>
            <Text style={styles.emptyTitle}>All caught up</Text>
            <Text style={styles.emptyText}>New reports from residents in {myBarangay || 'your barangay'} will appear here.</Text>
          </View>
        )}

        {pending.map((report) => (
          <TouchableOpacity
            key={report.id}
            style={styles.card}
            activeOpacity={0.85}
            onPress={() => navigation.navigate('BarangayVerifyDetail', { reportId: report.id })}
          >
            <View style={[styles.stripe, { backgroundColor: sevColor(report.severity) }]} />
            {report.photoURL ? (
              <Image source={{ uri: report.photoURL }} style={styles.thumb} />
            ) : (
              <View style={[styles.thumb, styles.thumbPlaceholder]}>
                <Text style={{ fontSize: 12, color: colors.textHint }}>{report.photoPending ? 'Uploading…' : 'No photo'}</Text>
              </View>
            )}
            <View style={{ flex: 1, gap: 3 }}>
              <View style={styles.cardTop}>
                <Text style={styles.cardTitle} numberOfLines={1}>
                  {report.aiAnalysis?.wasteTypes?.[0]?.label || 'Waste report'}
                </Text>
                <Badge variant={report.severity} />
              </View>
              <Text style={styles.cardSub} numberOfLines={1}>
                {[report.aiAnalysis?.waterway?.context ? CONTEXT[report.aiAnalysis.waterway.context] : null, report.location?.address].filter(Boolean).join(' · ') || report.reportNumber}
              </Text>
              <Text style={styles.cardMeta}>
                {new Date(report.createdAt).toLocaleString('en-PH', { timeZone: 'Asia/Manila', month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' })}
                {report.aiAnalysis?.confidence ? ` · AI ${report.aiAnalysis.confidence}%` : ''}
              </Text>
              {(!!report.duplicateOfNumber || (report.nearbyReportCount ?? 0) >= 3) && (
                <View style={styles.flags}>
                  {!!report.duplicateOfNumber && <Text style={[styles.flag, { color: colors.purpleText, backgroundColor: colors.purpleBg }]}>Possible duplicate</Text>}
                  {(report.nearbyReportCount ?? 0) >= 3 && <Text style={[styles.flag, { color: colors.redText, backgroundColor: colors.redBg }]}>Hotspot</Text>}
                </View>
              )}
            </View>
            <Text style={styles.chev}>›</Text>
          </TouchableOpacity>
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
    borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: Colors.border,
  },
  headerTitle: { fontSize: 17, fontWeight: '700', color: Colors.textPrimary },
  backBtn: { width: 38, height: 38, borderRadius: 19, backgroundColor: Colors.grayBg, alignItems: 'center', justifyContent: 'center' },
  body: { padding: 16, gap: 14, paddingBottom: 24 },
  headerSub: { fontSize: 12, color: Colors.textMuted, marginTop: 1 },
  emptyCard: {
    backgroundColor: Colors.surface, borderRadius: 18, padding: 28, alignItems: 'center', gap: 4,
    borderWidth: StyleSheet.hairlineWidth, borderColor: Colors.border,
  },
  emptyTitle: { fontSize: 15, fontWeight: '700', color: Colors.textPrimary },
  emptyText: { fontSize: 13, color: Colors.textMuted, textAlign: 'center', lineHeight: 18 },
  card: {
    backgroundColor: Colors.surface, borderRadius: 18, padding: 12, paddingLeft: 16, overflow: 'hidden',
    flexDirection: 'row', gap: 12, alignItems: 'center',
    borderWidth: StyleSheet.hairlineWidth, borderColor: Colors.border,
    shadowColor: Colors.shadow, shadowOffset: { width: 0, height: 4 }, shadowOpacity: 0.05, shadowRadius: 12, elevation: 1,
  },
  stripe: { position: 'absolute', left: 0, top: 0, bottom: 0, width: 4 },
  thumb: { width: 72, height: 72, borderRadius: 12, backgroundColor: Colors.grayBg },
  thumbPlaceholder: { alignItems: 'center', justifyContent: 'center', backgroundColor: Colors.grayBg },
  cardTop: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 6 },
  cardTitle: { fontSize: 15, fontWeight: '700', color: Colors.textPrimary, flexShrink: 1 },
  cardSub: { fontSize: 12, color: Colors.textSecondary },
  cardMeta: { fontSize: 12, color: Colors.textMuted },
  flags: { flexDirection: 'row', gap: 6, marginTop: 2 },
  flag: { fontSize: 11, fontWeight: '700', paddingHorizontal: 8, paddingVertical: 2, borderRadius: 10, overflow: 'hidden' },
  chev: { fontSize: 22, color: Colors.textHint },
});
