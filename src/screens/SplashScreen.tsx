import React, { useEffect, useRef } from 'react';
import {
  View, Text, Animated, StyleSheet, TouchableOpacity, StatusBar,
} from 'react-native';
import { NativeStackScreenProps } from '@react-navigation/native-stack';
import Svg, { Path, Circle } from 'react-native-svg';
import { RootStackParamList } from '../types';
import { Colors } from '../constants/colors';

type Props = NativeStackScreenProps<RootStackParamList, 'Splash'>;

export default function SplashScreen({ navigation }: Props) {
  const progress = useRef(new Animated.Value(0)).current;
  const fadeIcon = useRef(new Animated.Value(0)).current;
  const fadeTitle = useRef(new Animated.Value(0)).current;
  const fadeTag = useRef(new Animated.Value(0)).current;
  const fadeBtns = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    Animated.sequence([
      Animated.timing(fadeIcon, { toValue: 1, duration: 600, useNativeDriver: true }),
      Animated.timing(fadeTitle, { toValue: 1, duration: 500, useNativeDriver: true }),
      Animated.timing(fadeTag, { toValue: 1, duration: 400, useNativeDriver: true }),
      Animated.timing(progress, { toValue: 1, duration: 2200, useNativeDriver: false }),
      Animated.timing(fadeBtns, { toValue: 1, duration: 500, useNativeDriver: true }),
    ]).start();
  }, []);

  const progressWidth = progress.interpolate({
    inputRange: [0, 1],
    outputRange: ['0%', '100%'],
  });

  return (
    <View style={styles.container}>
      <StatusBar barStyle="light-content" backgroundColor={Colors.teal} />

      <View style={styles.body}>
        <Animated.View style={[styles.iconWrap, { opacity: fadeIcon }]}>
          <Svg width={52} height={52} viewBox="0 0 52 52" fill="none">
            <Path d="M6 34 Q13 26 20 30 Q27 34 34 26 Q41 18 46 22" stroke="white" strokeWidth="3" strokeLinecap="round" />
            <Path d="M6 42 Q13 34 20 38 Q27 42 34 34 Q41 26 46 30" stroke="rgba(255,255,255,0.5)" strokeWidth="2.5" strokeLinecap="round" />
            <Path d="M18 10 L26 6 L34 10 L34 22 Q26 28 18 22 Z" stroke="white" strokeWidth="2" strokeLinejoin="round" fill="rgba(255,255,255,0.12)" />
            <Circle cx="26" cy="15" r="3" fill="white" />
          </Svg>
        </Animated.View>

        <Animated.Text style={[styles.title, { opacity: fadeTitle }]}>
          CleanStream
        </Animated.Text>

        <Animated.Text style={[styles.tagline, { opacity: fadeTag }]}>
          AI-powered waste classification &amp; cleanup coordination · Cebu City
        </Animated.Text>

        <Animated.View style={[styles.progressWrap, { opacity: fadeTag }]}>
          <View style={styles.track}>
            <Animated.View style={[styles.fill, { width: progressWidth }]} />
          </View>
          <Text style={styles.version}>v3.0 · Enhanced AI · Multi-role</Text>
        </Animated.View>
      </View>

      <Animated.View style={[styles.btns, { opacity: fadeBtns }]}>
        <TouchableOpacity style={styles.primaryBtn} onPress={() => navigation.navigate('Login')}>
          <Text style={styles.primaryBtnText}>Sign in</Text>
        </TouchableOpacity>
        <TouchableOpacity style={styles.secondaryBtn} onPress={() => navigation.navigate('Signup')}>
          <Text style={styles.secondaryBtnText}>Create account</Text>
        </TouchableOpacity>
      </Animated.View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: Colors.teal },
  body: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 24,
    gap: 16,
  },
  iconWrap: {
    width: 84,
    height: 84,
    borderRadius: 24,
    backgroundColor: 'rgba(255,255,255,0.18)',
    borderWidth: 2,
    borderColor: 'rgba(255,255,255,0.28)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  title: {
    fontSize: 28,
    fontWeight: '600',
    color: '#fff',
    letterSpacing: -0.3,
  },
  tagline: {
    fontSize: 12,
    color: 'rgba(255,255,255,0.75)',
    textAlign: 'center',
    lineHeight: 18,
    maxWidth: 260,
  },
  progressWrap: { width: 160, alignItems: 'center', gap: 8 },
  track: {
    height: 3,
    width: '100%',
    backgroundColor: 'rgba(255,255,255,0.25)',
    borderRadius: 3,
    overflow: 'hidden',
  },
  fill: { height: '100%', backgroundColor: '#fff', borderRadius: 3 },
  version: { fontSize: 10, color: 'rgba(255,255,255,0.45)' },
  btns: { paddingHorizontal: 24, paddingBottom: 40, gap: 9 },
  primaryBtn: {
    backgroundColor: 'rgba(255,255,255,0.22)',
    borderRadius: 12,
    paddingVertical: 12,
    alignItems: 'center',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.4)',
  },
  primaryBtnText: { color: '#fff', fontSize: 14, fontWeight: '600' },
  secondaryBtn: {
    backgroundColor: Colors.white,
    borderRadius: 12,
    paddingVertical: 12,
    alignItems: 'center',
  },
  secondaryBtnText: { color: Colors.teal, fontSize: 14, fontWeight: '600' },
});
