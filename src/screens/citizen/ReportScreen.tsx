import React, { useState, useEffect, useRef, useMemo } from 'react';
import {
  View, Text, TouchableOpacity, StyleSheet, SafeAreaView,
  ScrollView, ActivityIndicator, Alert, Image, TextInput,
} from 'react-native';
import { useNavigation } from '@react-navigation/native';
import { NativeStackNavigationProp } from '@react-navigation/native-stack';
import * as ImagePicker from 'expo-image-picker';
import { manipulateAsync, SaveFormat } from 'expo-image-manipulator';
import { useTheme } from '../../hooks/useTheme';
import { maintenanceText, useMaintenance } from '../../hooks/useMaintenance';
import { useT } from '../../hooks/useT';
import { StringKey } from '../../i18n/strings';
import { enqueueReport, isOnline } from '../../services/offlineQueue';
import { analyzeAndSaveReport } from '../../services/reportSubmission';
import { ThemeColors } from '../../constants/theme';
import { RootStackParamList, WaterContext } from '../../types';
import { useAppSelector, useAppDispatch } from '../../store/hooks';
import { upsertReport } from '../../store/reportsSlice';
import { watchLocation, CEBU_BARANGAYS, CebuBarangay } from '../../services/locationService';
import { loadLocalModel } from '../../services/aiService';
import { createReport } from '../../services/reportsService';
import { GeoLocation } from '../../types';
import { LocationSearchModal } from '../../components/common/LocationSearchModal';
import { BarangayChoice, BarangayPickerSheet } from '../../components/common/BarangayPickerSheet';
import { BackIcon, CameraIcon, CheckIcon } from '../../components/common/TabIcons';
import Svg, { Path, Circle, Rect } from 'react-native-svg';

type Nav = NativeStackNavigationProp<RootStackParamList>;

const AI_STEPS: StringKey[] = ['report.step1', 'report.step2', 'report.step3', 'report.step4', 'report.step5'];

const WATER_CONTEXT_OPTIONS: WaterContext[] = ['in_water', 'riverbank', 'drainage', 'unknown'];

export default function CitizenReportScreen() {
  const { colors } = useTheme();
  const styles = useMemo(() => createStyles(colors), [colors]);
  const navigation = useNavigation<Nav>();
  const dispatch = useAppDispatch();
  const { user } = useAppSelector((s) => s.auth);
  const maintenance = useMaintenance();
  const { t } = useT();
  const [photoUri, setPhotoUri] = useState<string | null>(null);
  const [location, setLocation] = useState<GeoLocation | null>(null);
  const [geoStatus, setGeoStatus] = useState<'detecting' | 'found' | 'manual' | 'error'>('detecting');
  const [notes, setNotes] = useState('');
  const [processing, setProcessing] = useState(false);
  const [aiStep, setAiStep] = useState(0);
  const [waterContext, setWaterContext] = useState<WaterContext>('unknown');
  // Set while analysis runs; calling it stops waiting and files the report without AI.
  const skipAnalysisRef = useRef<(() => void) | null>(null);

  const [showSearch, setShowSearch] = useState(false);
  const promptTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const stopWatchRef = useRef<(() => void) | null>(null);
  const fallbackTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const gotFixRef = useRef(false);
  const pickedManuallyRef = useRef(false);
  // The barangay the reporter chose for this report (e.g. the waterway is just across the
  // boundary). GPS keeps refining the position, but the report goes to this barangay.
  const chosenBarangayRef = useRef<BarangayChoice | null>(null);
  const [pickingBarangay, setPickingBarangay] = useState(false);
  const withChosenBarangay = (loc: GeoLocation): GeoLocation => {
    const b = chosenBarangayRef.current;
    return b ? { ...loc, barangay: b.name, barangayId: b.id } : loc;
  };
  const confirmPromptedRef = useRef(false);

  const stopWatching = () => {
    stopWatchRef.current?.();
    stopWatchRef.current = null;
    if (fallbackTimerRef.current) clearTimeout(fallbackTimerRef.current);
    if (promptTimerRef.current) clearTimeout(promptTimerRef.current);
  };

  // Live GPS: updates the coordinates and street address on the first fix and
  // again as the device moves. If no fix arrives within 30s (e.g. indoors), the
  // registered-barangay fallback is applied -- the watch keeps running, so a
  // real fix still replaces it later unless the user picked a barangay by hand.
  const startWatching = async () => {
    stopWatching();
    gotFixRef.current = false;
    pickedManuallyRef.current = false;
    confirmPromptedRef.current = false;
    setGeoStatus('detecting');

    // After 15s without a fix, offer to search for the location by name instead.
    promptTimerRef.current = setTimeout(() => {
      if (gotFixRef.current || pickedManuallyRef.current) return;
      Alert.alert(
        'Still looking for GPS',
        'This is taking longer than usual (GPS is weak indoors). Search for your current location instead?',
        [
          { text: 'Keep waiting', style: 'cancel' },
          { text: 'Search location', onPress: () => setShowSearch(true) },
        ],
      );
    }, 15000);

    fallbackTimerRef.current = setTimeout(() => {
      if (!gotFixRef.current) applyGpsFailureFallback();
    }, 30000);

    try {
      stopWatchRef.current = await watchLocation((loc) => {
        gotFixRef.current = true;
        if (pickedManuallyRef.current) return;
        setLocation(withChosenBarangay(loc));
        setGeoStatus('found');
        // First real fix: ask the user to confirm it before anything else, and only
        // offer the manual search if they say it's not where they are.
        if (!confirmPromptedRef.current) {
          confirmPromptedRef.current = true;
          Alert.alert(
            'Confirm your location',
            `${loc.address ?? 'Your detected location'}

Barangay: ${loc.barangay ?? 'Unknown'}

Is this where you are?`,
            [
              { text: 'No, search instead', style: 'cancel', onPress: () => setShowSearch(true) },
              { text: "Yes, that's right" },
            ],
            { cancelable: false },
          );
        }
      });
    } catch {
      applyGpsFailureFallback();
    }
  };

  useEffect(() => {
    startWatching();
    // Start downloading/warming the on-device AI models as soon as this screen
    // opens, so they're likely already loaded by the time the user finishes
    // framing and capturing their photo.
    loadLocalModel();
    return stopWatching;
    // eslint-disable-next-line react-hooks/exhaustive-deps
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
      // Device cameras capture at full sensor resolution (often 12MP+). That
      // one file then gets used three ways at once -- on-screen preview,
      // Storage upload blob, on-device AI tensor decode -- and holding all
      // three in native memory simultaneously is what was causing an
      // OS-level out-of-memory kill after a few report submissions in the
      // same session. Downscaling once immediately after capture (before
      // anything else touches it) fixes it at the source instead of trying
      // to shrink memory use separately in each downstream consumer.
      try {
        const resized = await manipulateAsync(
          result.assets[0].uri,
          [{ resize: { width: 1280 } }],
          { compress: 0.7, format: SaveFormat.JPEG },
        );
        setPhotoUri(resized.uri);
      } catch (e) {
        console.warn('[Report] Photo downscale failed, using original capture:', e);
        setPhotoUri(result.assets[0].uri);
      }
    }
  };

  const handleSubmit = async () => {
    if (maintenance.enabled) { Alert.alert('Under maintenance', maintenanceText(maintenance.message)); return; }
    if (!photoUri) { Alert.alert('Photo required', 'Please capture a photo first.'); return; }
    if (!location) { Alert.alert('Location needed', 'Waiting for GPS location...'); return; }
    if (!user) return;

    const userName = `${user.firstName} ${user.lastName}`;
    setProcessing(true);
    setAiStep(0);

    // ── No connection: keep the report on the phone and send it later ──────
    const saveOffline = async () => {
      try {
        await enqueueReport({
          userId: user.uid, userRole: user.role, userName, photoUri, location, notes, waterContext,
        });
        Alert.alert(
          t('report.offlineSavedTitle'),
          t('report.offlineSavedBody'),
          [{ text: 'OK', onPress: () => navigation.goBack() }],
        );
      } catch (e) {
        console.error('[Submit] Could not save report offline:', e);
        Alert.alert(t('report.failedTitle'), t('report.offlineSaveFailed'));
      }
    };
    if (!(await isOnline())) {
      setProcessing(false);
      await saveOffline();
      return;
    }

    const stepInterval = setInterval(() => {
      setAiStep((s) => Math.min(s + 1, AI_STEPS.length - 1));
    }, 600);

    // ── STEP 1: Create Firestore document (CRITICAL) ───────────────────────
    let reportId: string;
    let reportNumber: string;
    try {
      const result = await createReport(
        user.uid, user.role, userName, photoUri, location, notes, undefined, location.barangayId, location.barangay,
      );
      reportId = result.reportId;
      reportNumber = result.reportNumber;
    } catch (criticalErr) {
      clearInterval(stepInterval);
      setProcessing(false);
      console.error('[Submit] CRITICAL — Firestore document creation failed:', criticalErr);
      Alert.alert(t('report.failedTitle'), t('report.failedBody'), [
        { text: t('common.cancel'), style: 'cancel' },
        { text: t('report.saveOnPhone'), onPress: () => { saveOffline(); } },
      ]);
      return;
    }

    // ── STEP 2: AI analysis, duplicate check, alerts (all non-critical) ────
    // The reporter can stop waiting at any time ("Skip analysis").
    const skip = new Promise<void>((resolve) => { skipAnalysisRef.current = resolve; });
    const { ai, aiIssue, proximity } = await analyzeAndSaveReport({
      reportId, reportNumber, userId: user.uid, location, photoUri, waterContext, skip,
    });
    skipAnalysisRef.current = null;

    clearInterval(stepInterval);
    setAiStep(AI_STEPS.length);
    setProcessing(false);

    const now = new Date().toISOString();
    const reportPayload = {
      id: reportId,
      reportNumber,
      userId: user.uid,
      userRole: user.role,
      userName,
      location,
      notes,
      photoURL: ai.processedImageURL ?? photoUri,
      status: 'pending' as const,
      severity: ai.severityLevel,
      aiAnalysis: ai,
      nearbyReportCount: proximity?.nearbyCount,
      ...(proximity?.duplicateOf ? {
        duplicateOf: proximity.duplicateOf.id,
        duplicateOfNumber: proximity.duplicateOf.reportNumber,
        duplicateDistanceM: proximity.duplicateOf.distanceM,
      } : {}),
      statusHistory: [{ status: 'pending' as const, changedBy: user.uid, changedByName: userName, changedAt: now }],
      createdAt: now,
      updatedAt: now,
    };

    // Put the new report in Redux immediately so History shows it right away
    dispatch(upsertReport(reportPayload));

    if (aiIssue) {
      Alert.alert(
        t('report.submittedTitle'),
        t(aiIssue === 'skipped' ? 'report.aiSkipped' : aiIssue === 'disabled' ? 'report.aiDisabled' : 'report.aiFailed'),
        [{ text: t('report.viewReport'), onPress: () => navigation.navigate('CitizenAIResult', { report: reportPayload }) }],
      );
    } else {
      navigation.navigate('CitizenAIResult', { report: reportPayload });
    }
  };

  const refreshLocation = () => {
    chosenBarangayRef.current = null;
    setLocation(null);
    startWatching();
  };

  // Phones with no SIM / no Google Play Services can't get network-assisted
  // location, and raw GPS rarely locks indoors -- without a fallback the report
  // could never be submitted. Use the barangay's center point instead.
  const applyBarangay = (b: CebuBarangay) => {
    setLocation({
      latitude: b.lat,
      longitude: b.lng,
      timestamp: Date.now(),
      barangay: b.name,
      barangayId: b.id,
      address: `${b.name} (approximate - GPS unavailable)`,
    });
    setGeoStatus('manual');
  };

  // Send the report to another barangay. With a real position it only changes the barangay;
  // without one, the barangay's centre point stands in for the location.
  const chooseReportBarangay = (b: BarangayChoice) => {
    chosenBarangayRef.current = b;
    const known = CEBU_BARANGAYS.find((c) => c.id === b.id);
    if (location && geoStatus !== 'manual') setLocation(withChosenBarangay(location));
    else if (known) { pickedManuallyRef.current = true; applyBarangay(known); }
    else if (location) setLocation(withChosenBarangay(location));
  };

  const applyGpsFailureFallback = () => {
    const registered = CEBU_BARANGAYS.find((b) => b.id === user?.barangayId);
    if (registered) applyBarangay(registered);
    else setGeoStatus('error');
  };

  return (
    <SafeAreaView style={styles.container}>
      {/* Header */}
      <View style={styles.header}>
        <TouchableOpacity style={styles.backBtn} onPress={() => navigation.goBack()}>
          <BackIcon size={18} />
        </TouchableOpacity>
        <Text style={styles.headerTitle}>{t('report.title')}</Text>
        <View style={{ width: 38 }} />
      </View>

      <ScrollView contentContainerStyle={styles.body} showsVerticalScrollIndicator={false}>
        {maintenance.enabled && (
          <View style={styles.maintenanceBanner}>
            <Text style={styles.maintenanceText}>{maintenanceText(maintenance.message)}</Text>
          </View>
        )}
        {/* Camera capture */}
        <TouchableOpacity style={styles.camera} onPress={handleCamera} activeOpacity={0.85}>
          <View style={styles.liveBadge}>
            <View style={styles.liveDot} />
            <Text style={styles.liveBadgeText}>{t('report.liveOnly')}</Text>
          </View>
          {photoUri ? (
            <Image source={{ uri: photoUri }} style={StyleSheet.absoluteFill} resizeMode="cover" />
          ) : (
            <View style={styles.cameraInner}>
              <CameraIcon color="rgba(255,255,255,0.5)" size={36} />
              <Text style={styles.cameraTip}>{t('report.tapCamera')}</Text>
            </View>
          )}
        </TouchableOpacity>

        {/* Anti-fake notice */}
        <View style={styles.antiFake}>
          <Svg width={13} height={13} viewBox="0 0 16 16" fill="none">
            <Path d="M8 2l1.5 4.5L14 8l-4.5 1.5L8 14l-1.5-4.5L2 8l4.5-1.5z" stroke={colors.greenText} strokeWidth="2" strokeLinecap="round" />
          </Svg>
          <Text style={styles.antiFakeText}>
            <Text style={{ fontWeight: '600' }}>{t('report.cameraOnly')}</Text> {t('report.cameraOnlyBody')}
          </Text>
        </View>

        {/* AI feature chips */}
        <View style={styles.featureRow}>
          <View style={styles.featureChip}>
            <CheckIcon color={colors.teal} size={14} />
            <View>
              <Text style={styles.featureTitle}>{t('report.featClass')}</Text>
              <Text style={styles.featureSub}>{t('report.featClassSub')}</Text>
            </View>
          </View>
          <View style={styles.featureChip}>
            <Svg width={14} height={14} viewBox="0 0 16 16" fill="none">
              <Path d="M2 10c2-2 4-2 6 0s4 2 6 0M2 6c2-2 4-2 6 0s4 2 6 0" stroke={colors.blueText} strokeWidth="1.8" strokeLinecap="round" />
            </Svg>
            <View>
              <Text style={styles.featureTitle}>{t('report.featRisk')}</Text>
              <Text style={styles.featureSub}>{t('report.featRiskSub')}</Text>
            </View>
          </View>
        </View>

        {/* Where is the waste? — the AI's water check uses this, and it beats a guess */}
        <View style={styles.formCard}>
          <Text style={styles.formLabel}>{t('report.where')}</Text>
          <View style={styles.contextRow}>
            {WATER_CONTEXT_OPTIONS.map((o) => {
              const on = waterContext === o;
              return (
                <TouchableOpacity
                  key={o}
                  style={[styles.contextChip, on && styles.contextChipOn]}
                  onPress={() => setWaterContext(o)}
                  accessibilityRole="radio"
                  accessibilityState={{ selected: on }}
                >
                  <Text style={[styles.contextChipText, on && styles.contextChipTextOn]}>{t(`ctx.${o}` as StringKey)}</Text>
                </TouchableOpacity>
              );
            })}
          </View>
          <Text style={styles.formLabel}>{t('report.notes')}</Text>
          <TextInput
            style={styles.notesInput}
            value={notes}
            onChangeText={setNotes}
            placeholder={t('report.notesPlaceholder')}
            placeholderTextColor={colors.textHint}
            multiline
            maxLength={500}
            textAlignVertical="top"
          />
        </View>

        {/* Geo card */}
        <View style={styles.geoCard}>
          <View style={styles.geoCardHeader}>
            <Text style={styles.geoCardTitle}>📍 {t('report.gpsTitle')}</Text>
            <View style={[styles.geoBadge, geoStatus === 'found' ? styles.geoBadgeOk : styles.geoBadgePending]}>
              <Text style={[styles.geoBadgeText, geoStatus === 'found' && styles.geoBadgeTextOk]}>
                {geoStatus === 'found' ? `✓ ${t('report.gpsVerified')}` : t(geoStatus === 'detecting' ? 'report.gpsLocating' : geoStatus === 'manual' ? 'report.gpsManual' : 'report.gpsNone')}
              </Text>
            </View>
          </View>

          <View style={styles.geoItem}>
            <Svg width={12} height={12} viewBox="0 0 16 16" fill="none">
              <Path d="M8 2a5 5 0 0 1 5 5c0 3.5-5 8-5 8S3 10 3 7a5 5 0 0 1 5-5z" stroke={colors.teal} strokeWidth="2" strokeLinecap="round" />
              <Circle cx="8" cy="7" r="1.5" stroke={colors.teal} strokeWidth="2" />
            </Svg>
            <View>
              <Text style={styles.geoLabel}>{t('report.gpsCoords')}</Text>
              <Text style={styles.geoValue}>
                {location ? `${geoStatus === 'manual' ? '≈ ' : ''}${location.latitude.toFixed(4)}°N, ${location.longitude.toFixed(4)}°E` : geoStatus === 'error' ? 'Not available' : 'Detecting...'}
              </Text>
            </View>
          </View>

          <View style={styles.geoItem}>
            <Svg width={12} height={12} viewBox="0 0 16 16" fill="none">
              <Path d="M2 13V7l6-5 6 5v6" stroke={colors.teal} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
              <Path d="M6 13v-3h4v3" stroke={colors.teal} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
            </Svg>
            <View style={{ flex: 1 }}>
              <Text style={styles.geoLabel}>{t('report.barangay')}</Text>
              <Text style={styles.geoValue}>{location?.barangay || (geoStatus === 'error' ? 'Choose below' : 'Detecting...')}</Text>
              {!!location?.barangay && (
                <Text style={styles.geoHint}>Officials of Brgy. {location.barangay} will handle this report.</Text>
              )}
            </View>
            <TouchableOpacity style={styles.changeBtn} onPress={() => setPickingBarangay(true)} accessibilityLabel="Choose the barangay for this report">
              <Text style={styles.changeBtnText}>Change</Text>
            </TouchableOpacity>
          </View>

          <View style={styles.geoItem}>
            <Svg width={12} height={12} viewBox="0 0 16 16" fill="none">
              <Rect x="2" y="3" width="12" height="11" rx="1" stroke={colors.teal} strokeWidth="2" strokeLinecap="round" />
              <Path d="M5 1v4M11 1v4M2 7h12" stroke={colors.teal} strokeWidth="2" strokeLinecap="round" />
            </Svg>
            <View>
              <Text style={styles.geoLabel}>{t('report.timestamp')}</Text>
              <Text style={styles.geoValue}>{new Date().toLocaleString()}</Text>
            </View>
          </View>

          {geoStatus !== 'found' && (
            <TouchableOpacity style={styles.searchLocationBtn} onPress={() => setShowSearch(true)}>
              <Text style={styles.searchLocationText}>🔍 {t('report.searchLocation')}</Text>
            </TouchableOpacity>
          )}

          {(geoStatus === 'error' || geoStatus === 'manual') && (
            <View style={styles.fallbackBox}>
              <Text style={styles.fallbackHint}>
                GPS couldn't get a fix (common indoors or without mobile data). Choose your barangay, or move outdoors and refresh.
              </Text>
              <TouchableOpacity style={styles.chooseBrgyBtn} onPress={() => setPickingBarangay(true)} activeOpacity={0.85}>
                <Text style={styles.chooseBrgyText}>
                  {location?.barangay && geoStatus === 'manual' ? `📍 Brgy. ${location.barangay} · Change` : '📍 Choose barangay'}
                </Text>
              </TouchableOpacity>
            </View>
          )}

          <TouchableOpacity onPress={refreshLocation}>
            <Text style={styles.refreshBtn}>🔄 {t('report.refresh')}</Text>
          </TouchableOpacity>
        </View>

        {/* Submit button */}
        <TouchableOpacity
          style={[styles.submitBtn, (!photoUri || !location) && styles.submitBtnDisabled]}
          onPress={handleSubmit}
          disabled={!photoUri || !location || processing}
          activeOpacity={0.85}
        >
          <Text style={styles.submitBtnText}>{t('report.submit')}</Text>
        </TouchableOpacity>
      </ScrollView>

      {/* AI Processing overlay */}
      {processing && (
        <View style={styles.overlay}>
          <ActivityIndicator size="large" color={colors.teal} />
          <Text style={styles.overlayTitle}>{t('report.aiRunning')}</Text>
          <View style={styles.steps}>
            {AI_STEPS.map((step, i) => (
              <View key={step} style={styles.step}>
                <Text style={styles.stepIcon}>
                  {i < aiStep ? '✓' : i === aiStep ? '◌' : '○'}
                </Text>
                <Text style={[
                  styles.stepText,
                  i < aiStep && { color: colors.tealDark },
                  i === aiStep && { color: colors.amberText },
                ]}>
                  {t(step)}
                </Text>
              </View>
            ))}
          </View>
          <View style={styles.modelBadge}>
            <Text style={styles.modelBadgeText}>{t('report.savedBadge')}</Text>
          </View>
          <TouchableOpacity style={styles.skipBtn} onPress={() => skipAnalysisRef.current?.()}>
            <Text style={styles.skipBtnText}>{t('report.skip')}</Text>
          </TouchableOpacity>
        </View>
      )}
      <LocationSearchModal
        visible={showSearch}
        onClose={() => setShowSearch(false)}
        onSelect={(loc) => {
          pickedManuallyRef.current = true;
          setLocation(withChosenBarangay(loc));
          setGeoStatus('manual');
        }}
      />
      <BarangayPickerSheet
        visible={pickingBarangay}
        title="Which barangay is the waterway in?"
        subtitle="The report goes to the barangay you choose, and its officials handle the cleanup."
        selectedId={location?.barangayId}
        homeId={user?.barangayId}
        // Without a GPS position, only barangays with a known centre point can stand in for it.
        choices={location && geoStatus !== 'manual' ? undefined : CEBU_BARANGAYS.map((b) => ({ id: b.id, name: b.name }))}
        onClose={() => setPickingBarangay(false)}
        onPick={(b) => { setPickingBarangay(false); chooseReportBarangay(b); }}
      />
    </SafeAreaView>
  );
}

const createStyles = (Colors: ThemeColors) => StyleSheet.create({
  container: { flex: 1, backgroundColor: Colors.grayBg },
  geoHint: { fontSize: 11, color: Colors.textMuted, marginTop: 2 },
  chooseBrgyBtn: { marginTop: 8, alignSelf: 'flex-start', paddingHorizontal: 14, paddingVertical: 8, borderRadius: 16, backgroundColor: Colors.tealLight, borderWidth: 1, borderColor: Colors.tealMid },
  chooseBrgyText: { fontSize: 13, fontWeight: '700', color: Colors.tealDark },
  changeBtn: { marginLeft: 'auto', alignSelf: 'center', paddingHorizontal: 12, paddingVertical: 6, borderRadius: 14, backgroundColor: Colors.tealLight },
  changeBtnText: { fontSize: 12, fontWeight: '700', color: Colors.tealDark },
  header: {
    backgroundColor: Colors.white, paddingHorizontal: 16, paddingVertical: 12,
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
    borderBottomWidth: 0.5, borderBottomColor: Colors.border,
  },
  headerTitle: { fontSize: 16, fontWeight: '500', color: Colors.textPrimary },
  backBtn: {
    width: 38, height: 38, borderRadius: 19, backgroundColor: Colors.grayBg,
    alignItems: 'center', justifyContent: 'center',
  },
  maintenanceBanner: { backgroundColor: Colors.amberBg, borderRadius: 12, padding: 12, borderWidth: 0.5, borderColor: Colors.amber },
  maintenanceText: { fontSize: 12, color: Colors.amberText, lineHeight: 17 },
  body: { padding: 16, gap: 14, paddingBottom: 24 },
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
    flex: 1, backgroundColor: Colors.white, borderRadius: 16, padding: 12,
    flexDirection: 'row', gap: 7, alignItems: 'flex-start',
    shadowColor: Colors.shadow, shadowOffset: { width: 0, height: 2 }, shadowOpacity: 0.05, shadowRadius: 8, elevation: 1,
  },
  featureTitle: { fontSize: 10, fontWeight: '500', color: Colors.textPrimary },
  featureSub: { fontSize: 9, color: Colors.textMuted, marginTop: 2 },
  geoCard: {
    backgroundColor: Colors.white, borderRadius: 16, padding: 16, gap: 8,
    shadowColor: Colors.shadow, shadowOffset: { width: 0, height: 2 }, shadowOpacity: 0.05, shadowRadius: 8, elevation: 1,
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
  searchLocationBtn: {
    marginTop: 4, paddingVertical: 9, borderRadius: 10, alignItems: 'center',
    backgroundColor: Colors.tealLight,
  },
  searchLocationText: { fontSize: 11, fontWeight: '600', color: Colors.tealDark },
  fallbackBox: { gap: 8, marginTop: 4 },
  fallbackHint: { fontSize: 10, color: Colors.textMuted, lineHeight: 15 },
  chipRow: { gap: 6 },
  chip: {
    paddingHorizontal: 11, paddingVertical: 6, borderRadius: 20,
    backgroundColor: Colors.grayBg,
  },
  chipActive: { backgroundColor: Colors.teal },
  chipText: { fontSize: 11, color: Colors.textPrimary },
  chipTextActive: { color: '#fff', fontWeight: '600' },
  submitBtn: {
    backgroundColor: Colors.teal, borderRadius: 12,
    paddingVertical: 11, alignItems: 'center',
  },
  submitBtnDisabled: { opacity: 0.5 },
  submitBtnText: { fontSize: 12, fontWeight: '500', color: '#fff' },
  overlay: {
    ...StyleSheet.absoluteFill, backgroundColor: 'rgba(255,255,255,0.96)',
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
  skipBtn: { marginTop: 4, paddingVertical: 10, paddingHorizontal: 22, borderRadius: 22, borderWidth: 1, borderColor: Colors.borderMid },
  skipBtnText: { fontSize: 12, fontWeight: '600', color: Colors.textSecondary },
  formCard: {
    backgroundColor: Colors.white, borderRadius: 16, padding: 14, gap: 9,
    shadowColor: Colors.shadow, shadowOffset: { width: 0, height: 2 }, shadowOpacity: 0.05, shadowRadius: 8, elevation: 1,
  },
  formLabel: { fontSize: 12, fontWeight: '600', color: Colors.textPrimary },
  contextRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 6 },
  contextChip: { paddingHorizontal: 12, paddingVertical: 8, borderRadius: 20, borderWidth: 1, borderColor: Colors.border, backgroundColor: Colors.grayBg },
  contextChipOn: { backgroundColor: Colors.teal, borderColor: Colors.teal },
  contextChipText: { fontSize: 12, color: Colors.textSecondary, fontWeight: '500' },
  contextChipTextOn: { color: '#fff', fontWeight: '600' },
  notesInput: {
    minHeight: 72, borderRadius: 12, borderWidth: 1, borderColor: Colors.border, backgroundColor: Colors.grayBg,
    paddingHorizontal: 12, paddingVertical: 10, fontSize: 13, color: Colors.textPrimary,
  },
});
