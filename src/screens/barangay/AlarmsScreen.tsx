import React, { useEffect, useMemo, useState } from 'react';
import {
  View, Text, ScrollView, TouchableOpacity, StyleSheet, SafeAreaView, ActivityIndicator,
} from 'react-native';
import { useNavigation } from '@react-navigation/native';
import { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { useTheme } from '../../hooks/useTheme';
import { ThemeColors } from '../../constants/theme';
import { useAppSelector } from '../../store/hooks';
import { RootStackParamList } from '../../types';
import { BackIcon, BellIcon } from '../../components/common/TabIcons';
import {
  CheckpointAlarmConfig,
  initAlarmChannel,
  requestAlarmPermissions,
  reconcileDailyCheckpointAlarm,
  subscribeToCheckpointAlarm,
} from '../../services/alarmService';

type Nav = NativeStackNavigationProp<RootStackParamList>;

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

  const [config, setConfig] = useState<CheckpointAlarmConfig | null>(null);
  const [loading, setLoading] = useState(true);
  const [permissionDenied, setPermissionDenied] = useState(false);

  useEffect(() => {
    if (!user?.barangayId) {
      setLoading(false);
      return;
    }
    initAlarmChannel();
    requestAlarmPermissions().then((granted) => setPermissionDenied(!granted));

    const unsub = subscribeToCheckpointAlarm(user.barangayId, (next) => {
      setConfig(next);
      setLoading(false);
      reconcileDailyCheckpointAlarm(next).catch((e) =>
        console.warn('[Alarms] Reconcile failed:', e),
      );
    });
    return unsub;
  }, [user?.barangayId]);

  return (
    <SafeAreaView style={styles.container}>
      <View style={styles.header}>
        <TouchableOpacity style={styles.backBtn} onPress={() => navigation.goBack()}>
          <BackIcon size={18} />
        </TouchableOpacity>
        <Text style={styles.headerTitle}>Daily checkpoint alarm</Text>
        <View style={{ width: 38 }} />
      </View>

      <ScrollView contentContainerStyle={styles.body} showsVerticalScrollIndicator={false}>
        <View style={styles.introCard}>
          <BellIcon color={colors.brgy} size={18} />
          <Text style={styles.introText}>
            This alarm is set by your admin for your barangay. Your phone will ring and notify
            you every day at this time so you remember to check the waterway checkpoint.
          </Text>
        </View>

        {permissionDenied && (
          <View style={styles.warnCard}>
            <Text style={styles.warnText}>
              Notification permission isn't granted, so this alarm won't ring. Enable
              notifications for CleanStream in your phone's settings.
            </Text>
          </View>
        )}

        {loading && <ActivityIndicator size="small" color={colors.brgy} style={{ marginVertical: 12 }} />}

        {!loading && !user?.barangayId && (
          <View style={styles.emptyCard}>
            <Text style={styles.emptyText}>
              Your account has no assigned barangay yet, so no checkpoint alarm can be shown.
            </Text>
          </View>
        )}

        {!loading && user?.barangayId && !config && (
          <View style={styles.emptyCard}>
            <Text style={styles.emptyText}>
              Your admin hasn't set a daily checkpoint time for {user.barangay || 'your barangay'} yet.
            </Text>
          </View>
        )}

        {!loading && config && (
          <View style={styles.alarmCard}>
            <Text style={styles.alarmTime}>{formatTime(config.hour, config.minute)}</Text>
            <Text style={styles.alarmLabel}>Every day · {config.barangayName}</Text>
            <Text style={styles.alarmMeta}>Set by {config.updatedByName}</Text>
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
  backBtn: {
    width: 38, height: 38, borderRadius: 19, backgroundColor: Colors.grayBg,
    alignItems: 'center', justifyContent: 'center',
  },
  body: { padding: 16, gap: 14, paddingBottom: 28 },
  introCard: {
    backgroundColor: Colors.brgyLight, borderRadius: 16, padding: 14,
    flexDirection: 'row', gap: 9, alignItems: 'flex-start',
  },
  introText: { flex: 1, fontSize: 11, color: Colors.brgyDark, lineHeight: 16 },
  warnCard: {
    backgroundColor: Colors.amberBg, borderRadius: 16, padding: 14,
  },
  warnText: { fontSize: 11, color: Colors.amberText, lineHeight: 16 },
  emptyCard: {
    backgroundColor: Colors.white, borderRadius: 18, padding: 28, alignItems: 'center',
    shadowColor: Colors.shadow, shadowOffset: { width: 0, height: 2 }, shadowOpacity: 0.05, shadowRadius: 8, elevation: 1,
  },
  emptyText: { fontSize: 12, color: Colors.textHint, textAlign: 'center', lineHeight: 18 },
  alarmCard: {
    backgroundColor: Colors.white, borderRadius: 18, padding: 24, alignItems: 'center', gap: 4,
    shadowColor: Colors.shadow, shadowOffset: { width: 0, height: 2 }, shadowOpacity: 0.05, shadowRadius: 8, elevation: 1,
  },
  alarmTime: { fontSize: 36, fontWeight: '700', color: Colors.brgy },
  alarmLabel: { fontSize: 13, color: Colors.textPrimary, fontWeight: '500' },
  alarmMeta: { fontSize: 11, color: Colors.textHint, marginTop: 4 },
});
