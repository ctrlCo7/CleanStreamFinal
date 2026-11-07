import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { ActivityIndicator, Alert, AppState, ScrollView, StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { ThemeColors } from '../../constants/theme';
import { useTheme } from '../../hooks/useTheme';
import { checkEmailConfirmed, resendConfirmationEmail } from '../../services/authService';
import { logout, setUser } from '../../store/authSlice';
import { useAppDispatch, useAppSelector } from '../../store/hooks';

const RESEND_WAIT_S = 60;

const resendError = (e: unknown): string => {
  const code = (e as { code?: string })?.code ?? '';
  if (code === 'auth/too-many-requests') return 'Too many emails were sent. Wait a few minutes, then try again.';
  if (code === 'auth/network-request-failed') return 'No internet connection. Connect and try again.';
  return 'The email could not be sent. Try again in a moment.';
};

/**
 * Shown to citizens, officials and Captains who signed themselves up, until they tap the link
 * in the confirmation email. Checks again whenever they come back to the app (e.g. from Gmail).
 */
export default function VerifyEmailScreen() {
  const { colors } = useTheme();
  const styles = useMemo(() => createStyles(colors), [colors]);
  const dispatch = useAppDispatch();
  const user = useAppSelector((s) => s.auth.user);
  const [checking, setChecking] = useState(false);
  const [sending, setSending] = useState(false);
  const [wait, setWait] = useState(RESEND_WAIT_S);
  const [notYet, setNotYet] = useState(false);
  const busy = useRef(false);

  // Count down before the email can be sent again (it was just sent at sign-up).
  useEffect(() => {
    if (wait <= 0) return undefined;
    const t = setTimeout(() => setWait((w) => w - 1), 1000);
    return () => clearTimeout(t);
  }, [wait]);

  const check = useCallback(async (quiet: boolean) => {
    if (busy.current || !user) return;
    busy.current = true;
    if (!quiet) setChecking(true);
    try {
      if (await checkEmailConfirmed()) {
        // A fresh copy of the profile makes the app re-check and open the normal screens.
        dispatch(setUser({ ...user }));
      } else if (!quiet) {
        setNotYet(true);
      }
    } catch {
      if (!quiet) Alert.alert('Could not check', 'Check your internet connection and try again.');
    } finally {
      busy.current = false;
      setChecking(false);
    }
  }, [dispatch, user]);

  // Coming back from the email app: check automatically.
  useEffect(() => {
    const sub = AppState.addEventListener('change', (s) => { if (s === 'active') check(true); });
    return () => sub.remove();
  }, [check]);

  const resend = async () => {
    setSending(true);
    try {
      await resendConfirmationEmail();
      setWait(RESEND_WAIT_S);
      setNotYet(false);
      Alert.alert('Email sent', `We sent a new confirmation link to ${user?.email}. Check your inbox and spam folder.`);
    } catch (e) {
      Alert.alert('Not sent', resendError(e));
    } finally {
      setSending(false);
    }
  };

  return (
    <SafeAreaView style={styles.container}>
      <ScrollView contentContainerStyle={styles.body}>
        <View style={styles.icon}><Text style={styles.iconText}>✉</Text></View>
        <Text style={styles.title}>Confirm your email</Text>
        <Text style={styles.text}>
          We sent a confirmation link to
        </Text>
        <Text style={styles.email} selectable>{user?.email}</Text>
        <Text style={styles.text}>
          Open the email and tap the link, then come back here. This keeps CleanStream accounts real and makes sure password resets reach you.
        </Text>

        {notYet && (
          <View style={styles.note}>
            <Text style={styles.noteText}>Not confirmed yet. Tap the link in the email first. If you can't find it, check your spam folder or send it again.</Text>
          </View>
        )}

        <TouchableOpacity style={[styles.primary, checking && { opacity: 0.6 }]} onPress={() => check(false)} disabled={checking} accessibilityRole="button">
          {checking ? <ActivityIndicator color="#fff" /> : <Text style={styles.primaryText}>I've confirmed it</Text>}
        </TouchableOpacity>

        <TouchableOpacity
          style={[styles.secondary, (wait > 0 || sending) && { opacity: 0.5 }]}
          onPress={resend}
          disabled={wait > 0 || sending}
          accessibilityRole="button"
        >
          <Text style={styles.secondaryText}>{sending ? 'Sending…' : wait > 0 ? `Send the email again (${wait}s)` : 'Send the email again'}</Text>
        </TouchableOpacity>

        <TouchableOpacity onPress={() => dispatch(logout())} accessibilityRole="button">
          <Text style={styles.link}>Wrong email? Sign out and sign up again</Text>
        </TouchableOpacity>
      </ScrollView>
    </SafeAreaView>
  );
}

const createStyles = (C: ThemeColors) => StyleSheet.create({
  container: { flex: 1, backgroundColor: C.appBg },
  body: { flexGrow: 1, justifyContent: 'center', padding: 24, gap: 12 },
  icon: { alignSelf: 'center', width: 72, height: 72, borderRadius: 36, backgroundColor: C.tealLight, alignItems: 'center', justifyContent: 'center', marginBottom: 8 },
  iconText: { fontSize: 32, color: C.tealDark },
  title: { fontSize: 22, fontWeight: '700', color: C.textPrimary, textAlign: 'center' },
  text: { fontSize: 14, color: C.textSecondary, textAlign: 'center', lineHeight: 20 },
  email: { fontSize: 15, fontWeight: '700', color: C.textPrimary, textAlign: 'center' },
  note: { backgroundColor: C.amberBg, borderRadius: 10, padding: 12 },
  noteText: { fontSize: 13, color: C.amberText, lineHeight: 18 },
  primary: { backgroundColor: C.teal, borderRadius: 12, paddingVertical: 14, alignItems: 'center', marginTop: 8 },
  primaryText: { color: '#fff', fontWeight: '700', fontSize: 15 },
  secondary: { borderRadius: 12, paddingVertical: 13, alignItems: 'center', borderWidth: 1, borderColor: C.borderMid, backgroundColor: C.surface },
  secondaryText: { color: C.textPrimary, fontWeight: '600', fontSize: 14 },
  link: { color: C.tealDark, fontSize: 13, fontWeight: '600', textAlign: 'center', marginTop: 8 },
});
