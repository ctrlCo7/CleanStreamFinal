import React, { useState } from 'react';
import { View, Text, TouchableOpacity, StyleSheet, SafeAreaView, ScrollView } from 'react-native';
import { NativeStackScreenProps } from '@react-navigation/native-stack';
import MapView, { Marker, PROVIDER_GOOGLE, Callout } from 'react-native-maps';
import { Colors } from '../constants/colors';
import { RootStackParamList } from '../types';
import { BackIcon } from '../components/common/TabIcons';
import { Badge } from '../components/common/Badge';
import { useAppSelector } from '../store/hooks';

type Props = NativeStackScreenProps<RootStackParamList, 'Map'>;

const CEBU = { latitude: 10.3157, longitude: 123.8854, latitudeDelta: 0.08, longitudeDelta: 0.08 };

const SEVERITY_PIN: Record<string, string> = {
  critical: Colors.critical,
  high: Colors.red,
  moderate: Colors.amber,
  low: Colors.teal,
};

const LEGEND_ITEMS = [
  { color: Colors.critical, label: 'Critical' },
  { color: Colors.red, label: 'High' },
  { color: Colors.amber, label: 'Moderate' },
  { color: Colors.teal, label: 'Low' },
];

const FILTER_OPTIONS = ['All', 'Critical', 'High', 'Moderate', 'Low'];

const STATIC_HOTSPOTS = [
  { id: 's1', lat: 10.3095, lng: 123.8973, severity: 'critical' as const, barangay: 'Guadalupe', type: 'Hazardous waste', confidence: '99.1%' },
  { id: 's2', lat: 10.3240, lng: 123.9185, severity: 'high' as const, barangay: 'Punta Princesa', type: 'Plastic surge', confidence: '97.4%' },
  { id: 's3', lat: 10.2918, lng: 123.8794, severity: 'high' as const, barangay: 'Labangon', type: 'Metal debris', confidence: '91.2%' },
  { id: 's4', lat: 10.3340, lng: 123.9010, severity: 'moderate' as const, barangay: 'Mambaling', type: 'Organic waste', confidence: '88.5%' },
  { id: 's5', lat: 10.3450, lng: 123.9120, severity: 'moderate' as const, barangay: 'Kinasang-an', type: 'Mixed waste', confidence: '83.0%' },
  { id: 's6', lat: 10.3010, lng: 123.8600, severity: 'low' as const, barangay: 'Basak Pardo', type: 'Light debris', confidence: '76.2%' },
];

export default function MapScreen({ navigation }: Props) {
  const { reports } = useAppSelector((s) => s.reports);
  const [filter, setFilter] = useState('All');
  const [selectedId, setSelectedId] = useState<string | null>(null);

  const liveHotspots = reports
    .filter((r) => r.location?.lat && r.location?.lng)
    .map((r) => ({
      id: r.id,
      lat: r.location!.lat!,
      lng: r.location!.lng!,
      severity: r.severity,
      barangay: r.location?.barangay || 'Unknown',
      type: r.aiAnalysis?.wasteTypes[0]?.label || 'Waste',
      confidence: `${r.aiAnalysis?.confidence || '—'}%`,
    }));

  const allHotspots = [...STATIC_HOTSPOTS, ...liveHotspots];

  const filtered = filter === 'All' ? allHotspots : allHotspots.filter((h) => h.severity === filter.toLowerCase());

  const counts = {
    critical: allHotspots.filter((h) => h.severity === 'critical').length,
    high: allHotspots.filter((h) => h.severity === 'high').length,
    moderate: allHotspots.filter((h) => h.severity === 'moderate').length,
    low: allHotspots.filter((h) => h.severity === 'low').length,
  };

  return (
    <SafeAreaView style={styles.container}>
      <View style={styles.header}>
        <TouchableOpacity style={styles.backBtn} onPress={() => navigation.goBack()}>
          <BackIcon />
        </TouchableOpacity>
        <Text style={styles.headerTitle}>Waste Map</Text>
        <View style={{ width: 34 }} />
      </View>

      {/* Filter bar */}
      <View style={styles.filterBar}>
        <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.filterRow}>
          {FILTER_OPTIONS.map((opt) => (
            <TouchableOpacity
              key={opt}
              style={[styles.filterChip, filter === opt && styles.filterChipActive]}
              onPress={() => setFilter(opt)}
            >
              <Text style={[styles.filterChipText, filter === opt && styles.filterChipTextActive]}>{opt}</Text>
            </TouchableOpacity>
          ))}
        </ScrollView>
      </View>

      {/* Map */}
      <View style={styles.mapContainer}>
        <MapView
          provider={PROVIDER_GOOGLE}
          style={styles.map}
          initialRegion={CEBU}
          showsUserLocation
          showsMyLocationButton={false}
        >
          {filtered.map((h) => (
            <Marker
              key={h.id}
              coordinate={{ latitude: h.lat, longitude: h.lng }}
              onPress={() => setSelectedId(h.id === selectedId ? null : h.id)}
            >
              <View style={[styles.pin, { backgroundColor: SEVERITY_PIN[h.severity] }]}>
                <View style={styles.pinInner} />
              </View>
              <Callout style={styles.callout} onPress={() => navigation.navigate('CitizenDetail', { reportId: h.id })}>
                <Text style={styles.calloutBarangay}>{h.barangay}</Text>
                <Text style={styles.calloutType}>{h.type}</Text>
                <Text style={styles.calloutCnn}>CNN: {h.confidence}</Text>
                <Text style={styles.calloutTap}>Tap for details →</Text>
              </Callout>
            </Marker>
          ))}
        </MapView>

        {/* Legend overlay */}
        <View style={styles.legend}>
          {LEGEND_ITEMS.map((item) => (
            <View key={item.label} style={styles.legendItem}>
              <View style={[styles.legendDot, { backgroundColor: item.color }]} />
              <Text style={styles.legendText}>{item.label}</Text>
            </View>
          ))}
        </View>

        {/* Stats overlay */}
        <View style={styles.statsOverlay}>
          {[
            { val: counts.critical, color: Colors.critical, label: 'Critical' },
            { val: counts.high, color: Colors.red, label: 'High' },
            { val: counts.moderate, color: Colors.amber, label: 'Moderate' },
          ].map((s) => (
            <View key={s.label} style={styles.statChip}>
              <Text style={[styles.statChipVal, { color: s.color }]}>{s.val}</Text>
              <Text style={styles.statChipLabel}>{s.label}</Text>
            </View>
          ))}
        </View>
      </View>

      {/* Bottom info */}
      <View style={styles.bottomBar}>
        <Text style={styles.bottomTotal}>{filtered.length} hotspots visible</Text>
        <Text style={styles.bottomSub}>AI-classified · CNN v2.4 · Real-time</Text>
      </View>
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
  backBtn: { width: 34, height: 34, borderRadius: 17, backgroundColor: Colors.grayBg, alignItems: 'center', justifyContent: 'center' },
  filterBar: { backgroundColor: Colors.white, borderBottomWidth: 0.5, borderBottomColor: Colors.border },
  filterRow: { gap: 6, padding: 8, paddingHorizontal: 12 },
  filterChip: { paddingHorizontal: 12, paddingVertical: 5, borderRadius: 20, borderWidth: 0.5, borderColor: Colors.border, backgroundColor: Colors.white },
  filterChipActive: { backgroundColor: Colors.teal, borderColor: Colors.teal },
  filterChipText: { fontSize: 11, color: Colors.textMuted },
  filterChipTextActive: { color: '#fff', fontWeight: '500' },
  mapContainer: { flex: 1, position: 'relative' },
  map: { flex: 1 },
  pin: { width: 18, height: 18, borderRadius: 9, alignItems: 'center', justifyContent: 'center', borderWidth: 2, borderColor: '#fff' },
  pinInner: { width: 6, height: 6, borderRadius: 3, backgroundColor: 'rgba(255,255,255,0.8)' },
  callout: { backgroundColor: Colors.white, borderRadius: 10, padding: 10, minWidth: 140 },
  calloutBarangay: { fontSize: 12, fontWeight: '500', color: Colors.textPrimary },
  calloutType: { fontSize: 10, color: Colors.textMuted, marginTop: 2 },
  calloutCnn: { fontSize: 10, color: Colors.teal, marginTop: 3, fontWeight: '500' },
  calloutTap: { fontSize: 9, color: Colors.blue, marginTop: 5 },
  legend: {
    position: 'absolute', bottom: 16, left: 12,
    backgroundColor: 'rgba(255,255,255,0.95)', borderRadius: 12, padding: 10,
    borderWidth: 0.5, borderColor: Colors.border,
    gap: 5,
  },
  legendItem: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  legendDot: { width: 9, height: 9, borderRadius: 4.5 },
  legendText: { fontSize: 10, color: Colors.textPrimary, fontWeight: '500' },
  statsOverlay: {
    position: 'absolute', top: 12, right: 12,
    flexDirection: 'column', gap: 5,
  },
  statChip: {
    backgroundColor: 'rgba(255,255,255,0.95)', borderRadius: 10, paddingHorizontal: 9, paddingVertical: 5,
    alignItems: 'center', borderWidth: 0.5, borderColor: Colors.border,
  },
  statChipVal: { fontSize: 14, fontWeight: '500' },
  statChipLabel: { fontSize: 9, color: Colors.textMuted },
  bottomBar: {
    backgroundColor: Colors.white, paddingHorizontal: 16, paddingVertical: 10,
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
    borderTopWidth: 0.5, borderTopColor: Colors.border,
  },
  bottomTotal: { fontSize: 12, fontWeight: '500', color: Colors.textPrimary },
  bottomSub: { fontSize: 10, color: Colors.textMuted },
});
