import React, { useEffect, useMemo, useState } from 'react';
import {
  View, Text, ScrollView, TouchableOpacity, StyleSheet, Image, TextInput, ActivityIndicator, Alert,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { NativeStackScreenProps } from '@react-navigation/native-stack';
import { useTheme } from '../../hooks/useTheme';
import { ThemeColors } from '../../constants/theme';
import { RootStackParamList, WasteReport } from '../../types';
import { Badge } from '../../components/common/Badge';
import { BackIcon } from '../../components/common/TabIcons';
import { useAppSelector } from '../../store/hooks';
import { getReportById } from '../../services/reportsService';
import { assignCrewToReport, CrewMember, getAllCrews, getCrewsForBarangay } from '../../services/crewService';
import { formatDateKey, formatHHmm, isValidDateKey, toDateKey } from '../../utils/dates';
import { formatPhone } from '../../utils/phone';

type Props = NativeStackScreenProps<RootStackParamList, 'BarangayAssignCrew'>;

const EQUIPMENT = ['Gloves', 'Boots', 'Trash bags', 'Rakes', 'Truck', 'Boat'];
const STEP_MINUTES = 30;
const DAY_MINUTES = 24 * 60;

const toHHmm = (minutes: number): string =>
  `${String(Math.floor(minutes / 60)).padStart(2, '0')}:${String(minutes % 60).padStart(2, '0')}`;

const toMinutes = (hhmm: string): number => {
  const [h, m] = hhmm.split(':').map(Number);
  return h * 60 + m;
};

const dateKeyInDays = (days: number): string => {
  const d = new Date();
  d.setDate(d.getDate() + days);
  return toDateKey(d);
};

const DATE_CHIPS = [
  { label: 'Today', days: 0 },
  { label: 'Tomorrow', days: 1 },
  { label: 'In 2 days', days: 2 },
];

export default function AssignCrewScreen({ navigation, route }: Props) {
  const { colors } = useTheme();
  const styles = useMemo(() => createStyles(colors), [colors]);
  const { reportId } = route.params;
  const user = useAppSelector((s) => s.auth.user);
  const isAdmin = user?.role === 'admin';

  const [report, setReport] = useState<WasteReport | null>(null);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState('');
  const [crews, setCrews] = useState<CrewMember[]>([]);
  const [crewsLoading, setCrewsLoading] = useState(true);
  const [crewsError, setCrewsError] = useState('');
  const [reloadKey, setReloadKey] = useState(0);

  const [crewId, setCrewId] = useState('');
  const [dateKey, setDateKey] = useState(dateKeyInDays(1));
  const [startMin, setStartMin] = useState(8 * 60);
  const [endMin, setEndMin] = useState(10 * 60);
  const [workers, setWorkers] = useState(0);
  const [notes, setNotes] = useState('');
  const [equipment, setEquipment] = useState<string[]>([]);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setLoadError('');
    getReportById(reportId)
      .then((r) => { if (!cancelled) setReport(r); })
      .catch((err: Error) => { if (!cancelled) setLoadError(err.message || 'Could not load this report.'); })
      .finally(() => { if (!cancelled) setLoading(false); });
    return () => { cancelled = true; };
  }, [reportId, reloadKey]);

  const userRole = user?.role;
  const userBarangayId = user?.barangayId ?? '';
  useEffect(() => {
    if (userRole !== 'barangay' && userRole !== 'admin') return;
    let cancelled = false;
    setCrewsLoading(true);
    setCrewsError('');
    const load = userRole === 'admin' ? getAllCrews() : getCrewsForBarangay(userBarangayId);
    load
      .then((list) => { if (!cancelled) setCrews(list); })
      .catch((err: Error) => { if (!cancelled) setCrewsError(err.message || 'Could not load the crews.'); })
      .finally(() => { if (!cancelled) setCrewsLoading(false); });
    return () => { cancelled = true; };
  }, [userRole, userBarangayId, reloadKey]);

  const barangayName = report?.location?.barangay || report?.barangay || user?.barangay || 'your barangay';
  const reportNumber = report?.reportNumber ?? report?.id.slice(0, 12) ?? '';
  const reportBarangayId = report?.barangayId ?? report?.location?.barangayId;
  const todayKey = toDateKey(new Date());

  const header = (
    <View style={styles.header}>
      <TouchableOpacity style={styles.backBtn} onPress={() => navigation.goBack()} accessibilityLabel="Go back">
        <BackIcon size={18} />
      </TouchableOpacity>
      <Text style={styles.headerTitle}>Assign a cleanup crew</Text>
      <View style={{ width: 38 }} />
    </View>
  );

  const message = (title: string, body: string, retry?: () => void) => (
    <SafeAreaView style={styles.container}>
      {header}
      <View style={styles.center}>
        <Text style={styles.messageTitle}>{title}</Text>
        <Text style={styles.messageBody}>{body}</Text>
        {retry && (
          <TouchableOpacity style={styles.retryBtn} onPress={retry}>
            <Text style={styles.retryText}>Try again</Text>
          </TouchableOpacity>
        )}
      </View>
    </SafeAreaView>
  );

  if (loading) {
    return (
      <SafeAreaView style={styles.container}>
        {header}
        <View style={styles.center}><ActivityIndicator size="small" color={colors.brgy} /></View>
      </SafeAreaView>
    );
  }
  if (loadError) return message('Could not load this report', loadError, () => setReloadKey((k) => k + 1));
  if (!report) return message('Report not found', 'This report may have been removed.');

  const allowed = isAdmin || (user?.role === 'barangay' && !!user.barangayId && user.barangayId === reportBarangayId);
  if (!user || !allowed) {
    return message('Not your barangay', 'Only the barangay official of this report, or the Admin, can assign a crew.');
  }
  if (report.status === 'pending') return message('Verify the report first', 'Verify the report first, then you can assign a cleanup crew.');
  if (report.status !== 'verified' && report.status !== 'assigned') {
    return message('Nothing to assign', `This report is already ${report.status.replace('_', ' ')}.`);
  }

  const selectedCrew = crews.find((c) => c.uid === crewId);
  const dateOk = isValidDateKey(dateKey) && dateKey.trim() >= todayKey;
  const timeOk = endMin > startMin;
  const canSubmit = !!selectedCrew && dateOk && timeOk && !saving;
  const topWaste = report.aiAnalysis?.wasteTypes?.[0]?.label;
  const address = report.location?.address || report.location?.barangay || report.barangay || 'Unknown location';

  const toggleEquipment = (item: string) =>
    setEquipment((cur) => (cur.includes(item) ? cur.filter((e) => e !== item) : [...cur, item]));

  const stepStart = (delta: number) => {
    const next = Math.min(Math.max(startMin + delta, 0), DAY_MINUTES - STEP_MINUTES);
    setStartMin(next);
    if (endMin <= next) setEndMin(Math.min(next + STEP_MINUTES, DAY_MINUTES - 1));
  };
  const stepEnd = (delta: number) => {
    setEndMin(Math.min(Math.max(endMin + delta, 0), DAY_MINUTES - STEP_MINUTES));
  };

  const submit = () => {
    if (!selectedCrew) { Alert.alert('Pick a crew', 'Choose which crew will do the cleanup.'); return; }
    if (!isValidDateKey(dateKey)) { Alert.alert('Check the date', 'Type the date like 2026-10-25.'); return; }
    if (dateKey.trim() < todayKey) { Alert.alert('Check the date', 'The date cannot be in the past.'); return; }
    if (!timeOk) { Alert.alert('Check the time', 'The end time must be after the start time.'); return; }

    const date = dateKey.trim();
    Alert.alert(
      'Assign this crew?',
      `Assign ${selectedCrew.name} to ${reportNumber} on ${formatDateKey(date)}? They'll be notified.`,
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Assign crew',
          onPress: async () => {
            if (saving) return;
            setSaving(true);
            try {
              await assignCrewToReport({
                report,
                crew: selectedCrew,
                assigner: user,
                scheduledDate: date,
                startTime: toHHmm(startMin),
                endTime: toHHmm(endMin),
                notes: notes.trim() || undefined,
                equipmentNeeded: equipment.length > 0 ? equipment : undefined,
                personnelCount: workers > 0 ? workers : undefined,
              });
              setSaving(false);
              Alert.alert('Crew assigned', `${selectedCrew.name} has been notified.`);
              if (isAdmin) navigation.goBack();
              else navigation.replace('BarangayCrewTasks');
            } catch (err) {
              setSaving(false);
              Alert.alert('Could not assign the crew', err instanceof Error ? err.message : 'Please try again.');
            }
          },
        },
      ],
    );
  };

  const stepper = (label: string, value: string, onMinus: () => void, onPlus: () => void) => (
    <View style={styles.stepperRow}>
      <Text style={styles.stepperLabel}>{label}</Text>
      <View style={styles.stepper}>
        <TouchableOpacity style={styles.stepBtn} onPress={onMinus} disabled={saving} accessibilityLabel={`Less ${label}`}>
          <Text style={styles.stepBtnText}>-</Text>
        </TouchableOpacity>
        <Text style={styles.stepValue}>{value}</Text>
        <TouchableOpacity style={styles.stepBtn} onPress={onPlus} disabled={saving} accessibilityLabel={`More ${label}`}>
          <Text style={styles.stepBtnText}>+</Text>
        </TouchableOpacity>
      </View>
    </View>
  );

  return (
    <SafeAreaView style={styles.container}>
      {header}
      <ScrollView contentContainerStyle={styles.body} showsVerticalScrollIndicator={false} keyboardShouldPersistTaps="handled">
        <View style={styles.card}>
          <View style={styles.summaryRow}>
            {report.photoURL ? (
              <Image source={{ uri: report.photoURL }} style={styles.photo} resizeMode="cover" />
            ) : (
              <View style={[styles.photo, styles.photoEmpty]}><Text style={styles.hint}>No photo</Text></View>
            )}
            <View style={{ flex: 1, gap: 4 }}>
              <Text style={styles.summaryTitle}>{reportNumber}</Text>
              <View style={{ alignSelf: 'flex-start' }}><Badge variant={report.severity} /></View>
              <Text style={styles.muted} numberOfLines={2}>{address}</Text>
              {!!topWaste && <Text style={styles.muted}>{topWaste}</Text>}
            </View>
          </View>
          {report.status === 'assigned' && (
            <Text style={styles.noteBanner}>This report already has a crew. Pick another crew only if the first one declined.</Text>
          )}
        </View>

        <Text style={styles.sectionTitle}>Choose a crew</Text>
        {crewsLoading ? (
          <View style={styles.card}><ActivityIndicator size="small" color={colors.brgy} /></View>
        ) : crewsError ? (
          <View style={styles.card}>
            <Text style={styles.muted}>{crewsError}</Text>
            <TouchableOpacity style={styles.retryBtn} onPress={() => setReloadKey((k) => k + 1)}>
              <Text style={styles.retryText}>Try again</Text>
            </TouchableOpacity>
          </View>
        ) : crews.length === 0 ? (
          <View style={styles.card}>
            <Text style={styles.muted}>
              {`No cleanup crews in ${isAdmin ? 'the city' : barangayName} yet. Ask the Super Admin to create a crew account. A crew without smartphones can still have an account; you record their work for them.`}
            </Text>
          </View>
        ) : (
          crews.map((c) => {
            const on = c.uid === crewId;
            return (
              <TouchableOpacity
                key={c.uid}
                style={[styles.crewCard, on && styles.crewCardOn]}
                onPress={() => setCrewId(c.uid)}
                disabled={saving}
                activeOpacity={0.85}
                accessibilityRole="radio"
                accessibilityState={{ selected: on }}
              >
                <View style={[styles.radio, on && styles.radioOn]}>{on && <View style={styles.radioDot} />}</View>
                <View style={{ flex: 1 }}>
                  <Text style={styles.crewName}>{c.name}</Text>
                  <Text style={styles.muted}>{c.phone ? formatPhone(c.phone) : 'No number'}</Text>
                  {isAdmin && !!c.barangay && <Text style={styles.hint}>{c.barangay}</Text>}
                </View>
              </TouchableOpacity>
            );
          })
        )}

        <Text style={styles.sectionTitle}>When</Text>
        <View style={styles.card}>
          <View style={styles.chipRow}>
            {DATE_CHIPS.map((c) => {
              const key = dateKeyInDays(c.days);
              const on = dateKey === key;
              return (
                <TouchableOpacity key={c.label} style={[styles.chip, on && styles.chipOn]} onPress={() => setDateKey(key)} disabled={saving}>
                  <Text style={[styles.chipText, on && styles.chipTextOn]}>{c.label}</Text>
                </TouchableOpacity>
              );
            })}
          </View>
          <Text style={styles.fieldLabel}>Or type a date (YYYY-MM-DD)</Text>
          <TextInput
            style={styles.input}
            value={dateKey}
            onChangeText={setDateKey}
            placeholder="2026-10-25"
            placeholderTextColor={colors.textHint}
            keyboardType="numbers-and-punctuation"
            maxLength={10}
            editable={!saving}
          />
          {!dateOk && <Text style={styles.error}>{isValidDateKey(dateKey) ? 'The date cannot be in the past.' : 'Type the date like 2026-10-25.'}</Text>}
          {dateOk && <Text style={styles.hint}>{formatDateKey(dateKey.trim())}</Text>}

          {stepper('Start', formatHHmm(toHHmm(startMin)), () => stepStart(-STEP_MINUTES), () => stepStart(STEP_MINUTES))}
          {stepper('End', formatHHmm(toHHmm(endMin)), () => stepEnd(-STEP_MINUTES), () => stepEnd(STEP_MINUTES))}
          {!timeOk && <Text style={styles.error}>The end time must be after the start time.</Text>}
          {stepper(
            'Workers (optional)',
            workers === 0 ? 'Not set' : String(workers),
            () => setWorkers((w) => Math.max(0, w - 1)),
            () => setWorkers((w) => Math.min(50, w + 1)),
          )}
        </View>

        <Text style={styles.sectionTitle}>Equipment (optional)</Text>
        <View style={[styles.card, styles.chipRow]}>
          {EQUIPMENT.map((item) => {
            const on = equipment.includes(item);
            return (
              <TouchableOpacity key={item} style={[styles.chip, on && styles.chipOn]} onPress={() => toggleEquipment(item)} disabled={saving}>
                <Text style={[styles.chipText, on && styles.chipTextOn]}>{item}</Text>
              </TouchableOpacity>
            );
          })}
        </View>

        <Text style={styles.sectionTitle}>Notes for the crew (optional)</Text>
        <TextInput
          style={[styles.input, styles.notes]}
          value={notes}
          onChangeText={setNotes}
          placeholder="e.g. Enter through the side street. Ask for the barangay captain."
          placeholderTextColor={colors.textHint}
          multiline
          textAlignVertical="top"
          editable={!saving}
        />

        <TouchableOpacity style={[styles.primaryBtn, !canSubmit && styles.primaryBtnOff]} onPress={submit} disabled={!canSubmit}>
          {saving ? <ActivityIndicator size="small" color="#fff" /> : <Text style={styles.primaryText}>Assign crew</Text>}
        </TouchableOpacity>
      </ScrollView>
    </SafeAreaView>
  );
}

const createStyles = (Colors: ThemeColors) => StyleSheet.create({
  container: { flex: 1, backgroundColor: Colors.grayBg },
  header: {
    backgroundColor: Colors.white, paddingHorizontal: 16, paddingVertical: 12,
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
  },
  headerTitle: { fontSize: 16, fontWeight: '500', color: Colors.textPrimary },
  backBtn: { width: 38, height: 38, borderRadius: 19, backgroundColor: Colors.grayBg, alignItems: 'center', justifyContent: 'center' },
  body: { padding: 16, gap: 12, paddingBottom: 32 },
  center: { flex: 1, alignItems: 'center', justifyContent: 'center', padding: 24, gap: 10 },
  messageTitle: { fontSize: 16, fontWeight: '600', color: Colors.textPrimary, textAlign: 'center' },
  messageBody: { fontSize: 13, color: Colors.textMuted, textAlign: 'center', lineHeight: 19 },
  retryBtn: { minHeight: 44, paddingHorizontal: 20, borderRadius: 12, backgroundColor: Colors.brgyLight, alignItems: 'center', justifyContent: 'center', marginTop: 6 },
  retryText: { fontSize: 13, fontWeight: '600', color: Colors.brgy },
  card: {
    backgroundColor: Colors.white, borderRadius: 16, padding: 14, gap: 10,
    shadowColor: Colors.shadow, shadowOffset: { width: 0, height: 2 }, shadowOpacity: 0.05, shadowRadius: 8, elevation: 1,
  },
  summaryRow: { flexDirection: 'row', gap: 12 },
  photo: { width: 84, height: 84, borderRadius: 12, backgroundColor: Colors.grayBg },
  photoEmpty: { alignItems: 'center', justifyContent: 'center' },
  summaryTitle: { fontSize: 14, fontWeight: '600', color: Colors.textPrimary },
  noteBanner: { fontSize: 12, color: Colors.amberText, backgroundColor: Colors.amberBg, borderRadius: 10, padding: 10, lineHeight: 17 },
  sectionTitle: { fontSize: 14, fontWeight: '600', color: Colors.textPrimary, marginTop: 4 },
  muted: { fontSize: 12, color: Colors.textMuted, lineHeight: 18 },
  hint: { fontSize: 11, color: Colors.textHint },
  error: { fontSize: 12, color: Colors.redText },
  crewCard: {
    flexDirection: 'row', alignItems: 'center', gap: 12, minHeight: 56, padding: 14, borderRadius: 16,
    backgroundColor: Colors.white, borderWidth: 1.5, borderColor: 'transparent',
    shadowColor: Colors.shadow, shadowOffset: { width: 0, height: 2 }, shadowOpacity: 0.05, shadowRadius: 8, elevation: 1,
  },
  crewCardOn: { borderColor: Colors.brgy, backgroundColor: Colors.brgyLight },
  crewName: { fontSize: 14, fontWeight: '600', color: Colors.textPrimary },
  radio: { width: 22, height: 22, borderRadius: 11, borderWidth: 2, borderColor: Colors.grayMid, alignItems: 'center', justifyContent: 'center' },
  radioOn: { borderColor: Colors.brgy },
  radioDot: { width: 10, height: 10, borderRadius: 5, backgroundColor: Colors.brgy },
  chipRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  chip: { minHeight: 44, paddingHorizontal: 16, borderRadius: 22, backgroundColor: Colors.grayBg, alignItems: 'center', justifyContent: 'center' },
  chipOn: { backgroundColor: Colors.brgy },
  chipText: { fontSize: 13, fontWeight: '500', color: Colors.textPrimary },
  chipTextOn: { color: '#fff' },
  fieldLabel: { fontSize: 12, color: Colors.textMuted },
  input: {
    backgroundColor: Colors.white, borderRadius: 12, paddingHorizontal: 12, paddingVertical: 12, minHeight: 44,
    fontSize: 14, color: Colors.textPrimary,
    shadowColor: Colors.shadow, shadowOffset: { width: 0, height: 2 }, shadowOpacity: 0.05, shadowRadius: 8, elevation: 1,
  },
  notes: { minHeight: 90 },
  stepperRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  stepperLabel: { fontSize: 13, color: Colors.textPrimary },
  stepper: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  stepBtn: { width: 44, height: 44, borderRadius: 22, backgroundColor: Colors.grayBg, alignItems: 'center', justifyContent: 'center' },
  stepBtnText: { fontSize: 20, fontWeight: '600', color: Colors.textPrimary },
  stepValue: { minWidth: 74, textAlign: 'center', fontSize: 14, fontWeight: '600', color: Colors.textPrimary },
  primaryBtn: { minHeight: 50, borderRadius: 14, backgroundColor: Colors.brgy, alignItems: 'center', justifyContent: 'center', marginTop: 6 },
  primaryBtnOff: { opacity: 0.5 },
  primaryText: { fontSize: 15, fontWeight: '600', color: '#fff' },
});
