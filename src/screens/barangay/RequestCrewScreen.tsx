import React, { useEffect, useMemo, useState } from 'react';
import {
  ActivityIndicator, Alert, KeyboardAvoidingView, Platform, ScrollView, StyleSheet, Text, TextInput, TouchableOpacity, View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useNavigation } from '@react-navigation/native';
import { useTheme } from '../../hooks/useTheme';
import { ThemeColors } from '../../constants/theme';
import { BackIcon } from '../../components/common/TabIcons';
import { useAppSelector } from '../../store/hooks';
import { CrewRequest, CrewRequestStatus } from '../../types';
import {
  CrewRequestInput, cancelCrewRequest, crewRequestProblems, submitCrewRequest, subscribeToBarangayCrewRequests,
} from '../../services/crewRequestService';
import { explainWriteError } from '../../utils/firestoreErrors';
import { formatPH } from '../../utils/phTime';

const STATUS_LABEL: Record<CrewRequestStatus, string> = {
  pending: 'Waiting for the Super Admin',
  approved: 'Account created',
  declined: 'Declined',
  cancelled: 'Cancelled',
};

/**
 * Officials and the Barangay Captain ask the Super Admin for a cleanup team (crew) account for
 * their barangay, and follow their barangay's requests. The Super Admin is alerted in the portal.
 */
export default function RequestCrewScreen() {
  const { colors } = useTheme();
  const styles = useMemo(() => createStyles(colors), [colors]);
  const navigation = useNavigation();
  const { user } = useAppSelector((s) => s.auth);
  const barangayName = user?.barangay ?? user?.barangayId ?? 'your barangay';

  const [form, setForm] = useState<{ teamName: string; crewSize: string; leaderName: string; leaderEmail: string; leaderPhone: string; reason: string }>({
    teamName: '', crewSize: '', leaderName: '', leaderEmail: '', leaderPhone: '', reason: '',
  });
  const [errors, setErrors] = useState<Partial<Record<keyof CrewRequestInput, string>>>({});
  const [sending, setSending] = useState(false);
  const [requests, setRequests] = useState<CrewRequest[] | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);

  useEffect(() => {
    if (!user?.barangayId) return undefined;
    return subscribeToBarangayCrewRequests(user.barangayId, (r) => { setRequests(r); setLoadError(null); },
      (e) => setLoadError(explainWriteError(e, 'see the requests')));
  }, [user?.barangayId]);

  if (!user || (user.role !== 'admin' && user.role !== 'barangay')) {
    return (
      <SafeAreaView style={styles.container}>
        <View style={styles.center}><Text style={styles.muted}>Only barangay officials and the Captain can request a cleanup team.</Text></View>
      </SafeAreaView>
    );
  }

  const set = (k: keyof typeof form) => (v: string) => { setForm((f) => ({ ...f, [k]: v })); setErrors((e) => ({ ...e, [k]: undefined })); };
  const waiting = (requests ?? []).filter((r) => r.status === 'pending');

  const send = async () => {
    const input: CrewRequestInput = {
      teamName: form.teamName, crewSize: Number(form.crewSize.trim() || NaN), reason: form.reason,
      leaderName: form.leaderName, leaderEmail: form.leaderEmail, leaderPhone: form.leaderPhone,
    };
    const found = crewRequestProblems(input);
    setErrors(found);
    if (Object.keys(found).length) return;
    setSending(true);
    try {
      await submitCrewRequest(user, input);
      setForm({ teamName: '', crewSize: '', leaderName: '', leaderEmail: '', leaderPhone: '', reason: '' });
      Alert.alert('Request sent', 'The Super Admin has been notified. You\'ll get a notification here when they create the account or answer.');
    } catch (e) {
      Alert.alert('Request not sent', explainWriteError(e, 'send the request'));
    } finally {
      setSending(false);
    }
  };

  const cancel = (r: CrewRequest) => Alert.alert('Cancel this request?', `"${r.teamName}" will be withdrawn.`, [
    { text: 'Keep it', style: 'cancel' },
    { text: 'Cancel request', style: 'destructive', onPress: () => { cancelCrewRequest(r.id).catch((e) => Alert.alert('Not cancelled', explainWriteError(e, 'cancel the request'))); } },
  ]);

  const input = (k: keyof typeof form, label: string, props: React.ComponentProps<typeof TextInput> = {}, hint?: string) => (
    <View style={styles.field}>
      <Text style={styles.label}>{label}</Text>
      <TextInput
        value={form[k]}
        onChangeText={set(k)}
        placeholderTextColor={colors.textHint}
        style={[styles.input, props.multiline && styles.inputMulti, errors[k as keyof CrewRequestInput] && styles.inputBad]}
        accessibilityLabel={label}
        {...props}
      />
      {errors[k as keyof CrewRequestInput]
        ? <Text style={styles.error}>{errors[k as keyof CrewRequestInput]}</Text>
        : hint ? <Text style={styles.hint}>{hint}</Text> : null}
    </View>
  );

  const pillStyle = (s: CrewRequestStatus) => (s === 'approved' ? styles.pillOk : s === 'declined' ? styles.pillBad : s === 'pending' ? styles.pillWait : styles.pillOff);

  return (
    <SafeAreaView style={styles.container} edges={['top']}>
      <View style={styles.header}>
        <TouchableOpacity style={styles.backBtn} onPress={() => navigation.goBack()} accessibilityLabel="Back">
          <BackIcon color={colors.textPrimary} />
        </TouchableOpacity>
        <Text style={styles.headerTitle}>Request a cleanup team</Text>
        <View style={{ width: 38 }} />
      </View>

      <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
        <ScrollView contentContainerStyle={styles.body} keyboardShouldPersistTaps="handled">
          <View style={styles.card}>
            <Text style={styles.title}>New cleanup team for Brgy. {barangayName}</Text>
            <Text style={styles.line}>
              The Super Admin creates crew accounts. They're notified as soon as you send this, and you'll get a notification when the account is ready.
            </Text>
            {waiting.length > 0 && (
              <Text style={styles.note}>{waiting.length === 1 ? 'One request' : `${waiting.length} requests`} from your barangay {waiting.length === 1 ? 'is' : 'are'} already waiting (see below).</Text>
            )}
            {input('teamName', 'Team name', { placeholder: `e.g. ${barangayName} Cleanup Crew 2`, maxLength: 60 })}
            {input('crewSize', 'Number of workers', { placeholder: 'e.g. 6', keyboardType: 'number-pad', maxLength: 3 })}
            {input('leaderName', 'Crew leader (optional)', { placeholder: 'Who will sign in for the crew' })}
            {input('leaderEmail', 'Crew leader email (optional)', { placeholder: 'leader@example.com', keyboardType: 'email-address', autoCapitalize: 'none' },
              'The account will be created with this email, so the leader can sign in.')}
            {input('leaderPhone', 'Crew leader mobile (optional)', { placeholder: '0917 123 4567', keyboardType: 'phone-pad' })}
            {input('reason', 'Why is it needed?', { placeholder: 'e.g. More reports than our one crew can handle along the creek', multiline: true, maxLength: 500 })}
            <TouchableOpacity style={[styles.primary, sending && { opacity: 0.6 }]} onPress={send} disabled={sending} accessibilityRole="button">
              {sending ? <ActivityIndicator color="#fff" /> : <Text style={styles.primaryText}>Send request to the Super Admin</Text>}
            </TouchableOpacity>
          </View>

          <Text style={styles.section}>Your barangay's requests</Text>
          {loadError ? <Text style={styles.error}>{loadError}</Text>
            : requests === null ? <ActivityIndicator color={colors.teal} />
              : requests.length === 0 ? <Text style={styles.muted}>No requests yet.</Text>
                : requests.map((r) => (
                  <View key={r.id} style={styles.card}>
                    <View style={styles.row}>
                      <Text style={[styles.title, { flex: 1 }]}>{r.teamName}</Text>
                      <View style={[styles.pill, pillStyle(r.status)]}><Text style={styles.pillText}>{STATUS_LABEL[r.status]}</Text></View>
                    </View>
                    <Text style={styles.line}>{r.crewSize} worker{r.crewSize === 1 ? '' : 's'}{r.leaderName ? ` · Leader: ${r.leaderName}` : ''}</Text>
                    <Text style={styles.meta}>Requested by {r.requestedByName} ({r.requestedByRole === 'admin' ? 'Captain' : 'Official'}) · {formatPH(new Date(r.createdAt))}</Text>
                    {r.status === 'approved' && (
                      <Text style={styles.okText}>Account created{r.accountEmail ? `: ${r.accountEmail}` : ''}. The crew can now be assigned to cleanups.</Text>
                    )}
                    {r.status === 'declined' && <Text style={styles.badText}>Reason: {r.declineReason || 'No reason given.'}</Text>}
                    {r.status === 'pending' && r.requestedBy === user.uid && (
                      <TouchableOpacity onPress={() => cancel(r)} accessibilityRole="button"><Text style={styles.link}>Cancel request</Text></TouchableOpacity>
                    )}
                  </View>
                ))}
        </ScrollView>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

const createStyles = (C: ThemeColors) => StyleSheet.create({
  container: { flex: 1, backgroundColor: C.grayBg },
  center: { flex: 1, alignItems: 'center', justifyContent: 'center', padding: 24 },
  header: {
    backgroundColor: C.white, paddingHorizontal: 16, paddingVertical: 12, flexDirection: 'row', alignItems: 'center',
    justifyContent: 'space-between', borderBottomWidth: 0.5, borderBottomColor: C.border,
  },
  headerTitle: { fontSize: 16, fontWeight: '600', color: C.textPrimary },
  backBtn: { width: 38, height: 38, borderRadius: 19, backgroundColor: C.grayBg, alignItems: 'center', justifyContent: 'center' },
  body: { padding: 14, gap: 12, paddingBottom: 40 },
  card: { backgroundColor: C.white, borderRadius: 16, padding: 14, gap: 6, borderWidth: 0.5, borderColor: C.border },
  title: { fontSize: 14, fontWeight: '700', color: C.textPrimary },
  line: { fontSize: 12, color: C.textSecondary, lineHeight: 17 },
  meta: { fontSize: 11, color: C.textMuted },
  note: { fontSize: 12, color: C.amberText, backgroundColor: C.amberBg, borderRadius: 8, padding: 8 },
  section: { fontSize: 13, fontWeight: '700', color: C.textSecondary, marginTop: 6 },
  field: { marginTop: 8, gap: 4 },
  label: { fontSize: 12, fontWeight: '600', color: C.textPrimary },
  input: {
    borderWidth: 1, borderColor: C.borderMid, borderRadius: 10, paddingHorizontal: 12, paddingVertical: 10,
    fontSize: 14, color: C.textPrimary, backgroundColor: C.surface,
  },
  inputMulti: { minHeight: 80, textAlignVertical: 'top' },
  inputBad: { borderColor: C.red },
  hint: { fontSize: 11, color: C.textMuted },
  error: { fontSize: 12, color: C.redText },
  primary: { marginTop: 12, backgroundColor: C.teal, borderRadius: 12, paddingVertical: 13, alignItems: 'center' },
  primaryText: { color: '#fff', fontWeight: '700', fontSize: 14 },
  row: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  pill: { borderRadius: 12, paddingHorizontal: 8, paddingVertical: 3 },
  pillText: { fontSize: 10, fontWeight: '700', color: C.textPrimary },
  pillWait: { backgroundColor: C.amberBg },
  pillOk: { backgroundColor: C.greenBg },
  pillBad: { backgroundColor: C.redBg },
  pillOff: { backgroundColor: C.grayBg },
  okText: { fontSize: 12, color: C.greenText },
  badText: { fontSize: 12, color: C.redText },
  link: { fontSize: 12, fontWeight: '600', color: C.redText, marginTop: 4 },
  muted: { fontSize: 13, color: C.textMuted, textAlign: 'center' },
});
