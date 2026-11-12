import React, { useMemo, useState } from 'react';
import { Image, Modal, Pressable, ScrollView, StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { useTheme } from '../../hooks/useTheme';
import { ThemeColors } from '../../constants/theme';
import { CleanupResult } from '../../types';
import { formatPH } from '../../utils/phTime';

/**
 * The finished cleanup on a report: the crew's before and after photos side by side, with
 * the date, crew and amount collected. Tapping a photo shows it full screen.
 */
export function CleanupResultCard({ result, fallbackBeforeURL }: { result?: CleanupResult; fallbackBeforeURL?: string }) {
  const { colors } = useTheme();
  const styles = useMemo(() => createStyles(colors), [colors]);
  const [viewing, setViewing] = useState<{ uri: string; label: string } | null>(null);

  // Without a "before" photo from the crew, the reporter's own photo shows what it looked like.
  const before = result?.beforePhotoURLs?.length ? result.beforePhotoURLs : fallbackBeforeURL ? [fallbackBeforeURL] : [];
  const after = result?.afterPhotoURLs ?? [];

  const Column = ({ label, urls, empty }: { label: string; urls: string[]; empty: string }) => (
    <View style={styles.col}>
      <Text style={[styles.colLabel, label === 'After' && { color: colors.tealDark }]}>{label}</Text>
      {urls.length ? (
        <TouchableOpacity onPress={() => setViewing({ uri: urls[0], label })} accessibilityRole="imagebutton" accessibilityLabel={`${label} photo, tap to enlarge`}>
          <Image source={{ uri: urls[0] }} style={styles.photo} resizeMode="cover" />
          {urls.length > 1 && <Text style={styles.more}>+{urls.length - 1} more</Text>}
        </TouchableOpacity>
      ) : (
        <View style={[styles.photo, styles.photoEmpty]}><Text style={styles.emptyText}>{empty}</Text></View>
      )}
      {urls.length > 1 && (
        <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.thumbs}>
          {urls.slice(1).map((u) => (
            <TouchableOpacity key={u} onPress={() => setViewing({ uri: u, label })}>
              <Image source={{ uri: u }} style={styles.thumb} />
            </TouchableOpacity>
          ))}
        </ScrollView>
      )}
    </View>
  );

  const facts = [
    result?.confirmedAt ? `Cleaned up ${formatPH(result.confirmedAt)}` : '',
    result?.crewName ? `by ${result.crewName}` : '',
    typeof result?.wasteCollectedKg === 'number' ? `${result.wasteCollectedKg} kg collected` : '',
  ].filter(Boolean);

  return (
    <View style={styles.card}>
      <Text style={styles.title}>✅ Cleaned up: before and after</Text>
      {facts.length > 0 && <Text style={styles.facts}>{facts.join(' · ')}</Text>}
      <View style={styles.row}>
        <Column label="Before" urls={before} empty="No before photo" />
        <Column label="After" urls={after} empty={result ? 'No after photo' : 'Photos not available for this older cleanup'} />
      </View>
      {!!result?.notes && <Text style={styles.notes}>“{result.notes}”</Text>}
      <Text style={styles.hint}>Tap a photo to see it full size.</Text>

      <Modal visible={!!viewing} transparent animationType="fade" onRequestClose={() => setViewing(null)} statusBarTranslucent>
        <Pressable style={styles.viewer} onPress={() => setViewing(null)} accessibilityLabel="Close photo">
          {viewing && (
            <>
              <Text style={styles.viewerLabel}>{viewing.label}</Text>
              <Image source={{ uri: viewing.uri }} style={styles.viewerImage} resizeMode="contain" />
              <Text style={styles.viewerHint}>Tap anywhere to close</Text>
            </>
          )}
        </Pressable>
      </Modal>
    </View>
  );
}

const createStyles = (C: ThemeColors) => StyleSheet.create({
  card: {
    backgroundColor: C.white, borderRadius: 16, padding: 14, gap: 10,
    borderWidth: 1, borderColor: C.tealLight,
    shadowColor: C.shadow, shadowOffset: { width: 0, height: 2 }, shadowOpacity: 0.05, shadowRadius: 8, elevation: 1,
  },
  title: { fontSize: 14, fontWeight: '700', color: C.tealDark },
  facts: { fontSize: 11.5, color: C.textMuted, marginTop: -4 },
  row: { flexDirection: 'row', gap: 10 },
  col: { flex: 1, gap: 6 },
  colLabel: { fontSize: 11, fontWeight: '700', color: C.textMuted, textTransform: 'uppercase', letterSpacing: 0.5 },
  photo: { width: '100%', aspectRatio: 1, borderRadius: 12, backgroundColor: C.grayBg },
  photoEmpty: { alignItems: 'center', justifyContent: 'center', padding: 8 },
  emptyText: { fontSize: 11, color: C.textHint, textAlign: 'center' },
  more: {
    position: 'absolute', right: 6, bottom: 6, backgroundColor: 'rgba(0,0,0,0.6)', color: '#fff',
    fontSize: 10.5, fontWeight: '600', paddingHorizontal: 7, paddingVertical: 3, borderRadius: 8, overflow: 'hidden',
  },
  thumbs: { gap: 6 },
  thumb: { width: 44, height: 44, borderRadius: 8, backgroundColor: C.grayBg },
  notes: { fontSize: 12, color: C.textSecondary, fontStyle: 'italic' },
  hint: { fontSize: 10.5, color: C.textHint },
  viewer: { flex: 1, backgroundColor: 'rgba(0,0,0,0.92)', alignItems: 'center', justifyContent: 'center', padding: 16 },
  viewerLabel: { color: '#fff', fontSize: 15, fontWeight: '700', marginBottom: 12 },
  viewerImage: { width: '100%', height: '75%' },
  viewerHint: { color: 'rgba(255,255,255,0.7)', fontSize: 12, marginTop: 12 },
});
