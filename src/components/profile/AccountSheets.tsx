/**
 * The account screens every role's Profile opens, as bottom sheets:
 *  - EditProfileSheet: first and last name (and phone for cleanup crews)
 *  - NotificationSettingsSheet: what this person wants to be notified about
 *  - PrivacySheet: change password, what CleanStream stores, support contact
 *  - AppSettingsSheet: the Super Admin's settings, read-only (Admin's "System preferences")
 */
import React, { useEffect, useMemo, useState } from 'react';
import {
  ActivityIndicator, Alert, KeyboardAvoidingView, Linking, Modal, Platform, ScrollView, StyleSheet, Switch, Text,
  TextInput, TouchableOpacity, View,
} from 'react-native';
import { useTheme } from '../../hooks/useTheme';
import { ThemeColors } from '../../constants/theme';
import { useAppDispatch, useAppSelector } from '../../store/hooks';
import { setUser } from '../../store/authSlice';
import { resetPassword, updateUserProfile } from '../../services/authService';
import { NotificationCategory, NotificationPrefs, isOn, setNotificationPrefs } from '../../services/notificationPrefs';
import { getCheckpointAlarm, reconcileDailyCheckpointAlarm } from '../../services/alarmService';
import { useAppSettings } from '../../services/appSettings';
import { formatPhone, normalizePhone } from '../../utils/phone';
import { UserRole } from '../../types';

function Sheet({ visible, title, onClose, children }: { visible: boolean; title: string; onClose: () => void; children: React.ReactNode }) {
  const { colors } = useTheme();
  const styles = useMemo(() => createStyles(colors), [colors]);
  return (
    <Modal visible={visible} animationType="slide" transparent onRequestClose={onClose}>
      <KeyboardAvoidingView style={styles.backdrop} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
        <TouchableOpacity style={StyleSheet.absoluteFill} onPress={onClose} accessibilityLabel="Close" />
        <View style={styles.sheet}>
          <View style={styles.handle} />
          <View style={styles.sheetHead}>
            <Text style={styles.sheetTitle}>{title}</Text>
            <TouchableOpacity onPress={onClose} accessibilityRole="button"><Text style={styles.close}>Close</Text></TouchableOpacity>
          </View>
          <ScrollView contentContainerStyle={{ gap: 12, paddingBottom: 24 }} keyboardShouldPersistTaps="handled">
            {children}
          </ScrollView>
        </View>
      </KeyboardAvoidingView>
    </Modal>
  );
}

// ─── Edit profile ─────────────────────────────────────────────────────────────

export function EditProfileSheet({ visible, onClose }: { visible: boolean; onClose: () => void }) {
  const { colors } = useTheme();
  const styles = useMemo(() => createStyles(colors), [colors]);
  const dispatch = useAppDispatch();
  const user = useAppSelector((s) => s.auth.user);
  const [first, setFirst] = useState('');
  const [last, setLast] = useState('');
  const [phone, setPhone] = useState('');
  const [error, setError] = useState('');
  const [saving, setSaving] = useState(false);
  const withPhone = user?.role === 'cleanup_team';

  useEffect(() => {
    if (!visible || !user) return;
    setFirst(user.firstName ?? '');
    setLast(user.lastName ?? '');
    setPhone(user.phone ? formatPhone(user.phone) : '');
    setError('');
  }, [visible, user]);

  const save = async () => {
    if (!user) return;
    const firstName = first.trim().replace(/\s+/g, ' ');
    const lastName = last.trim().replace(/\s+/g, ' ');
    if (!firstName || !lastName) { setError('Enter your first and last name.'); return; }
    if (firstName.length > 50 || lastName.length > 50) { setError('Names can be up to 50 characters.'); return; }
    let normalized: string | undefined;
    if (withPhone) {
      normalized = normalizePhone(phone) ?? undefined;
      if (!normalized) { setError('Enter a Philippine mobile or landline number, e.g. 0917 123 4567.'); return; }
    }
    setSaving(true);
    try {
      const updates = { firstName, lastName, displayName: `${firstName} ${lastName}`, ...(normalized ? { phone: normalized } : {}) };
      await updateUserProfile(user.uid, updates);
      dispatch(setUser({ ...user, ...updates }));
      onClose();
    } catch {
      setError("Couldn't save. Check your connection and try again.");
    } finally {
      setSaving(false);
    }
  };

  return (
    <Sheet visible={visible} title="Edit profile" onClose={onClose}>
      <Text style={styles.label}>First name</Text>
      <TextInput style={styles.input} value={first} onChangeText={setFirst} autoCapitalize="words" maxLength={50} />
      <Text style={styles.label}>Last name</Text>
      <TextInput style={styles.input} value={last} onChangeText={setLast} autoCapitalize="words" maxLength={50} />
      {withPhone && (
        <>
          <Text style={styles.label}>Contact number</Text>
          <TextInput style={styles.input} value={phone} onChangeText={setPhone} keyboardType="phone-pad" placeholder="0917 123 4567" placeholderTextColor={colors.textHint} />
        </>
      )}
      <Text style={styles.hint}>Your email, role and barangay can only be changed by the Super Admin.</Text>
      {!!error && <Text style={styles.error}>{error}</Text>}
      <TouchableOpacity style={styles.primary} onPress={save} disabled={saving} accessibilityRole="button">
        {saving ? <ActivityIndicator color="#fff" /> : <Text style={styles.primaryText}>Save</Text>}
      </TouchableOpacity>
    </Sheet>
  );
}

// ─── Notification settings ────────────────────────────────────────────────────

const CATEGORY_INFO: Record<NotificationCategory, { label: string; hint: string }> = {
  reports: { label: 'Report updates', hint: 'When a report is verified, assigned, cleaned up or rejected' },
  tasks: { label: 'Cleanup tasks', hint: 'New tasks, crew replies, and the crew on its way' },
  alerts: { label: 'Urgent alerts', hint: 'Critical and high severity reports, checkpoint submissions' },
  community: { label: 'Events and announcements', hint: 'Volunteer cleanups and barangay announcements' },
  messages: { label: 'Messages', hint: 'New chat messages' },
  dailyAlarm: { label: 'Daily checkpoint alarm', hint: 'The phone alarm for your daily waterway inspection' },
};

const CATEGORIES_FOR: Record<UserRole, NotificationCategory[]> = {
  citizen: ['reports', 'tasks', 'community', 'messages'],
  barangay: ['reports', 'tasks', 'alerts', 'community', 'messages', 'dailyAlarm'],
  admin: ['reports', 'tasks', 'alerts', 'messages'],
  cleanup_team: ['tasks', 'messages'],
  superadmin: [],
};

export function NotificationSettingsSheet({ visible, onClose }: { visible: boolean; onClose: () => void }) {
  const { colors } = useTheme();
  const styles = useMemo(() => createStyles(colors), [colors]);
  const dispatch = useAppDispatch();
  const user = useAppSelector((s) => s.auth.user);
  const settings = useAppSettings();
  const [saving, setSaving] = useState<NotificationCategory | null>(null);
  if (!user) return null;

  const toggle = async (cat: NotificationCategory, value: boolean) => {
    const prefs: NotificationPrefs = { ...(user.notificationPrefs ?? {}), [cat]: value };
    setSaving(cat);
    try {
      await updateUserProfile(user.uid, { notificationPrefs: prefs });
      setNotificationPrefs(prefs);
      dispatch(setUser({ ...user, notificationPrefs: prefs }));
      // Turn the phone alarm on or off right away.
      if (cat === 'dailyAlarm' && user.barangayId) {
        const config = await getCheckpointAlarm(user.barangayId).catch(() => null);
        await reconcileDailyCheckpointAlarm(config);
      }
    } catch {
      Alert.alert('Not saved', "Couldn't save your choice. Check your connection and try again.");
    } finally {
      setSaving(null);
    }
  };

  return (
    <Sheet visible={visible} title="Notification settings" onClose={onClose}>
      {!settings.notifications.enablePush && (
        <Text style={styles.notice}>Phone notifications are turned off for everyone by the administrator. Your in-app notifications still follow these choices.</Text>
      )}
      {CATEGORIES_FOR[user.role].map((cat) => (
        <View key={cat} style={styles.row}>
          <View style={{ flex: 1 }}>
            <Text style={styles.rowLabel}>{CATEGORY_INFO[cat].label}</Text>
            <Text style={styles.hint}>{CATEGORY_INFO[cat].hint}</Text>
          </View>
          {saving === cat ? <ActivityIndicator /> : (
            <Switch
              value={isOn(user.notificationPrefs, cat)}
              onValueChange={(v) => toggle(cat, v)}
              trackColor={{ false: colors.grayMid, true: colors.teal }}
              thumbColor="#fff"
            />
          )}
        </View>
      ))}
    </Sheet>
  );
}

// ─── Privacy & security ───────────────────────────────────────────────────────

export function PrivacySheet({ visible, onClose }: { visible: boolean; onClose: () => void }) {
  const { colors } = useTheme();
  const styles = useMemo(() => createStyles(colors), [colors]);
  const user = useAppSelector((s) => s.auth.user);
  const settings = useAppSettings();
  const [sending, setSending] = useState(false);

  const changePassword = async () => {
    if (!user?.email) return;
    setSending(true);
    try {
      await resetPassword(user.email);
      Alert.alert('Check your email', `We sent a link to ${user.email} to set a new password.`);
    } catch {
      Alert.alert('Not sent', "Couldn't send the email. Check your connection and try again.");
    } finally {
      setSending(false);
    }
  };

  return (
    <Sheet visible={visible} title="Privacy & security" onClose={onClose}>
      <TouchableOpacity style={styles.primary} onPress={changePassword} disabled={sending} accessibilityRole="button">
        {sending ? <ActivityIndicator color="#fff" /> : <Text style={styles.primaryText}>Change my password</Text>}
      </TouchableOpacity>
      <Text style={styles.sectionTitle}>What CleanStream keeps</Text>
      {[
        'Your name, email and barangay, to run your account.',
        'Reports you file: the photo, its location and time, and the AI result.',
        'Your location only while you file a report, or, for cleanup crews, while driving to a site. Sharing stops on arrival.',
        'ID photos from official sign-ups are deleted as soon as the Super Admin decides.',
      ].map((line) => (
        <View key={line} style={styles.bullet}><Text style={styles.bulletDot}>•</Text><Text style={styles.bulletText}>{line}</Text></View>
      ))}
      <Text style={styles.hint}>Every launch starts at the sign-in screen: CleanStream doesn't stay signed in on this phone.</Text>
      {(settings.supportEmail || settings.supportPhone) && (
        <>
          <Text style={styles.sectionTitle}>Questions or account removal</Text>
          {!!settings.supportEmail && (
            <TouchableOpacity onPress={() => Linking.openURL(`mailto:${settings.supportEmail}`)}><Text style={styles.link}>{settings.supportEmail}</Text></TouchableOpacity>
          )}
          {!!settings.supportPhone && (
            <TouchableOpacity onPress={() => Linking.openURL(`tel:${settings.supportPhone!.replace(/\s/g, '')}`)}><Text style={styles.link}>{settings.supportPhone}</Text></TouchableOpacity>
          )}
        </>
      )}
    </Sheet>
  );
}

// ─── App settings (read-only) ────────────────────────────────────────────────

export function AppSettingsSheet({ visible, onClose }: { visible: boolean; onClose: () => void }) {
  const { colors } = useTheme();
  const styles = useMemo(() => createStyles(colors), [colors]);
  const s = useAppSettings();
  const onOff = (v: boolean) => (v ? 'On' : 'Off');
  const rows: Array<[string, string]> = [
    ['AI waste analysis', onOff(s.features.aiAnalysis)],
    ['AI model', s.aiModelVersion ?? 'On-device AI'],
    ['Ask reporter below AI confidence', `${s.aiReviewThreshold}%`],
    ['Volunteer cleanups', onOff(s.features.cleanupEvents)],
    ['Messaging', onOff(s.features.messaging)],
    ['Hotspot map', onOff(s.features.mapView)],
    ['Announcements', onOff(s.features.announcements)],
    ['Phone notifications', onOff(s.notifications.enablePush)],
    ['Critical report alerts', onOff(s.notifications.criticalAlerts)],
    ['Report status updates', onOff(s.notifications.reportUpdateAlerts)],
    ['Inspection reminders', onOff(s.notifications.inspectionReminders)],
  ];
  return (
    <Sheet visible={visible} title="App settings" onClose={onClose}>
      <Text style={styles.notice}>These are set by the Super Admin in the web portal (System settings) and apply to everyone.</Text>
      {rows.map(([k, v]) => (
        <View key={k} style={styles.row}>
          <Text style={[styles.rowLabel, { flex: 1 }]}>{k}</Text>
          <Text style={styles.rowValue}>{v}</Text>
        </View>
      ))}
    </Sheet>
  );
}

const createStyles = (Colors: ThemeColors) => StyleSheet.create({
  backdrop: { flex: 1, justifyContent: 'flex-end', backgroundColor: 'rgba(0,0,0,0.4)' },
  sheet: { backgroundColor: Colors.surface, borderTopLeftRadius: 22, borderTopRightRadius: 22, padding: 18, paddingTop: 10, maxHeight: '88%' },
  handle: { alignSelf: 'center', width: 40, height: 4, borderRadius: 2, backgroundColor: Colors.grayMid, marginBottom: 10 },
  sheetHead: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 6 },
  sheetTitle: { fontSize: 18, fontWeight: '700', color: Colors.textPrimary },
  close: { fontSize: 14, fontWeight: '600', color: Colors.teal },
  label: { fontSize: 12, fontWeight: '600', color: Colors.textSecondary, marginBottom: -6 },
  input: { borderWidth: 1, borderColor: Colors.border, borderRadius: 12, paddingHorizontal: 12, paddingVertical: 11, fontSize: 15, color: Colors.textPrimary, backgroundColor: Colors.grayBg },
  hint: { fontSize: 12, color: Colors.textMuted, lineHeight: 17 },
  error: { fontSize: 13, color: Colors.red },
  notice: { fontSize: 12, color: Colors.blueText, backgroundColor: Colors.blueBg, borderRadius: 10, padding: 10, lineHeight: 17 },
  primary: { backgroundColor: Colors.teal, borderRadius: 14, paddingVertical: 14, alignItems: 'center' },
  primaryText: { color: '#fff', fontSize: 15, fontWeight: '700' },
  row: { flexDirection: 'row', alignItems: 'center', gap: 12, paddingVertical: 6, borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: Colors.border },
  rowLabel: { fontSize: 14, fontWeight: '600', color: Colors.textPrimary },
  rowValue: { fontSize: 14, color: Colors.textSecondary },
  sectionTitle: { fontSize: 14, fontWeight: '700', color: Colors.textPrimary, marginTop: 6 },
  bullet: { flexDirection: 'row', gap: 8 },
  bulletDot: { color: Colors.teal, fontSize: 14 },
  bulletText: { flex: 1, fontSize: 13, color: Colors.textSecondary, lineHeight: 19 },
  link: { fontSize: 14, fontWeight: '600', color: Colors.teal },
});
