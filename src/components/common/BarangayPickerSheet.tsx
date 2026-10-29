import React, { useEffect, useMemo, useState } from 'react';
import { FlatList, Modal, StyleSheet, Text, TextInput, TouchableOpacity, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useTheme } from '../../hooks/useTheme';
import { ThemeColors } from '../../constants/theme';
import { CEBU_BARANGAYS } from '../../services/locationService';
import { collection, onSnapshot } from 'firebase/firestore';
import { db } from '../../services/firebase';

export interface BarangayChoice { id: string; name: string }

/** The built-in Cebu City list plus any barangay the Super Admin has added, by name. */
export function useBarangayChoices(): BarangayChoice[] {
  const [extra, setExtra] = useState<BarangayChoice[]>([]);
  useEffect(() => {
    // Plain collection read (filtered here): no composite index needed.
    return onSnapshot(collection(db, 'barangays'), (snap) => setExtra(snap.docs
      .map((d) => ({ id: d.id, name: String(d.data().name ?? ''), active: d.data().isActive !== false }))
      .filter((b) => b.name && b.active)
      .map(({ id, name }) => ({ id, name }))), () => setExtra([]));
  }, []);
  return useMemo(() => {
    const all = new Map<string, BarangayChoice>(CEBU_BARANGAYS.map((b) => [b.id, { id: b.id, name: b.name }]));
    extra.forEach((b) => { if (!all.has(b.id)) all.set(b.id, b); });
    return [...all.values()].sort((a, b) => a.name.localeCompare(b.name));
  }, [extra]);
}

interface Props {
  visible: boolean;
  title: string;
  subtitle?: string;
  selectedId?: string;
  /** Marks the person's own barangay in the list. */
  homeId?: string;
  /** Limit the list (e.g. to barangays with a known centre point). Defaults to every barangay. */
  choices?: BarangayChoice[];
  onPick: (b: BarangayChoice) => void;
  onClose: () => void;
}

/** Full-screen, searchable list of Cebu City barangays. */
export function BarangayPickerSheet({ visible, title, subtitle, selectedId, homeId, choices, onPick, onClose }: Props) {
  const { colors } = useTheme();
  const styles = useMemo(() => createStyles(colors), [colors]);
  const all = useBarangayChoices();
  const [q, setQ] = useState('');
  const list = useMemo(() => {
    const base = choices ?? all;
    const needle = q.trim().toLowerCase();
    return needle ? base.filter((b) => b.name.toLowerCase().includes(needle)) : base;
  }, [choices, all, q]);

  return (
    <Modal visible={visible} animationType="slide" onRequestClose={onClose} presentationStyle="pageSheet">
      <SafeAreaView style={styles.container}>
        <View style={styles.header}>
          <View style={{ flex: 1 }}>
            <Text style={styles.title}>{title}</Text>
            {!!subtitle && <Text style={styles.subtitle}>{subtitle}</Text>}
          </View>
          <TouchableOpacity onPress={onClose} style={styles.closeBtn} accessibilityLabel="Close">
            <Text style={styles.closeText}>✕</Text>
          </TouchableOpacity>
        </View>
        <TextInput
          style={styles.search}
          placeholder="Search barangay"
          placeholderTextColor={colors.textHint}
          value={q}
          onChangeText={setQ}
          autoCorrect={false}
        />
        <FlatList
          data={list}
          keyExtractor={(b) => b.id}
          keyboardShouldPersistTaps="handled"
          contentContainerStyle={{ paddingBottom: 24 }}
          ListEmptyComponent={<Text style={styles.empty}>No barangay matches “{q}”.</Text>}
          renderItem={({ item }) => {
            const selected = item.id === selectedId;
            return (
              <TouchableOpacity style={[styles.row, selected && styles.rowSelected]} onPress={() => { onPick(item); setQ(''); }} activeOpacity={0.8}>
                <Text style={styles.rowIcon}>📍</Text>
                <Text style={[styles.rowName, selected && styles.rowNameSelected]}>Brgy. {item.name}</Text>
                {item.id === homeId && <Text style={styles.home}>Your barangay</Text>}
                {selected && <Text style={styles.check}>✓</Text>}
              </TouchableOpacity>
            );
          }}
        />
      </SafeAreaView>
    </Modal>
  );
}

const createStyles = (Colors: ThemeColors) => StyleSheet.create({
  container: { flex: 1, backgroundColor: Colors.grayBg },
  header: {
    flexDirection: 'row', alignItems: 'center', gap: 12, paddingHorizontal: 16, paddingVertical: 14,
    backgroundColor: Colors.white, borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: Colors.border,
  },
  title: { fontSize: 17, fontWeight: '700', color: Colors.textPrimary },
  subtitle: { fontSize: 12, color: Colors.textMuted, marginTop: 2 },
  closeBtn: { width: 34, height: 34, borderRadius: 17, backgroundColor: Colors.grayBg, alignItems: 'center', justifyContent: 'center' },
  closeText: { fontSize: 15, color: Colors.textSecondary },
  search: {
    margin: 16, marginBottom: 8, backgroundColor: Colors.white, borderRadius: 12, paddingHorizontal: 14, paddingVertical: 11,
    fontSize: 14, color: Colors.textPrimary, borderWidth: StyleSheet.hairlineWidth, borderColor: Colors.border,
  },
  row: {
    flexDirection: 'row', alignItems: 'center', gap: 10, marginHorizontal: 16, marginTop: 8, padding: 14,
    backgroundColor: Colors.white, borderRadius: 14,
  },
  rowSelected: { borderWidth: 1.5, borderColor: Colors.teal },
  rowIcon: { fontSize: 14 },
  rowName: { flex: 1, fontSize: 14, fontWeight: '600', color: Colors.textPrimary },
  rowNameSelected: { color: Colors.tealDark },
  home: { fontSize: 11, fontWeight: '700', color: Colors.tealDark, backgroundColor: Colors.tealLight, paddingHorizontal: 8, paddingVertical: 3, borderRadius: 10, overflow: 'hidden' },
  check: { fontSize: 15, fontWeight: '700', color: Colors.teal },
  empty: { textAlign: 'center', color: Colors.textMuted, fontSize: 13, marginTop: 30 },
});
