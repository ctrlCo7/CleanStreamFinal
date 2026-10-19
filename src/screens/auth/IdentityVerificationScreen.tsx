import { NativeStackScreenProps } from '@react-navigation/native-stack';
import React, { useMemo, useState } from 'react';
import {
  ActivityIndicator, Alert, Image, ScrollView, StyleSheet, Switch, Text, TouchableOpacity, View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { ThemeColors } from '../../constants/theme';
import { useTheme } from '../../hooks/useTheme';
import { detectFaces } from '../../services/faceDetection';
import { CapturedPhoto, captureIdPhoto, captureSelfie, toDataUri } from '../../services/identityCapture';
import {
  ID_IMAGE_MAX_CHARS, ID_IMAGE_MAX_SIDE, ID_TYPES, SELFIE_MAX_CHARS, SELFIE_MAX_SIDE, SELFIE_PROMPTS,
  evaluateIdPhoto, evaluateSelfie, looksLikeIdText, nameOnId,
} from '../../services/identityChecks';
import { resubmitIdentity } from '../../services/identityVerificationService';
import { recognizeText } from '../../services/textRecognition';
import { setIdentityDraft } from '../../store/identityDraft';
import { useAppSelector } from '../../store/hooks';
import { IdType, IdentityEvidence, RootStackParamList, SelfieStep } from '../../types';

type Props = NativeStackScreenProps<RootStackParamList, 'IdentityVerification'>;

type Phase = 'id' | SelfieStep | 'review';
const PHASES: Phase[] = ['id', 'neutral', 'smile', 'turn', 'review'];

interface Shot { previewUri: string; dataUri: string; ok: boolean; message: string }
interface IdChecks { faceOnId: boolean; textReadable: boolean; lastNameOnId: boolean | null; firstNameOnId: boolean | null }

export default function IdentityVerificationScreen({ navigation, route }: Props) {
  const { mode, firstName, lastName } = route.params;
  const { colors } = useTheme();
  const styles = useMemo(() => createStyles(colors), [colors]);
  const user = useAppSelector((s) => s.auth.user);

  const [phase, setPhase] = useState<Phase>('id');
  const [idType, setIdType] = useState<IdType>('philsys');
  const [idShot, setIdShot] = useState<Shot | null>(null);
  const [idChecks, setIdChecks] = useState<IdChecks | null>(null);
  const [selfies, setSelfies] = useState<Partial<Record<SelfieStep, Shot>>>({});
  const [detectorAvailable, setDetectorAvailable] = useState(true);
  const [busy, setBusy] = useState(false);
  const [consent, setConsent] = useState(false);

  const stepNumber = PHASES.indexOf(phase) + 1;

  const fail = (e: unknown) => Alert.alert('Camera problem', (e as Error).message || 'Something went wrong. Please try again.');

  const takeId = async () => {
    setBusy(true);
    try {
      const photo = await captureIdPhoto();
      if (!photo) return;
      const [faces, text] = await Promise.all([detectFaces(photo.uri, photo.width, photo.height), recognizeText(photo.uri)]);
      const dataUri = await toDataUri(photo, ID_IMAGE_MAX_SIDE, ID_IMAGE_MAX_CHARS);
      const unavailable = faces === null;
      if (unavailable) setDetectorAvailable(false);
      const result = unavailable
        ? { faceOnId: false, textReadable: looksLikeIdText(text), problem: null as string | null }
        : evaluateIdPhoto(faces, text);
      // No text at all usually means the reader isn't available, so don't claim a mismatch.
      const haveText = text.trim().length > 0;
      setIdChecks({
        faceOnId: result.faceOnId,
        textReadable: result.textReadable,
        lastNameOnId: haveText ? nameOnId(text, lastName) : null,
        firstNameOnId: haveText ? nameOnId(text, firstName) : null,
      });
      setIdShot({
        previewUri: photo.uri,
        dataUri,
        ok: unavailable || result.faceOnId,
        message: unavailable ? "Automatic checks aren't available on this phone. The reviewer will check your photos by eye." : result.problem ?? 'Photo accepted.',
      });
    } catch (e) {
      fail(e);
    } finally {
      setBusy(false);
    }
  };

  const takeSelfie = async (step: SelfieStep) => {
    setBusy(true);
    try {
      const photo: CapturedPhoto | null = await captureSelfie();
      if (!photo) return;
      const faces = await detectFaces(photo.uri, photo.width, photo.height);
      const dataUri = await toDataUri(photo, SELFIE_MAX_SIDE, SELFIE_MAX_CHARS);
      let shot: Shot;
      if (faces === null) {
        setDetectorAvailable(false);
        shot = { previewUri: photo.uri, dataUri, ok: true, message: "Automatic checks aren't available on this phone. The reviewer will check your photos by eye." };
      } else {
        const result = evaluateSelfie(step, faces);
        shot = { previewUri: photo.uri, dataUri, ok: result.ok, message: result.message };
      }
      setSelfies((s) => ({ ...s, [step]: shot }));
    } catch (e) {
      fail(e);
    } finally {
      setBusy(false);
    }
  };

  const evidence = (): IdentityEvidence | null => {
    if (!idShot || !idChecks || !selfies.neutral || !selfies.smile || !selfies.turn) return null;
    return {
      idType,
      idImage: idShot.dataUri,
      selfies: { neutral: selfies.neutral.dataUri, smile: selfies.smile.dataUri, turn: selfies.turn.dataUri },
      clientChecks: {
        mode: detectorAvailable ? 'mlkit' : 'unavailable',
        faceOnId: idChecks.faceOnId,
        textReadable: idChecks.textReadable,
        lastNameOnId: idChecks.lastNameOnId,
        firstNameOnId: idChecks.firstNameOnId,
        liveness: {
          neutral: detectorAvailable && selfies.neutral.ok,
          smile: detectorAvailable && selfies.smile.ok,
          turn: detectorAvailable && selfies.turn.ok,
        },
      },
    };
  };

  const finish = async () => {
    const ev = evidence();
    if (!ev) return;
    if (mode === 'signup') {
      setIdentityDraft(ev);
      navigation.goBack();
      return;
    }
    if (!user) return;
    setBusy(true);
    try {
      await resubmitIdentity(user.uid, user.role, ev);
      Alert.alert('Submitted', 'Thanks. Your new photos are with the Super Admin for review.');
      navigation.goBack();
    } catch (e) {
      Alert.alert('Could not submit', (e as Error).message || 'Please check your connection and try again.');
    } finally {
      setBusy(false);
    }
  };

  const canAdvance =
    (phase === 'id' && !!idShot?.ok) ||
    (phase !== 'id' && phase !== 'review' && !!selfies[phase]?.ok);

  const next = () => setPhase(PHASES[Math.min(PHASES.indexOf(phase) + 1, PHASES.length - 1)]);
  const back = () => {
    const i = PHASES.indexOf(phase);
    if (i === 0) navigation.goBack(); else setPhase(PHASES[i - 1]);
  };

  const shotCard = (shot: Shot | null | undefined, onRetake: () => void, label: string) => (
    <View style={styles.shotCard}>
      {shot ? (
        <>
          <Image source={{ uri: shot.previewUri }} style={styles.preview} resizeMode="cover" />
          <Text style={[styles.shotMsg, { color: shot.ok ? colors.tealDark : colors.redText }]}>{shot.ok ? '✓ ' : '✗ '}{shot.message}</Text>
          <TouchableOpacity style={styles.secondaryBtn} onPress={onRetake} disabled={busy}>
            <Text style={styles.secondaryBtnText}>Retake</Text>
          </TouchableOpacity>
        </>
      ) : (
        <TouchableOpacity style={styles.captureBtn} onPress={onRetake} disabled={busy} activeOpacity={0.85}>
          {busy ? <ActivityIndicator color="#fff" /> : <Text style={styles.captureBtnText}>{label}</Text>}
        </TouchableOpacity>
      )}
    </View>
  );

  return (
    <SafeAreaView style={styles.container}>
      <View style={styles.header}>
        <TouchableOpacity onPress={back} style={styles.backBtn} disabled={busy}><Text style={styles.backText}>‹</Text></TouchableOpacity>
        <Text style={styles.headerTitle}>Verify your identity</Text>
        <Text style={styles.stepText}>{stepNumber}/{PHASES.length}</Text>
      </View>
      <View style={styles.progress}><View style={[styles.progressFill, { width: `${(stepNumber / PHASES.length) * 100}%` }]} /></View>

      <ScrollView contentContainerStyle={styles.body} showsVerticalScrollIndicator={false}>
        {phase === 'id' && (
          <>
            <Text style={styles.title}>Photograph your government ID</Text>
            <Text style={styles.sub}>Use a valid, unexpired ID with your photo. Lay it flat in good light, fill the frame, and avoid glare.</Text>
            <Text style={styles.label}>ID type</Text>
            <View style={styles.chipWrap}>
              {ID_TYPES.map((t) => (
                <TouchableOpacity key={t.id} style={[styles.chip, idType === t.id && styles.chipActive]} onPress={() => setIdType(t.id)}>
                  <Text style={[styles.chipText, idType === t.id && styles.chipTextActive]}>{t.label}</Text>
                </TouchableOpacity>
              ))}
            </View>
            {shotCard(idShot, takeId, 'Take photo of ID')}
            {idChecks && (
              <View style={styles.checks}>
                <Text style={styles.checkRow}>{idChecks.faceOnId ? '✓' : '•'} Photo of your face found on the ID</Text>
                <Text style={styles.checkRow}>{idChecks.textReadable ? '✓' : '•'} Text on the ID is readable</Text>
                {idChecks.lastNameOnId !== null && (
                  <Text style={styles.checkRow}>{idChecks.lastNameOnId && idChecks.firstNameOnId ? '✓' : '•'} Your name matches the ID</Text>
                )}
                {idChecks.lastNameOnId === false && (
                  <Text style={styles.warn}>We couldn't find “{lastName}” on the ID. The name you entered should match your ID exactly. You can retake the photo or continue; the reviewer will check.</Text>
                )}
              </View>
            )}
          </>
        )}

        {(phase === 'neutral' || phase === 'smile' || phase === 'turn') && (
          <>
            <Text style={styles.title}>{SELFIE_PROMPTS[phase].title}</Text>
            <Text style={styles.sub}>{SELFIE_PROMPTS[phase].instruction}</Text>
            {shotCard(selfies[phase], () => takeSelfie(phase), 'Open front camera')}
            <Text style={styles.hint}>These live photos are compared with the photo on your ID, so take them yourself, right now.</Text>
          </>
        )}

        {phase === 'review' && (
          <>
            <Text style={styles.title}>Review and submit</Text>
            <Text style={styles.sub}>The Super Admin will compare your selfies with your ID. You'll be able to use the app once approved.</Text>
            <View style={styles.thumbs}>
              {idShot && <Image source={{ uri: idShot.previewUri }} style={styles.thumb} />}
              {(['neutral', 'smile', 'turn'] as SelfieStep[]).map((k) => selfies[k] && <Image key={k} source={{ uri: selfies[k]!.previewUri }} style={styles.thumb} />)}
            </View>
            {!detectorAvailable && <Text style={styles.warn}>Automatic photo checks aren't available on this phone, so the reviewer will check everything by eye.</Text>}
            <View style={styles.consentRow}>
              <Switch value={consent} onValueChange={setConsent} trackColor={{ true: colors.teal }} />
              <Text style={styles.consentText}>
                I agree that CleanStream may use my ID and selfies only to verify my identity. Only the Super Admin can see them, and they are deleted once the review is done.
              </Text>
            </View>
          </>
        )}
      </ScrollView>

      <View style={styles.footer}>
        {phase === 'review' ? (
          <TouchableOpacity style={[styles.primaryBtn, (!consent || busy) && styles.disabled]} onPress={finish} disabled={!consent || busy}>
            {busy ? <ActivityIndicator color="#fff" /> : <Text style={styles.primaryBtnText}>{mode === 'signup' ? 'Use these photos' : 'Submit for review'}</Text>}
          </TouchableOpacity>
        ) : (
          <TouchableOpacity style={[styles.primaryBtn, (!canAdvance || busy) && styles.disabled]} onPress={next} disabled={!canAdvance || busy}>
            <Text style={styles.primaryBtnText}>Continue</Text>
          </TouchableOpacity>
        )}
      </View>
    </SafeAreaView>
  );
}

const createStyles = (Colors: ThemeColors) => StyleSheet.create({
  container: { flex: 1, backgroundColor: Colors.white },
  header: { flexDirection: 'row', alignItems: 'center', paddingHorizontal: 16, paddingVertical: 10 },
  backBtn: { width: 36, height: 36, alignItems: 'center', justifyContent: 'center' },
  backText: { fontSize: 30, color: Colors.textPrimary, marginTop: -4 },
  headerTitle: { flex: 1, fontSize: 16, fontWeight: '600', color: Colors.textPrimary, marginLeft: 4 },
  stepText: { fontSize: 12, color: Colors.textMuted },
  progress: { height: 3, backgroundColor: Colors.grayBg },
  progressFill: { height: 3, backgroundColor: Colors.teal },
  body: { padding: 20, gap: 12 },
  title: { fontSize: 19, fontWeight: '600', color: Colors.textPrimary },
  sub: { fontSize: 13, color: Colors.textMuted, lineHeight: 19 },
  label: { fontSize: 12, fontWeight: '600', color: Colors.textPrimary, marginTop: 4 },
  chipWrap: { flexDirection: 'row', flexWrap: 'wrap', gap: 7 },
  chip: { paddingHorizontal: 12, paddingVertical: 7, borderRadius: 20, backgroundColor: Colors.grayBg },
  chipActive: { backgroundColor: Colors.teal },
  chipText: { fontSize: 12, color: Colors.textPrimary },
  chipTextActive: { color: '#fff', fontWeight: '600' },
  shotCard: { backgroundColor: Colors.grayBg, borderRadius: 16, padding: 14, gap: 10, alignItems: 'stretch' },
  preview: { width: '100%', height: 220, borderRadius: 12, backgroundColor: Colors.grayMid },
  shotMsg: { fontSize: 13, fontWeight: '500', lineHeight: 18 },
  captureBtn: { backgroundColor: Colors.teal, borderRadius: 12, paddingVertical: 16, alignItems: 'center' },
  captureBtnText: { color: '#fff', fontSize: 14, fontWeight: '600' },
  secondaryBtn: { borderRadius: 10, paddingVertical: 10, alignItems: 'center', backgroundColor: Colors.white },
  secondaryBtnText: { fontSize: 13, fontWeight: '600', color: Colors.textPrimary },
  checks: { gap: 4, marginTop: 2 },
  checkRow: { fontSize: 13, color: Colors.textPrimary },
  warn: { fontSize: 12, color: Colors.amberText, backgroundColor: Colors.amberBg, borderRadius: 10, padding: 10, lineHeight: 17 },
  hint: { fontSize: 12, color: Colors.textHint, lineHeight: 17 },
  thumbs: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  thumb: { width: '48%', height: 130, borderRadius: 10, backgroundColor: Colors.grayBg },
  consentRow: { flexDirection: 'row', alignItems: 'flex-start', gap: 10, marginTop: 6 },
  consentText: { flex: 1, fontSize: 12, color: Colors.textMuted, lineHeight: 17 },
  footer: { padding: 16, paddingBottom: 20, borderTopWidth: 0.5, borderTopColor: Colors.border, backgroundColor: Colors.white },
  primaryBtn: { backgroundColor: Colors.teal, borderRadius: 12, paddingVertical: 14, alignItems: 'center' },
  primaryBtnText: { color: '#fff', fontSize: 14, fontWeight: '600' },
  disabled: { opacity: 0.45 },
});
