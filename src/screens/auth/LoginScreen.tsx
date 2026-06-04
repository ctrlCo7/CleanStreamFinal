import React, { useState } from 'react';
import {
  View, Text, TextInput, TouchableOpacity, StyleSheet,
  ScrollView, Alert, ActivityIndicator, KeyboardAvoidingView, Platform,
} from 'react-native';
import { NativeStackScreenProps } from '@react-navigation/native-stack';
import Svg, { Path, Rect, Circle } from 'react-native-svg';
import { Colors } from '../../constants/colors';
import { RootStackParamList, UserRole } from '../../types';
import { useAppDispatch, useAppSelector } from '../../store/hooks';
import { login, clearError } from '../../store/authSlice';

type Props = NativeStackScreenProps<RootStackParamList, 'Login'>;

const ROLES: { id: UserRole; label: string; bg: string; textColor: string; icon: React.ReactNode }[] = [
  {
    id: 'citizen',
    label: 'Citizen',
    bg: Colors.tealLight,
    textColor: Colors.tealDark,
    icon: (
      <Svg width={18} height={18} viewBox="0 0 16 16" fill="none">
        <Circle cx="8" cy="5" r="3" stroke={Colors.teal} strokeWidth="1.8" strokeLinecap="round" />
        <Path d="M2 14c0-4 12-4 12 0" stroke={Colors.teal} strokeWidth="1.8" strokeLinecap="round" />
      </Svg>
    ),
  },
  {
    id: 'admin',
    label: 'Admin',
    bg: Colors.blueBg,
    textColor: Colors.blueText,
    icon: (
      <Svg width={18} height={18} viewBox="0 0 16 16" fill="none">
        <Rect x="2" y="8" width="12" height="7" rx="1" stroke={Colors.blueText} strokeWidth="1.8" strokeLinecap="round" />
        <Path d="M5 8V6a3 3 0 0 1 6 0v2" stroke={Colors.blueText} strokeWidth="1.8" strokeLinecap="round" />
      </Svg>
    ),
  },
  {
    id: 'barangay',
    label: 'Barangay',
    bg: Colors.purpleBg,
    textColor: Colors.purpleText,
    icon: (
      <Svg width={18} height={18} viewBox="0 0 16 16" fill="none">
        <Path d="M2 13V7l6-5 6 5v6" stroke={Colors.purpleText} strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" />
        <Path d="M6 13v-3h4v3" stroke={Colors.purpleText} strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" />
      </Svg>
    ),
  },
];

export default function LoginScreen({ navigation }: Props) {
  const dispatch = useAppDispatch();
  const { loading, error } = useAppSelector((s) => s.auth);
  const [selectedRole, setSelectedRole] = useState<UserRole>('citizen');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');

  const handleLogin = async () => {
    if (!email.trim() || !password.trim()) {
      Alert.alert('Missing fields', 'Please enter email and password.');
      return;
    }
    dispatch(clearError());
    const result = await dispatch(login({ email: email.trim(), password }));
    if (login.rejected.match(result)) {
      Alert.alert('Sign in failed', result.payload as string || 'Please check your credentials.');
    }
    // Navigation handled by RootNavigator watching auth state
  };

  return (
    <KeyboardAvoidingView
      style={styles.flex}
      behavior={Platform.OS === 'ios' ? 'padding' : undefined}
    >
      <ScrollView
        style={styles.flex}
        contentContainerStyle={styles.container}
        keyboardShouldPersistTaps="handled"
      >
        {/* Logo */}
        <View style={styles.logoWrap}>
          <View style={styles.logo}>
            <Svg width={36} height={36} viewBox="0 0 36 36" fill="none">
              <Path d="M4 24 Q9 18 14 21 Q19 24 24 18 Q29 12 32 15" stroke={Colors.teal} strokeWidth="2.5" strokeLinecap="round" />
              <Path d="M13 8 L18 5 L23 8 L23 17 Q18 21 13 17 Z" stroke={Colors.teal} strokeWidth="1.8" strokeLinejoin="round" fill={Colors.tealLight} />
              <Circle cx="18" cy="12" r="2.5" fill={Colors.teal} />
            </Svg>
          </View>
          <Text style={styles.heading}>Welcome back</Text>
          <Text style={styles.subheading}>Sign in to CleanStream</Text>
        </View>

        {/* Role picker */}
        <Text style={styles.roleLbl}>Select your role</Text>
        <View style={styles.roleRow}>
          {ROLES.map((role) => (
            <TouchableOpacity
              key={role.id}
              style={[
                styles.roleCard,
                selectedRole === role.id && {
                  borderColor: role.textColor,
                  backgroundColor: role.bg,
                  borderWidth: 1.5,
                },
              ]}
              onPress={() => setSelectedRole(role.id)}
              activeOpacity={0.85}
            >
              <View style={[styles.roleIcon, { backgroundColor: role.bg }]}>
                {role.icon}
              </View>
              <Text style={[styles.roleLabel, { color: selectedRole === role.id ? role.textColor : Colors.textMuted }]}>
                {role.label}
              </Text>
            </TouchableOpacity>
          ))}
        </View>

        {/* Email */}
        <View style={styles.field}>
          <Text style={styles.fieldLabel}>Email</Text>
          <TextInput
            style={styles.input}
            placeholder="you@example.com"
            placeholderTextColor={Colors.textHint}
            keyboardType="email-address"
            autoCapitalize="none"
            value={email}
            onChangeText={setEmail}
          />
        </View>

        {/* Password */}
        <View style={styles.field}>
          <Text style={styles.fieldLabel}>Password</Text>
          <TextInput
            style={styles.input}
            placeholder="Enter password"
            placeholderTextColor={Colors.textHint}
            secureTextEntry
            value={password}
            onChangeText={setPassword}
          />
        </View>

        <TouchableOpacity style={styles.forgotWrap} onPress={() => Alert.alert('Reset', 'Password reset email sent')}>
          <Text style={styles.forgotText}>Forgot password?</Text>
        </TouchableOpacity>

        <TouchableOpacity
          style={styles.primaryBtn}
          onPress={handleLogin}
          disabled={loading}
          activeOpacity={0.85}
        >
          {loading ? (
            <ActivityIndicator color="#fff" />
          ) : (
            <Text style={styles.primaryBtnText}>Sign in</Text>
          )}
        </TouchableOpacity>

        <View style={styles.switchRow}>
          <Text style={styles.switchText}>No account? </Text>
          <TouchableOpacity onPress={() => navigation.navigate('Signup')}>
            <Text style={styles.switchLink}>Sign up</Text>
          </TouchableOpacity>
        </View>
      </ScrollView>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1, backgroundColor: Colors.white },
  container: { flexGrow: 1, padding: 22, paddingTop: 48 },
  logoWrap: { alignItems: 'center', marginBottom: 20 },
  logo: {
    width: 60, height: 60, borderRadius: 18,
    backgroundColor: Colors.tealLight, alignItems: 'center', justifyContent: 'center',
    marginBottom: 12,
  },
  heading: { fontSize: 21, fontWeight: '500', color: Colors.textPrimary },
  subheading: { fontSize: 12, color: Colors.textMuted, marginTop: 4 },
  roleLbl: { fontSize: 11, fontWeight: '500', color: Colors.textSecondary, marginBottom: 7 },
  roleRow: { flexDirection: 'row', gap: 7, marginBottom: 18 },
  roleCard: {
    flex: 1, borderRadius: 12, borderWidth: 0.5, borderColor: Colors.borderMid,
    padding: 11, alignItems: 'center', gap: 6, backgroundColor: Colors.white,
  },
  roleIcon: { width: 36, height: 36, borderRadius: 10, alignItems: 'center', justifyContent: 'center' },
  roleLabel: { fontSize: 10, fontWeight: '500', textAlign: 'center' },
  field: { marginBottom: 10 },
  fieldLabel: { fontSize: 11, fontWeight: '500', color: Colors.textSecondary, marginBottom: 4 },
  input: {
    backgroundColor: Colors.white,
    borderWidth: 0.5,
    borderColor: Colors.borderMid,
    borderRadius: 10,
    paddingHorizontal: 13,
    paddingVertical: 10,
    fontSize: 13,
    color: Colors.textPrimary,
  },
  forgotWrap: { alignItems: 'flex-end', marginBottom: 8 },
  forgotText: { fontSize: 11, color: Colors.teal },
  primaryBtn: {
    backgroundColor: Colors.teal,
    borderRadius: 12,
    paddingVertical: 12,
    alignItems: 'center',
    marginTop: 4,
  },
  primaryBtnText: { color: '#fff', fontSize: 13, fontWeight: '500' },
  switchRow: { flexDirection: 'row', justifyContent: 'center', marginTop: 14 },
  switchText: { fontSize: 11, color: Colors.textMuted },
  switchLink: { fontSize: 11, color: Colors.teal, fontWeight: '500' },
});
