import React, { useEffect, useState, useMemo } from 'react';
import {
  View, Text, ScrollView, TouchableOpacity, StyleSheet, Image, TextInput, ActivityIndicator, Alert,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { NativeStackScreenProps } from '@react-navigation/native-stack';
import { useTheme } from '../../hooks/useTheme';
import { ThemeColors } from '../../constants/theme';
import { AIWasteType, RootStackParamList, SeverityLevel, WasteReport } from '../../types';
import { Badge } from '../../components/common/Badge';
import { BackIcon } from '../../components/common/TabIcons';
import { useAppSelector } from '../../store/hooks';
import { getReportById, verifyReport, rejectReport } from '../../services/reportsService';

type Props = NativeStackScreenProps<RootStackParamList, 'BarangayVerifyDetail'>;

const SEVERITY_LEVELS: SeverityLevel[] = ['low', 'moderate', 'high', 'critical'];

const WASTE_TYPE_LABELS: Record<AIWasteType, string> = {
  plastic_bottle: 'Plastic Bottle',
  plastic_bag: 'Plastic Bag',
  glass_bottle: 'Glass Bottle',
  metal_can: 'Metal / Can',
  paper_waste: 'Paper Waste',
  cardboard: 'Cardboard',
  food_waste: 'Food Waste',
  styrofoam: 'Styrofoam',
  cigarette_butt: 'Cigarette Butt',
  e_waste: 'E-Waste',
  mixed_waste: 'Mixed Waste',
  trash_pile: 'Trash Pile',
};

const WASTE_TYPE_OPTIONS = Object.keys(WASTE_TYPE_LABELS) as AIWasteType[];

export default function BarangayVerifyReportDetailScreen({ navigation, route }: Props) {
  const { colors } = useTheme();
  const styles = useMemo(() => createStyles(colors), [colors]);
  const { reportId } = route.params;
  const { user } = useAppSelector((s) => s.auth);
  const [report, setReport] = useState<WasteReport | null>(null);
  const [loading, setLoading] = useState(true);
  const [showRejectForm, setShowRejectForm] = useState(false);
  const [reason, setReason] = useState('');
  const [saving, setSaving] = useState(false);
  const [confirmedSeverity, setConfirmedSeverity] = useState<SeverityLevel>('moderate');
  const [confirmedWasteType, setConfirmedWasteType] = useState<AIWasteType>('mixed_waste');

  useEffect(() => {
    getReportById(reportId).then((r) => {
      setReport(r);
      setLoading(false);
      if (r) {
        setConfirmedSeverity(r.severity);
        setConfirmedWasteType((r.aiAnalysis?.wasteTypes?.[0]?.type as AIWasteType) ?? 'mixed_waste');
      }
    });
  }, [reportId]);

  const officerName = user ? `${user.firstName} ${user.lastName}` : 'Barangay Official';

  const cycleSeverity = () => {
    const idx = SEVERITY_LEVELS.indexOf(confirmedSeverity);
    setConfirmedSeverity(SEVERITY_LEVELS[(idx + 1) % SEVERITY_LEVELS.length]);
  };

  const cycleWasteType = () => {
    const idx = WASTE_TYPE_OPTIONS.indexOf(confirmedWasteType);
    setConfirmedWasteType(WASTE_TYPE_OPTIONS[(idx + 1) % WASTE_TYPE_OPTIONS.length]);
  };

  const handleVerify = async () => {
    if (!user || saving) return;
    setSaving(true);
    try {
      // Whatever the officer leaves selected (AI's original call, or a correction) is
      // saved as ground truth -- this is what ml-waste-detection's export script trains
      // on, so an unmodified confirmation is a valid positive label too.
      await verifyReport(reportId, user.uid, officerName, {
        severity: confirmedSeverity,
        wasteType: confirmedWasteType,
      });
      Alert.alert('Report verified', 'This report has been marked as verified.');
      navigation.goBack();
    } catch {
      Alert.alert('Error', 'Failed to verify this report. Please try again.');
    } finally {
      setSaving(false);
    }
  };

  const handleReject = async () => {
    if (!user || saving) return;
    if (!reason.trim()) {
      Alert.alert('Reason required', 'Please explain why this report is being rejected.');
      return;
    }
    setSaving(true);
    try {
      await rejectReport(reportId, user.uid, officerName, reason.trim());
      Alert.alert('Report rejected', 'The reporter will see this report marked as rejected.');
      navigation.goBack();
    } catch {
      Alert.alert('Error', 'Failed to reject this report. Please try again.');
    } finally {
      setSaving(false);
    }
  };

  if (loading || !report) {
    return (
      <SafeAreaView style={styles.container}>
        <View style={styles.header}>
          <TouchableOpacity style={styles.backBtn} onPress={() => navigation.goBack()}><BackIcon /></TouchableOpacity>
          <Text style={styles.headerTitle}>Review report</Text>
          <View style={{ width: 34 }} />
        </View>
        <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center' }}>
          <ActivityIndicator size="small" color={colors.brgy} />
        </View>
      </SafeAreaView>
    );
  }

  const alreadyDecided = report.status !== 'pending';

  return (
    <SafeAreaView style={styles.container}>
      <View style={styles.header}>
        <TouchableOpacity style={styles.backBtn} onPress={() => navigation.goBack()}><BackIcon /></TouchableOpacity>
        <Text style={styles.headerTitle}>Review report</Text>
        <View style={{ width: 34 }} />
      </View>

      <ScrollView contentContainerStyle={styles.body} showsVerticalScrollIndicator={false}>
        {report.photoURL ? (
          <Image source={{ uri: report.photoURL }} style={styles.photo} resizeMode="cover" />
        ) : (
          <View style={styles.photoPlaceholder}>
            <Text style={{ color: colors.textHint, fontSize: 12 }}>No photo available</Text>
          </View>
        )}

        <View style={styles.titleRow}>
          <Text style={styles.title}>{report.location?.barangay || report.barangay || 'Unknown location'}</Text>
          <Badge variant={report.status} />
        </View>

        <View style={styles.detailTable}>
          {[
            { k: 'Report #', v: report.reportNumber ?? report.id.slice(0, 12) },
            { k: 'Submitted by', v: report.userName || '—' },
            { k: 'Date & time', v: new Date(report.createdAt).toLocaleString() },
            { k: 'GPS location', v: report.location ? `${report.location.latitude.toFixed(4)}°N, ${report.location.longitude.toFixed(4)}°E` : '—' },
            { k: 'Primary waste', v: report.aiAnalysis?.wasteTypes?.[0]?.label || '—' },
            { k: 'Severity', v: report.severity, badge: true },
            { k: 'Hazardous', v: report.aiAnalysis?.hazardousDetected ? 'Yes' : 'No', red: report.aiAnalysis?.hazardousDetected },
            { k: 'CNN confidence', v: report.aiAnalysis ? `${report.aiAnalysis.confidence}%` : '—' },
            { k: 'Notes', v: report.notes || '—' },
          ].map((row) => (
            <View key={row.k} style={styles.detailRow}>
              <Text style={styles.detailKey}>{row.k}</Text>
              {row.badge ? (
                <Badge variant={report.severity} />
              ) : (
                <Text style={[styles.detailVal, row.red && { color: colors.red }]}>{row.v}</Text>
              )}
            </View>
          ))}
        </View>

        {!alreadyDecided && (
          <View style={styles.confirmCard}>
            <Text style={styles.confirmTitle}>Confirm AI classification</Text>
            <Text style={styles.confirmSub}>
              Correct these if the AI got it wrong — your confirmation (or correction) becomes the
              training label used to improve future accuracy.
            </Text>
            <View style={styles.confirmRow}>
              <Text style={styles.confirmLabel}>Severity</Text>
              <TouchableOpacity style={styles.confirmSelector} onPress={cycleSeverity}>
                <Text style={styles.confirmSelectorText}>
                  {confirmedSeverity.charAt(0).toUpperCase() + confirmedSeverity.slice(1)}
                </Text>
                <Text style={styles.selectorArrow}>▾</Text>
              </TouchableOpacity>
            </View>
            <View style={styles.confirmRow}>
              <Text style={styles.confirmLabel}>Primary waste type</Text>
              <TouchableOpacity style={styles.confirmSelector} onPress={cycleWasteType}>
                <Text style={styles.confirmSelectorText}>{WASTE_TYPE_LABELS[confirmedWasteType]}</Text>
                <Text style={styles.selectorArrow}>▾</Text>
              </TouchableOpacity>
            </View>
          </View>
        )}

        {alreadyDecided ? (
          <View style={styles.decidedBanner}>
            <Text style={styles.decidedText}>
              This report was already {report.status === 'rejected' ? 'rejected' : `marked as ${report.status}`}.
              {report.rejectionReason ? ` Reason: ${report.rejectionReason}` : ''}
            </Text>
          </View>
        ) : showRejectForm ? (
          <View style={styles.rejectForm}>
            <Text style={styles.rejectLabel}>Reason for rejection</Text>
            <TextInput
              style={styles.rejectInput}
              placeholder="e.g. Duplicate report, no waste visible, wrong location..."
              placeholderTextColor={colors.textHint}
              value={reason}
              onChangeText={setReason}
              multiline
              numberOfLines={4}
              textAlignVertical="top"
            />
            <View style={styles.actions}>
              <TouchableOpacity style={styles.outlineBtn} onPress={() => setShowRejectForm(false)} disabled={saving}>
                <Text style={styles.outlineBtnText}>Cancel</Text>
              </TouchableOpacity>
              <TouchableOpacity style={styles.rejectBtn} onPress={handleReject} disabled={saving}>
                {saving ? <ActivityIndicator size="small" color="#fff" /> : <Text style={styles.rejectBtnText}>Confirm reject</Text>}
              </TouchableOpacity>
            </View>
          </View>
        ) : (
          <View style={styles.actions}>
            <TouchableOpacity style={styles.rejectOutlineBtn} onPress={() => setShowRejectForm(true)} disabled={saving}>
              <Text style={styles.rejectOutlineBtnText}>Reject</Text>
            </TouchableOpacity>
            <TouchableOpacity style={styles.verifyBtn} onPress={handleVerify} disabled={saving}>
              {saving ? <ActivityIndicator size="small" color="#fff" /> : <Text style={styles.verifyBtnText}>Verify report</Text>}
            </TouchableOpacity>
          </View>
        )}
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
  backBtn: { width: 34, height: 34, borderRadius: 17, backgroundColor: Colors.grayBg, alignItems: 'center', justifyContent: 'center' },
  body: { padding: 14, gap: 10, paddingBottom: 28 },
  photo: { borderRadius: 14, height: 180, backgroundColor: '#C0DD97' },
  photoPlaceholder: { borderRadius: 14, height: 90, backgroundColor: '#C0DD97', alignItems: 'center', justifyContent: 'center' },
  titleRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  title: { fontSize: 14, fontWeight: '500', color: Colors.textPrimary },
  detailTable: { backgroundColor: Colors.white, borderRadius: 12, borderWidth: 0.5, borderColor: Colors.border },
  detailRow: {
    flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center',
    paddingHorizontal: 13, paddingVertical: 7,
    borderBottomWidth: 0.5, borderBottomColor: Colors.border,
  },
  detailKey: { fontSize: 11, color: Colors.textMuted },
  detailVal: { fontSize: 11, fontWeight: '500', color: Colors.textPrimary, textAlign: 'right', flex: 1, marginLeft: 8 },
  confirmCard: { backgroundColor: Colors.white, borderRadius: 12, padding: 12, borderWidth: 0.5, borderColor: Colors.border, gap: 8 },
  confirmTitle: { fontSize: 12, fontWeight: '500', color: Colors.textPrimary },
  confirmSub: { fontSize: 10, color: Colors.textMuted, lineHeight: 14 },
  confirmRow: { gap: 4 },
  confirmLabel: { fontSize: 10, color: Colors.textMuted },
  confirmSelector: {
    backgroundColor: Colors.grayBg, borderWidth: 0.5, borderColor: Colors.borderMid,
    borderRadius: 10, padding: 9, paddingHorizontal: 12,
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
  },
  confirmSelectorText: { fontSize: 12, color: Colors.textPrimary },
  selectorArrow: { fontSize: 14, color: Colors.grayHint },
  decidedBanner: {
    backgroundColor: Colors.white, borderRadius: 12, padding: 12,
    borderWidth: 0.5, borderColor: Colors.border,
  },
  decidedText: { fontSize: 12, color: Colors.textMuted, lineHeight: 18 },
  actions: { flexDirection: 'row', gap: 8 },
  verifyBtn: { flex: 1, backgroundColor: Colors.brgy, borderRadius: 12, paddingVertical: 12, alignItems: 'center' },
  verifyBtnText: { fontSize: 13, fontWeight: '500', color: '#fff' },
  rejectOutlineBtn: {
    flex: 1, backgroundColor: Colors.white, borderWidth: 0.5, borderColor: 'rgba(226,75,74,0.3)',
    borderRadius: 12, paddingVertical: 12, alignItems: 'center',
  },
  rejectOutlineBtnText: { fontSize: 13, fontWeight: '500', color: Colors.red },
  rejectForm: { backgroundColor: Colors.white, borderRadius: 12, padding: 12, borderWidth: 0.5, borderColor: Colors.border, gap: 8 },
  rejectLabel: { fontSize: 11, color: Colors.textMuted },
  rejectInput: {
    backgroundColor: Colors.grayBg, borderRadius: 10, borderWidth: 0.5, borderColor: Colors.border,
    padding: 10, fontSize: 12, color: Colors.textPrimary, minHeight: 80,
  },
  outlineBtn: {
    flex: 1, backgroundColor: Colors.white, borderWidth: 0.5, borderColor: Colors.borderMid,
    borderRadius: 11, paddingVertical: 10, alignItems: 'center',
  },
  outlineBtnText: { fontSize: 12, fontWeight: '500', color: Colors.textPrimary },
  rejectBtn: { flex: 1, backgroundColor: Colors.red, borderRadius: 11, paddingVertical: 10, alignItems: 'center' },
  rejectBtnText: { fontSize: 12, fontWeight: '500', color: '#fff' },
});
