import React from 'react';
import { View, Text, ActivityIndicator, StyleSheet, StatusBar } from 'react-native';
import { LogoMark } from '../components/common/LogoMark';

// Shown while Firebase restores the saved session on app start. Same teal
// background as the native splash so the hand-off between them is seamless.
export default function LoadingScreen() {
  return (
    <View style={styles.container}>
      <StatusBar barStyle="light-content" backgroundColor="#1D9E75" />
      <View style={styles.logoWrap}>
        <LogoMark size={64} />
      </View>
      <Text style={styles.title}>CleanStream</Text>
      <ActivityIndicator style={styles.spinner} color="rgba(255,255,255,0.85)" />
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#1D9E75',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 16,
  },
  logoWrap: {
    width: 104,
    height: 104,
    borderRadius: 30,
    backgroundColor: 'rgba(255,255,255,0.18)',
    borderWidth: 2,
    borderColor: 'rgba(255,255,255,0.28)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  title: { fontSize: 30, fontWeight: '700', color: '#fff', letterSpacing: -0.3 },
  spinner: { marginTop: 12 },
});
