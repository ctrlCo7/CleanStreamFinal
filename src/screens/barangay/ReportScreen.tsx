import React, { useState } from 'react';
import {
  View, Text, ScrollView, TouchableOpacity, StyleSheet, SafeAreaView,
  TextInput, Alert,
} from 'react-native';
import { Colors } from '../../constants/colors';
import { useAppSelector } from '../../store/hooks';

const CHECKPOINT_TYPES = ['Pre-cleanup assessment', 'During cleanup progress', 'Post-cleanup verification', 'Hazmat status update', 'Community alert'];
const CONDITIONS = ['Clean', 'Mild', 'Moderate', 'Heavy', 'Critical'];
const WASTE_TYPES_OPT = ['Plastic', 'Organic', 'Hazardous', 'Metal', 'Electronic', 'Mixed'];

export default function BarangayReportScreen() {
  const { user } = useAppSelector((s) => s.auth);
  const [checkpointType, setCheckpointType] = useState(CHECKPOINT_TYPES[0]);
  const [condition, setCondition] = useState(CONDITIONS[2]);
  const [wasteType, setWasteType] = useState('Plastic');
  const [notes, setNotes] = useState('');
  const [submitted, setSubmitted] = useState(false);
  const [typeIdx, setTypeIdx] = useState(0);
  const [condIdx, setCondIdx] = useState(2);

  const barangay = user?.barangay || 'Guadalupe';

  const handleSubmit = () => {
    if (!notes.trim()) {
      Alert.alert('Notes required', 'Please add field notes before submitting.');
      return;
    }
    setSubmitted(true);
    setTimeout(() => {
      setSubmitted(false);
      setNotes('');
      Alert.alert('Checkpoint submitted', 'Your field report has been sent to the admin.');
    }, 1500);
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

  const COND_COLORS: Record<string, string> = {
    Clean: Colors.teal,
    Mild: Colors.green,
    Moderate: Colors.amber,
    Heavy: Colors.red,
    Critical: Colors.critical,
  };

  return (
    <SafeAreaView style={styles.container}>
      <View style={styles.header}>
        <Text style={styles.headerTitle}>Field Checkpoint</Text>
        <View style={styles.rolePill}>
          <Text style={styles.rolePillText}>{barangay} BHW</Text>
        </View>
      </View>

      <ScrollView contentContainerStyle={styles.body} showsVerticalScrollIndicator={false}>
        {/* Info banner */}
        <View style={styles.infoBanner}>
          <Text style={styles.infoTitle}>Submit checkpoint report</Text>
          <Text style={styles.infoSub}>Document conditions before, during, and after cleanup operations. Your field reports help the admin prioritize resources.</Text>
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
            { k: 'Officer', v: user ? `${user.firstName} ${user.lastName}` : 'BHW Officer' },
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
            placeholderTextColor={Colors.textHint}
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
          disabled={submitted}
          activeOpacity={0.85}
        >
          <Text style={styles.submitBtnText}>{submitted ? '✓ Submitted' : 'Submit checkpoint'}</Text>
        </TouchableOpacity>

        {/* Previous checkpoints */}
        <View style={styles.prevSection}>
          <Text style={styles.prevTitle}>Recent checkpoints</Text>
          {[
            { type: 'Post-cleanup verification', condition: 'Clean', date: 'Apr 3, 2026 · 2:14 PM', barangay: 'Guadalupe' },
            { type: 'Pre-cleanup assessment', condition: 'Critical', date: 'Apr 2, 2026 · 5:47 AM', barangay: 'Guadalupe' },
            { type: 'During cleanup progress', condition: 'Moderate', date: 'Apr 1, 2026 · 9:30 AM', barangay: 'Labangon' },
          ].map((p, i) => (
            <View key={i} style={styles.prevCard}>
              <View style={[styles.prevDot, { backgroundColor: COND_COLORS[p.condition] }]} />
              <View style={{ flex: 1 }}>
                <Text style={styles.prevType}>{p.type}</Text>
                <Text style={styles.prevDate}>{p.date} · {p.barangay}</Text>
              </View>
              <Text style={[styles.prevCond, { color: COND_COLORS[p.condition] }]}>{p.condition}</Text>
            </View>
          ))}
        </View>
      </ScrollView>
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
  rolePill: { backgroundColor: Colors.brgyLight, paddingHorizontal: 10, paddingVertical: 4, borderRadius: 20 },
  rolePillText: { fontSize: 10, color: Colors.brgyDark, fontWeight: '500' },
  body: { padding: 14, gap: 10, paddingBottom: 28 },
  infoBanner: {
    backgroundColor: Colors.brgyLight, borderRadius: 12, padding: 12,
    borderWidth: 0.5, borderColor: Colors.brgyMid, borderLeftWidth: 3, borderLeftColor: Colors.brgy,
  },
  infoTitle: { fontSize: 12, fontWeight: '500', color: Colors.brgyDark },
  infoSub: { fontSize: 10, color: Colors.brgyDark, opacity: 0.8, marginTop: 3, lineHeight: 15 },
  field: { gap: 5 },
  fieldLabel: { fontSize: 11, color: Colors.textMuted },
  selector: {
    backgroundColor: Colors.white, borderWidth: 0.5, borderColor: Colors.borderMid,
    borderRadius: 10, padding: 10, paddingHorizontal: 12,
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
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
  infoCard: { backgroundColor: Colors.white, borderRadius: 13, padding: 12, borderWidth: 0.5, borderColor: Colors.border },
  cardTitle: { fontSize: 11, fontWeight: '500', color: Colors.textPrimary, marginBottom: 7 },
  infoRow: {
    flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center',
    paddingVertical: 5, borderBottomWidth: 0.5, borderBottomColor: Colors.border,
  },
  infoKey: { fontSize: 10, color: Colors.textMuted },
  infoVal: { fontSize: 11, fontWeight: '500', color: Colors.textPrimary },
  notesInput: {
    backgroundColor: Colors.white, borderRadius: 12, borderWidth: 0.5, borderColor: Colors.border,
    padding: 12, fontSize: 12, color: Colors.textPrimary, minHeight: 110,
  },
  submitBtn: { backgroundColor: Colors.brgy, borderRadius: 13, paddingVertical: 13, alignItems: 'center' },
  submitBtnSuccess: { backgroundColor: Colors.green },
  submitBtnText: { fontSize: 13, fontWeight: '500', color: '#fff' },
  prevSection: { gap: 7 },
  prevTitle: { fontSize: 12, fontWeight: '500', color: Colors.textPrimary },
  prevCard: {
    backgroundColor: Colors.white, borderRadius: 12, padding: 10, paddingHorizontal: 13,
    flexDirection: 'row', alignItems: 'center', gap: 10, borderWidth: 0.5, borderColor: Colors.border,
  },
  prevDot: { width: 9, height: 9, borderRadius: 4.5 },
  prevType: { fontSize: 11, fontWeight: '500', color: Colors.textPrimary },
  prevDate: { fontSize: 10, color: Colors.textMuted, marginTop: 2 },
  prevCond: { fontSize: 11, fontWeight: '500' },
});
