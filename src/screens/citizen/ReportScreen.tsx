import React, { useState, useEffect, useRef } from 'react';
import {
  View, Text, TouchableOpacity, StyleSheet, SafeAreaView,
  ScrollView, ActivityIndicator, Alert, Image,
} from 'react-native';
import { useNavigation } from '@react-navigation/native';
import { NativeStackNavigationProp } from '@react-navigation/native-stack';
import * as ImagePicker from 'expo-image-picker';
import { Colors } from '../../constants/colors';
import { RootStackParamList } from '../../types';
import { useAppSelector, useAppDispatch } from '../../store/hooks';
import { upsertReport } from '../../store/reportsSlice';
import { getCurrentLocation } from '../../services/locationService';
import { analyzeWastePhoto } from '../../services/aiService';
import { createReport, updateReportWithAI } from '../../services/reportsService';
import { GeoLocation } from '../../types';
import { BackIcon, CameraIcon, CheckIcon } from '../../components/common/TabIcons';
import Svg, { Path, Circle, Rect } from 'react-native-svg';

type Nav = NativeStackNavigationProp<RootStackParamList>;

const AI_STEPS = [
  'Uploading photo to cloud',
  'Running YOLO object detection',
  'Running CNN classification',
  'Generating disposal recommendations',
  'Calculating severity score',
];

export default function CitizenReportScreen() {
  const navigation = useNavigation<Nav>();
  const dispatch = useAppDispatch();
  const { user } = useAppSelector((s) => s.auth);
  const [photoUri, setPhotoUri] = useState<string | null>(null);
  const [location, setLocation] = useState<GeoLocation | null>(null);
  const [geoStatus, setGeoStatus] = useState<'detecting' | 'found' | 'error'>('detecting');
  const [notes, setNotes] = useState('');
  const [processing, setProcessing] = useState(false);
  const [aiStep, setAiStep] = useState(0);

  useEffect(() => {
    (async () => {
      try {
        const loc = await getCurrentLocation();
        setLocation(loc);
        setGeoStatus('found');
      } catch {
        setGeoStatus('error');
      }
    })();
  }, []);

  const handleCamera = async () => {
    const { status } = await ImagePicker.requestCameraPermissionsAsync();
    if (status !== 'granted') {
      Alert.alert('Permission required', 'Camera permission is needed to capture waste photos.');
      return;
    }
    const result = await ImagePicker.launchCameraAsync({
      mediaTypes: 'images',
      quality: 0.85,
      allowsEditing: false,
    });
    if (!result.canceled && result.assets[0]) {
      setPhotoUri(result.assets[0].uri);
    }
  };

  const handleSubmit = async () => {
    if (!photoUri) { Alert.alert('Photo required', 'Please capture a photo first.'); return; }
    if (!location) { Alert.alert('Location needed', 'Waiting for GPS location...'); return; }
    if (!user) return;

    setProcessing(true);
    setAiStep(0);

    const stepInterval = setInterval(() => {
      setAiStep((s) => Math.min(s + 1, AI_STEPS.length - 1));
    }, 600);

    // ── STEP 1: Create Firestore document (CRITICAL) ───────────────────────
    let reportId: string;
    let reportNumber: string;
    try {
      console.log('[Submit] Creating report...');
      const result = await createReport(
        user.uid,
        user.role,
        `${user.firstName} ${user.lastName}`,
        photoUri,
        location,
        notes,
      );
      reportId = result.reportId;
      reportNumber = result.reportNumber;
      console.log('[Submit] Report created successfully. ID:', reportId, 'Number:', reportNumber);
    } catch (criticalErr) {
      clearInterval(stepInterval);
      setProcessing(false);
      console.error('[Submit] CRITICAL — Firestore document creation failed:', criticalErr);
      Alert.alert('Submission failed', 'Could not save your report. Please check your connection and try again.');
      return;
    }

    // Report is saved. All remaining steps are non-critical.
    const now = new Date().toISOString();
    const userName = `${user.firstName} ${user.lastName}`;

    // ── STEP 2: AI analysis (NON-CRITICAL) ────────────────────────────────
    let aiResult: Awaited<ReturnType<typeof analyzeWastePhoto>> | null = null;
    let aiWarning: string | null = null;

    try {
      console.log('[Submit] Running AI analysis for report:', reportId);
      aiResult = await analyzeWastePhoto(photoUri, reportId, user.uid);
      console.log('[Submit] AI analysis complete. Severity:', aiResult.severityLevel,
        '| Confidence:', aiResult.confidence,
        '| Objects:', aiResult.objectCount ?? 'N/A',
        '| ProcessedURL:', aiResult.processedImageURL ?? 'none');
    } catch (aiErr) {
      console.error('[Submit] AI analysis failed (non-fatal):', aiErr);
      aiWarning = 'AI analysis will be retried automatically.';
    }

    // ── STEP 3: Persist AI result to Firestore (NON-CRITICAL) ─────────────
    if (aiResult) {
      try {
        console.log('[Submit] Saving AI result to Firestore...');
        await updateReportWithAI(reportId, aiResult);
        console.log('[Submit] AI result saved.');
      } catch (updateErr) {
        console.error('[Submit] AI result save failed (non-fatal):', updateErr);
      }
    }

    clearInterval(stepInterval);
    setAiStep(AI_STEPS.length);
    setProcessing(false);

    // ── Navigate with whatever result we have ──────────────────────────────
    const effectiveAI = aiResult ?? {
      modelVersion: 'Pending',
      confidence: 0,
      severityScore: 0,
      severityLevel: 'low' as const,
      wasteTypes: [],
      estimatedVolume: 0,
      spreadArea: 0,
      hazardousDetected: false,
      teamNeeded: 'TBD',
      cleanupPriority: 'Pending AI analysis',
      timestamp: now,
    };

    const reportPayload = {
      id: reportId,
      reportNumber,
      userId: user.uid,
      userRole: user.role,
      userName,
      location,
      photoURL: effectiveAI.processedImageURL ?? photoUri,
      status: 'pending' as const,
      severity: effectiveAI.severityLevel,
      aiAnalysis: effectiveAI,
      statusHistory: [{ status: 'pending' as const, changedBy: user.uid, changedByName: userName, changedAt: now }],
      createdAt: now,
      updatedAt: now,
    };

    // Put the new report in Redux immediately so History shows it right away
    dispatch(upsertReport(reportPayload));

    if (aiWarning) {
      Alert.alert(
        'Report submitted',
        `Your report was saved successfully. ${aiWarning}`,
        [{
          text: 'View report',
          onPress: () => navigation.navigate('CitizenAIResult', { report: reportPayload }),
        }],
      );
    } else {
      navigation.navigate('CitizenAIResult', { report: reportPayload });
    }
  };

  const refreshLocation = async () => {
    setGeoStatus('detecting');
    try {
      const loc = await getCurrentLocation();
      setLocation(loc);
      setGeoStatus('found');
    } catch {
      setGeoStatus('error');
    }
  };

  return (
    <SafeAreaView style={styles.container}>
      {/* Header */}
      <View style={styles.header}>
        <TouchableOpacity style={styles.backBtn} onPress={() => navigation.goBack()}>
          <BackIcon />
        </TouchableOpacity>
        <Text style={styles.headerTitle}>New report</Text>
        <View style={{ width: 34 }} />
      </View>

      <ScrollView contentContainerStyle={styles.body} showsVerticalScrollIndicator={false}>
        {/* Camera capture */}
        <TouchableOpacity style={styles.camera} onPress={handleCamera} activeOpacity={0.85}>
          <View style={styles.liveBadge}>
            <View style={styles.liveDot} />
            <Text style={styles.liveBadgeText}>LIVE CAPTURE ONLY</Text>
          </View>
          {photoUri ? (
            <Image source={{ uri: photoUri }} style={StyleSheet.absoluteFillObject} resizeMode="cover" />
          ) : (
            <View style={styles.cameraInner}>
              <CameraIcon color="rgba(255,255,255,0.5)" size={36} />
              <Text style={styles.cameraTip}>Tap to open live camera</Text>
            </View>
          )}
        </TouchableOpacity>

        {/* Anti-fake notice */}
        <View style={styles.antiFake}>
          <Svg width={13} height={13} viewBox="0 0 16 16" fill="none">
            <Path d="M8 2l1.5 4.5L14 8l-4.5 1.5L8 14l-1.5-4.5L2 8l4.5-1.5z" stroke={Colors.greenText} strokeWidth="2" strokeLinecap="round" />
          </Svg>
          <Text style={styles.antiFakeText}>
            <Text style={{ fontWeight: '600' }}>Camera-only reporting.</Text> Gallery uploads disabled. Auto-GPS tag + timestamp watermark applied on every capture.
          </Text>
        </View>

        {/* AI feature chips */}
        <View style={styles.featureRow}>
          <View style={styles.featureChip}>
            <CheckIcon color={Colors.teal} size={14} />
            <View>
              <Text style={styles.featureTitle}>Waste Classification</Text>
              <Text style={styles.featureSub}>5 types · CNN Model v2.4</Text>
            </View>
          </View>
          <View style={styles.featureChip}>
            <Svg width={14} height={14} viewBox="0 0 16 16" fill="none">
              <Rect x="2" y="2" width="12" height="12" rx="1" stroke={Colors.blueText} strokeWidth="1.8" strokeLinecap="round" />
              <Path d="M6 10V6M8 10V8M10 10V4" stroke={Colors.blueText} strokeWidth="1.8" strokeLinecap="round" />
            </Svg>
            <View>
              <Text style={styles.featureTitle}>Volume Estimate</Text>
              <Text style={styles.featureSub}>m³ calculated from scan</Text>
            </View>
          </View>
        </View>

        {/* Geo card */}
        <View style={styles.geoCard}>
          <View style={styles.geoCardHeader}>
            <Text style={styles.geoCardTitle}>📍 Live GPS location</Text>
            <View style={[styles.geoBadge, geoStatus === 'found' ? styles.geoBadgeOk : styles.geoBadgePending]}>
              <Text style={[styles.geoBadgeText, geoStatus === 'found' && styles.geoBadgeTextOk]}>
                {geoStatus === 'found' ? '✓ Verified' : geoStatus === 'detecting' ? 'Locating...' : 'Error'}
              </Text>
            </View>
          </View>

          <View style={styles.geoItem}>
            <Svg width={12} height={12} viewBox="0 0 16 16" fill="none">
              <Path d="M8 2a5 5 0 0 1 5 5c0 3.5-5 8-5 8S3 10 3 7a5 5 0 0 1 5-5z" stroke={Colors.teal} strokeWidth="2" strokeLinecap="round" />
              <Circle cx="8" cy="7" r="1.5" stroke={Colors.teal} strokeWidth="2" />
            </Svg>
            <View>
              <Text style={styles.geoLabel}>GPS coordinates</Text>
              <Text style={styles.geoValue}>
                {location ? `${location.latitude.toFixed(4)}°N, ${location.longitude.toFixed(4)}°E` : 'Detecting...'}
              </Text>
            </View>
          </View>

          <View style={styles.geoItem}>
            <Svg width={12} height={12} viewBox="0 0 16 16" fill="none">
              <Path d="M2 13V7l6-5 6 5v6" stroke={Colors.teal} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
              <Path d="M6 13v-3h4v3" stroke={Colors.teal} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
            </Svg>
            <View>
              <Text style={styles.geoLabel}>Barangay · Cebu City</Text>
              <Text style={styles.geoValue}>{location?.barangay || 'Detecting...'}</Text>
            </View>
          </View>

          <View style={styles.geoItem}>
            <Svg width={12} height={12} viewBox="0 0 16 16" fill="none">
              <Rect x="2" y="3" width="12" height="11" rx="1" stroke={Colors.teal} strokeWidth="2" strokeLinecap="round" />
              <Path d="M5 1v4M11 1v4M2 7h12" stroke={Colors.teal} strokeWidth="2" strokeLinecap="round" />
            </Svg>
            <View>
              <Text style={styles.geoLabel}>Timestamp</Text>
              <Text style={styles.geoValue}>{new Date().toLocaleString()}</Text>
            </View>
          </View>

          <TouchableOpacity onPress={refreshLocation}>
            <Text style={styles.refreshBtn}>🔄 Refresh location</Text>
          </TouchableOpacity>
        </View>

        {/* Submit button */}
        <TouchableOpacity
          style={[styles.submitBtn, (!photoUri || !location) && styles.submitBtnDisabled]}
          onPress={handleSubmit}
          disabled={!photoUri || !location || processing}
          activeOpacity={0.85}
        >
          <Text style={styles.submitBtnText}>Submit live report</Text>
        </TouchableOpacity>
      </ScrollView>

      {/* AI Processing overlay */}
      {processing && (
        <View style={styles.overlay}>
          <ActivityIndicator size="large" color={Colors.teal} />
          <Text style={styles.overlayTitle}>AI Classification Running</Text>
          <View style={styles.steps}>
            {AI_STEPS.map((step, i) => (
              <View key={step} style={styles.step}>
                <Text style={styles.stepIcon}>
                  {i < aiStep ? '✓' : i === aiStep ? '◌' : '○'}
                </Text>
                <Text style={[
                  styles.stepText,
                  i < aiStep && { color: Colors.tealDark },
                  i === aiStep && { color: Colors.amberText },
                ]}>
                  {step}
                </Text>
              </View>
            ))}
          </View>
          <View style={styles.modelBadge}>
            <Text style={styles.modelBadgeText}>CNN Model v2.4 · 94% accuracy</Text>
          </View>
        </View>
      )}
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: Colors.grayBg },
  header: {
    backgroundColor: Colors.white, paddingHorizontal: 16, paddingVertical: 12,
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
    borderBottomWidth: 0.5, borderBottomColor: Colors.border,
  },
  headerTitle: { fontSize: 16, fontWeight: '500', color: Colors.textPrimary },
  backBtn: {
    width: 34, height: 34, borderRadius: 17, backgroundColor: Colors.grayBg,
    alignItems: 'center', justifyContent: 'center',
  },
  body: { padding: 14, gap: 10, paddingBottom: 24 },
  camera: {
    borderRadius: 16, backgroundColor: '#1A1A18', height: 160,
    alignItems: 'center', justifyContent: 'center',
    borderWidth: 2, borderColor: Colors.teal, overflow: 'hidden', position: 'relative',
  },
  liveBadge: {
    position: 'absolute', top: 8, alignSelf: 'center',
    backgroundColor: Colors.red, flexDirection: 'row', alignItems: 'center', gap: 4,
    paddingHorizontal: 10, paddingVertical: 3, borderRadius: 20, zIndex: 2,
  },
  liveDot: { width: 6, height: 6, borderRadius: 3, backgroundColor: '#fff' },
  liveBadgeText: { fontSize: 9, fontWeight: '600', color: '#fff', letterSpacing: 0.4 },
  cameraInner: { alignItems: 'center', gap: 4, zIndex: 1 },
  cameraTip: { fontSize: 11, color: 'rgba(255,255,255,0.5)', marginTop: 6 },
  antiFake: {
    flexDirection: 'row', gap: 8, alignItems: 'flex-start',
    backgroundColor: Colors.greenBg, borderRadius: 10, padding: 9,
    borderWidth: 0.5, borderColor: 'rgba(99,153,34,0.25)',
  },
  antiFakeText: { flex: 1, fontSize: 10, color: Colors.greenText, lineHeight: 15 },
  featureRow: { flexDirection: 'row', gap: 6 },
  featureChip: {
    flex: 1, backgroundColor: Colors.white, borderRadius: 10, padding: 9,
    borderWidth: 0.5, borderColor: Colors.border, flexDirection: 'row', gap: 7, alignItems: 'flex-start',
  },
  featureTitle: { fontSize: 10, fontWeight: '500', color: Colors.textPrimary },
  featureSub: { fontSize: 9, color: Colors.textMuted, marginTop: 2 },
  geoCard: {
    backgroundColor: Colors.white, borderRadius: 12, padding: 13,
    borderWidth: 0.5, borderColor: Colors.border, gap: 8,
  },
  geoCardHeader: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  geoCardTitle: { fontSize: 12, fontWeight: '500', color: Colors.textPrimary },
  geoBadge: {
    flexDirection: 'row', alignItems: 'center', gap: 4,
    paddingHorizontal: 7, paddingVertical: 2, borderRadius: 20,
    backgroundColor: Colors.grayBg,
  },
  geoBadgeOk: { backgroundColor: Colors.tealLight },
  geoBadgePending: { backgroundColor: Colors.grayBg },
  geoBadgeText: { fontSize: 9, fontWeight: '600', color: Colors.textMuted },
  geoBadgeTextOk: { color: Colors.tealDark },
  geoItem: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  geoLabel: { fontSize: 10, color: Colors.textMuted },
  geoValue: { fontSize: 12, fontWeight: '500', color: Colors.textPrimary },
  refreshBtn: { fontSize: 10, color: Colors.teal, alignSelf: 'flex-end' },
  submitBtn: {
    backgroundColor: Colors.teal, borderRadius: 12,
    paddingVertical: 11, alignItems: 'center',
  },
  submitBtnDisabled: { opacity: 0.5 },
  submitBtnText: { fontSize: 12, fontWeight: '500', color: '#fff' },
  overlay: {
    ...StyleSheet.absoluteFillObject, backgroundColor: 'rgba(255,255,255,0.96)',
    alignItems: 'center', justifyContent: 'center', gap: 14, zIndex: 50,
  },
  overlayTitle: { fontSize: 14, fontWeight: '500', color: Colors.textPrimary },
  steps: { gap: 5, width: 200 },
  step: { flexDirection: 'row', alignItems: 'center', gap: 7 },
  stepIcon: { width: 14, textAlign: 'center' },
  stepText: { fontSize: 11, color: Colors.textHint },
  modelBadge: {
    backgroundColor: Colors.tealLight, borderRadius: 8, paddingHorizontal: 12, paddingVertical: 6,
  },
  modelBadgeText: { fontSize: 10, color: Colors.tealDark },
});
