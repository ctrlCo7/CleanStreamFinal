import React, { useMemo, useState } from 'react';
import {
  ActivityIndicator, FlatList, Keyboard, Modal, SafeAreaView, StyleSheet,
  Text, TextInput, TouchableOpacity, View,
} from 'react-native';
import { useTheme } from '../../hooks/useTheme';
import { ThemeColors } from '../../constants/theme';
import { GeoLocation } from '../../types';
import { PlaceResult, locationFromPlaceResult, searchPlaces } from '../../services/locationService';

interface Props {
  visible: boolean;
  onClose: () => void;
  onSelect: (loc: GeoLocation) => void;
}

export function LocationSearchModal({ visible, onClose, onSelect }: Props) {
  const { colors } = useTheme();
  const styles = useMemo(() => createStyles(colors), [colors]);
  const [query, setQuery] = useState('');
  const [results, setResults] = useState<PlaceResult[]>([]);
  const [loading, setLoading] = useState(false);
  const [searched, setSearched] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const runSearch = async () => {
    Keyboard.dismiss();
    setLoading(true);
    setError(null);
    try {
      setResults(await searchPlaces(query));
      setSearched(true);
    } catch {
      setError('Search failed. Check your internet connection and try again.');
    } finally {
      setLoading(false);
    }
  };

  const choose = async (r: PlaceResult) => {
    onSelect(await locationFromPlaceResult(r));
    onClose();
  };

  return (
    <Modal visible={visible} animationType="slide" onRequestClose={onClose}>
      <SafeAreaView style={styles.container}>
        <View style={styles.header}>
          <Text style={styles.title}>Search your location</Text>
          <TouchableOpacity onPress={onClose}>
            <Text style={styles.close}>Close</Text>
          </TouchableOpacity>
        </View>

        <View style={styles.searchRow}>
          <TextInput
            style={styles.input}
            value={query}
            onChangeText={setQuery}
            placeholder="Street, barangay or landmark in Cebu City"
            placeholderTextColor={colors.textHint}
            returnKeyType="search"
            onSubmitEditing={runSearch}
            autoFocus
          />
          <TouchableOpacity style={styles.searchBtn} onPress={runSearch} disabled={loading || query.trim().length < 2}>
            <Text style={styles.searchBtnText}>Search</Text>
          </TouchableOpacity>
        </View>

        {loading && <ActivityIndicator style={styles.loader} color={colors.teal} />}
        {!!error && <Text style={styles.message}>{error}</Text>}
        {!loading && !error && searched && results.length === 0 && (
          <Text style={styles.message}>No matches. Try a nearby street or barangay name.</Text>
        )}

        <FlatList
          data={results}
          keyExtractor={(r) => r.id}
          keyboardShouldPersistTaps="handled"
          renderItem={({ item }) => (
            <TouchableOpacity style={styles.result} onPress={() => choose(item)}>
              <Text style={styles.resultTitle} numberOfLines={1}>{item.title}</Text>
              <Text style={styles.resultSub} numberOfLines={2}>{item.subtitle}</Text>
            </TouchableOpacity>
          )}
        />
      </SafeAreaView>
    </Modal>
  );
}

const createStyles = (Colors: ThemeColors) => StyleSheet.create({
  container: { flex: 1, backgroundColor: Colors.grayBg },
  header: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
    padding: 16, backgroundColor: Colors.white,
  },
  title: { fontSize: 15, fontWeight: '600', color: Colors.textPrimary },
  close: { fontSize: 13, color: Colors.teal, fontWeight: '600' },
  searchRow: { flexDirection: 'row', gap: 8, padding: 16 },
  input: {
    flex: 1, backgroundColor: Colors.white, borderRadius: 12, paddingHorizontal: 14,
    paddingVertical: 10, fontSize: 13, color: Colors.textPrimary,
  },
  searchBtn: { backgroundColor: Colors.teal, borderRadius: 12, paddingHorizontal: 16, justifyContent: 'center' },
  searchBtnText: { color: '#fff', fontSize: 13, fontWeight: '600' },
  loader: { marginTop: 12 },
  message: { fontSize: 12, color: Colors.textMuted, textAlign: 'center', padding: 16 },
  result: {
    backgroundColor: Colors.white, marginHorizontal: 16, marginBottom: 8,
    borderRadius: 12, padding: 14, gap: 3,
  },
  resultTitle: { fontSize: 13, fontWeight: '600', color: Colors.textPrimary },
  resultSub: { fontSize: 11, color: Colors.textMuted, lineHeight: 16 },
});
