import React, { useMemo, useState } from 'react';
import {
  View, Text, ScrollView, TouchableOpacity, StyleSheet, TextInput, ActivityIndicator, Alert,
  KeyboardAvoidingView, Platform,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { NativeStackScreenProps } from '@react-navigation/native-stack';
import { useTheme } from '../../hooks/useTheme';
import { ThemeColors } from '../../constants/theme';
import { RootStackParamList } from '../../types';
import { BackIcon } from '../../components/common/TabIcons';
import { useAppSelector } from '../../store/hooks';
import { createCleanupEvent } from '../../services/cleanupEventService';
import { getNotificationRecipientsByRole, sendBulkNotification } from '../../services/notificationService';
import { CEBU_BARANGAYS } from '../../services/locationService';
import { fullName } from '../../services/crewService';
import { formatDateKey, formatHHmm, isValidDateKey, toDateKey } from '../../utils/dates';

type Props = NativeStackScreenProps<RootStackParamList, 'BarangayCreateEvent'>;

const BRING_OPTIONS = ['Gloves', 'Boots', 'Water', 'Hat', 'Trash bags', 'Rakes', 'Face mask'];
const STEP_MINUTES = 30;

const addDays = (d: Date, n: number): Date => new Date(d.getFullYear(), d.getMonth(), d.getDate() + n);

// Days from d until the coming Saturday (0 when d is a Saturday).
const saturdayOffset = (d: Date): number => (6 - d.getDay() + 7) % 7;

const fromMinutes = (mins: number): string =>
  `${String(Math.floor(mins / 60)).padStart(2, '0')}:${String(mins % 60).padStart(2, '0')}`;

export default function CreateEventScreen({ navigation }: Props) {
  const { colors } = useTheme();
  const styles = useMemo(() => createStyles(colors), [colors]);
  const user = useAppSelector((s) => s.auth.user);

  const today = useMemo(() => new Date(), []);
  const todayKey = toDateKey(today);
  const chips = useMemo(() => {
    const sat = saturdayOffset(today);
    return [
      { label: 'Today', key: toDateKey(today) },
      { label: 'Tomorrow', key: toDateKey(addDays(today, 1)) },
      { label: 'This Saturday', key: toDateKey(addDays(today, sat)) },
      { label: 'Next Saturday', key: toDateKey(addDays(today, sat + 7)) },
    ];
  }, [today]);

  const [title, setTitle] = useState('');
  const [description, setDescription] = useState('');
  const [dateKey, setDateKey] = useState('');
  const [startMin, setStartMin] = useState(7 * 60);
  const [endMin, setEndMin] = useState(10 * 60);
  const [place, setPlace] = useState('');
  const [needed, setNeeded] = useState(20);
  const [bring, setBring] = useState<string[]>([]);
  const [saving, setSaving] = useState(false);

  const barangayInfo = CEBU_BARANGAYS.find((b) => b.id === user?.barangayId);

  if (!user || user.role !== 'barangay' || !user.barangayId) {
    return (
      <SafeAreaView style={styles.container}>
        <Header title="New cleanup event" styles={styles} onBack={() => navigation.goBack()} />
        <View style={styles.centerBox}>
          <Text style={styles.centerText}>
            Only barangay officials with a barangay on their profile can plan a cleanup event.
          </Text>
        </View>
      </SafeAreaView>
    );
  }
  const barangayId = user.barangayId;

  const dateParsed = isValidDateKey(dateKey);
  const dateValid = dateParsed && dateKey >= todayKey;
  let dateError = '';
  if (dateKey.length > 0 && !dateValid) {
    dateError = dateParsed ? 'That date has already passed.' : 'Use the format YYYY-MM-DD, for example 2026-11-07.';
  }
  const timeValid = endMin > startMin;
  const canSubmit = title.trim().length > 0 && place.trim().length > 0 && dateValid && timeValid && !saving;

  const toggleBring = (item: string) =>
    setBring((cur) => (cur.includes(item) ? cur.filter((x) => x !== item) : [...cur, item]));

  const stepStart = (delta: number) => setStartMin((m) => Math.min(23 * 60, Math.max(0, m + delta)));
  const stepEnd = (delta: number) => setEndMin((m) => Math.min(23 * 60 + 30, Math.max(0, m + delta)));
  const stepNeeded = (delta: number) => setNeeded((n) => Math.min(500, Math.max(1, n + delta)));

  const publish = () => {
    if (!canSubmit) return;
    const barangayName = user.barangay || barangayInfo?.name || 'your barangay';
    const start = fromMinutes(startMin);
    const end = fromMinutes(endMin);
    const cleanTitle = title.trim();
    const cleanPlace = place.trim();

    const create = async () => {
      setSaving(true);
      try {
        const eventId = await createCleanupEvent({
          title: cleanTitle,
          description: description.trim(),
          barangayId,
          barangay: barangayName,
          organizedBy: user.uid,
          organizerName: fullName(user),
          location: {
            latitude: barangayInfo?.lat ?? 10.3157,
            longitude: barangayInfo?.lng ?? 123.8854,
            timestamp: Date.now(),
            barangay: barangayName,
            barangayId,
          },
          locationAddress: cleanPlace,
          eventDate: dateKey,
          startTime: start,
          endTime: end,
          maxParticipants: needed,
          volunteersNeeded: needed,
          status: 'upcoming',
          tags: [],
          requirements: bring,
          targetWasteTypes: [],
        });

        // The event is already saved; failing to notify residents must not undo or hide that.
        try {
          const ids = await getNotificationRecipientsByRole(['citizen'], barangayId);
          const body = `${cleanTitle}, ${formatDateKey(dateKey)} ${formatHHmm(start)} at ${cleanPlace}. Tap to join.`;
          for (let i = 0; i < ids.length; i += 400) {
            await sendBulkNotification(
              ids.slice(i, i + 400),
              `New cleanup in ${barangayName}`,
              body,
              'event_reminder',
              { eventId },
            );
          }
        } catch {
          // Residents can still find the event in their list.
        }

        navigation.replace('BarangayEventDetail', { eventId });
      } catch (err) {
        setSaving(false);
        Alert.alert('Could not publish the event', err instanceof Error ? err.message : 'Please try again.');
      }
    };

    Alert.alert(
      'Publish this event?',
      `Everyone registered in ${barangayName} will be notified.`,
      [
        { text: 'Not yet', style: 'cancel' },
        { text: 'Publish event', onPress: create },
      ],
    );
  };

  return (
    <SafeAreaView style={styles.container}>
      <Header title="New cleanup event" styles={styles} onBack={() => navigation.goBack()} />
      <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
        <ScrollView contentContainerStyle={styles.body} keyboardShouldPersistTaps="handled" showsVerticalScrollIndicator={false}>
          <View style={styles.card}>
            <Text style={styles.label}>Event name</Text>
            <TextInput
              style={styles.input}
              value={title}
              onChangeText={setTitle}
              placeholder="Example: Creek clean-up day"
              placeholderTextColor={colors.textHint}
              maxLength={80}
            />
            <Text style={styles.label}>What will happen? (optional)</Text>
            <TextInput
              style={[styles.input, styles.multiline]}
              value={description}
              onChangeText={setDescription}
              placeholder="Tell residents what to expect"
              placeholderTextColor={colors.textHint}
              multiline
              maxLength={500}
            />
          </View>

          <View style={styles.card}>
            <Text style={styles.sectionTitle}>When</Text>
            <View style={styles.chipRow}>
              {chips.map((c) => (
                <TouchableOpacity
                  key={c.label}
                  style={[styles.chip, dateKey === c.key && styles.chipOn]}
                  onPress={() => setDateKey(c.key)}
                >
                  <Text style={[styles.chipText, dateKey === c.key && styles.chipTextOn]}>{c.label}</Text>
                </TouchableOpacity>
              ))}
            </View>
            <Text style={styles.label}>Or type a date (YYYY-MM-DD)</Text>
            <TextInput
              style={styles.input}
              value={dateKey}
              onChangeText={setDateKey}
              placeholder="2026-11-07"
              placeholderTextColor={colors.textHint}
              autoCapitalize="none"
              keyboardType="numbers-and-punctuation"
              maxLength={10}
            />
            {dateError ? <Text style={styles.errorText}>{dateError}</Text> : null}
            {dateValid ? <Text style={styles.hintText}>{formatDateKey(dateKey)}</Text> : null}

            <Stepper
              label="Starts at"
              value={formatHHmm(fromMinutes(startMin))}
              onMinus={() => stepStart(-STEP_MINUTES)}
              onPlus={() => stepStart(STEP_MINUTES)}
              styles={styles}
            />
            <Stepper
              label="Ends at"
              value={formatHHmm(fromMinutes(endMin))}
              onMinus={() => stepEnd(-STEP_MINUTES)}
              onPlus={() => stepEnd(STEP_MINUTES)}
              styles={styles}
            />
            {!timeValid ? <Text style={styles.errorText}>The end time must be after the start time.</Text> : null}
          </View>

          <View style={styles.card}>
            <Text style={styles.sectionTitle}>Where</Text>
            <Text style={styles.label}>Meeting place</Text>
            <TextInput
              style={styles.input}
              value={place}
              onChangeText={setPlace}
              placeholder="Example: Barangay hall, front gate"
              placeholderTextColor={colors.textHint}
              maxLength={120}
            />
            <Text style={styles.hintText}>Barangay {user.barangay || barangayInfo?.name}</Text>
          </View>

          <View style={styles.card}>
            <Text style={styles.sectionTitle}>Volunteers</Text>
            <Stepper
              label="Volunteers needed"
              value={String(needed)}
              onMinus={() => stepNeeded(needed > 20 ? -5 : -1)}
              onPlus={() => stepNeeded(needed >= 20 ? 5 : 1)}
              styles={styles}
            />
            <Text style={styles.label}>What to bring</Text>
            <View style={styles.chipRow}>
              {BRING_OPTIONS.map((item) => {
                const on = bring.includes(item);
                return (
                  <TouchableOpacity key={item} style={[styles.chip, on && styles.chipOn]} onPress={() => toggleBring(item)}>
                    <Text style={[styles.chipText, on && styles.chipTextOn]}>{item}</Text>
                  </TouchableOpacity>
                );
              })}
            </View>
          </View>

          <TouchableOpacity
            style={[styles.primaryBtn, !canSubmit && styles.primaryBtnOff]}
            onPress={publish}
            disabled={!canSubmit}
            activeOpacity={0.85}
          >
            {saving ? <ActivityIndicator size="small" color="#fff" /> : <Text style={styles.primaryBtnText}>Publish event</Text>}
          </TouchableOpacity>
          {!canSubmit && !saving ? (
            <Text style={styles.hintCenter}>Add a name, a date and a meeting place to publish.</Text>
          ) : null}
        </ScrollView>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

function Header({ title, onBack, styles }: { title: string; onBack: () => void; styles: ReturnType<typeof createStyles> }) {
  return (
    <View style={styles.header}>
      <TouchableOpacity style={styles.backBtn} onPress={onBack}><BackIcon size={18} /></TouchableOpacity>
      <Text style={styles.headerTitle}>{title}</Text>
      <View style={{ width: 38 }} />
    </View>
  );
}

function Stepper({ label, value, onMinus, onPlus, styles }: {
  label: string; value: string; onMinus: () => void; onPlus: () => void; styles: ReturnType<typeof createStyles>;
}) {
  return (
    <View style={styles.stepRow}>
      <Text style={styles.stepLabel}>{label}</Text>
      <View style={styles.stepControls}>
        <TouchableOpacity style={styles.stepBtn} onPress={onMinus}><Text style={styles.stepBtnText}>-</Text></TouchableOpacity>
        <Text style={styles.stepValue}>{value}</Text>
        <TouchableOpacity style={styles.stepBtn} onPress={onPlus}><Text style={styles.stepBtnText}>+</Text></TouchableOpacity>
      </View>
    </View>
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
  body: { padding: 16, gap: 14, paddingBottom: 32 },
  centerBox: { flex: 1, alignItems: 'center', justifyContent: 'center', padding: 24 },
  centerText: { fontSize: 14, color: Colors.textMuted, textAlign: 'center', lineHeight: 21 },
  card: {
    backgroundColor: Colors.white, borderRadius: 16, padding: 16, gap: 10,
    shadowColor: Colors.shadow, shadowOffset: { width: 0, height: 2 }, shadowOpacity: 0.05, shadowRadius: 8, elevation: 1,
  },
  sectionTitle: { fontSize: 14, fontWeight: '600', color: Colors.textPrimary },
  label: { fontSize: 12, color: Colors.textMuted },
  input: {
    backgroundColor: Colors.grayBg, borderRadius: 12, paddingHorizontal: 12, paddingVertical: 12,
    fontSize: 14, color: Colors.textPrimary, minHeight: 46,
  },
  multiline: { minHeight: 90, textAlignVertical: 'top' },
  chipRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  chip: {
    paddingHorizontal: 14, minHeight: 44, borderRadius: 22, backgroundColor: Colors.grayBg,
    alignItems: 'center', justifyContent: 'center',
  },
  chipOn: { backgroundColor: Colors.brgy },
  chipText: { fontSize: 13, color: Colors.textPrimary },
  chipTextOn: { color: '#fff', fontWeight: '600' },
  errorText: { fontSize: 12, color: Colors.redText },
  hintText: { fontSize: 12, color: Colors.textHint },
  hintCenter: { fontSize: 12, color: Colors.textHint, textAlign: 'center' },
  stepRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', minHeight: 48 },
  stepLabel: { fontSize: 14, color: Colors.textPrimary },
  stepControls: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  stepBtn: { width: 44, height: 44, borderRadius: 22, backgroundColor: Colors.brgyLight, alignItems: 'center', justifyContent: 'center' },
  stepBtnText: { fontSize: 22, color: Colors.brgyDark, fontWeight: '600' },
  stepValue: { minWidth: 68, textAlign: 'center', fontSize: 15, fontWeight: '600', color: Colors.textPrimary },
  primaryBtn: { backgroundColor: Colors.brgy, borderRadius: 14, minHeight: 50, alignItems: 'center', justifyContent: 'center' },
  primaryBtnOff: { opacity: 0.45 },
  primaryBtnText: { color: '#fff', fontSize: 15, fontWeight: '600' },
});
