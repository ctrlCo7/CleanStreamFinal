import React, { useState } from 'react';
import {
  View, Text, TextInput, TouchableOpacity, StyleSheet,
  ScrollView, Alert, ActivityIndicator, KeyboardAvoidingView, Platform,
} from 'react-native';
import { NativeStackScreenProps } from '@react-navigation/native-stack';
import { Colors } from '../../constants/colors';
import { RootStackParamList, UserRole } from '../../types';
import { useAppDispatch, useAppSelector } from '../../store/hooks';
import { register, clearError } from '../../store/authSlice';

type Props = NativeStackScreenProps<RootStackParamList, 'Signup'>;

const ROLES: { id: UserRole; label: string; bg: string; textColor: string }[] = [
  { id: 'citizen', label: 'Citizen', bg: Colors.tealLight, textColor: Colors.tealDark },
  { id: 'admin', label: 'Admin', bg: Colors.blueBg, textColor: Colors.blueText },
  { id: 'barangay', label: 'Barangay', bg: Colors.purpleBg, textColor: Colors.purpleText },
];

export default function SignupScreen({ navigation }: Props) {
  const dispatch = useAppDispatch();
  const { loading } = useAppSelector((s) => s.auth);
  const [role, setRole] = useState<UserRole>('citizen');
  const [firstName, setFirstName] = useState('');
  const [lastName, setLastName] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [barangay, setBarangay] = useState('');
  const [employeeId, setEmployeeId] = useState('');
  const [agency, setAgency] = useState('');

  const handleRegister = async () => {
    if (!firstName.trim() || !lastName.trim() || !email.trim() || !password.trim()) {
      Alert.alert('Missing fields', 'Please fill in all required fields.');
      return;
    }
    if (password.length < 6) {
      Alert.alert('Weak password', 'Password must be at least 6 characters.');
      return;
    }
    dispatch(clearError());
    const result = await dispatch(
      register({ email: email.trim(), password, firstName, lastName, role, barangay, employeeId, agency }),
    );
    if (register.rejected.match(result)) {
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
              <Text style={[styles.roleLabel, { color: role === r.id ? r.textColor : Colors.textMuted }]}>{r.label}</Text>
            </TouchableOpacity>
          ))}
        </View>

        <View style={styles.twoCol}>
          <View style={[styles.field, styles.flex]}>
            <Text style={styles.fieldLabel}>First name</Text>
            <TextInput style={styles.input} placeholder="Juan" placeholderTextColor={Colors.textHint} value={firstName} onChangeText={setFirstName} />
          </View>
          <View style={[styles.field, styles.flex]}>
            <Text style={styles.fieldLabel}>Last name</Text>
            <TextInput style={styles.input} placeholder="Dela Cruz" placeholderTextColor={Colors.textHint} value={lastName} onChangeText={setLastName} />
          </View>
        </View>

        <View style={styles.field}>
          <Text style={styles.fieldLabel}>Email</Text>
          <TextInput style={styles.input} placeholder="you@example.com" placeholderTextColor={Colors.textHint} keyboardType="email-address" autoCapitalize="none" value={email} onChangeText={setEmail} />
        </View>

        {(role === 'citizen' || role === 'barangay') && (
          <View style={styles.field}>
            <Text style={styles.fieldLabel}>Barangay</Text>
            <TextInput style={styles.input} placeholder="e.g. Punta Princesa" placeholderTextColor={Colors.textHint} value={barangay} onChangeText={setBarangay} />
          </View>
        )}

        {role === 'admin' && (
          <>
            <View style={styles.field}>
              <Text style={styles.fieldLabel}>Employee ID</Text>
              <TextInput style={styles.input} placeholder="CENRO-2024-XXXX" placeholderTextColor={Colors.textHint} value={employeeId} onChangeText={setEmployeeId} />
            </View>
            <View style={styles.field}>
              <Text style={styles.fieldLabel}>Agency</Text>
              <TextInput style={styles.input} placeholder="CENRO, Cebu City" placeholderTextColor={Colors.textHint} value={agency} onChangeText={setAgency} />
            </View>
          </>
        )}

        <View style={styles.field}>
          <Text style={styles.fieldLabel}>Password</Text>
          <TextInput style={styles.input} placeholder="Create password (min 6 chars)" placeholderTextColor={Colors.textHint} secureTextEntry value={password} onChangeText={setPassword} />
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

const styles = StyleSheet.create({
  flex: { flex: 1, backgroundColor: Colors.white },
  container: { flexGrow: 1, padding: 22, paddingTop: 48 },
  header: { alignItems: 'center', marginBottom: 16 },
  logo: { width: 60, height: 60, borderRadius: 18, backgroundColor: Colors.tealLight, marginBottom: 12 },
  heading: { fontSize: 21, fontWeight: '500', color: Colors.textPrimary },
  subheading: { fontSize: 12, color: Colors.textMuted, marginTop: 4 },
  sectionLabel: { fontSize: 11, fontWeight: '500', color: Colors.textSecondary, marginBottom: 7 },
  roleRow: { flexDirection: 'row', gap: 7, marginBottom: 16 },
  roleCard: {
    flex: 1, borderRadius: 12, borderWidth: 0.5, borderColor: Colors.borderMid,
    padding: 11, alignItems: 'center', backgroundColor: Colors.white,
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
  primaryBtn: { backgroundColor: Colors.teal, borderRadius: 12, paddingVertical: 12, alignItems: 'center', marginTop: 4 },
  primaryBtnText: { color: '#fff', fontSize: 13, fontWeight: '500' },
  switchRow: { flexDirection: 'row', justifyContent: 'center', marginTop: 14 },
  switchText: { fontSize: 11, color: Colors.textMuted },
  switchLink: { fontSize: 11, color: Colors.teal, fontWeight: '500' },
});
