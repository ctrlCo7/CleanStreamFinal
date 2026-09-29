import React from 'react';
import { View, Text, TouchableOpacity, StyleSheet, Platform } from 'react-native';
import MapView, { Marker, PROVIDER_GOOGLE } from 'react-native-maps';
import { useTheme } from '../../hooks/useTheme';

interface HotspotPin {
  id: string;
  latitude: number;
  longitude: number;
  severity: 'critical' | 'high' | 'moderate' | 'low';
}

interface MapPreviewProps {
  pins?: HotspotPin[];
  onPress?: () => void;
  height?: number;
  tagText?: string;
  accentColor?: string;
}

const CEBU_REGION = {
  latitude: 10.3157,
  longitude: 123.8854,
  latitudeDelta: 0.08,
  longitudeDelta: 0.06,
};

export function MapPreview({
  pins = [],
  onPress,
  height = 130,
  tagText = 'Live hotspot map · Tap to expand',
  accentColor,
}: MapPreviewProps) {
  const { colors, isDark } = useTheme();
  const pinColors = {
    critical: colors.critical,
    high: colors.red,
    moderate: colors.amber,
    low: colors.teal,
  };
  const resolvedAccent = accentColor ?? colors.tealDark;

  return (
    <TouchableOpacity onPress={onPress} activeOpacity={0.9}>
      <View style={[styles.container, { height, backgroundColor: isDark ? colors.grayMid : '#D4EFE4' }]}>
        {Platform.OS !== 'web' && (
          <MapView
            style={StyleSheet.absoluteFill}
            // Expo Go on iOS has no Google Maps SDK baked in -- forcing
            // PROVIDER_GOOGLE there renders blank. Android keeps Google Maps.
            provider={Platform.OS === 'android' ? PROVIDER_GOOGLE : undefined}
            initialRegion={CEBU_REGION}
            scrollEnabled={false}
            zoomEnabled={false}
            pitchEnabled={false}
            rotateEnabled={false}
            mapType="standard"
            userInterfaceStyle={isDark ? 'dark' : 'light'}
          >
            {pins.map((pin) => (
              <Marker
                key={pin.id}
                coordinate={{ latitude: pin.latitude, longitude: pin.longitude }}
                pinColor={pinColors[pin.severity]}
              />
            ))}
          </MapView>
        )}
        <View style={[styles.tag, { position: 'absolute', bottom: 8, left: 10, backgroundColor: isDark ? 'rgba(30,30,29,0.88)' : 'rgba(255,255,255,0.88)' }]}>
          <Text style={[styles.tagText, { color: resolvedAccent }]}>{tagText}</Text>
        </View>
        <View style={[styles.gpsBadge, { backgroundColor: isDark ? 'rgba(30,30,29,0.9)' : 'rgba(255,255,255,0.9)' }]}>
          <Text style={[styles.gpsText, { color: resolvedAccent }]}>📍 Mobile GPS</Text>
        </View>
      </View>
    </TouchableOpacity>
  );
}

const styles = StyleSheet.create({
  container: {
    borderRadius: 14,
    overflow: 'hidden',
    position: 'relative',
  },
  tag: {
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 8,
  },
  tagText: {
    fontSize: 10,
    fontWeight: '500',
  },
  gpsBadge: {
    position: 'absolute',
    top: 8,
    right: 10,
    paddingHorizontal: 8,
    paddingVertical: 2,
    borderRadius: 8,
  },
  gpsText: {
    fontSize: 9,
    fontWeight: '500',
  },
});
