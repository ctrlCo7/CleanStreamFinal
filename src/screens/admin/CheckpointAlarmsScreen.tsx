import React, { useEffect, useMemo, useState } from 'react';
import {
  View, Text, ScrollView, TouchableOpacity, StyleSheet, SafeAreaView, ActivityIndicator, Alert,
} from 'react-native';
import { useNavigation } from '@react-navigation/native';
import { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { useTheme } from '../../hooks/useTheme';
import { ThemeColors } from '../../constants/theme';
import { useAppSelector } from '../../store/hooks';
import { Barangay, RootStackParamList } from '../../types';
import { BackIcon, BellIcon } from '../../components/common/TabIcons';
import { subscribeToBarangays } from '../../services/barangayService';
import {
  CheckpointAlarmConfig,
  setCheckpointAlarm,
  subscribeToAllCheckpointAlarms,
} from '../../services/alarmService';

type Nav = NativeStackNavigationProp<RootStackParamList>;

const to24Hour = (hour12: number, period: 'AM' | 'PM'): number => {
  const h = hour12 % 12;
  return period === 'PM' ? h + 12 : h;
};

const to12Hour = (hour24: number): { hour12: number; period: 'AM' | 'PM' } => {
  const period = hour24 >= 12 ? 'PM' : 'AM';
  const hour12 = hour24 % 12 === 0 ? 12 : hour24 % 12;
  return { hour12, period };
};

const formatTime = (hour: number, minute: number): string => {
  const { hour12, period } = to12Hour(hour);
  return `${hour12}:${String(minute).padStart(2, '0')} ${period}`;
};

export default function AdminCheckpointAlarmsScreen() {
  const { colors } = useTheme();
  const styles = useMemo(() => createStyles(colors), [colors]);
  const navigation = useNavigation<Nav>();
  const { user } = useAppSelector((s) => s.auth);

  const [barangays, setBarangays] = useState<Barangay[]>([]);
  const [configs, setConfigs] = useState<Record<string, CheckpointAlarmConfig>>({});
  const [loading, setLoading] = useState(true);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [hour12, setHour12] = useState(7);
  const [minute, setMinute] = useState(0);
  const [period, setPeriod] = useState<'AM' | 'PM'>('AM');
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    const unsubBarangays = subscribeToBarangays((list) => {
      setBarangays(list);
      setLoading(false);
    });
    const unsubConfigs = subscribeToAllCheckpointAlarms((list) => {
      const byId: Record<string, CheckpointAlarmConfig> = {};
      list.forEach((c) => { byId[c.barangayId] = c; });
      setConfigs(byId);
    });
    return () => { unsubBarangays(); unsubConfigs(); };
  }, []);

  const startEditing = (barangay: Barangay) => {
    const existing = configs[barangay.id];
    if (existing) {
      const { hour12: h, period: p } = to12Hour(existing.hour);
      setHour12(h);
      setMinute(existing.minute);
      setPeriod(p);
    } else {
      setHour12(7);
      setMinute(0);
      setPeriod('AM');
    }
    setEditingId(barangay.id);
  };

  const handleSave = async (barangay: Barangay) => {
    if (!user) return;
    setSaving(true);
    try {
      await setCheckpointAlarm(
        barangay.id,
        barangay.name,
        to24Hour(hour12, period),
        minute,
        user.uid,
        `${user.firstName} ${user.lastName}`.trim(),
      );
      setEditingId(null);
    } catch (e) {
      Alert.alert('Could not save', e instanceof Error ? e.message : 'Please try again.');
    } finally {
      setSaving(false);
    }
  };

  return (
    <SafeAreaView style={styles.container}>
      <View style={styles.header}>
        <TouchableOpacity style={styles.backBtn} onPress={() => navigation.goBack()}>
          <BackIcon size={18} />
        </TouchableOpacity>
        <Text style={styles.headerTitle}>Checkpoint alarms</Text>
        <View style={{ width: 38 }} />
      </View>

      <ScrollView contentContainerStyle={styles.body} showsVerticalScrollIndicator={false}>
        <View style={styles.introCard}>
          <BellIcon color={colors.blue} size={18} />
          <Text style={styles.introText}>
            Set the daily time each barangay's officials get a checkpoint reminder to check their
            waterway. Barangay officials can see this time but can't change it themselves.
          </Text>
        </View>

        {loading && <ActivityIndicator size="small" color={colors.blue} style={{ marginVertical: 12 }} />}

        {!loading && barangays.length === 0 && (
          <View style={styles.emptyCard}>
            <Text style={styles.emptyText}>No barangays found.</Text>
          </View>
        )}

        {barangays.map((barangay) => {
          const config = configs[barangay.id];
          const isEditing = editingId === barangay.id;
          return (
            <View key={barangay.id} style={styles.card}>
              <View style={styles.cardRow}>
                <View style={{ flex: 1 }}>
                  <Text style={styles.barangayName}>{barangay.name}</Text>
                  <Text style={styles.timeText}>
                    {config ? `${formatTime(config.hour, config.minute)} daily` : 'Not set'}
                  </Text>
                </View>
                {!isEditing && (
                  <TouchableOpacity style={styles.editBtn} onPress={() => startEditing(barangay)}>
                    <Text style={styles.editBtnText}>{config ? 'Edit' : 'Set time'}</Text>
                  </TouchableOpacity>
                )}
              </View>

              {isEditing && (
                <View style={styles.editor}>
                  <View style={styles.timeRow}>
                    <Stepper value={hour12} onChange={(v) => setHour12(((v - 1 + 12) % 12) + 1)} colors={colors} />
                    <Text style={styles.timeColon}>:</Text>
                    <Stepper value={minute} onChange={(v) => setMinute((v + 60) % 60)} pad colors={colors} step={5} />
                    <View style={styles.periodToggle}>
                      {(['AM', 'PM'] as const).map((p) => (
                        <TouchableOpacity
                          key={p}
                          style={[styles.periodBtn, period === p && { backgroundColor: colors.blue }]}
                          onPress={() => setPeriod(p)}
                        >
                          <Text style={[styles.periodBtnText, period === p && { color: '#fff' }]}>{p}</Text>
                        </TouchableOpacity>
                      ))}
                    </View>
                  </View>
                  <View style={styles.editorActions}>
                    <TouchableOpacity style={styles.cancelBtn} onPress={() => setEditingId(null)}>
                      <Text style={styles.cancelBtnText}>Cancel</Text>
                    </TouchableOpacity>
                    <TouchableOpacity style={styles.saveBtn} onPress={() => handleSave(barangay)} disabled={saving}>
                      {saving ? <ActivityIndicator size="small" color="#fff" /> : <Text style={styles.saveBtnText}>Save</Text>}
                    </TouchableOpacity>
                  </View>
                </View>
              )}
            </View>
          );
        })}
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
    width: 38, height: 38, borderRadius: 19, backgroundColor: Colors.grayBg,
    alignItems: 'center', justifyContent: 'center',
  },
  body: { padding: 16, gap: 14, paddingBottom: 28 },
  introCard: {
    backgroundColor: Colors.blueBg, borderRadius: 16, padding: 14,
    flexDirection: 'row', gap: 9, alignItems: 'flex-start',
  },
  introText: { flex: 1, fontSize: 11, color: Colors.blueText, lineHeight: 16 },
  emptyCard: {
    backgroundColor: Colors.white, borderRadius: 18, padding: 28, alignItems: 'center',
    shadowColor: Colors.shadow, shadowOffset: { width: 0, height: 2 }, shadowOpacity: 0.05, shadowRadius: 8, elevation: 1,
  },
  emptyText: { fontSize: 12, color: Colors.textHint },
  card: {
    backgroundColor: Colors.white, borderRadius: 18, padding: 15, gap: 12,
    shadowColor: Colors.shadow, shadowOffset: { width: 0, height: 2 }, shadowOpacity: 0.05, shadowRadius: 8, elevation: 1,
  },
  cardRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  barangayName: { fontSize: 14, fontWeight: '600', color: Colors.textPrimary },
  timeText: { fontSize: 12, color: Colors.textMuted, marginTop: 2 },
  editBtn: { paddingHorizontal: 12, paddingVertical: 7, borderRadius: 10, backgroundColor: Colors.blueBg },
  editBtnText: { fontSize: 11, fontWeight: '600', color: Colors.blueText },
  editor: { gap: 10, borderTopWidth: 0.5, borderTopColor: Colors.border, paddingTop: 10 },
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
  editorActions: { flexDirection: 'row', gap: 8, justifyContent: 'flex-end' },
  cancelBtn: { paddingHorizontal: 14, paddingVertical: 9, borderRadius: 10 },
  cancelBtnText: { fontSize: 12, color: Colors.textMuted, fontWeight: '500' },
  saveBtn: { backgroundColor: Colors.blue, borderRadius: 10, paddingHorizontal: 18, paddingVertical: 9, alignItems: 'center' },
  saveBtnText: { fontSize: 12, fontWeight: '600', color: '#fff' },
});
