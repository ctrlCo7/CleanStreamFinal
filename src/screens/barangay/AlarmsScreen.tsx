import React, { useEffect, useMemo, useState } from 'react';
import {
  View, Text, ScrollView, TouchableOpacity, StyleSheet, SafeAreaView,
  TextInput, Alert, ActivityIndicator, Switch,
} from 'react-native';
import { useNavigation } from '@react-navigation/native';
import { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { useTheme } from '../../hooks/useTheme';
import { ThemeColors } from '../../constants/theme';
import { useAppSelector } from '../../store/hooks';
import { RootStackParamList } from '../../types';
import { BackIcon, BellIcon } from '../../components/common/TabIcons';
import {
  WaterwayAlarmRecord,
  DAY_LABELS,
  createAlarm,
  deleteAlarm,
  setAlarmActive,
  subscribeToUserAlarms,
  initAlarmChannel,
  requestAlarmPermissions,
  reconcileAlarmsOnDevice,
} from '../../services/alarmService';

type Nav = NativeStackNavigationProp<RootStackParamList>;

const to24Hour = (hour12: number, period: 'AM' | 'PM'): number => {
  const h = hour12 % 12;
  return period === 'PM' ? h + 12 : h;
};

const formatTime = (hour: number, minute: number): string => {
  const period = hour >= 12 ? 'PM' : 'AM';
  const h12 = hour % 12 === 0 ? 12 : hour % 12;
  return `${h12}:${String(minute).padStart(2, '0')} ${period}`;
};

export default function BarangayAlarmsScreen() {
  const { colors } = useTheme();
  const styles = useMemo(() => createStyles(colors), [colors]);
  const navigation = useNavigation<Nav>();
  const { user } = useAppSelector((s) => s.auth);

  const [alarms, setAlarms] = useState<WaterwayAlarmRecord[]>([]);
  const [loading, setLoading] = useState(true);
  const [composerOpen, setComposerOpen] = useState(false);
  const [saving, setSaving] = useState(false);
  const [busyId, setBusyId] = useState<string | null>(null);

  const [label, setLabel] = useState('');
  const [hour12, setHour12] = useState(7);
  const [minute, setMinute] = useState(0);
  const [period, setPeriod] = useState<'AM' | 'PM'>('AM');
  const [selectedDays, setSelectedDays] = useState<number[]>([2, 4, 6]); // Mon/Wed/Fri

  useEffect(() => {
    if (!user?.uid) return;
    initAlarmChannel();
    requestAlarmPermissions();
    reconcileAlarmsOnDevice(user.uid).catch((e) => console.warn('[Alarms] Reconcile failed:', e));
    const unsub = subscribeToUserAlarms(user.uid, (list) => {
      setAlarms(list);
      setLoading(false);
    });
    return unsub;
  }, [user?.uid]);

  const toggleDay = (day: number) => {
    setSelectedDays((prev) => (prev.includes(day) ? prev.filter((d) => d !== day) : [...prev, day].sort()));
  };

  const resetComposer = () => {
    setLabel('');
    setHour12(7);
    setMinute(0);
    setPeriod('AM');
    setSelectedDays([2, 4, 6]);
  };

  const handleCreate = async () => {
    if (!user) return;
    if (!label.trim()) {
      Alert.alert('Label needed', 'Describe what to check, e.g. "Check waterway near Public Market".');
      return;
    }
    if (selectedDays.length === 0) {
      Alert.alert('Pick at least one day', 'Select which days this alarm should ring.');
      return;
    }
    if (!user.barangayId) {
      Alert.alert('Barangay not set', 'Your account has no assigned barangay yet, so this alarm cannot be scoped correctly.');
      return;
    }
    setSaving(true);
    try {
      await createAlarm(
        user.uid,
        user.barangayId,
        user.barangay || '—',
        label.trim(),
        to24Hour(hour12, period),
        minute,
        selectedDays,
      );
      resetComposer();
      setComposerOpen(false);
    } catch (e) {
      Alert.alert('Could not create alarm', e instanceof Error ? e.message : 'Please try again.');
    } finally {
      setSaving(false);
    }
  };

  const handleToggleActive = async (alarm: WaterwayAlarmRecord, next: boolean) => {
    setBusyId(alarm.id);
    try {
      await setAlarmActive(alarm, next);
    } catch {
      Alert.alert('Error', 'Could not update this alarm. Please try again.');
    } finally {
      setBusyId(null);
    }
  };

  const handleDelete = (alarm: WaterwayAlarmRecord) => {
    Alert.alert('Delete alarm', `Remove "${alarm.label}"?`, [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'Delete',
        style: 'destructive',
        onPress: async () => {
          setBusyId(alarm.id);
          try {
            await deleteAlarm(alarm);
          } catch {
            Alert.alert('Error', 'Could not delete this alarm. Please try again.');
          } finally {
            setBusyId(null);
          }
        },
      },
    ]);
  };

  return (
    <SafeAreaView style={styles.container}>
      <View style={styles.header}>
        <TouchableOpacity style={styles.backBtn} onPress={() => navigation.goBack()}>
          <BackIcon />
        </TouchableOpacity>
        <Text style={styles.headerTitle}>Waterway alarms</Text>
        <TouchableOpacity style={styles.addBtn} onPress={() => setComposerOpen((v) => !v)}>
          <Text style={styles.addBtnText}>{composerOpen ? 'Cancel' : '+ New'}</Text>
        </TouchableOpacity>
      </View>

      <ScrollView contentContainerStyle={styles.body} showsVerticalScrollIndicator={false}>
        <View style={styles.introCard}>
          <BellIcon color={colors.brgy} size={18} />
          <Text style={styles.introText}>
            Set a recurring time and your phone will ring and notify you when it's time to check a waterway checkpoint.
          </Text>
        </View>

        {composerOpen && (
          <View style={styles.composer}>
            <Text style={styles.composerLabel}>What to check</Text>
            <TextInput
              style={styles.composerInput}
              placeholder="e.g. Check waterway near Public Market"
              placeholderTextColor={colors.textHint}
              value={label}
              onChangeText={setLabel}
            />

            <Text style={styles.composerLabel}>Time</Text>
            <View style={styles.timeRow}>
              <Stepper value={hour12} onChange={(v) => setHour12(((v - 1 + 12) % 12) + 1)} colors={colors} />
              <Text style={styles.timeColon}>:</Text>
              <Stepper value={minute} onChange={(v) => setMinute((v + 60) % 60)} pad colors={colors} step={5} />
              <View style={styles.periodToggle}>
                {(['AM', 'PM'] as const).map((p) => (
                  <TouchableOpacity
                    key={p}
                    style={[styles.periodBtn, period === p && { backgroundColor: colors.brgy }]}
                    onPress={() => setPeriod(p)}
                  >
                    <Text style={[styles.periodBtnText, period === p && { color: '#fff' }]}>{p}</Text>
                  </TouchableOpacity>
                ))}
              </View>
            </View>

            <Text style={styles.composerLabel}>Repeat on</Text>
            <View style={styles.dayRow}>
              {DAY_LABELS.map((d, i) => {
                const day = i + 1; // 1=Sun .. 7=Sat
                const active = selectedDays.includes(day);
                return (
                  <TouchableOpacity
                    key={d}
                    style={[styles.dayChip, active && { backgroundColor: colors.brgy, borderColor: colors.brgy }]}
                    onPress={() => toggleDay(day)}
                  >
                    <Text style={[styles.dayChipText, active && { color: '#fff' }]}>{d}</Text>
                  </TouchableOpacity>
                );
              })}
            </View>

            <TouchableOpacity style={styles.saveBtn} onPress={handleCreate} disabled={saving}>
              {saving ? <ActivityIndicator size="small" color="#fff" /> : <Text style={styles.saveBtnText}>Set alarm</Text>}
            </TouchableOpacity>
          </View>
        )}

        {loading && <ActivityIndicator size="small" color={colors.brgy} style={{ marginVertical: 12 }} />}

        {!loading && alarms.length === 0 && !composerOpen && (
          <View style={styles.emptyCard}>
            <Text style={styles.emptyText}>No waterway alarms set yet</Text>
          </View>
        )}

        {alarms.map((alarm) => (
          <View key={alarm.id} style={styles.alarmCard}>
            <View style={{ flex: 1 }}>
              <Text style={styles.alarmTime}>{formatTime(alarm.hour, alarm.minute)}</Text>
              <Text style={styles.alarmLabel}>{alarm.label}</Text>
              <View style={styles.alarmDaysRow}>
                {DAY_LABELS.map((d, i) => {
                  const day = i + 1;
                  const active = alarm.days.includes(day);
                  return (
                    <Text key={d} style={[styles.alarmDayText, { color: active ? colors.brgy : colors.textHint }]}>
                      {d[0]}
                    </Text>
                  );
                })}
              </View>
            </View>
            <View style={styles.alarmActions}>
              {busyId === alarm.id ? (
                <ActivityIndicator size="small" color={colors.brgy} />
              ) : (
                <Switch
                  value={alarm.isActive}
                  onValueChange={(v) => handleToggleActive(alarm, v)}
                  trackColor={{ false: colors.border, true: colors.brgyMid }}
                  thumbColor={alarm.isActive ? colors.brgy : '#fff'}
                />
              )}
              <TouchableOpacity onPress={() => handleDelete(alarm)}>
                <Text style={styles.deleteText}>Delete</Text>
              </TouchableOpacity>
            </View>
          </View>
        ))}
      </ScrollView>
    </SafeAreaView>
  );
}

function Stepper({ value, onChange, pad, step = 1, colors }: {
  value: number; onChange: (v: number) => void; pad?: boolean; step?: number; colors: ThemeColors;
}) {
  const styles = createStyles(colors);
  return (
    <View style={styles.stepper}>
      <TouchableOpacity style={styles.stepperBtn} onPress={() => onChange(value - step)}>
        <Text style={styles.stepperBtnText}>−</Text>
      </TouchableOpacity>
      <Text style={styles.stepperValue}>{pad ? String(value).padStart(2, '0') : value}</Text>
      <TouchableOpacity style={styles.stepperBtn} onPress={() => onChange(value + step)}>
        <Text style={styles.stepperBtnText}>+</Text>
      </TouchableOpacity>
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
  backBtn: {
    width: 34, height: 34, borderRadius: 17, backgroundColor: Colors.grayBg,
    alignItems: 'center', justifyContent: 'center',
  },
  addBtn: { paddingHorizontal: 8, paddingVertical: 6, borderRadius: 8 },
  addBtnText: { fontSize: 12, color: Colors.brgy, fontWeight: '500' },
  body: { padding: 14, gap: 10, paddingBottom: 28 },
  introCard: {
    backgroundColor: Colors.brgyLight, borderRadius: 12, padding: 12,
    flexDirection: 'row', gap: 9, alignItems: 'flex-start',
    borderWidth: 0.5, borderColor: Colors.brgyMid,
  },
  introText: { flex: 1, fontSize: 11, color: Colors.brgyDark, lineHeight: 16 },
  composer: {
    backgroundColor: Colors.white, borderRadius: 12, padding: 12, gap: 8,
    borderWidth: 0.5, borderColor: Colors.border,
  },
  composerLabel: { fontSize: 11, fontWeight: '500', color: Colors.textPrimary, marginTop: 2 },
  composerInput: {
    backgroundColor: Colors.grayBg, borderRadius: 10, borderWidth: 0.5, borderColor: Colors.border,
    paddingHorizontal: 11, paddingVertical: 9, fontSize: 12, color: Colors.textPrimary,
  },
  timeRow: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  timeColon: { fontSize: 18, fontWeight: '600', color: Colors.textPrimary },
  stepper: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  stepperBtn: {
    width: 28, height: 28, borderRadius: 14, backgroundColor: Colors.grayBg,
    alignItems: 'center', justifyContent: 'center', borderWidth: 0.5, borderColor: Colors.border,
  },
  stepperBtnText: { fontSize: 16, color: Colors.textPrimary, fontWeight: '600' },
  stepperValue: { fontSize: 16, fontWeight: '600', color: Colors.textPrimary, minWidth: 26, textAlign: 'center' },
  periodToggle: { flexDirection: 'row', gap: 4, marginLeft: 8 },
  periodBtn: {
    paddingHorizontal: 10, paddingVertical: 6, borderRadius: 8, backgroundColor: Colors.grayBg,
    borderWidth: 0.5, borderColor: Colors.border,
  },
  periodBtnText: { fontSize: 11, fontWeight: '500', color: Colors.textPrimary },
  dayRow: { flexDirection: 'row', gap: 5, flexWrap: 'wrap' },
  dayChip: {
    paddingHorizontal: 10, paddingVertical: 6, borderRadius: 20,
    backgroundColor: Colors.grayBg, borderWidth: 0.5, borderColor: Colors.border,
  },
  dayChipText: { fontSize: 10, fontWeight: '500', color: Colors.textPrimary },
  saveBtn: { backgroundColor: Colors.brgy, borderRadius: 10, paddingVertical: 10, alignItems: 'center', marginTop: 4 },
  saveBtnText: { fontSize: 12, fontWeight: '500', color: '#fff' },
  emptyCard: { backgroundColor: Colors.white, borderRadius: 12, padding: 32, alignItems: 'center', borderWidth: 0.5, borderColor: Colors.border },
  emptyText: { fontSize: 12, color: Colors.textHint },
  alarmCard: {
    backgroundColor: Colors.white, borderRadius: 13, padding: 12,
    flexDirection: 'row', alignItems: 'center', gap: 10,
    borderWidth: 0.5, borderColor: Colors.border,
  },
  alarmTime: { fontSize: 16, fontWeight: '600', color: Colors.textPrimary },
  alarmLabel: { fontSize: 11, color: Colors.textMuted, marginTop: 2 },
  alarmDaysRow: { flexDirection: 'row', gap: 6, marginTop: 6 },
  alarmDayText: { fontSize: 9, fontWeight: '600' },
  alarmActions: { alignItems: 'center', gap: 6 },
  deleteText: { fontSize: 10, color: Colors.red },
});
