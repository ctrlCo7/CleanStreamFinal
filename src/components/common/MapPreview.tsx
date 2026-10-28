import React, { useMemo } from 'react';
import { View, Text, TouchableOpacity, StyleSheet, Platform } from 'react-native';
import MapView, { Marker } from 'react-native-maps';
import { useTheme } from '../../hooks/useTheme';
import { MapErrorBoundary } from './MapErrorBoundary';
import { OsmMapView, OsmMarker } from './OsmMapView';
import { useMapEngine } from '../../hooks/useMapFallback';
import { nativeMapLook } from '../map/mapTheme';
import { TeardropPin } from '../map/MapIcons';



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

  // Google Maps / Apple Maps, or OpenFreeMap on Huawei phones and when the native map can't start.
  const { engine, onReady, onError } = useMapEngine();
  const useFallbackMap = engine === 'osm';

  const osmMarkers: OsmMarker[] = useMemo(
    () =>
      pins.map((pin) => ({
        id: pin.id,
        latitude: pin.latitude,
        longitude: pin.longitude,
        color: pinColors[pin.severity],
      })),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [pins],
  );

  return (
    <TouchableOpacity onPress={onPress} activeOpacity={0.9}>
      <View style={[styles.container, { height, backgroundColor: isDark ? colors.grayMid : '#D4EFE4' }]}>
        {Platform.OS !== 'web' && (
          useFallbackMap ? (
            <OsmMapView
              region={CEBU_REGION}
              markers={osmMarkers}
              interactive={false}
              style={StyleSheet.absoluteFill}
            />
          ) : (
            <MapErrorBoundary onError={onError}>
              <MapView
                style={StyleSheet.absoluteFill}
                // Google Maps with CleanStream's style on Android, matching Apple Maps on iOS.
                {...nativeMapLook(isDark)}
                initialRegion={CEBU_REGION}
                scrollEnabled={false}
                zoomEnabled={false}
                pitchEnabled={false}
                rotateEnabled={false}
                onMapReady={onReady}
              >
                {pins.map((pin) => (
                  <Marker
                    key={pin.id}
                    coordinate={{ latitude: pin.latitude, longitude: pin.longitude }}
                    anchor={{ x: 0.5, y: 1 }}
                    tracksViewChanges={false}
                  >
                    <TeardropPin color={pinColors[pin.severity]} glow={pin.severity === 'critical'} />
                  </Marker>
                ))}
              </MapView>
            </MapErrorBoundary>
          )
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
