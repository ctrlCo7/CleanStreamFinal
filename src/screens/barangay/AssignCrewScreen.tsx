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
import { checkScheduleConflicts, proposeCleanup, CrewMember, getCrewsForBarangay, reportBarangayId as barangayOfReport } from '../../services/crewService';
import { describeConflict } from '../../services/scheduleConflicts';
import { addDaysKey, phDateKey } from '../../utils/phTime';
import { formatDateKey, formatHHmm, isValidDateKey } from '../../utils/dates';
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

// Philippine dates (UTC+8), whatever the phone's time zone.
const dateKeyInDays = (days: number): string => addDaysKey(phDateKey(), days);

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
      .catch((err: Error & { code?: string }) => {
        if (cancelled) return;
        // The rules hide other barangays' reports from officials.
        setLoadError(err.code === 'permission-denied'
          ? 'This report belongs to another barangay. Only its own barangay can view it and take action.'
          : err.message || 'Could not load this report.');
      })
      .finally(() => { if (!cancelled) setLoading(false); });
    return () => { cancelled = true; };
  }, [reportId, reloadKey]);

  const userRole = user?.role;
  // Officials and the Admin alike only see the crews of the report's own barangay: a
  // cleanup is never handed to another barangay.
  const crewBarangayId = report ? barangayOfReport(report) : undefined;
  useEffect(() => {
    if ((userRole !== 'barangay' && userRole !== 'admin') || !crewBarangayId) return;
    let cancelled = false;
    setCrewsLoading(true);
    setCrewsError('');
    getCrewsForBarangay(crewBarangayId)
      .then((list) => { if (!cancelled) setCrews(list); })
      .catch((err: Error) => { if (!cancelled) setCrewsError(err.message || 'Could not load the crews.'); })
      .finally(() => { if (!cancelled) setCrewsLoading(false); });
    return () => { cancelled = true; };
  }, [userRole, crewBarangayId, reloadKey]);

  const barangayName = report?.location?.barangay || report?.barangay || user?.barangay || 'your barangay';
  const reportNumber = report?.reportNumber ?? report?.id.slice(0, 12) ?? '';
  const reportBarangayId = report?.barangayId ?? report?.location?.barangayId;
  // "Today" in the Philippines (UTC+8), whatever the phone's own time zone.
  const todayKey = phDateKey();

  // Live conflict check while the schedule is being filled in: the same check that runs on
  // sending, so a clash is visible before it gets declined.
  const [preview, setPreview] = useState<{ conflicts: string[]; suggestion: { scheduledDate: string; startTime: string; endTime: string } | null } | null>(null);
  useEffect(() => {
    const crew = crews.find((c) => c.uid === crewId);
    if (!report || !crew || !reportBarangayId || !isValidDateKey(dateKey) || endMin <= startMin) { setPreview(null); return undefined; }
    let cancelled = false;
    const id = setTimeout(() => {
      checkScheduleConflicts(reportBarangayId, {
        scheduledDate: dateKey.trim(), startTime: toHHmm(startMin), endTime: toHHmm(endMin),
        assignedTeamId: crew.uid, assignedTeamName: crew.name, location: report.location, equipmentNeeded: equipment,
      })
        .then(({ conflicts, suggestion }) => { if (!cancelled) setPreview({ conflicts: conflicts.map(describeConflict), suggestion }); })
        .catch((e) => { console.warn('[Assign] Conflict preview failed (checked again on sending):', e); if (!cancelled) setPreview(null); });
    }, 400);
    return () => { cancelled = true; clearTimeout(id); };
  }, [report, crews, crewId, reportBarangayId, dateKey, startMin, endMin, equipment]);

  const header = (
    <View style={styles.header}>
      <TouchableOpacity style={styles.backBtn} onPress={() => navigation.goBack()} accessibilityLabel="Go back">
        <BackIcon size={18} />
      </TouchableOpacity>
      <Text style={styles.headerTitle}>{isAdmin ? 'Schedule a cleanup' : 'Propose a cleanup schedule'}</Text>
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
    return message('Not your barangay', 'Only this report’s barangay officials or Barangay Captain can assign a crew.');
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
    const when = `${formatDateKey(date)}, ${formatHHmm(toHHmm(startMin))}–${formatHHmm(toHHmm(endMin))}`;
    Alert.alert(
      isAdmin ? 'Schedule this cleanup?' : 'Send for approval?',
      isAdmin
        ? `${selectedCrew.name} for ${reportNumber} on ${when}. It's checked for clashes with approved cleanups first.`
        : `${selectedCrew.name} for ${reportNumber} on ${when}. It's checked for clashes automatically, then sent to the Barangay Captain for approval.`,
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: isAdmin ? 'Schedule' : 'Send for approval',
          onPress: async () => {
            if (saving) return;
            setSaving(true);
            try {
              const result = await proposeCleanup({
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
              if (result.outcome === 'declined') {
                // Declined automatically: say why, show the clashing schedule and a free time.
                const s = result.suggestion;
                Alert.alert(
                  'Declined automatically: schedule conflict',
                  `${result.conflicts.map((c) => c.message).join('\n\n')}${s ? `\n\nA free time: ${formatDateKey(s.scheduledDate)}, ${formatHHmm(s.startTime)}–${formatHHmm(s.endTime)}.` : ''}\n\nPropose a different schedule.`,
                  s ? [
                    { text: 'Close', style: 'cancel' },
                    { text: 'Use the free time', onPress: () => { setDateKey(s.scheduledDate); setStartMin(toMinutes(s.startTime)); setEndMin(toMinutes(s.endTime)); } },
                  ] : undefined,
                );
                return;
              }
              Alert.alert(
                result.outcome === 'approved' ? 'Cleanup scheduled' : 'Sent for approval',
                result.outcome === 'approved'
                  ? `${selectedCrew.name} has been notified.`
                  : 'The Barangay Captain has been asked to approve it. You\'ll be notified of the decision.',
              );
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
        <Text style={styles.hint}>Only {barangayName}'s own crews are listed. A report's cleanup stays in its barangay.</Text>
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
              {`No cleanup crews in ${barangayName} yet. Ask the Super Admin to create a crew account for ${barangayName}. A crew without smartphones can still have an account; you record their work for them.`}
            </Text>
            <TouchableOpacity style={styles.retryBtn} onPress={() => navigation.navigate('RequestCrew')} accessibilityRole="button">
              <Text style={styles.retryText}>Request a cleanup team account</Text>
            </TouchableOpacity>
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
            selectedCrew?.crewSize ? `Workers (crew has ${selectedCrew.crewSize})` : 'Workers (optional)',
            workers === 0 ? 'Not set' : String(workers),
            () => setWorkers((w) => Math.max(0, w - 1)),
            () => setWorkers((w) => Math.min(selectedCrew?.crewSize ?? 50, w + 1)),
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

        {preview && preview.conflicts.length > 0 && (
          <View style={styles.conflictCard}>
            <Text style={styles.conflictTitle}>⚠️ This time clashes with an approved cleanup</Text>
            {preview.conflicts.map((m) => <Text key={m} style={styles.conflictText}>{m}</Text>)}
            <Text style={styles.conflictText}>If you send it like this, it will be declined automatically.</Text>
            {preview.suggestion && (
              <TouchableOpacity
                style={styles.conflictBtn}
                onPress={() => {
                  const s = preview.suggestion!;
                  setDateKey(s.scheduledDate); setStartMin(toMinutes(s.startTime)); setEndMin(toMinutes(s.endTime));
                }}
                disabled={saving}
              >
                <Text style={styles.conflictBtnText}>
                  Use the free time: {formatDateKey(preview.suggestion.scheduledDate)}, {formatHHmm(preview.suggestion.startTime)}–{formatHHmm(preview.suggestion.endTime)}
                </Text>
              </TouchableOpacity>
            )}
          </View>
        )}
        {preview && preview.conflicts.length === 0 && (
          <Text style={styles.okText}>✓ No clash with approved cleanups at this time.</Text>
        )}

        <TouchableOpacity style={[styles.primaryBtn, !canSubmit && styles.primaryBtnOff]} onPress={submit} disabled={!canSubmit}>
          {saving ? <ActivityIndicator size="small" color="#fff" /> : (
            <Text style={styles.primaryText}>{isAdmin ? 'Schedule cleanup' : 'Send to the Captain for approval'}</Text>
          )}
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
  headerTitle: { fontSize: 17, fontWeight: '700', color: Colors.textPrimary },
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
  conflictCard: { backgroundColor: Colors.redBg, borderRadius: 12, padding: 12, gap: 6 },
  conflictTitle: { fontSize: 13, fontWeight: '700', color: Colors.redText },
  conflictText: { fontSize: 12, color: Colors.redText, lineHeight: 17 },
  conflictBtn: { marginTop: 4, backgroundColor: Colors.surface, borderRadius: 10, paddingVertical: 9, paddingHorizontal: 10 },
  conflictBtnText: { fontSize: 12, fontWeight: '700', color: Colors.tealDark, textAlign: 'center' },
  okText: { fontSize: 12, color: Colors.tealDark, fontWeight: '600' },
  sectionTitle: { fontSize: 14, fontWeight: '600', color: Colors.textPrimary, marginTop: 4 },
  muted: { fontSize: 12, color: Colors.textMuted, lineHeight: 18 },
  hint: { fontSize: 12, color: Colors.textHint },
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
