import React, { useEffect, useState, useMemo } from 'react';
import { View, Text, ScrollView, TouchableOpacity, StyleSheet, SafeAreaView, Image, Alert, ActivityIndicator } from 'react-native';
import { NativeStackScreenProps } from '@react-navigation/native-stack';
import { useTheme } from '../../hooks/useTheme';
import { ThemeColors } from '../../constants/theme';
import { RootStackParamList, WasteReport } from '../../types';
import { Badge } from '../../components/common/Badge';
import { BackIcon } from '../../components/common/TabIcons';
import { getReportById } from '../../services/reportsService';
import { getOrCreateAdminConversation } from '../../services/messagingService';
import { useAppSelector } from '../../store/hooks';

type Props = NativeStackScreenProps<RootStackParamList, 'CitizenDetail'>;

const STATUS_STEPS: { key: string; label: string }[] = [
  { key: 'pending', label: 'Submitted' },
  { key: 'verified', label: 'Verified' },
  { key: 'assigned', label: 'Assigned' },
  { key: 'in_progress', label: 'In progress' },
  { key: 'completed', label: 'Resolved' },
];

export default function CitizenReportDetailScreen({ navigation, route }: Props) {
  const { colors } = useTheme();
  const styles = useMemo(() => createStyles(colors), [colors]);
  const { reportId } = route.params;
  const { user } = useAppSelector((s) => s.auth);
  const [report, setReport] = useState<WasteReport | null>(null);
  const [contactingAdmin, setContactingAdmin] = useState(false);

  useEffect(() => {
    getReportById(reportId).then(setReport);
  }, [reportId]);

  const handleChatAdmin = async () => {
    if (!user?.uid || contactingAdmin) return;
    setContactingAdmin(true);
    try {
      const result = await getOrCreateAdminConversation(user.uid, `${user.firstName} ${user.lastName}`, 'citizen');
      if (!result) {
        Alert.alert('No admin available', 'No admin account was found to message right now.');
        return;
      }
      navigation.navigate('CitizenChat', { conversationId: result.conversationId, participantName: result.adminName });
    } catch {
      Alert.alert('Couldn’t open chat', 'Please try again.');
    } finally {
      setContactingAdmin(false);
    }
  };

  if (!report) {
    return (
      <SafeAreaView style={styles.container}>
        <View style={styles.header}>
          <TouchableOpacity style={styles.backBtn} onPress={() => navigation.goBack()}><BackIcon size={18} /></TouchableOpacity>
          <Text style={styles.headerTitle}>Report details</Text>
          <View style={{ width: 38 }} />
        </View>
        <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center' }}>
          <Text style={{ color: colors.textMuted }}>Loading...</Text>
        </View>
      </SafeAreaView>
    );
  }

  const stepIndex = STATUS_STEPS.findIndex((s) => s.key === report.status);

  return (
    <SafeAreaView style={styles.container}>
      <View style={styles.header}>
        <TouchableOpacity style={styles.backBtn} onPress={() => navigation.goBack()}><BackIcon /></TouchableOpacity>
        <Text style={styles.headerTitle}>Report details</Text>
        <View style={{ width: 34 }} />
      </View>

      <ScrollView contentContainerStyle={styles.body} showsVerticalScrollIndicator={false}>
        {/* Photo */}
        {report.photoURL ? (
          <Image source={{ uri: report.photoURL }} style={styles.photo} resizeMode="cover" />
        ) : (
          <View style={styles.photoPlaceholder}>
            <Text style={{ color: colors.textHint, fontSize: 12 }}>No photo available</Text>
          </View>
        )}

        {/* Title row */}
        <View style={styles.titleRow}>
          <Text style={styles.title}>{report.location?.barangay || 'Unknown location'}</Text>
          <Badge variant={report.severity} />
        </View>

        {/* Details table */}
        <View style={styles.detailTable}>
          {[
            { k: 'Date & time', v: new Date(report.createdAt).toLocaleString() },
            { k: 'GPS location', v: `${report.location?.latitude.toFixed(4)}°N, ${report.location?.longitude.toFixed(4)}°E` },
            { k: 'Barangay', v: report.location?.barangay || '—' },
            { k: 'Primary waste', v: report.aiAnalysis?.wasteTypes[0]?.label || '—' },
            { k: 'Hazardous', v: report.aiAnalysis?.hazardousDetected ? 'Yes — Hazardous material' : 'No', red: report.aiAnalysis?.hazardousDetected },
            { k: 'CNN confidence', v: report.aiAnalysis ? `${report.aiAnalysis.confidence}%` : '—' },
            { k: 'Status', v: report.status, badge: true },
          ].map((row) => (
            <View key={row.k} style={styles.detailRow}>
              <Text style={styles.detailKey}>{row.k}</Text>
              {row.badge ? (
                <Badge variant={report.status} />
              ) : (
                <Text style={[styles.detailVal, row.red && { color: colors.red }]}>{row.v}</Text>
              )}
            </View>
          ))}
        </View>

        {/* Status tracker */}
        {report.status === 'rejected' || report.status === 'cancelled' ? (
          <View style={styles.rejectedBanner}>
            <Text style={styles.rejectedTitle}>
              This report was {report.status === 'rejected' ? 'rejected' : 'cancelled'}.
            </Text>
            {report.rejectionReason && (
              <Text style={styles.rejectedReason}>Reason: {report.rejectionReason}</Text>
            )}
          </View>
        ) : (
          <View style={styles.statusTracker}>
            {STATUS_STEPS.map((step, i) => {
              const done = i <= stepIndex;
              const active = i === stepIndex;
              return (
                <React.Fragment key={step.key}>
                  <View style={styles.stepCol}>
                    <View style={[styles.stepDot, done && styles.stepDotDone, active && styles.stepDotActive]} />
                    <Text style={[styles.stepLabel, done && styles.stepLabelDone, active && styles.stepLabelActive]}>
                      {step.label}
                    </Text>
                  </View>
                  {i < STATUS_STEPS.length - 1 && (
                    <View style={[styles.stepLine, done && i < stepIndex && styles.stepLineDone]} />
                  )}
                </React.Fragment>
              );
            })}
          </View>
        )}

        {/* Actions */}
        <View style={styles.actions}>
          <TouchableOpacity style={styles.outlineBtn} onPress={() => navigation.navigate('Map', {})}>
            <Text style={styles.outlineBtnText}>🗺️ Map</Text>
          </TouchableOpacity>
          <TouchableOpacity style={styles.primaryBtn} onPress={handleChatAdmin} disabled={contactingAdmin}>
            {contactingAdmin
              ? <ActivityIndicator size="small" color="#fff" />
              : <Text style={styles.primaryBtnText}>💬 Chat admin</Text>
            }
          </TouchableOpacity>
        </View>
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
  photo: { borderRadius: 14, height: 180, backgroundColor: '#C0DD97' },
  photoPlaceholder: { borderRadius: 14, height: 90, backgroundColor: '#C0DD97', alignItems: 'center', justifyContent: 'center' },
  titleRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  title: { fontSize: 14, fontWeight: '500', color: Colors.textPrimary },
  detailTable: {
    backgroundColor: Colors.white, borderRadius: 16,
    shadowColor: Colors.shadow, shadowOffset: { width: 0, height: 2 }, shadowOpacity: 0.05, shadowRadius: 8, elevation: 1,
  },
  detailRow: {
    flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center',
    paddingHorizontal: 13, paddingVertical: 7,
    borderBottomWidth: 0.5, borderBottomColor: Colors.border,
  },
  detailKey: { fontSize: 11, color: Colors.textMuted },
  detailVal: { fontSize: 11, fontWeight: '500', color: Colors.textPrimary, textAlign: 'right', flex: 1, marginLeft: 8 },
  statusTracker: { flexDirection: 'row', alignItems: 'center', paddingHorizontal: 8 },
  rejectedBanner: {
    backgroundColor: Colors.redBg, borderRadius: 12, padding: 12,
    borderWidth: 0.5, borderColor: 'rgba(226,75,74,0.25)',
  },
  rejectedTitle: { fontSize: 12, fontWeight: '500', color: Colors.redText },
  rejectedReason: { fontSize: 11, color: Colors.redText, opacity: 0.85, marginTop: 4 },
  stepCol: { alignItems: 'center', gap: 4 },
  stepDot: { width: 12, height: 12, borderRadius: 6, backgroundColor: Colors.grayBg, borderWidth: 1, borderColor: Colors.borderMid },
  stepDotDone: { backgroundColor: Colors.teal, borderColor: Colors.teal },
  stepDotActive: { backgroundColor: Colors.blue, borderColor: Colors.blue },
  stepLine: { flex: 1, height: 2, backgroundColor: Colors.grayMid, marginBottom: 16 },
  stepLineDone: { backgroundColor: Colors.teal },
  stepLabel: { fontSize: 9, color: Colors.textHint, textAlign: 'center' },
  stepLabelDone: { color: Colors.tealDark },
  stepLabelActive: { color: Colors.blueText },
  actions: { flexDirection: 'row', gap: 8 },
  outlineBtn: {
    flex: 1, backgroundColor: Colors.white, borderWidth: 0.5, borderColor: Colors.borderMid,
    borderRadius: 11, paddingVertical: 9, alignItems: 'center', justifyContent: 'center',
  },
  outlineBtnText: { fontSize: 11, fontWeight: '500', color: Colors.textPrimary },
  primaryBtn: {
    flex: 1, backgroundColor: Colors.teal, borderRadius: 11,
    paddingVertical: 9, alignItems: 'center', justifyContent: 'center',
  },
  primaryBtnText: { fontSize: 11, fontWeight: '500', color: '#fff' },
});
