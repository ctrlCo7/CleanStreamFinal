import React, { useEffect, useMemo, useState } from 'react';
import { Alert, Linking, Platform, StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { useTheme } from '../../hooks/useTheme';
import { ThemeColors } from '../../constants/theme';
import { NavInstruction, formatDistance, stepArrow } from '../../services/routeMath';
import { isVoiceOn, setVoiceOn, watchNavigation } from '../../services/crewTrackingService';

/** Hands the trip to the phone's own maps app (Google Maps, Waze, Petal Maps on Huawei, Apple Maps). */
export async function openInMapsApp(destination: { latitude: number; longitude: number }): Promise<void> {
  const { latitude: lat, longitude: lng } = destination;
  const urls = Platform.OS === 'ios'
    ? [`maps://?daddr=${lat},${lng}&dirflg=d`, `https://maps.apple.com/?daddr=${lat},${lng}&dirflg=d`]
    : [
      `google.navigation:q=${lat},${lng}&mode=d`,
      // Any maps app (Petal Maps on Huawei, Waze, OsmAnd...).
      `geo:${lat},${lng}?q=${lat},${lng}(Cleanup site)`,
      `https://www.google.com/maps/dir/?api=1&destination=${lat},${lng}&travelmode=driving`,
    ];
  for (const url of urls) {
    try {
      await Linking.openURL(url);
      return;
    } catch {
      // That app isn't installed: try the next one.
    }
  }
  Alert.alert('No maps app', 'Install a maps app, or follow the directions in CleanStream.');
}

/**
 * Turn-by-turn directions for the crew leader on the way to the site, like a ride-hailing
 * driver app: the next turn with a big arrow and how far it is, the turn after it, spoken
 * directions (can be muted), and a button to continue in the phone's maps app.
 */
export function NavigationBanner({ taskId, destination }: {
  taskId: string;
  destination: { latitude: number; longitude: number };
}) {
  const { colors } = useTheme();
  const styles = useMemo(() => createStyles(colors), [colors]);
  const [nav, setNav] = useState<NavInstruction | null>(null);
  const [voice, setVoice] = useState(isVoiceOn());
  useEffect(() => watchNavigation(taskId, setNav), [taskId]);

  const toggleVoice = () => {
    setVoiceOn(!voice);
    setVoice(!voice);
  };

  return (
    <View style={styles.wrap}>
      <View style={styles.banner}>
        <Text style={styles.arrow}>{nav ? stepArrow(nav.step) : '↑'}</Text>
        <View style={{ flex: 1 }}>
          {nav ? (
            <>
              <Text style={styles.distance}>
                {nav.step.type === 'depart' ? 'Start' : nav.distanceM < 20 ? 'Now' : formatDistance(nav.distanceM)}
              </Text>
              <Text style={styles.text} numberOfLines={2}>{nav.text}</Text>
            </>
          ) : (
            <Text style={styles.text}>Getting directions…</Text>
          )}
        </View>
        <TouchableOpacity
          onPress={toggleVoice}
          style={styles.voice}
          accessibilityRole="button"
          accessibilityLabel={voice ? 'Mute voice directions' : 'Turn on voice directions'}
        >
          <Text style={styles.voiceIcon}>{voice ? '🔊' : '🔇'}</Text>
        </TouchableOpacity>
      </View>
      {nav?.then && (
        <View style={styles.then}>
          <Text style={styles.thenText} numberOfLines={1}>Then: {nav.then}</Text>
        </View>
      )}
      <TouchableOpacity style={styles.mapsBtn} onPress={() => openInMapsApp(destination)} accessibilityRole="button">
        <Text style={styles.mapsBtnText}>🧭 Open in maps app</Text>
      </TouchableOpacity>
    </View>
  );
}

const createStyles = (Colors: ThemeColors) => StyleSheet.create({
  wrap: { gap: 0 },
  banner: {
    flexDirection: 'row', alignItems: 'center', gap: 12,
    backgroundColor: Colors.tealDark, borderRadius: 16, paddingHorizontal: 14, paddingVertical: 12,
  },
  arrow: { fontSize: 40, color: '#fff', fontWeight: '800', width: 48, textAlign: 'center' },
  distance: { fontSize: 22, color: '#fff', fontWeight: '800' },
  text: { fontSize: 15, color: '#fff', fontWeight: '600', marginTop: 1 },
  voice: { width: 40, height: 40, borderRadius: 20, backgroundColor: 'rgba(255,255,255,0.18)', alignItems: 'center', justifyContent: 'center' },
  voiceIcon: { fontSize: 18 },
  then: {
    alignSelf: 'flex-start', marginLeft: 14, backgroundColor: Colors.tealDeep,
    borderBottomLeftRadius: 10, borderBottomRightRadius: 10, paddingHorizontal: 12, paddingVertical: 5,
  },
  thenText: { fontSize: 12, color: '#fff', fontWeight: '600' },
  mapsBtn: {
    marginTop: 10, alignSelf: 'flex-start', borderRadius: 20, paddingHorizontal: 14, paddingVertical: 8,
    borderWidth: 1, borderColor: Colors.teal, backgroundColor: Colors.surface,
  },
  mapsBtnText: { fontSize: 13, color: Colors.teal, fontWeight: '700' },
});
