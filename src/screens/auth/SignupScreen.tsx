import { NativeStackScreenProps } from '@react-navigation/native-stack';
import React, { useEffect, useMemo, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  KeyboardAvoidingView, Platform,
  ScrollView,
  StyleSheet,
  Text, TextInput, TouchableOpacity,
  View,
} from 'react-native';
import { useTheme } from '../../hooks/useTheme';
import { ThemeColors } from '../../constants/theme';
import { clearError, register, setUser } from '../../store/authSlice';
import { useAppDispatch, useAppSelector } from '../../store/hooks';
import { RootStackParamList, UserRole } from '../../types';
import { CEBU_BARANGAYS } from '../../services/locationService';
import { requiresIdentityCheck } from '../../services/authService';
import { idTypeLabel } from '../../services/identityChecks';
import { clearIdentityDraft, getIdentityDraft } from '../../store/identityDraft';

type Props = NativeStackScreenProps<RootStackParamList, 'Signup'>;

function buildRoles(colors: ThemeColors) {
  return [
    { id: 'citizen' as UserRole, label: 'Citizen', bg: colors.tealLight, textColor: colors.tealDark },
    { id: 'admin' as UserRole, label: 'Admin', bg: colors.blueBg, textColor: colors.blueText },
    { id: 'barangay' as UserRole, label: 'Barangay', bg: colors.purpleBg, textColor: colors.purpleText },
  ];
}

export default function SignupScreen({ navigation }: Props) {
  const dispatch = useAppDispatch();
  const { colors } = useTheme();
  const styles = useMemo(() => createStyles(colors), [colors]);
  const ROLES = useMemo(() => buildRoles(colors), [colors]);
  const { loading } = useAppSelector((s) => s.auth);
  const [role, setRole] = useState<UserRole>('citizen');
  const [firstName, setFirstName] = useState('');
  const [lastName, setLastName] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [barangayId, setBarangayId] = useState('');
  const [employeeId, setEmployeeId] = useState('');
  const [agency, setAgency] = useState('');

  const selectedBarangay = CEBU_BARANGAYS.find((b) => b.id === barangayId);

  // The ID photo and selfies are captured on their own screen and handed back through memory.
  const [evidence, setEvidence] = useState(getIdentityDraft());
  useEffect(() => {
    const unsubscribe = navigation.addListener('focus', () => setEvidence(getIdentityDraft()));
    return unsubscribe;
  }, [navigation]);
  const needsId = requiresIdentityCheck(role);

  const handleRegister = async () => {
    if (!firstName.trim() || !lastName.trim() || !email.trim() || !password.trim()) {
      Alert.alert('Missing fields', 'Please fill in all required fields.');
      return;
    }
    if (password.length < 6) {
      Alert.alert('Weak password', 'Password must be at least 6 characters.');
      return;
    }
    if ((role === 'citizen' || role === 'barangay') && !selectedBarangay) {
      Alert.alert('Barangay required', 'Please select your barangay.');
      return;
    }
    if (role === 'barangay' && !employeeId.trim()) {
      Alert.alert('Employee ID required', 'Please enter your BSP employee ID.');
      return;
    }
    if (role === 'admin' && !employeeId.trim()) {
      Alert.alert('Employee ID required', 'Please enter your employee ID.');
      return;
    }
    if (needsId && !evidence) {
      Alert.alert('Verify your identity', 'Admin and Barangay Official accounts need a photo of a valid ID and a few selfies so the Super Admin can confirm it is you.');
      return;
    }
    dispatch(clearError());
    const result = await dispatch(
      register({
        email: email.trim(),
        password,
        firstName,
        lastName,
        role,
        barangay: selectedBarangay?.name,
        barangayId: selectedBarangay?.id,
        employeeId,
        agency,
        evidence: needsId ? evidence ?? undefined : undefined,
      }),
    );
    if (register.fulfilled.match(result)) {
      clearIdentityDraft();
      dispatch(setUser(null));
      if (needsId) {
        Alert.alert('Account created', 'Your ID is now with the Super Admin for review. Sign in to see the status. You will get access once it is approved.');
      }
      navigation.navigate('Login');
    } else {
      Alert.alert('Sign up failed', result.payload as string || 'Please try again.');
    }
  };

  return (
    <KeyboardAvoidingView style={styles.flex} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
      <ScrollView style={styles.flex} contentContainerStyle={styles.container} keyboardShouldPersistTaps="handled">
        <View style={styles.header}>
          <View style={styles.logo} />
          <Text style={styles.heading}>Create account</Text>
          <Text style={styles.subheading}>Join CleanStream</Text>
        </View>

        <Text style={styles.sectionLabel}>I am a...</Text>
        <View style={styles.roleRow}>
          {ROLES.map((r) => (
            <TouchableOpacity
              key={r.id}
              style={[styles.roleCard, role === r.id && { borderColor: r.textColor, backgroundColor: r.bg, borderWidth: 1.5 }]}
              onPress={() => setRole(r.id)}
              activeOpacity={0.85}
            >
              <Text style={[styles.roleLabel, { color: role === r.id ? r.textColor : colors.textMuted }]}>{r.label}</Text>
            </TouchableOpacity>
          ))}
        </View>

        <View style={styles.twoCol}>
          <View style={[styles.field, styles.flex]}>
            <Text style={styles.fieldLabel}>First name</Text>
            <TextInput style={styles.input} placeholder="Juan" placeholderTextColor={colors.textHint} value={firstName} onChangeText={setFirstName} />
          </View>
          <View style={[styles.field, styles.flex]}>
            <Text style={styles.fieldLabel}>Last name</Text>
            <TextInput style={styles.input} placeholder="Dela Cruz" placeholderTextColor={colors.textHint} value={lastName} onChangeText={setLastName} />
          </View>
        </View>

        <View style={styles.field}>
          <Text style={styles.fieldLabel}>Email</Text>
          <TextInput style={styles.input} placeholder="you@example.com" placeholderTextColor={colors.textHint} keyboardType="email-address" autoCapitalize="none" value={email} onChangeText={setEmail} />
        </View>

        {(role === 'citizen' || role === 'barangay') && (
          <View style={styles.field}>
            <Text style={styles.fieldLabel}>Barangay</Text>
            <View style={styles.barangayWrap}>
              {CEBU_BARANGAYS.map((b) => (
                <TouchableOpacity
                  key={b.id}
                  style={[styles.barangayChip, barangayId === b.id && styles.barangayChipActive]}
                  onPress={() => setBarangayId(b.id)}
                  activeOpacity={0.85}
                >
                  <Text style={[styles.barangayChipText, barangayId === b.id && styles.barangayChipTextActive]}>
                    {b.name}
                  </Text>
                </TouchableOpacity>
              ))}
            </View>
          </View>
        )}

        {role === 'barangay' && (
          <View style={styles.field}>
            <Text style={styles.fieldLabel}>Employee ID (BSP)</Text>
            <TextInput style={styles.input} placeholder="BSP-2024-XXXX" placeholderTextColor={colors.textHint} value={employeeId} onChangeText={setEmployeeId} />
          </View>
        )}

        {role === 'admin' && (
          <>
            <View style={styles.field}>
              <Text style={styles.fieldLabel}>Employee ID</Text>
              <TextInput style={styles.input} placeholder="CENRO-2024-XXXX" placeholderTextColor={colors.textHint} value={employeeId} onChangeText={setEmployeeId} />
            </View>
            <View style={styles.field}>
              <Text style={styles.fieldLabel}>Agency (optional)</Text>
              <TextInput style={styles.input} placeholder="CENRO, Cebu City" placeholderTextColor={colors.textHint} value={agency} onChangeText={setAgency} />
            </View>
          </>
        )}

        {needsId && (
          <View style={styles.idBox}>
            <Text style={styles.idTitle}>Identity verification</Text>
            <Text style={styles.idText}>
              To protect the system, {role === 'admin' ? 'Admin' : 'Barangay Official'} accounts must be verified. You’ll photograph a valid government ID and take three quick selfies. The Super Admin checks that the face on the ID is yours before your account is approved.
            </Text>
            {evidence ? (
              <Text style={styles.idDone}>✓ {idTypeLabel(evidence.idType)} and selfies captured</Text>
            ) : (
              <Text style={styles.idPending}>Not done yet</Text>
            )}
            <TouchableOpacity
              style={styles.idBtn}
              onPress={() => navigation.navigate('IdentityVerification', { mode: 'signup', firstName: firstName.trim(), lastName: lastName.trim() })}
              activeOpacity={0.85}
            >
              <Text style={styles.idBtnText}>{evidence ? 'Retake ID and selfies' : 'Verify my identity'}</Text>
            </TouchableOpacity>
          </View>
        )}

        <View style={styles.field}>
          <Text style={styles.fieldLabel}>Password</Text>
          <TextInput style={styles.input} placeholder="Create password (min 6 chars)" placeholderTextColor={colors.textHint} secureTextEntry value={password} onChangeText={setPassword} />
        </View>

        <TouchableOpacity style={styles.primaryBtn} onPress={handleRegister} disabled={loading} activeOpacity={0.85}>
          {loading ? <ActivityIndicator color="#fff" /> : <Text style={styles.primaryBtnText}>Create account</Text>}
        </TouchableOpacity>

        <View style={styles.switchRow}>
          <Text style={styles.switchText}>Have account? </Text>
          <TouchableOpacity onPress={() => navigation.navigate('Login')}>
            <Text style={styles.switchLink}>Sign in</Text>
          </TouchableOpacity>
        </View>
      </ScrollView>
    </KeyboardAvoidingView>
  );
}

const createStyles = (Colors: ThemeColors) => StyleSheet.create({
  flex: { flex: 1, backgroundColor: Colors.white },
  container: { flexGrow: 1, padding: 22, paddingTop: 48 },
  header: { alignItems: 'center', marginBottom: 16 },
  logo: { width: 60, height: 60, borderRadius: 18, backgroundColor: Colors.tealLight, marginBottom: 12 },
  heading: { fontSize: 21, fontWeight: '500', color: Colors.textPrimary },
  subheading: { fontSize: 12, color: Colors.textMuted, marginTop: 4 },
  sectionLabel: { fontSize: 11, fontWeight: '500', color: Colors.textSecondary, marginBottom: 7 },
  roleRow: { flexDirection: 'row', gap: 7, marginBottom: 16 },
  roleCard: {
    flex: 1, borderRadius: 16,
    padding: 14, alignItems: 'center', backgroundColor: Colors.white,
    shadowColor: Colors.shadow, shadowOffset: { width: 0, height: 2 }, shadowOpacity: 0.05, shadowRadius: 8, elevation: 1,
  },
  roleLabel: { fontSize: 10, fontWeight: '500', textAlign: 'center' },
  twoCol: { flexDirection: 'row', gap: 9, marginBottom: 0 },
  field: { marginBottom: 10 },
  fieldLabel: { fontSize: 11, fontWeight: '500', color: Colors.textSecondary, marginBottom: 4 },
  input: {
    backgroundColor: Colors.white, borderWidth: 0.5, borderColor: Colors.borderMid,
    borderRadius: 10, paddingHorizontal: 13, paddingVertical: 10,
    fontSize: 13, color: Colors.textPrimary,
  },
  barangayWrap: { flexDirection: 'row', flexWrap: 'wrap', gap: 6 },
  barangayChip: {
    borderRadius: 20, borderWidth: 0.5, borderColor: Colors.borderMid,
    paddingHorizontal: 12, paddingVertical: 7, backgroundColor: Colors.white,
  },
  barangayChipActive: { backgroundColor: Colors.tealLight, borderColor: Colors.teal },
  barangayChipText: { fontSize: 11, color: Colors.textMuted, fontWeight: '500' },
  barangayChipTextActive: { color: Colors.tealDark },
  idBox: { backgroundColor: Colors.grayBg, borderRadius: 14, padding: 14, gap: 8, marginBottom: 14 },
  idTitle: { fontSize: 14, fontWeight: '600', color: Colors.textPrimary },
  idText: { fontSize: 12, color: Colors.textMuted, lineHeight: 17 },
  idDone: { fontSize: 13, fontWeight: '600', color: Colors.tealDark },
  idPending: { fontSize: 13, color: Colors.amberText },
  idBtn: { backgroundColor: Colors.white, borderWidth: 1, borderColor: Colors.teal, borderRadius: 10, paddingVertical: 11, alignItems: 'center' },
  idBtnText: { fontSize: 13, fontWeight: '600', color: Colors.tealDark },
  primaryBtn: {
    backgroundColor: Colors.teal, borderRadius: 12, paddingVertical: 12, alignItems: 'center', marginTop: 4,
    shadowColor: Colors.shadow, shadowOffset: { width: 0, height: 3 }, shadowOpacity: 0.18, shadowRadius: 8, elevation: 3,
  },
  primaryBtnText: { color: '#fff', fontSize: 13, fontWeight: '500' },
  switchRow: { flexDirection: 'row', justifyContent: 'center', marginTop: 14 },
  switchText: { fontSize: 11, color: Colors.textMuted },
  switchLink: { fontSize: 11, color: Colors.teal, fontWeight: '500' },
});
