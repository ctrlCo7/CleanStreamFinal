import React from 'react';
import { View, Text, TouchableOpacity, StyleSheet } from 'react-native';
import MapView, { Marker, PROVIDER_GOOGLE } from 'react-native-maps';
import { Colors } from '../../constants/colors';

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

const PIN_COLORS = {
  critical: Colors.critical,
  high: Colors.red,
  moderate: Colors.amber,
  low: Colors.teal,
};

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
  accentColor = Colors.tealDark,
}: MapPreviewProps) {
  return (
    <TouchableOpacity onPress={onPress} activeOpacity={0.9}>
      <View style={[styles.container, { height }]}>
        <MapView
          style={StyleSheet.absoluteFillObject}
          provider={PROVIDER_GOOGLE}
          initialRegion={CEBU_REGION}
          scrollEnabled={false}
          zoomEnabled={false}
          pitchEnabled={false}
          rotateEnabled={false}
          mapType="standard"
        >
          {pins.map((pin) => (
            <Marker
              key={pin.id}
              coordinate={{ latitude: pin.latitude, longitude: pin.longitude }}
              pinColor={PIN_COLORS[pin.severity]}
            />
          ))}
        </MapView>
        <View style={[styles.tag, { position: 'absolute', bottom: 8, left: 10 }]}>
          <Text style={[styles.tagText, { color: accentColor }]}>{tagText}</Text>
        </View>
        <View style={styles.gpsBadge}>
          <Text style={[styles.gpsText, { color: accentColor }]}>📍 Mobile GPS</Text>
        </View>
      </View>
    </TouchableOpacity>
  );
}

const styles = StyleSheet.create({
  container: {
    borderRadius: 14,
    overflow: 'hidden',
    backgroundColor: '#D4EFE4',
    position: 'relative',
  },
  tag: {
    backgroundColor: 'rgba(255,255,255,0.88)',
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
    backgroundColor: 'rgba(255,255,255,0.9)',
    paddingHorizontal: 8,
    paddingVertical: 2,
    borderRadius: 8,
  },
  gpsText: {
    fontSize: 9,
    fontWeight: '500',
  },
});
