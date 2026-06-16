import React, { useState, useMemo, useCallback, memo } from 'react';
import {
  View,
  Text,
  TouchableOpacity,
  StyleSheet,
  ScrollView,
  ActivityIndicator,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { NativeStackScreenProps } from '@react-navigation/native-stack';
import MapView, { Marker, PROVIDER_GOOGLE, Callout } from 'react-native-maps';
import { Colors } from '../constants/colors';
import { RootStackParamList, WasteReport, SeverityLevel } from '../types';
import { BackIcon } from '../components/common/TabIcons';
import { useMapReports } from '../hooks/useMapReports';
import {
  getMarkerColor,
  SEVERITY_COLORS,
  SEVERITY_BG,
  SEVERITY_EMOJIS,
  SEVERITY_LABELS,
  ORDERED_SEVERITIES,
  SeverityCount,
} from '../utils/mapUtils';

type Props = NativeStackScreenProps<RootStackParamList, 'Map'>;

const CEBU = {
  latitude: 10.3157,
  longitude: 123.8854,
  latitudeDelta: 0.08,
  longitudeDelta: 0.08,
};

const FILTER_OPTIONS = ['All', 'Critical', 'High', 'Moderate', 'Low'] as const;

// ─── Memoized marker (prevents re-rendering unchanged reports) ────────────────

interface SeverityMarkerProps {
  report: WasteReport;
  onNavigate: (reportId: string) => void;
}

const SeverityMarker = memo(
  ({ report, onNavigate }: SeverityMarkerProps) => {
    const color    = getMarkerColor(report.severity);
    const bgColor  = SEVERITY_BG[report.severity as SeverityLevel] ?? '#F9F9F9';
    const emoji    = SEVERITY_EMOJIS[report.severity as SeverityLevel] ?? '⚪';
    const sevLabel = SEVERITY_LABELS[report.severity as SeverityLevel] ?? report.severity;

    const barangay   = report.location.barangay ?? report.barangay ?? 'Unknown';
    const wasteLabel = report.aiAnalysis?.wasteTypes?.[0]?.label ?? 'Waste detected';
    const confidence = report.aiAnalysis?.confidence != null
      ? `${Number(report.aiAnalysis.confidence).toFixed(1)}%`
      : '—';

    return (
      <Marker
        coordinate={{
          latitude: report.location.latitude,
          longitude: report.location.longitude,
        }}
        // tracksViewChanges=false is critical: prevents continuous native re-renders
        // Set to true only while animating/updating, otherwise performance tanks
        tracksViewChanges={false}
      >
        {/* Custom circular pin */}
        <View style={[styles.pin, { backgroundColor: color }]}>
          <View style={styles.pinInner} />
        </View>

        {/* Info callout */}
        <Callout style={styles.callout} onPress={() => onNavigate(report.id)}>
          <View style={[styles.calloutSeverityBadge, { backgroundColor: bgColor }]}>
            <Text style={[styles.calloutSeverityText, { color }]}>
              {emoji} {sevLabel}
            </Text>
          </View>
          <Text style={styles.calloutBarangay}>{barangay}</Text>
          <Text style={styles.calloutType}>{wasteLabel}</Text>
          <Text style={styles.calloutConfidence}>AI Confidence: {confidence}</Text>
          <Text style={styles.calloutReportNum} numberOfLines={1}>
            {report.reportNumber ?? report.id.slice(0, 12)}
          </Text>
          <Text style={styles.calloutTap}>Tap to view full report →</Text>
        </Callout>
      </Marker>
    );
  },
  // Custom equality: only re-render if severity, position, or confidence changed
  (prev, next) =>
    prev.report.severity === next.report.severity &&
    prev.report.location.latitude === next.report.location.latitude &&
    prev.report.location.longitude === next.report.location.longitude &&
    prev.report.aiAnalysis?.confidence === next.report.aiAnalysis?.confidence,
);

// ─── Stats bar (4 severity counts, tappable to filter) ───────────────────────

interface StatsBarProps {
  counts: SeverityCount;
  activeFilter: string;
  onFilter: (sev: string) => void;
}

const StatsBar = memo(({ counts, activeFilter, onFilter }: StatsBarProps) => (
  <View style={styles.statsBar}>
    {ORDERED_SEVERITIES.map((sev) => {
      const label = sev.charAt(0).toUpperCase() + sev.slice(1);
      const isActive = activeFilter === label;
      return (
        <TouchableOpacity
          key={sev}
          style={[styles.statItem, isActive && { borderColor: SEVERITY_COLORS[sev], borderWidth: 1.5 }]}
          onPress={() => onFilter(isActive ? 'All' : label)}
          activeOpacity={0.75}
        >
          <Text style={[styles.statCount, { color: SEVERITY_COLORS[sev] }]}>{counts[sev]}</Text>
          <View style={[styles.statBar, { backgroundColor: SEVERITY_COLORS[sev] }]} />
          <Text style={styles.statLabel}>{label}</Text>
        </TouchableOpacity>
      );
    })}
  </View>
));

// ─── Legend overlay ───────────────────────────────────────────────────────────

const MapLegend = memo(() => (
  <View style={styles.legend}>
    <Text style={styles.legendTitle}>Legend</Text>
    {ORDERED_SEVERITIES.map((sev) => (
      <View key={sev} style={styles.legendItem}>
        <Text style={styles.legendEmoji}>{SEVERITY_EMOJIS[sev]}</Text>
        <Text style={styles.legendText}>{SEVERITY_LABELS[sev]}</Text>
      </View>
    ))}
  </View>
));

// ─── Screen ───────────────────────────────────────────────────────────────────

export default function MapScreen({ navigation }: Props) {
  const { reports, loading, counts, total } = useMapReports();
  const [filter, setFilter] = useState('All');

  // Filtered marker list — recomputed only when reports or filter change
  const filtered = useMemo(() => {
    if (filter === 'All') return reports;
    const lower = filter.toLowerCase() as SeverityLevel;
    return reports.filter((r) => r.severity === lower);
  }, [reports, filter]);

  // Stable navigation callback — prevents SeverityMarker re-renders from function identity change
  const handleNavigate = useCallback(
    (reportId: string) => {
      navigation.navigate('CitizenDetail', { reportId } as never);
    },
    [navigation],
  );

  const handleFilter = useCallback((val: string) => setFilter(val), []);

  return (
    <SafeAreaView style={styles.container}>
      {/* ── Header ── */}
      <View style={styles.header}>
        <TouchableOpacity style={styles.backBtn} onPress={() => navigation.goBack()}>
          <BackIcon />
        </TouchableOpacity>
        <Text style={styles.headerTitle}>Waste Map</Text>
        <View style={{ width: 34 }} />
      </View>

      {/* ── Severity filter chips ── */}
      <View style={styles.filterBar}>
        <ScrollView
          horizontal
          showsHorizontalScrollIndicator={false}
          contentContainerStyle={styles.filterRow}
        >
          {FILTER_OPTIONS.map((opt) => (
            <TouchableOpacity
              key={opt}
              style={[styles.filterChip, filter === opt && styles.filterChipActive]}
              onPress={() => setFilter(opt)}
            >
              <Text style={[styles.filterChipText, filter === opt && styles.filterChipTextActive]}>
                {opt}
              </Text>
            </TouchableOpacity>
          ))}
        </ScrollView>
      </View>

      {/* ── Severity counts (above map) ── */}
      <StatsBar counts={counts} activeFilter={filter} onFilter={handleFilter} />

      {/* ── Map ── */}
      <View style={styles.mapContainer}>
        <MapView
          provider={PROVIDER_GOOGLE}
          style={styles.map}
          initialRegion={CEBU}
          showsUserLocation
          showsMyLocationButton={false}
          moveOnMarkerPress={false}
        >
          {filtered.map((report) => (
            <SeverityMarker
              key={report.id}
              report={report}
              onNavigate={handleNavigate}
            />
          ))}
        </MapView>

        {/* Loading overlay */}
        {loading && (
          <View style={styles.loadingOverlay}>
            <ActivityIndicator size="large" color={Colors.teal} />
            <Text style={styles.loadingText}>Loading map data…</Text>
          </View>
        )}

        {/* Legend */}
        <MapLegend />

        {/* Live badge */}
        <View style={styles.liveBadge}>
          <View style={styles.liveDot} />
          <Text style={styles.liveText}>Live</Text>
        </View>
      </View>

      {/* ── Bottom summary bar ── */}
      <View style={styles.bottomBar}>
        <Text style={styles.bottomTotal}>
          {filtered.length} of {total} report{total !== 1 ? 's' : ''} shown
        </Text>
        <Text style={styles.bottomSub}>AI-classified · Real-time</Text>
      </View>
    </SafeAreaView>
  );
}

// ─── Styles ───────────────────────────────────────────────────────────────────

const styles = StyleSheet.create({
  container:  { flex: 1, backgroundColor: Colors.grayBg },

  // Header
  header: {
    backgroundColor: Colors.white,
    paddingHorizontal: 16,
    paddingVertical: 12,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    borderBottomWidth: 0.5,
    borderBottomColor: Colors.border,
  },
  headerTitle: { fontSize: 16, fontWeight: '600', color: Colors.textPrimary },
  backBtn: {
    width: 34, height: 34, borderRadius: 17,
    backgroundColor: Colors.grayBg,
    alignItems: 'center', justifyContent: 'center',
  },

  // Filter chips
  filterBar: {
    backgroundColor: Colors.white,
    borderBottomWidth: 0.5,
    borderBottomColor: Colors.border,
  },
  filterRow:      { gap: 6, padding: 8, paddingHorizontal: 12 },
  filterChip: {
    paddingHorizontal: 12, paddingVertical: 5,
    borderRadius: 20, borderWidth: 0.5,
    borderColor: Colors.border, backgroundColor: Colors.white,
  },
  filterChipActive: { backgroundColor: Colors.teal, borderColor: Colors.teal },
  filterChipText:       { fontSize: 11, color: Colors.textMuted },
  filterChipTextActive: { color: '#fff', fontWeight: '600' },

  // Stats bar
  statsBar: {
    flexDirection: 'row',
    backgroundColor: Colors.white,
    borderBottomWidth: 0.5,
    borderBottomColor: Colors.border,
    paddingHorizontal: 8,
    paddingVertical: 8,
    gap: 6,
  },
  statItem: {
    flex: 1,
    alignItems: 'center',
    paddingVertical: 6,
    borderRadius: 10,
    backgroundColor: Colors.grayBg,
    borderWidth: 1,
    borderColor: 'transparent',
  },
  statCount: { fontSize: 18, fontWeight: '700', lineHeight: 22 },
  statBar:   { height: 3, width: '60%', borderRadius: 2, marginVertical: 2 },
  statLabel: { fontSize: 9, color: Colors.textMuted, fontWeight: '500', textTransform: 'uppercase', letterSpacing: 0.3 },

  // Map
  mapContainer: { flex: 1, position: 'relative' },
  map:          { flex: 1 },

  // Markers
  pin: {
    width: 18, height: 18, borderRadius: 9,
    alignItems: 'center', justifyContent: 'center',
    borderWidth: 2.5, borderColor: '#fff',
    shadowColor: '#000', shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.3, shadowRadius: 2, elevation: 3,
  },
  pinInner: { width: 5, height: 5, borderRadius: 2.5, backgroundColor: 'rgba(255,255,255,0.9)' },

  // Callout
  callout: {
    backgroundColor: Colors.white,
    borderRadius: 12,
    padding: 10,
    minWidth: 160,
    maxWidth: 220,
  },
  calloutSeverityBadge: {
    borderRadius: 6,
    paddingHorizontal: 7,
    paddingVertical: 3,
    alignSelf: 'flex-start',
    marginBottom: 6,
  },
  calloutSeverityText: { fontSize: 11, fontWeight: '700' },
  calloutBarangay:    { fontSize: 12, fontWeight: '600', color: Colors.textPrimary },
  calloutType:        { fontSize: 10, color: Colors.textMuted, marginTop: 2 },
  calloutConfidence:  { fontSize: 10, color: Colors.teal, marginTop: 3, fontWeight: '600' },
  calloutReportNum:   { fontSize: 9, color: Colors.textHint, marginTop: 2 },
  calloutTap:         { fontSize: 9, color: Colors.blue, marginTop: 6, fontWeight: '500' },

  // Legend
  legend: {
    position: 'absolute', bottom: 16, left: 12,
    backgroundColor: 'rgba(255,255,255,0.96)',
    borderRadius: 12, padding: 10,
    borderWidth: 0.5, borderColor: Colors.border,
    gap: 4,
    shadowColor: '#000', shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.08, shadowRadius: 4, elevation: 2,
  },
  legendTitle: { fontSize: 9, fontWeight: '700', color: Colors.textMuted, textTransform: 'uppercase', letterSpacing: 0.5, marginBottom: 2 },
  legendItem:  { flexDirection: 'row', alignItems: 'center', gap: 5 },
  legendEmoji: { fontSize: 11 },
  legendText:  { fontSize: 10, color: Colors.textPrimary, fontWeight: '500' },

  // Live badge
  liveBadge: {
    position: 'absolute', top: 12, right: 12,
    flexDirection: 'row', alignItems: 'center', gap: 5,
    backgroundColor: 'rgba(255,255,255,0.95)',
    borderRadius: 20, paddingHorizontal: 10, paddingVertical: 5,
    borderWidth: 0.5, borderColor: Colors.border,
  },
  liveDot:  { width: 7, height: 7, borderRadius: 3.5, backgroundColor: '#22C55E' },
  liveText: { fontSize: 11, fontWeight: '600', color: Colors.textPrimary },

  // Loading overlay
  loadingOverlay: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: 'rgba(255,255,255,0.85)',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 10,
    zIndex: 10,
  },
  loadingText: { fontSize: 13, color: Colors.textMuted },

  // Bottom bar
  bottomBar: {
    backgroundColor: Colors.white,
    paddingHorizontal: 16,
    paddingVertical: 10,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    borderTopWidth: 0.5,
    borderTopColor: Colors.border,
  },
  bottomTotal: { fontSize: 12, fontWeight: '600', color: Colors.textPrimary },
  bottomSub:   { fontSize: 10, color: Colors.textMuted },
});
