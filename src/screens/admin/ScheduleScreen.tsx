import React, { useEffect, useState, useMemo } from 'react';
import {
  View, Text, ScrollView, TouchableOpacity, StyleSheet, Alert, ActivityIndicator,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { NativeStackScreenProps } from '@react-navigation/native-stack';
import { useTheme } from '../../hooks/useTheme';
import { ThemeColors } from '../../constants/theme';
import { RootStackParamList } from '../../types';
import { BackIcon } from '../../components/common/TabIcons';
import { Badge } from '../../components/common/Badge';
import { useAppSelector } from '../../store/hooks';
import { updateReportStatus } from '../../services/reportsService';
import { assignCrewToReport, CrewMember, getAllCrews } from '../../services/crewService';
import { formatDateKey, formatHHmm, toDateKey } from '../../utils/dates';
import { formatPhone } from '../../utils/phone';
import { CEBU_BARANGAYS } from '../../services/locationService';
import { getNotificationRecipientsByRole, sendBulkNotification, sendReportNotification } from '../../services/notificationService';

type Props = NativeStackScreenProps<RootStackParamList, 'AdminSchedule'>;

const TEAMS = ['Team A — General cleanup', 'Team B — Hazmat specialists', 'Team C — Standard cleanup', 'Team D — Heavy machinery'];

// Used when the Admin picks a real crew: this screen has no date or time fields of its own.
const CREW_START = '08:00';
const CREW_END = '10:00';

function tomorrowKey(): string {
  const d = new Date();
  d.setDate(d.getDate() + 1);
  return toDateKey(d);
}

function suggestScheduleDate(severity: string): string {
  const now = new Date();
  const daysOffset = severity === 'critical' ? 1 : severity === 'high' ? 2 : 4;
  const d = new Date(now);
  d.setDate(d.getDate() + daysOffset);
  return d.toLocaleDateString('en-US', { month: 'long', day: 'numeric', year: 'numeric' });
}

export default function AdminScheduleScreen({ navigation, route }: Props) {
  const { colors } = useTheme();
  const styles = useMemo(() => createStyles(colors), [colors]);
  const { reportId } = route.params || {};
  const { reports } = useAppSelector((s) => s.reports);
  const { user } = useAppSelector((s) => s.auth);
  const report = reportId ? reports.find((r) => r.id === reportId) : null;

  const severity = report?.severity || 'critical';
  const barangay = report?.location?.barangay || report?.barangay || 'Unknown';

  // Default the barangay-unit selector to the report's own barangay when it matches
  // the canonical list, so approving without touching the selector still assigns the
  // correct real barangayId (previously this used a hardcoded display-only label that
  // never matched a real barangay account, so assignments never actually reached anyone).
  const defaultUnitIdx = Math.max(0, CEBU_BARANGAYS.findIndex((b) => b.name === barangay));

  const [teamIdx, setTeamIdx] = useState(1);
  const [unitIdx, setUnitIdx] = useState(defaultUnitIdx);
  const [selectedTeam, setSelectedTeam] = useState(TEAMS[1]);
  const [selectedUnit, setSelectedUnit] = useState(CEBU_BARANGAYS[defaultUnitIdx]);
  const [approved, setApproved] = useState(false);
  const [saving, setSaving] = useState(false);
  const [crews, setCrews] = useState<CrewMember[]>([]);
  const [crewsLoading, setCrewsLoading] = useState(true);
  const [crewId, setCrewId] = useState('');

  useEffect(() => {
    let cancelled = false;
    getAllCrews()
      .then((list) => { if (!cancelled) setCrews(list); })
      .catch((e) => console.warn('[Schedule] Could not load crews (the team label still works):', e))
      .finally(() => { if (!cancelled) setCrewsLoading(false); });
    return () => { cancelled = true; };
  }, []);

  const unitCrews = crews.filter((c) => c.barangayId === selectedUnit.id);
  const selectedCrew = unitCrews.find((c) => c.uid === crewId);
  const scheduledDate = tomorrowKey();

  const aiSchedule = {
    date: suggestScheduleDate(severity),
    time: severity === 'critical' ? '6:00 AM – 2:00 PM' : '7:00 AM – 12:00 PM',
    personnel: severity === 'critical' ? '8–10 (hazmat)' : '4–6 (standard)',
    priority: severity.toUpperCase(),
  };

  const handleApprove = async () => {
    setSaving(true);
    try {
      if (report && user && selectedCrew) {
        // A real crew: this creates the task, marks the report assigned and notifies the crew and the reporter.
        await assignCrewToReport({
          report, crew: selectedCrew, assigner: user, scheduledDate, startTime: CREW_START, endTime: CREW_END,
        });
        getNotificationRecipientsByRole(['barangay'], selectedUnit.id)
          .then((barangayUserIds) => {
            if (barangayUserIds.length === 0) return;
            return sendBulkNotification(
              barangayUserIds,
              'Cleanup scheduled in your barangay',
              `${selectedCrew.name} will clean up on ${formatDateKey(scheduledDate)} — ${severity} severity report in ${selectedUnit.name}.`,
              'system',
            );
          })
          .catch((e) => console.warn('[Schedule] Barangay notification failed (non-fatal):', e));
      } else if (report && user) {
        const userName = `${user.firstName} ${user.lastName}`;
        await updateReportStatus(report.id, 'assigned', user.uid, userName, {
          assignedTeamName: selectedTeam,
          assignedBarangayId: selectedUnit.id,
          note: `Scheduled ${aiSchedule.date}. ${selectedTeam} + ${selectedUnit.name} BSP.`,
        });

        // Notify the citizen who filed the report, and the barangay official(s) for
        // the assigned barangay -- previously neither ever heard about an approval.
        sendReportNotification(report.userId, 'report_assigned', report.id, report.reportNumber ?? report.id)
          .catch((e) => console.warn('[Schedule] Citizen notification failed (non-fatal):', e));

        getNotificationRecipientsByRole(['barangay'], selectedUnit.id)
          .then((barangayUserIds) => {
            if (barangayUserIds.length === 0) return;
            return sendBulkNotification(
              barangayUserIds,
              'Cleanup scheduled in your barangay',
              `${selectedTeam} scheduled for ${aiSchedule.date} — ${severity} severity report in ${selectedUnit.name}.`,
              'system',
            );
          })
          .catch((e) => console.warn('[Schedule] Barangay notification failed (non-fatal):', e));
      }
      setApproved(true);
      setTimeout(() => {
        navigation.goBack();
        Alert.alert(
          'Schedule approved',
          selectedCrew
            ? `${selectedCrew.name} has been notified for ${formatDateKey(scheduledDate)}, ${formatHHmm(CREW_START)} to ${formatHHmm(CREW_END)}.`
            : `Team notified for ${aiSchedule.date} at ${aiSchedule.time.split('–')[0].trim()}`,
        );
      }, 1200);
    } catch (err) {
      Alert.alert('Error', err instanceof Error && err.message ? err.message : 'Failed to save schedule. Please try again.');
    } finally {
      setSaving(false);
    }
  };

  const cycleTeam = () => {
    const next = (teamIdx + 1) % TEAMS.length;
    setTeamIdx(next);
    setSelectedTeam(TEAMS[next]);
  };

  const cycleUnit = () => {
    const next = (unitIdx + 1) % CEBU_BARANGAYS.length;
    setUnitIdx(next);
    setSelectedUnit(CEBU_BARANGAYS[next]);
    setCrewId('');
  };

  return (
    <SafeAreaView style={styles.container}>
      <View style={styles.header}>
        <TouchableOpacity style={styles.backBtn} onPress={() => navigation.goBack()}><BackIcon size={18} /></TouchableOpacity>
        <Text style={styles.headerTitle}>Schedule cleanup</Text>
        <View style={{ width: 34 }} />
      </View>

      <ScrollView contentContainerStyle={styles.body} showsVerticalScrollIndicator={false}>
        {/* Severity banner */}
        <View style={[styles.sevBanner, { borderLeftColor: severity === 'critical' ? colors.critical : colors.red }]}>
          <Text style={styles.sevTitle}>{barangay}</Text>
          <Text style={styles.sevSub}>{severity.charAt(0).toUpperCase() + severity.slice(1)} · {report?.aiAnalysis?.hazardousDetected ? 'Hazardous waste' : 'Waste detected'}</Text>
          <View style={styles.sevBadgeRow}>
            <Badge variant={severity as 'critical' | 'high' | 'moderate' | 'low'} label={`CNN: ${report?.aiAnalysis?.confidence != null ? Number(report.aiAnalysis.confidence).toFixed(1) : '—'}%`} />
            <Badge variant="moderate" label={`Vol. ~${report?.aiAnalysis?.estimatedVolume?.toFixed(1) ?? '—'}m³`} />
          </View>
        </View>

        {/* AI suggested schedule */}
        <View style={styles.schedCard}>
          <Text style={styles.schedCardTitle}>AI-suggested schedule</Text>
          {Object.entries(aiSchedule).map(([k, v]) => (
            <View key={k} style={styles.schedRow}>
              <Text style={styles.schedKey}>{k.charAt(0).toUpperCase() + k.slice(1)}</Text>
              <Text style={[styles.schedVal, k === 'priority' && { color: colors.critical }]}>{v}</Text>
            </View>
          ))}
        </View>

        {/* Assign team */}
        <View style={styles.field}>
          <Text style={styles.fieldLabel}>Assign team</Text>
          <TouchableOpacity style={styles.selector} onPress={cycleTeam}>
            <Text style={styles.selectorText}>{selectedTeam}</Text>
            <Text style={styles.selectorArrow}>▾</Text>
          </TouchableOpacity>
        </View>

        {/* Assign barangay unit */}
        <View style={styles.field}>
          <Text style={styles.fieldLabel}>Assign barangay unit</Text>
          <TouchableOpacity style={styles.selector} onPress={cycleUnit}>
            <Text style={styles.selectorText}>{selectedUnit.name} BSP</Text>
            <Text style={styles.selectorArrow}>▾</Text>
          </TouchableOpacity>
        </View>

        {/* Real crew (optional) */}
        <View style={styles.field}>
          <Text style={styles.fieldLabel}>Assign a cleanup crew (optional)</Text>
          {crewsLoading ? (
            <ActivityIndicator size="small" color={colors.blue} />
          ) : unitCrews.length === 0 ? (
            <Text style={styles.crewHint}>No crew accounts in {selectedUnit.name} yet. The team above will be used.</Text>
          ) : (
            unitCrews.map((c) => {
              const on = c.uid === crewId;
              return (
                <TouchableOpacity
                  key={c.uid}
                  style={[styles.crewCard, on && styles.crewCardOn]}
                  onPress={() => setCrewId(on ? '' : c.uid)}
                  disabled={saving || approved}
                  activeOpacity={0.85}
                  accessibilityState={{ selected: on }}
                >
                  <View style={[styles.crewRadio, on && styles.crewRadioOn]}>{on && <View style={styles.crewRadioDot} />}</View>
                  <View style={{ flex: 1 }}>
                    <Text style={styles.crewName}>{c.name}</Text>
                    <Text style={styles.crewHint}>{c.phone ? formatPhone(c.phone) : 'No number'}</Text>
                  </View>
                </TouchableOpacity>
              );
            })
          )}
          <Text style={styles.crewHint}>
            {selectedCrew
              ? `${selectedCrew.name} will get a task for ${formatDateKey(scheduledDate)}, ${formatHHmm(CREW_START)} to ${formatHHmm(CREW_END)}. The team label above is not used.`
              : 'No crew chosen: only the team label above is saved and the barangay is told.'}
          </Text>
        </View>

        {/* Action buttons */}
        <View style={styles.actionRow}>
          <TouchableOpacity
            style={[styles.approveBtn, (approved || saving) && styles.approveBtnDisabled]}
            onPress={handleApprove}
            disabled={approved || saving}
          >
            {saving
              ? <ActivityIndicator size="small" color="#fff" />
              : <Text style={styles.approveBtnText}>{approved ? '✓ Approved' : 'Approve'}</Text>
            }
          </TouchableOpacity>
          <TouchableOpacity style={styles.modifyBtn} onPress={() => Alert.alert('Edit mode', 'Modify schedule')}>
            <Text style={styles.modifyBtnText}>Modify</Text>
          </TouchableOpacity>
        </View>

        {approved && (
          <View style={styles.successCard}>
            <View style={styles.successIcon}>
              <Text style={{ fontSize: 20 }}>✓</Text>
            </View>
            <Text style={styles.successTitle}>Schedule approved!</Text>
            <Text style={styles.successSub}>
              {selectedCrew
                ? `${selectedCrew.name} notified. ${formatDateKey(scheduledDate)}, ${formatHHmm(CREW_START)}.`
                : `${selectedTeam} notified. ${aiSchedule.date}, ${aiSchedule.time.split('–')[0].trim()}.`}
            </Text>
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
  backBtn: { width: 38, height: 38, borderRadius: 19, backgroundColor: Colors.grayBg, alignItems: 'center', justifyContent: 'center' },
  body: { padding: 16, gap: 14, paddingBottom: 24 },
  sevBanner: {
    backgroundColor: Colors.white, borderRadius: 16, padding: 14, paddingHorizontal: 16,
    borderLeftWidth: 3,
    shadowColor: Colors.shadow, shadowOffset: { width: 0, height: 2 }, shadowOpacity: 0.05, shadowRadius: 8, elevation: 1,
  },
  sevTitle: { fontSize: 14, fontWeight: '500', color: Colors.textPrimary },
  sevSub: { fontSize: 11, color: Colors.textMuted, marginTop: 3 },
  sevBadgeRow: { flexDirection: 'row', gap: 5, marginTop: 6 },
  schedCard: {
    backgroundColor: Colors.white, borderRadius: 16, padding: 15,
    shadowColor: Colors.shadow, shadowOffset: { width: 0, height: 2 }, shadowOpacity: 0.05, shadowRadius: 8, elevation: 1,
  },
  schedCardTitle: { fontSize: 14, fontWeight: '600', color: Colors.textPrimary, marginBottom: 9 },
  schedRow: {
    flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center',
    paddingVertical: 6, borderBottomWidth: 0.5, borderBottomColor: Colors.border,
  },
  schedKey: { fontSize: 11, color: Colors.textMuted },
  schedVal: { fontSize: 11, fontWeight: '500', color: Colors.textPrimary },
  field: { gap: 4 },
  fieldLabel: { fontSize: 11, color: Colors.textMuted },
  selector: {
    backgroundColor: Colors.white, borderWidth: 0.5, borderColor: Colors.borderMid,
    borderRadius: 10, padding: 9, paddingHorizontal: 12,
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
  },
  selectorText: { fontSize: 12, color: Colors.textPrimary },
  selectorArrow: { fontSize: 14, color: Colors.grayHint },
  crewCard: {
    flexDirection: 'row', alignItems: 'center', gap: 12, minHeight: 56, padding: 12, borderRadius: 16,
    backgroundColor: Colors.white, borderWidth: 1.5, borderColor: 'transparent',
    shadowColor: Colors.shadow, shadowOffset: { width: 0, height: 2 }, shadowOpacity: 0.05, shadowRadius: 8, elevation: 1,
  },
  crewCardOn: { borderColor: Colors.blue, backgroundColor: Colors.blueBg },
  crewName: { fontSize: 14, fontWeight: '600', color: Colors.textPrimary },
  crewHint: { fontSize: 11, color: Colors.textMuted, lineHeight: 16 },
  crewRadio: { width: 22, height: 22, borderRadius: 11, borderWidth: 2, borderColor: Colors.grayMid, alignItems: 'center', justifyContent: 'center' },
  crewRadioOn: { borderColor: Colors.blue },
  crewRadioDot: { width: 10, height: 10, borderRadius: 5, backgroundColor: Colors.blue },
  actionRow: { flexDirection: 'row', gap: 8 },
  approveBtn: { flex: 1, backgroundColor: Colors.teal, borderRadius: 12, paddingVertical: 11, alignItems: 'center' },
  approveBtnDisabled: { opacity: 0.6 },
  approveBtnText: { fontSize: 12, fontWeight: '500', color: '#fff' },
  modifyBtn: { flex: 1, backgroundColor: Colors.white, borderWidth: 0.5, borderColor: Colors.borderMid, borderRadius: 12, paddingVertical: 11, alignItems: 'center' },
  modifyBtnText: { fontSize: 12, color: Colors.textPrimary },
  successCard: {
    backgroundColor: Colors.white, borderRadius: 18, padding: 18,
    alignItems: 'center', gap: 10,
    shadowColor: Colors.shadow, shadowOffset: { width: 0, height: 2 }, shadowOpacity: 0.05, shadowRadius: 8, elevation: 1,
  },
  successIcon: { width: 56, height: 56, borderRadius: 28, backgroundColor: Colors.tealLight, alignItems: 'center', justifyContent: 'center' },
  successTitle: { fontSize: 15, fontWeight: '500', color: Colors.textPrimary },
  successSub: { fontSize: 12, color: Colors.textMuted, textAlign: 'center', lineHeight: 18 },
});
