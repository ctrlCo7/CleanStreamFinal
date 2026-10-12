import React, { useState, useEffect, useMemo } from 'react';
import {
  View, Text, ScrollView, TouchableOpacity, StyleSheet,
  TextInput, Alert, ActivityIndicator, Image,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { collection, query, where, orderBy, onSnapshot, limit } from 'firebase/firestore';
import * as ImagePicker from 'expo-image-picker';
import { manipulateAsync, SaveFormat } from 'expo-image-manipulator';
import { db } from '../../services/firebase';
import { useTheme } from '../../hooks/useTheme';
import { ThemeColors } from '../../constants/theme';
import { useAppSelector } from '../../store/hooks';
import { createCheckpoint } from '../../services/checkpointService';
import { getCurrentLocation } from '../../services/locationService';
import { getNotificationRecipientsByRole, sendBulkNotification } from '../../services/notificationService';
import { CameraIcon } from '../../components/common/TabIcons';
import { GeoLocation } from '../../types';

const CHECKPOINT_TYPES = ['Pre-cleanup assessment', 'During cleanup progress', 'Post-cleanup verification', 'Hazmat status update', 'Community alert'];
const CONDITIONS = ['Clean', 'Mild', 'Moderate', 'Heavy', 'Critical'];
const WASTE_TYPES_OPT = ['Plastic', 'Organic', 'Hazardous', 'Metal', 'Electronic', 'Mixed'];

function buildCondColors(colors: ThemeColors): Record<string, string> {
  return {
    Clean: colors.teal,
    Mild: colors.green,
    Moderate: colors.amber,
    Heavy: colors.red,
    Critical: colors.critical,
  };
}

interface FieldCheckpoint {
  id: string;
  type: string;
  condition: string;
  date: string;
  barangay: string;
}

export default function BarangayReportScreen() {
  const { colors } = useTheme();
  const styles = useMemo(() => createStyles(colors), [colors]);
  const COND_COLORS = useMemo(() => buildCondColors(colors), [colors]);
  const { user } = useAppSelector((s) => s.auth);
  const [checkpointType, setCheckpointType] = useState(CHECKPOINT_TYPES[0]);
  const [condition, setCondition] = useState(CONDITIONS[2]);
  const [wasteType, setWasteType] = useState('Plastic');
  const [notes, setNotes] = useState('');
  const [submitted, setSubmitted] = useState(false);
  const [saving, setSaving] = useState(false);
  const [typeIdx, setTypeIdx] = useState(0);
  const [condIdx, setCondIdx] = useState(2);
  const [recentCheckpoints, setRecentCheckpoints] = useState<FieldCheckpoint[]>([]);
  const [photoUri, setPhotoUri] = useState<string | null>(null);
  const [location, setLocation] = useState<GeoLocation | null>(null);
  const [geoStatus, setGeoStatus] = useState<'detecting' | 'found' | 'error'>('detecting');

  const barangay = user?.barangay || 'Guadalupe';

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
      Alert.alert('Permission required', 'Camera permission is needed to capture checkpoint photos.');
      return;
    }
    const result = await ImagePicker.launchCameraAsync({
      mediaTypes: 'images',
      quality: 0.85,
      allowsEditing: false,
    });
    if (!result.canceled && result.assets[0]) {
      try {
        const resized = await manipulateAsync(
          result.assets[0].uri,
          [{ resize: { width: 1280 } }],
          { compress: 0.7, format: SaveFormat.JPEG },
        );
        setPhotoUri(resized.uri);
      } catch (e) {
        console.warn('[Checkpoint] Photo downscale failed, using original capture:', e);
        setPhotoUri(result.assets[0].uri);
      }
    }
  };

  // Subscribe to recent checkpoints for this user
  useEffect(() => {
    if (!user?.uid) return;
    const q = query(
      collection(db, 'fieldCheckpoints'),
      where('userId', '==', user.uid),
      orderBy('createdAt', 'desc'),
      limit(5),
    );
    const unsub = onSnapshot(q, (snap) => {
      setRecentCheckpoints(
        snap.docs.map((d) => {
          const data = d.data();
          const ts = data.createdAt?.toDate?.() ?? new Date(data.createdAt ?? Date.now());
          return {
            id: d.id,
            type: data.type || '—',
            condition: data.condition || '—',
            barangay: data.barangay || '—',
            date: ts.toLocaleString('en-US', { month: 'short', day: 'numeric', year: 'numeric', hour: '2-digit', minute: '2-digit' }),
          };
        }),
      );
    });
    return unsub;
  }, [user?.uid]);

  const handleSubmit = async () => {
    if (!photoUri) {
      Alert.alert('Photo required', 'Please capture a photo of the checkpoint first.');
      return;
    }
    if (!notes.trim()) {
      Alert.alert('Notes required', 'Please add field notes before submitting.');
      return;
    }
    setSaving(true);
    const officerName = user ? `${user.firstName} ${user.lastName}` : 'Barangay Official';
    try {
      await createCheckpoint(
        user?.uid ?? '',
        officerName,
        user?.barangayId ?? '',
        barangay,
        checkpointType,
        condition,
        wasteType,
        notes.trim(),
        photoUri,
        location ?? undefined,
      );

      // Notify admins so checkpoint completions actually surface somewhere, per the
      // CleanStream workflow ("notify the Admin regarding checkpoint completion").
      getNotificationRecipientsByRole(['admin'])
        .then((adminIds) => {
          if (adminIds.length === 0) return;
          return sendBulkNotification(
            adminIds,
            'Checkpoint report submitted',
            `${officerName} (${barangay}) submitted a ${checkpointType.toLowerCase()} checkpoint — condition: ${condition}.`,
            'system',
          );
        })
        .catch((e) => console.warn('[Checkpoint] Admin notification failed (non-fatal):', e));

      setSubmitted(true);
      setNotes('');
      setPhotoUri(null);
      setTimeout(() => {
        setSubmitted(false);
        Alert.alert('Checkpoint submitted', 'Your field report has been sent to the admin.');
      }, 1500);
    } catch {
      Alert.alert('Error', 'Failed to submit. Please check your connection and try again.');
    } finally {
      setSaving(false);
    }
  };

  const cycleType = () => {
    const next = (typeIdx + 1) % CHECKPOINT_TYPES.length;
    setTypeIdx(next);
    setCheckpointType(CHECKPOINT_TYPES[next]);
  };

  const cycleCond = () => {
    const next = (condIdx + 1) % CONDITIONS.length;
    setCondIdx(next);
    setCondition(CONDITIONS[next]);
  };

  return (
    <SafeAreaView style={styles.container}>
      <View style={styles.header}>
        <Text style={styles.headerTitle}>Field Checkpoint</Text>
        <View style={styles.rolePill}>
          <Text style={styles.rolePillText}>{barangay} BSP</Text>
        </View>
      </View>

      <ScrollView contentContainerStyle={styles.body} showsVerticalScrollIndicator={false}>
        {/* Info banner */}
        <View style={styles.infoBanner}>
          <Text style={styles.infoTitle}>Submit checkpoint report</Text>
          <Text style={styles.infoSub}>Document conditions before, during, and after cleanup operations. Your field reports help the admin prioritize resources.</Text>
        </View>

        {/* Photo capture */}
        <View style={styles.field}>
          <Text style={styles.fieldLabel}>Checkpoint photo</Text>
          {photoUri ? (
            <TouchableOpacity onPress={handleCamera} activeOpacity={0.85}>
              <Image source={{ uri: photoUri }} style={styles.photoPreview} />
              <View style={styles.retakeBadge}>
                <Text style={styles.retakeBadgeText}>Retake</Text>
              </View>
            </TouchableOpacity>
          ) : (
            <TouchableOpacity style={styles.cameraBtn} onPress={handleCamera} activeOpacity={0.85}>
              <CameraIcon color={colors.brgy} size={22} />
              <Text style={styles.cameraBtnText}>Capture checkpoint photo</Text>
            </TouchableOpacity>
          )}
        </View>

        {/* Checkpoint type */}
        <View style={styles.field}>
          <Text style={styles.fieldLabel}>Checkpoint type</Text>
          <TouchableOpacity style={styles.selector} onPress={cycleType}>
            <Text style={styles.selectorText}>{checkpointType}</Text>
            <Text style={styles.selectorArrow}>▾</Text>
          </TouchableOpacity>
        </View>

        {/* Current condition */}
        <View style={styles.field}>
          <Text style={styles.fieldLabel}>Site condition</Text>
          <TouchableOpacity style={[styles.selector, { borderColor: COND_COLORS[condition] }]} onPress={cycleCond}>
            <View style={styles.condRow}>
              <View style={[styles.condDot, { backgroundColor: COND_COLORS[condition] }]} />
              <Text style={[styles.selectorText, { color: COND_COLORS[condition] }]}>{condition}</Text>
            </View>
            <Text style={styles.selectorArrow}>▾</Text>
          </TouchableOpacity>
        </View>

        {/* Waste type chips */}
        <View style={styles.field}>
          <Text style={styles.fieldLabel}>Primary waste type</Text>
          <View style={styles.chipRow}>
            {WASTE_TYPES_OPT.map((wt) => (
              <TouchableOpacity
                key={wt}
                style={[styles.chip, wasteType === wt && styles.chipActive]}
                onPress={() => setWasteType(wt)}
              >
                <Text style={[styles.chipText, wasteType === wt && styles.chipTextActive]}>{wt}</Text>
              </TouchableOpacity>
            ))}
          </View>
        </View>

        {/* Location info */}
        <View style={styles.infoCard}>
          <Text style={styles.cardTitle}>Auto-detected location</Text>
          {[
            { k: 'Barangay', v: barangay },
            {
              k: 'GPS',
              v: geoStatus === 'found' && location
                ? `${location.latitude.toFixed(5)}, ${location.longitude.toFixed(5)}`
                : geoStatus === 'detecting' ? 'Detecting…' : 'Unavailable',
            },
            { k: 'Officer', v: user ? `${user.firstName} ${user.lastName}` : 'Barangay Official' },
            { k: 'Date/Time', v: new Date().toLocaleString('en-US', { month: 'short', day: 'numeric', year: 'numeric', hour: '2-digit', minute: '2-digit' }) },
          ].map((row) => (
            <View key={row.k} style={styles.infoRow}>
              <Text style={styles.infoKey}>{row.k}</Text>
              <Text style={styles.infoVal}>{row.v}</Text>
            </View>
          ))}
        </View>

        {/* Notes */}
        <View style={styles.field}>
          <Text style={styles.fieldLabel}>Field notes</Text>
          <TextInput
            style={styles.notesInput}
            placeholder="Describe conditions, estimated volume, hazards, community feedback..."
            placeholderTextColor={colors.textHint}
            value={notes}
            onChangeText={setNotes}
            multiline
            numberOfLines={5}
            textAlignVertical="top"
          />
        </View>

        {/* Submit */}
        <TouchableOpacity
          style={[styles.submitBtn, submitted && styles.submitBtnSuccess]}
          onPress={handleSubmit}
          disabled={submitted || saving}
          activeOpacity={0.85}
        >
          {saving
            ? <ActivityIndicator size="small" color="#fff" />
            : <Text style={styles.submitBtnText}>{submitted ? '✓ Submitted' : 'Submit checkpoint'}</Text>
          }
        </TouchableOpacity>

        {/* Recent checkpoints from Firestore */}
        {recentCheckpoints.length > 0 && (
          <View style={styles.prevSection}>
            <Text style={styles.prevTitle}>Recent checkpoints</Text>
            {recentCheckpoints.map((p) => (
              <View key={p.id} style={styles.prevCard}>
                <View style={[styles.prevDot, { backgroundColor: COND_COLORS[p.condition] ?? colors.grayMid }]} />
                <View style={{ flex: 1 }}>
                  <Text style={styles.prevType}>{p.type}</Text>
                  <Text style={styles.prevDate}>{p.date} · {p.barangay}</Text>
                </View>
                <Text style={[styles.prevCond, { color: COND_COLORS[p.condition] ?? colors.textMuted }]}>{p.condition}</Text>
              </View>
            ))}
          </View>
        )}
      </ScrollView>
    </SafeAreaView>
  );
}

const createStyles = (Colors: ThemeColors) => StyleSheet.create({
  container: { flex: 1, backgroundColor: Colors.grayBg },
  header: {
    backgroundColor: Colors.white, paddingHorizontal: 16, paddingVertical: 12,
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
    borderBottomWidth: 0.5, borderBottomColor: Colors.border,
  },
  headerTitle: { fontSize: 16, fontWeight: '500', color: Colors.textPrimary },
  rolePill: { backgroundColor: Colors.brgyLight, paddingHorizontal: 10, paddingVertical: 4, borderRadius: 20 },
  rolePillText: { fontSize: 10, color: Colors.brgyDark, fontWeight: '500' },
  body: { padding: 16, gap: 14, paddingBottom: 28 },
  infoBanner: {
    backgroundColor: Colors.brgyLight, borderRadius: 12, padding: 12,
    borderWidth: 0.5, borderColor: Colors.brgyMid, borderLeftWidth: 3, borderLeftColor: Colors.brgy,
  },
  infoTitle: { fontSize: 12, fontWeight: '500', color: Colors.brgyDark },
  infoSub: { fontSize: 10, color: Colors.brgyDark, opacity: 0.8, marginTop: 3, lineHeight: 15 },
  field: { gap: 5 },
  fieldLabel: { fontSize: 11, color: Colors.textMuted },
  cameraBtn: {
    backgroundColor: Colors.white, borderRadius: 16, paddingVertical: 24,
    alignItems: 'center', justifyContent: 'center', gap: 8,
    borderWidth: 1, borderColor: Colors.brgyMid, borderStyle: 'dashed',
  },
  cameraBtnText: { fontSize: 12, fontWeight: '500', color: Colors.brgy },
  photoPreview: { width: '100%', height: 180, borderRadius: 16 },
  retakeBadge: {
    position: 'absolute', bottom: 10, right: 10,
    backgroundColor: 'rgba(0,0,0,0.6)', borderRadius: 20,
    paddingHorizontal: 12, paddingVertical: 6,
  },
  retakeBadgeText: { fontSize: 11, fontWeight: '600', color: '#fff' },
  selector: {
    backgroundColor: Colors.white,
    borderRadius: 16, padding: 13, paddingHorizontal: 14,
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
    shadowColor: Colors.shadow, shadowOffset: { width: 0, height: 2 }, shadowOpacity: 0.05, shadowRadius: 8, elevation: 1,
  },
  selectorText: { fontSize: 12, color: Colors.textPrimary },
  selectorArrow: { fontSize: 14, color: Colors.grayHint },
  condRow: { flexDirection: 'row', alignItems: 'center', gap: 7 },
  condDot: { width: 9, height: 9, borderRadius: 4.5 },
  chipRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 6 },
  chip: { paddingHorizontal: 11, paddingVertical: 5, borderRadius: 20, borderWidth: 0.5, borderColor: Colors.border, backgroundColor: Colors.white },
  chipActive: { backgroundColor: Colors.brgy, borderColor: Colors.brgy },
  chipText: { fontSize: 11, color: Colors.textMuted },
  chipTextActive: { color: '#fff', fontWeight: '500' },
  infoCard: {
    backgroundColor: Colors.white, borderRadius: 17, padding: 15,
    shadowColor: Colors.shadow, shadowOffset: { width: 0, height: 2 }, shadowOpacity: 0.05, shadowRadius: 8, elevation: 1,
  },
  cardTitle: { fontSize: 11, fontWeight: '500', color: Colors.textPrimary, marginBottom: 7 },
  infoRow: {
    flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center',
    paddingVertical: 5, borderBottomWidth: 0.5, borderBottomColor: Colors.border,
  },
  infoKey: { fontSize: 10, color: Colors.textMuted },
  infoVal: { fontSize: 11, fontWeight: '500', color: Colors.textPrimary },
  notesInput: {
    backgroundColor: Colors.white, borderRadius: 16,
    padding: 15, fontSize: 12, color: Colors.textPrimary, minHeight: 110,
    shadowColor: Colors.shadow, shadowOffset: { width: 0, height: 2 }, shadowOpacity: 0.05, shadowRadius: 8, elevation: 1,
  },
  submitBtn: { backgroundColor: Colors.brgy, borderRadius: 13, paddingVertical: 13, alignItems: 'center' },
  submitBtnSuccess: { backgroundColor: Colors.green },
  submitBtnText: { fontSize: 13, fontWeight: '500', color: '#fff' },
  prevSection: { gap: 7 },
  prevTitle: { fontSize: 12, fontWeight: '500', color: Colors.textPrimary },
  prevCard: {
    backgroundColor: Colors.white, borderRadius: 16, padding: 13, paddingHorizontal: 15,
    flexDirection: 'row', alignItems: 'center', gap: 10,
    shadowColor: Colors.shadow, shadowOffset: { width: 0, height: 2 }, shadowOpacity: 0.05, shadowRadius: 8, elevation: 1,
  },
  prevDot: { width: 9, height: 9, borderRadius: 4.5 },
  prevType: { fontSize: 11, fontWeight: '500', color: Colors.textPrimary },
  prevDate: { fontSize: 10, color: Colors.textMuted, marginTop: 2 },
  prevCond: { fontSize: 11, fontWeight: '500' },
});
