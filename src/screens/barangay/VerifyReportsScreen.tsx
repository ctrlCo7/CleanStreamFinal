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
import { RootStackParamList, WasteReport } from '../../types';

type Props = NativeStackScreenProps<RootStackParamList, 'BarangayVerify'>;

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
    .sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());

  return (
    <SafeAreaView style={styles.container}>
      <View style={styles.header}>
        <TouchableOpacity style={styles.backBtn} onPress={() => navigation.goBack()}><BackIcon size={18} /></TouchableOpacity>
        <Text style={styles.headerTitle}>Pending Review</Text>
        <View style={{ width: 34 }} />
      </View>

      <ScrollView contentContainerStyle={styles.body} showsVerticalScrollIndicator={false}>
        {loading && (
          <ActivityIndicator size="small" color={colors.brgy} style={{ alignSelf: 'center', marginVertical: 16 }} />
        )}

        {!loading && pending.length === 0 && (
          <View style={styles.emptyCard}>
            <Text style={styles.emptyText}>No reports awaiting review</Text>
          </View>
        )}

        {pending.map((report) => (
          <TouchableOpacity
            key={report.id}
            style={styles.card}
            activeOpacity={0.85}
            onPress={() => navigation.navigate('BarangayVerifyDetail', { reportId: report.id })}
          >
            {report.photoURL ? (
              <Image source={{ uri: report.photoURL }} style={styles.thumb} />
            ) : (
              <View style={[styles.thumb, styles.thumbPlaceholder]}>
                <Text style={{ fontSize: 10, color: colors.textHint }}>No photo</Text>
              </View>
            )}
            <View style={{ flex: 1 }}>
              <View style={styles.cardTop}>
                <Text style={styles.cardTitle} numberOfLines={1}>
                  {report.aiAnalysis?.wasteTypes?.[0]?.label || 'Waste report'}
                </Text>
                <Badge variant={report.severity} />
              </View>
              <Text style={styles.cardSub}>{report.reportNumber ?? report.id.slice(0, 12)}</Text>
              <Text style={styles.cardMeta}>
                {new Date(report.createdAt).toLocaleDateString('en-US', { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' })}
                {report.aiAnalysis?.confidence != null ? ` · CNN ${report.aiAnalysis.confidence}%` : ''}
              </Text>
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
    backgroundColor: Colors.white, paddingHorizontal: 16, paddingVertical: 12,
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
    borderBottomWidth: 0.5, borderBottomColor: Colors.border,
  },
  headerTitle: { fontSize: 16, fontWeight: '500', color: Colors.textPrimary },
  backBtn: { width: 38, height: 38, borderRadius: 19, backgroundColor: Colors.grayBg, alignItems: 'center', justifyContent: 'center' },
  body: { padding: 16, gap: 14, paddingBottom: 24 },
  emptyCard: {
    backgroundColor: Colors.white, borderRadius: 16, padding: 34, alignItems: 'center',
    shadowColor: Colors.shadow, shadowOffset: { width: 0, height: 2 }, shadowOpacity: 0.05, shadowRadius: 8, elevation: 1,
  },
  emptyText: { fontSize: 12, color: Colors.textHint },
  card: {
    backgroundColor: Colors.white, borderRadius: 17, padding: 13,
    flexDirection: 'row', gap: 10, alignItems: 'center',
    shadowColor: Colors.shadow, shadowOffset: { width: 0, height: 2 }, shadowOpacity: 0.05, shadowRadius: 8, elevation: 1,
  },
  thumb: { width: 54, height: 54, borderRadius: 10, backgroundColor: '#C0DD97' },
  thumbPlaceholder: { alignItems: 'center', justifyContent: 'center', backgroundColor: Colors.grayBg },
  cardTop: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 6 },
  cardTitle: { fontSize: 12, fontWeight: '500', color: Colors.textPrimary, flexShrink: 1 },
  cardSub: { fontSize: 10, color: Colors.textMuted, marginTop: 2 },
  cardMeta: { fontSize: 10, color: Colors.textHint, marginTop: 2 },
});
