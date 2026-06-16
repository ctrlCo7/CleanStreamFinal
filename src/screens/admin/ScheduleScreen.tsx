import React, { useState } from 'react';
import {
  View, Text, ScrollView, TouchableOpacity, StyleSheet, Alert, ActivityIndicator,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { NativeStackScreenProps } from '@react-navigation/native-stack';
import { Colors } from '../../constants/colors';
import { RootStackParamList } from '../../types';
import { BackIcon } from '../../components/common/TabIcons';
import { Badge } from '../../components/common/Badge';
import { useAppSelector } from '../../store/hooks';
import { updateReportStatus } from '../../services/reportsService';

type Props = NativeStackScreenProps<RootStackParamList, 'AdminSchedule'>;

const TEAMS = ['Team A — General cleanup', 'Team B — Hazmat specialists', 'Team C — Standard cleanup', 'Team D — Heavy machinery'];
const BARANGAY_UNITS = ['Punta Princesa BHW', 'Guadalupe BHW', 'Labangon BHW', 'Mambaling BHW'];

function suggestScheduleDate(severity: string): string {
  const now = new Date();
  const daysOffset = severity === 'critical' ? 1 : severity === 'high' ? 2 : 4;
  const d = new Date(now);
  d.setDate(d.getDate() + daysOffset);
  return d.toLocaleDateString('en-US', { month: 'long', day: 'numeric', year: 'numeric' });
}

export default function AdminScheduleScreen({ navigation, route }: Props) {
  const { reportId } = route.params || {};
  const { reports } = useAppSelector((s) => s.reports);
  const { user } = useAppSelector((s) => s.auth);
  const report = reportId ? reports.find((r) => r.id === reportId) : null;

  const [teamIdx, setTeamIdx] = useState(1);
  const [unitIdx, setUnitIdx] = useState(0);
  const [selectedTeam, setSelectedTeam] = useState(TEAMS[1]);
  const [selectedUnit, setSelectedUnit] = useState(BARANGAY_UNITS[0]);
  const [approved, setApproved] = useState(false);
  const [saving, setSaving] = useState(false);

  const severity = report?.severity || 'critical';
  const barangay = report?.location?.barangay || report?.barangay || 'Unknown';

  const aiSchedule = {
    date: suggestScheduleDate(severity),
    time: severity === 'critical' ? '6:00 AM – 2:00 PM' : '7:00 AM – 12:00 PM',
    personnel: severity === 'critical' ? '8–10 (hazmat)' : '4–6 (standard)',
    priority: severity.toUpperCase(),
  };

  const handleApprove = async () => {
    setSaving(true);
    try {
      if (report && user) {
        const userName = `${user.firstName} ${user.lastName}`;
        await updateReportStatus(report.id, 'assigned', user.uid, userName, {
          assignedTeamName: selectedTeam,
          assignedBarangayId: selectedUnit,
          note: `Scheduled ${aiSchedule.date}. ${selectedTeam} + ${selectedUnit}.`,
        });
      }
      setApproved(true);
      setTimeout(() => {
        navigation.goBack();
        Alert.alert('Schedule approved', `Team notified for ${aiSchedule.date} at ${aiSchedule.time.split('–')[0].trim()}`);
      }, 1200);
    } catch {
      Alert.alert('Error', 'Failed to save schedule. Please try again.');
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
    const next = (unitIdx + 1) % BARANGAY_UNITS.length;
    setUnitIdx(next);
    setSelectedUnit(BARANGAY_UNITS[next]);
  };

  return (
    <SafeAreaView style={styles.container}>
      <View style={styles.header}>
        <TouchableOpacity style={styles.backBtn} onPress={() => navigation.goBack()}><BackIcon /></TouchableOpacity>
        <Text style={styles.headerTitle}>Schedule cleanup</Text>
        <View style={{ width: 34 }} />
      </View>

      <ScrollView contentContainerStyle={styles.body} showsVerticalScrollIndicator={false}>
        {/* Severity banner */}
        <View style={[styles.sevBanner, { borderLeftColor: severity === 'critical' ? Colors.critical : Colors.red }]}>
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
              <Text style={[styles.schedVal, k === 'priority' && { color: Colors.critical }]}>{v}</Text>
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
            <Text style={styles.selectorText}>{selectedUnit}</Text>
            <Text style={styles.selectorArrow}>▾</Text>
          </TouchableOpacity>
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
            <Text style={styles.successSub}>{selectedTeam} notified. {aiSchedule.date}, {aiSchedule.time.split('–')[0].trim()}.</Text>
          </View>
        )}
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: Colors.grayBg },
  header: {
    backgroundColor: Colors.white, paddingHorizontal: 16, paddingVertical: 12,
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
    borderBottomWidth: 0.5, borderBottomColor: Colors.border,
  },
  headerTitle: { fontSize: 16, fontWeight: '500', color: Colors.textPrimary },
  backBtn: { width: 34, height: 34, borderRadius: 17, backgroundColor: Colors.grayBg, alignItems: 'center', justifyContent: 'center' },
  body: { padding: 14, gap: 10, paddingBottom: 24 },
  sevBanner: {
    backgroundColor: Colors.white, borderRadius: 12, padding: 11, paddingHorizontal: 14,
    borderWidth: 0.5, borderColor: Colors.border, borderLeftWidth: 3,
  },
  sevTitle: { fontSize: 14, fontWeight: '500', color: Colors.textPrimary },
  sevSub: { fontSize: 11, color: Colors.textMuted, marginTop: 3 },
  sevBadgeRow: { flexDirection: 'row', gap: 5, marginTop: 6 },
  schedCard: { backgroundColor: Colors.white, borderRadius: 14, padding: 12, borderWidth: 0.5, borderColor: Colors.border },
  schedCardTitle: { fontSize: 13, fontWeight: '500', color: Colors.textPrimary, marginBottom: 9 },
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
  actionRow: { flexDirection: 'row', gap: 8 },
  approveBtn: { flex: 1, backgroundColor: Colors.teal, borderRadius: 12, paddingVertical: 11, alignItems: 'center' },
  approveBtnDisabled: { opacity: 0.6 },
  approveBtnText: { fontSize: 12, fontWeight: '500', color: '#fff' },
  modifyBtn: { flex: 1, backgroundColor: Colors.white, borderWidth: 0.5, borderColor: Colors.borderMid, borderRadius: 12, paddingVertical: 11, alignItems: 'center' },
  modifyBtnText: { fontSize: 12, color: Colors.textPrimary },
  successCard: {
    backgroundColor: Colors.white, borderRadius: 14, padding: 16,
    alignItems: 'center', gap: 10, borderWidth: 0.5, borderColor: Colors.border,
  },
  successIcon: { width: 56, height: 56, borderRadius: 28, backgroundColor: Colors.tealLight, alignItems: 'center', justifyContent: 'center' },
  successTitle: { fontSize: 15, fontWeight: '500', color: Colors.textPrimary },
  successSub: { fontSize: 12, color: Colors.textMuted, textAlign: 'center', lineHeight: 18 },
});
