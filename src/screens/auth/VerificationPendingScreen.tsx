import { NativeStackScreenProps } from '@react-navigation/native-stack';
import React, { useEffect, useMemo, useState } from 'react';
import { ScrollView, StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { ThemeColors } from '../../constants/theme';
import { useTheme } from '../../hooks/useTheme';
import { hasSubmittedEvidence, subscribeToOwnProfile } from '../../services/identityVerificationService';
import { logout, setUser } from '../../store/authSlice';
import { useAppDispatch, useAppSelector } from '../../store/hooks';
import { RootStackParamList } from '../../types';

type Props = NativeStackScreenProps<RootStackParamList, 'VerificationPending'>;

/**
 * Everything an Admin or Barangay Official applicant sees until the Super Admin approves their
 * ID. They have no app access yet; this screen follows the decision live and lets the app
 * open as soon as they are approved.
 */
export default function VerificationPendingScreen({ navigation }: Props) {
  const { colors } = useTheme();
  const styles = useMemo(() => createStyles(colors), [colors]);
  const dispatch = useAppDispatch();
  const user = useAppSelector((s) => s.auth.user);
  const [evidenceSent, setEvidenceSent] = useState<boolean | null>(null);

  useEffect(() => {
    if (!user) return undefined;
    return subscribeToOwnProfile(user.uid, (profile) => {
      if (!profile) return;
      if (profile.isActive === false) { dispatch(logout()); return; }
      // Approval (or any other change) updates the stored user; the navigator then opens the app.
      dispatch(setUser(profile));
    });
  }, [dispatch, user?.uid]);

  useEffect(() => {
    if (user?.idVerification !== 'pending') return;
    hasSubmittedEvidence(user.uid).then(setEvidenceSent).catch(() => setEvidenceSent(null));
  }, [user?.uid, user?.idVerification]);

  if (!user) return null;
  const rejected = user.idVerification === 'rejected';
  const missing = user.idVerification === 'pending' && evidenceSent === false;
  const roleLabel = user.role === 'admin' ? 'Admin' : 'Barangay Official';

  const resubmit = () => navigation.navigate('IdentityVerification', { mode: 'resubmit', firstName: user.firstName, lastName: user.lastName });

  return (
    <SafeAreaView style={styles.container}>
      <ScrollView contentContainerStyle={styles.body}>
        <View style={[styles.badge, rejected || missing ? styles.badgeWarn : styles.badgeOk]}>
          <Text style={styles.badgeIcon}>{rejected ? '✗' : missing ? '!' : '⏳'}</Text>
        </View>

        <Text style={styles.title}>
          {rejected ? 'We couldn’t verify your ID' : missing ? 'We still need your ID photos' : 'Your account is under review'}
        </Text>

        <Text style={styles.text}>
          {rejected
            ? `Your ${roleLabel} application wasn’t approved.`
            : missing
              ? `Your ${roleLabel} account was created, but your ID photos didn’t upload. Please send them again.`
              : `Thanks, ${user.firstName}. The Super Admin is checking your ID and selfies for your ${roleLabel} account. You’ll get access as soon as it’s approved. This screen updates by itself.`}
        </Text>

        {rejected && !!user.idRejectionReason && (
          <View style={styles.reasonBox}>
            <Text style={styles.reasonLabel}>Reason</Text>
            <Text style={styles.reasonText}>{user.idRejectionReason}</Text>
          </View>
        )}

        {(rejected || missing) && (
          <TouchableOpacity style={styles.primaryBtn} onPress={resubmit} activeOpacity={0.85}>
            <Text style={styles.primaryBtnText}>{rejected ? 'Submit new photos' : 'Send my ID photos'}</Text>
          </TouchableOpacity>
        )}

        <Text style={styles.small}>Your ID photos are visible only to the Super Admin and are deleted once the review is done.</Text>

        <TouchableOpacity style={styles.linkBtn} onPress={() => dispatch(logout())}>
          <Text style={styles.linkText}>Sign out</Text>
        </TouchableOpacity>
      </ScrollView>
    </SafeAreaView>
  );
}

const createStyles = (Colors: ThemeColors) => StyleSheet.create({
  container: { flex: 1, backgroundColor: Colors.white },
  body: { flexGrow: 1, alignItems: 'center', justifyContent: 'center', padding: 28, gap: 14 },
  badge: { width: 76, height: 76, borderRadius: 38, alignItems: 'center', justifyContent: 'center' },
  badgeOk: { backgroundColor: Colors.tealLight },
  badgeWarn: { backgroundColor: Colors.amberBg },
  badgeIcon: { fontSize: 32 },
  title: { fontSize: 20, fontWeight: '600', color: Colors.textPrimary, textAlign: 'center' },
  text: { fontSize: 14, color: Colors.textMuted, textAlign: 'center', lineHeight: 21, maxWidth: 340 },
  reasonBox: { alignSelf: 'stretch', backgroundColor: Colors.amberBg, borderRadius: 12, padding: 14, gap: 4 },
  reasonLabel: { fontSize: 11, fontWeight: '700', color: Colors.amberText, textTransform: 'uppercase' },
  reasonText: { fontSize: 14, color: Colors.amberText, lineHeight: 20 },
  primaryBtn: { alignSelf: 'stretch', backgroundColor: Colors.teal, borderRadius: 12, paddingVertical: 14, alignItems: 'center' },
  primaryBtnText: { color: '#fff', fontSize: 14, fontWeight: '600' },
  small: { fontSize: 12, color: Colors.textHint, textAlign: 'center', lineHeight: 17, maxWidth: 320 },
  linkBtn: { paddingVertical: 10 },
  linkText: { fontSize: 14, color: Colors.teal, fontWeight: '600' },
});
