import React, { useEffect, useState, useMemo } from 'react';
import {
  View, Text, ScrollView, TouchableOpacity, StyleSheet, Image, TextInput, ActivityIndicator, Alert,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { NativeStackScreenProps } from '@react-navigation/native-stack';
import { useTheme } from '../../hooks/useTheme';
import { ThemeColors } from '../../constants/theme';
import { AIWasteType, CONCERN_LABELS, RootStackParamList, SeverityLevel, WasteReport } from '../../types';
import { formatPH } from '../../utils/phTime';
import { formatDateKey } from '../../utils/dates';
import { Badge } from '../../components/common/Badge';
import { BackIcon } from '../../components/common/TabIcons';
import { useAppSelector } from '../../store/hooks';
import { getReportById, verifyReport, rejectReport } from '../../services/reportsService';
import { HOTSPOT_MIN_REPORTS } from '../../services/reportProximity';
import { WASTE_TYPE_LABELS } from '../../services/wasteAnalysis';
import { canViewReport } from '../../services/assignmentRules';
import { explainWriteError } from '../../utils/firestoreErrors';
import { precisionLabel } from '../../utils/locationPrecision';
import { notifyReportRejected, notifyReportVerified } from '../../services/workflowNotifications';

const OTHER_BARANGAY = 'This report belongs to another barangay. Only its own barangay can view it and take action.';

type Props = NativeStackScreenProps<RootStackParamList, 'BarangayVerifyDetail'>;

const SEVERITY_LEVELS: SeverityLevel[] = ['low', 'moderate', 'high', 'critical'];

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

  const [blocked, setBlocked] = useState('');

  useEffect(() => {
    getReportById(reportId).then((r) => {
      if (r && !canViewReport(r, user)) {
        setBlocked(OTHER_BARANGAY);
      } else {
        setReport(r);
        if (!r) setBlocked('This report may have been removed.');
      }
      setLoading(false);
      if (r) {
        setConfirmedSeverity(r.severity);
        setConfirmedWasteType(r.citizenWasteType ?? (r.aiAnalysis?.wasteTypes?.[0]?.type as AIWasteType) ?? 'mixed_waste');
      }
    }).catch((err: { code?: string; message?: string }) => {
      // The rules hide other barangays' reports from officials.
      setBlocked(err?.code === 'permission-denied' ? OTHER_BARANGAY : err?.message || 'Could not load this report.');
      setLoading(false);
    });
  }, [reportId]); // eslint-disable-line react-hooks/exhaustive-deps

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
      if (report) notifyReportVerified(report, user).catch(() => undefined);
      Alert.alert(
        'Report verified',
        'The reporter has been told, and the report was forwarded to the Barangay Captain. Do you want to propose a cleanup schedule now? The Captain approves it.',
        [
          { text: 'Later', style: 'cancel', onPress: () => navigation.goBack() },
          { text: 'Propose a schedule', onPress: () => navigation.replace('BarangayAssignCrew', { reportId }) },
        ],
      );
    } catch (e) {
      console.warn('[Verify] Report verify failed:', e);
      Alert.alert('Could not verify', explainWriteError(e, 'verify this report', {
        otherBarangay: !!report?.barangayId && report.barangayId !== user.barangayId,
      }));
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
      if (report) notifyReportRejected(report, user, reason.trim()).catch(() => undefined);
      Alert.alert('Report rejected', 'The reporter has been told, with your reason.');
      navigation.goBack();
    } catch {
      Alert.alert('Error', 'Failed to reject this report. Please try again.');
    } finally {
      setSaving(false);
    }
  };

  const handleCloseDuplicate = () => {
    if (!user || saving || !report?.duplicateOfNumber) return;
    Alert.alert('Close as duplicate?', `This report will be closed and the reporter told it duplicates ${report.duplicateOfNumber}.`, [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'Close as duplicate',
        onPress: async () => {
          setSaving(true);
          try {
            await rejectReport(reportId, user.uid, officerName, `Duplicate of ${report.duplicateOfNumber}`);
            notifyReportRejected(report, user, `Duplicate of ${report.duplicateOfNumber}`).catch(() => undefined);
            navigation.goBack();
          } catch {
            Alert.alert('Error', 'Failed to close this report. Please try again.');
          } finally {
            setSaving(false);
          }
        },
      },
    ]);
  };

  if (loading || !report) {
    return (
      <SafeAreaView style={styles.container}>
        <View style={styles.header}>
          <TouchableOpacity style={styles.backBtn} onPress={() => navigation.goBack()}><BackIcon size={18} /></TouchableOpacity>
          <Text style={styles.headerTitle}>Review report</Text>
          <View style={{ width: 38 }} />
        </View>
        <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center', padding: 24 }}>
          {loading || !blocked
            ? <ActivityIndicator size="small" color={colors.brgy} />
            : <Text style={{ fontSize: 14, color: colors.textSecondary, textAlign: 'center', lineHeight: 20 }}>{blocked}</Text>}
        </View>
      </SafeAreaView>
    );
  }

  const alreadyDecided = report.status !== 'pending';

  return (
    <SafeAreaView style={styles.container}>
      <View style={styles.header}>
        <TouchableOpacity style={styles.backBtn} onPress={() => navigation.goBack()}><BackIcon size={18} /></TouchableOpacity>
        <Text style={styles.headerTitle}>Review report</Text>
        <View style={{ width: 38 }} />
      </View>

      <ScrollView contentContainerStyle={styles.body} showsVerticalScrollIndicator={false}>
        {report.photoURL ? (
          <Image source={{ uri: report.photoURL }} style={styles.photo} resizeMode="cover" />
        ) : (
          <View style={styles.photoPlaceholder}>
            <Text style={{ color: colors.textHint, fontSize: 12 }}>{report.photoPending ? 'Photo still uploading from the reporter’s phone. Check again shortly before verifying.' : 'No photo available'}</Text>
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
            { k: 'Concern', v: report.concernType ? CONCERN_LABELS[report.concernType] : '—' },
            { k: 'Incident date', v: report.incidentDate ? formatDateKey(report.incidentDate) : '—' },
            { k: 'Submitted', v: formatPH(report.createdAt) },
            { k: 'GPS location', v: report.location ? `${report.location.latitude.toFixed(5)}°N, ${report.location.longitude.toFixed(5)}°E` : '—' },
            { k: 'Spot accuracy', v: report.location ? precisionLabel(report.location) : '—' },
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
            {!!report?.citizenWasteType && (
              <Text style={styles.confirmLabel}>
                Reporter says: {WASTE_TYPE_LABELS[report.citizenWasteType]}
              </Text>
            )}
          </View>
        )}

        {/* Same spot reported again, or a place where dumping keeps returning */}
        {!!report.duplicateOfNumber && (
          <View style={[styles.flagCard, { backgroundColor: colors.purpleBg, borderColor: colors.purple }]}>
            <Text style={[styles.flagTitle, { color: colors.purpleText }]}>Possible duplicate</Text>
            <Text style={[styles.flagText, { color: colors.purpleText }]}>
              {report.duplicateOfNumber} was filed {report.duplicateDistanceM ?? 'under 50'} m away within 24 hours before this one. Compare the photos.
            </Text>
            {!alreadyDecided && (
              <TouchableOpacity style={[styles.flagBtn, { borderColor: colors.purple }]} onPress={handleCloseDuplicate} disabled={saving}>
                <Text style={[styles.flagBtnText, { color: colors.purpleText }]}>Close as duplicate</Text>
              </TouchableOpacity>
            )}
          </View>
        )}
        {(report.nearbyReportCount ?? 0) >= HOTSPOT_MIN_REPORTS && (
          <View style={[styles.flagCard, { backgroundColor: colors.redBg, borderColor: colors.red }]}>
            <Text style={[styles.flagTitle, { color: colors.redText }]}>Hotspot</Text>
            <Text style={[styles.flagText, { color: colors.redText }]}>
              {report.nearbyReportCount} reports within 100 m in the last 90 days. Consider a checkpoint, signage or a volunteer cleanup here.
            </Text>
          </View>
        )}

        {alreadyDecided ? (
          <View style={styles.decidedBanner}>
            <Text style={styles.decidedText}>
              This report was already {report.status === 'rejected' ? 'rejected' : `marked as ${report.status}`}.
              {report.rejectionReason ? ` Reason: ${report.rejectionReason}` : ''}
            </Text>
            {(report.status === 'verified' || report.status === 'assigned') && (
              <TouchableOpacity
                style={styles.assignBtn}
                onPress={() => navigation.navigate('BarangayAssignCrew', { reportId })}
                accessibilityLabel="Propose a cleanup schedule"
              >
                <Text style={styles.verifyBtnText}>Propose a cleanup schedule</Text>
              </TouchableOpacity>
            )}
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
    borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: Colors.border,
  },
  headerTitle: { fontSize: 17, fontWeight: '700', color: Colors.textPrimary },
  backBtn: { width: 38, height: 38, borderRadius: 19, backgroundColor: Colors.grayBg, alignItems: 'center', justifyContent: 'center' },
  body: { padding: 16, gap: 14, paddingBottom: 28 },
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
    borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: Colors.border,
  },
  detailKey: { fontSize: 12, color: Colors.textMuted },
  detailVal: { fontSize: 12, fontWeight: '500', color: Colors.textPrimary, textAlign: 'right', flex: 1, marginLeft: 8 },
  confirmCard: {
    backgroundColor: Colors.white, borderRadius: 16, padding: 15, gap: 8,
    shadowColor: Colors.shadow, shadowOffset: { width: 0, height: 2 }, shadowOpacity: 0.05, shadowRadius: 8, elevation: 1,
  },
  confirmTitle: { fontSize: 12, fontWeight: '500', color: Colors.textPrimary },
  confirmSub: { fontSize: 12, color: Colors.textMuted, lineHeight: 14 },
  confirmRow: { gap: 4 },
  confirmLabel: { fontSize: 12, color: Colors.textMuted },
  confirmSelector: {
    backgroundColor: Colors.grayBg, borderWidth: StyleSheet.hairlineWidth, borderColor: Colors.borderMid,
    borderRadius: 10, padding: 9, paddingHorizontal: 12,
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
  },
  confirmSelectorText: { fontSize: 12, color: Colors.textPrimary },
  selectorArrow: { fontSize: 14, color: Colors.grayHint },
  flagCard: { borderRadius: 12, borderWidth: 1, padding: 12, gap: 4 },
  flagTitle: { fontSize: 13, fontWeight: '700' },
  flagText: { fontSize: 12, lineHeight: 17 },
  flagBtn: { alignSelf: 'flex-start', marginTop: 4, borderWidth: 1, borderRadius: 10, paddingHorizontal: 12, paddingVertical: 7 },
  flagBtnText: { fontSize: 12, fontWeight: '700' },
  decidedBanner: {
    backgroundColor: Colors.white, borderRadius: 16, padding: 15, gap: 12,
    shadowColor: Colors.shadow, shadowOffset: { width: 0, height: 2 }, shadowOpacity: 0.05, shadowRadius: 8, elevation: 1,
  },
  assignBtn: { minHeight: 48, backgroundColor: Colors.brgy, borderRadius: 12, paddingVertical: 12, alignItems: 'center', justifyContent: 'center' },
  decidedText: { fontSize: 12, color: Colors.textMuted, lineHeight: 18 },
  actions: { flexDirection: 'row', gap: 8 },
  verifyBtn: { flex: 1, backgroundColor: Colors.brgy, borderRadius: 12, paddingVertical: 12, alignItems: 'center' },
  verifyBtnText: { fontSize: 13, fontWeight: '500', color: '#fff' },
  rejectOutlineBtn: {
    flex: 1, backgroundColor: Colors.white, borderWidth: StyleSheet.hairlineWidth, borderColor: 'rgba(226,75,74,0.3)',
    borderRadius: 12, paddingVertical: 12, alignItems: 'center',
  },
  rejectOutlineBtnText: { fontSize: 13, fontWeight: '500', color: Colors.red },
  rejectForm: {
    backgroundColor: Colors.white, borderRadius: 16, padding: 15, gap: 8,
    shadowColor: Colors.shadow, shadowOffset: { width: 0, height: 2 }, shadowOpacity: 0.05, shadowRadius: 8, elevation: 1,
  },
  rejectLabel: { fontSize: 12, color: Colors.textMuted },
  rejectInput: {
    backgroundColor: Colors.grayBg, borderRadius: 10, borderWidth: StyleSheet.hairlineWidth, borderColor: Colors.border,
    padding: 10, fontSize: 12, color: Colors.textPrimary, minHeight: 80,
  },
  outlineBtn: {
    flex: 1, backgroundColor: Colors.white, borderWidth: StyleSheet.hairlineWidth, borderColor: Colors.borderMid,
    borderRadius: 11, paddingVertical: 10, alignItems: 'center',
  },
  outlineBtnText: { fontSize: 12, fontWeight: '500', color: Colors.textPrimary },
  rejectBtn: { flex: 1, backgroundColor: Colors.red, borderRadius: 11, paddingVertical: 10, alignItems: 'center' },
  rejectBtnText: { fontSize: 12, fontWeight: '500', color: '#fff' },
});
