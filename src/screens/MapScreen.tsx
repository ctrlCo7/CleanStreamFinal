import React, { useState, useMemo, useCallback, useEffect, memo } from 'react';
import {
  View,
  Text,
  Image,
  TouchableOpacity,
  StyleSheet,
  ScrollView,
  ActivityIndicator,
  Platform,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { NativeStackScreenProps } from '@react-navigation/native-stack';
import MapView, { Circle, Marker } from 'react-native-maps';
import { useTheme } from '../hooks/useTheme';
import { ThemeColors } from '../constants/theme';
import { CrewTracking, RootStackParamList, WasteReport, SeverityLevel } from '../types';
import { BackIcon } from '../components/common/TabIcons';
import { useMapReports } from '../hooks/useMapReports';
import { MapErrorBoundary } from '../components/common/MapErrorBoundary';
import { useMapEngine } from '../hooks/useMapFallback';
import { OsmArea, OsmMapView, OsmMarker } from '../components/common/OsmMapView';
import { findHotspots, HOTSPOT_RADIUS_M } from '../services/reportProximity';

const HOTSPOT_COLOR = '#DC2626';
import { formatVolume } from '../utils/units';
import { nativeMapLook } from '../components/map/mapTheme';
import { TruckIcon } from '../components/map/MapIcons';
import { subscribeActiveTrips } from '../services/crewTrackingService';
import { formatEta } from '../services/routeMath';
import { useTrackedTruck } from '../hooks/useGlide';
import { MotionMemo, nextMotion } from '../components/map/truckMotion';
import { useAppSelector } from '../store/hooks';
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

// ─── Report pins ──────────────────────────────────────────────────────────────
//
// Pins are ready-made images, one per severity, that Google Maps and Apple Maps draw
// natively. Pins drawn as React views have to be photographed by the map first, and on
// Android (new architecture) that photo is often taken before the colour is drawn, so
// pins came out blank or uncoloured.

const PIN_IMAGES: Record<SeverityLevel, number> = {
  low: require('../../assets/images/pins/pin-low.png'),
  moderate: require('../../assets/images/pins/pin-moderate.png'),
  high: require('../../assets/images/pins/pin-high.png'),
  critical: require('../../assets/images/pins/pin-critical.png'),
};
// The pin's tip (the exact spot) is 46 of its 48 points down.
// (pin images: assets/images/pins, made by rendering an SVG at 1x/2x/3x)
const PIN_ANCHOR = { x: 0.5, y: 46 / 48 };
// Worse reports are drawn on top of milder ones nearby.
const PIN_Z: Record<SeverityLevel, number> = { low: 1, moderate: 2, high: 3, critical: 4 };

interface SeverityMarkerProps {
  report: WasteReport;
  selected: boolean;
  onSelect: (reportId: string) => void;
}

const SeverityMarker = memo(
  ({ report, selected, onSelect }: SeverityMarkerProps) => (
    <Marker
      coordinate={{ latitude: report.location.latitude, longitude: report.location.longitude }}
      image={PIN_IMAGES[report.severity] ?? PIN_IMAGES.low}
      anchor={PIN_ANCHOR}
      zIndex={selected ? 50 : PIN_Z[report.severity] ?? 1}
      tracksViewChanges={false}
      onPress={() => onSelect(report.id)}
      accessibilityLabel={`${SEVERITY_LABELS[report.severity] ?? 'Report'} report`}
    />
  ),
  (prev, next) =>
    prev.selected === next.selected &&
    prev.report.severity === next.report.severity &&
    prev.report.location.latitude === next.report.location.latitude &&
    prev.report.location.longitude === next.report.location.longitude,
);

// ─── The tapped report's analysis (a card over the map) ───────────────────────

const STATUS_LABELS: Record<string, string> = {
  pending: 'Waiting for review', verified: 'Verified', assigned: 'Crew assigned', in_progress: 'Cleanup in progress',
  completed: 'Cleaned up', rejected: 'Rejected', cancelled: 'Cancelled',
};

function ReportCard({ report, onOpen, onClose, styles }: {
  report: WasteReport;
  onOpen: (reportId: string) => void;
  onClose: () => void;
  styles: ReturnType<typeof createStyles>;
}) {
  const sev = report.severity;
  const color = getMarkerColor(sev);
  const ai = report.aiAnalysis;
  const hasAi = !!ai && ai.analysisSource !== 'unavailable';
  const waste = ai?.wasteTypes?.[0];
  const barangay = report.location.barangay ?? report.barangay ?? 'Unknown';
  const facts: Array<[string, string]> = hasAi ? [
    ['AI confidence', `${Number(ai.confidence ?? 0).toFixed(0)}%`],
    ['Est. volume', formatVolume(ai.estimatedVolume)],
    ['Hazardous', ai.hazardousDetected ? 'Yes ⚠️' : 'No'],
    ...(ai.cleanupPriority ? [['Priority', ai.cleanupPriority] as [string, string]] : []),
  ] : [];

  return (
    <View style={styles.sheet}>
      <View style={styles.sheetTop}>
        {report.photoURL ? (
          <Image source={{ uri: report.thumbnailURL || report.photoURL }} style={styles.sheetPhoto} resizeMode="cover" />
        ) : (
          <View style={[styles.sheetPhoto, styles.sheetNoPhoto]}><Text style={{ fontSize: 22 }}>🗑️</Text></View>
        )}
        <View style={{ flex: 1, minWidth: 0 }}>
          <View style={[styles.sheetBadge, { backgroundColor: SEVERITY_BG[sev] }]}>
            <Text style={[styles.sheetBadgeText, { color }]}>
              {SEVERITY_EMOJIS[sev]} {SEVERITY_LABELS[sev]}
              {hasAi && Number.isFinite(ai.severityScore) ? ` · ${Math.round(ai.severityScore)}/100` : ''}
            </Text>
          </View>
          <Text style={styles.sheetTitle} numberOfLines={1}>
            {hasAi ? (waste ? `${waste.label}${waste.percentage ? ` · ${Math.round(waste.percentage)}%` : ''}` : 'No waste detected') : 'Waste report'}
          </Text>
          <Text style={styles.sheetSub} numberOfLines={1}>📍 {barangay}</Text>
          <Text style={styles.sheetSub} numberOfLines={1}>
            {STATUS_LABELS[report.status] ?? report.status} · {report.reportNumber ?? report.id.slice(0, 12)}
          </Text>
        </View>
        <TouchableOpacity onPress={onClose} style={styles.sheetClose} accessibilityRole="button" accessibilityLabel="Close">
          <Text style={styles.sheetCloseText}>✕</Text>
        </TouchableOpacity>
      </View>

      {hasAi ? (
        <View style={styles.factRow}>
          {facts.map(([k, v]) => (
            <View key={k} style={styles.fact}>
              <Text style={styles.factValue} numberOfLines={1}>{v}</Text>
              <Text style={styles.factLabel} numberOfLines={1}>{k}</Text>
            </View>
          ))}
        </View>
      ) : (
        <Text style={styles.sheetNote}>AI analysis isn't available for this report yet. An official will review the photo.</Text>
      )}
      {hasAi && !!ai.environmentalImpact && (
        <Text style={styles.sheetNote} numberOfLines={2}>{ai.environmentalImpact}</Text>
      )}

      <TouchableOpacity style={styles.sheetBtn} onPress={() => onOpen(report.id)} accessibilityRole="button">
        <Text style={styles.sheetBtnText}>View full report →</Text>
      </TouchableOpacity>
    </View>
  );
}

// ─── Stats bar (4 severity counts, tappable to filter) ───────────────────────

interface StatsBarProps {
  counts: SeverityCount;
  activeFilter: string;
  onFilter: (sev: string) => void;
  styles: ReturnType<typeof createStyles>;
}

const StatsBar = memo(({ counts, activeFilter, onFilter, styles }: StatsBarProps) => (
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

const MapLegend = memo(({ styles }: { styles: ReturnType<typeof createStyles> }) => (
  <View style={styles.legend}>
    <Text style={styles.legendTitle}>Legend</Text>
    {ORDERED_SEVERITIES.map((sev) => (
      <View key={sev} style={styles.legendItem}>
        <Text style={styles.legendEmoji}>{SEVERITY_EMOJIS[sev]}</Text>
        <Text style={styles.legendText}>{SEVERITY_LABELS[sev]}</Text>
      </View>
    ))}
    <View style={styles.legendItem}>
      <View style={[styles.legendRing, { borderColor: HOTSPOT_COLOR }]} />
      <Text style={styles.legendText}>Hotspot (3+ in 100 m)</Text>
    </View>
  </View>
));

// ─── Live trucks (officials and Admin) ────────────────────────────────────────

/** A cleanup truck on its way, driving along the road between GPS updates and facing where it goes. */
function LiveTruckMarker({ trip, onPress }: { trip: CrewTracking; onPress: (taskId: string) => void }) {
  const pos = useTrackedTruck(trip);
  // Let the truck drawing render once, then freeze it (Android snapshots marker views).
  const [drawing, setDrawing] = useState(true);
  useEffect(() => {
    const id = setTimeout(() => setDrawing(false), 800);
    return () => clearTimeout(id);
  }, []);
  if (!pos) return null;
  return (
    <Marker
      coordinate={pos}
      anchor={{ x: 0.5, y: 0.5 }}
      flat
      rotation={pos.heading}
      tracksViewChanges={drawing}
      zIndex={20}
      title={trip.crewName}
      description={`On the way · arriving in ${formatEta(trip.etaSeconds)}`}
      onCalloutPress={() => onPress(trip.taskId)}
    >
      <TruckIcon size={40} />
    </Marker>
  );
}

// ─── Screen ───────────────────────────────────────────────────────────────────

export default function MapScreen({ navigation }: Props) {
  const { colors, isDark } = useTheme();
  const styles = useMemo(() => createStyles(colors), [colors]);
  const { reports, loading, counts, total } = useMapReports();
  const [filter, setFilter] = useState('All');
  const viewer = useAppSelector((s) => s.auth.user);
  const [trips, setTrips] = useState<CrewTracking[]>([]);
  const mapRef = React.useRef<MapView>(null);

  // Officials and the Admin see cleanup trucks on the road, like a dispatcher.
  useEffect(() => {
    if (!viewer) return;
    return subscribeActiveTrips({ role: viewer.role, barangayId: viewer.barangayId }, setTrips);
  }, [viewer?.role, viewer?.barangayId]); // eslint-disable-line react-hooks/exhaustive-deps

  const openTask = useCallback((taskId: string) => navigation.navigate('CleanupTaskDetail', { taskId } as never), [navigation]);

  // Google Maps / Apple Maps, or OpenFreeMap on Huawei phones and when the native map can't start.
  const { engine, onReady: onMapReadyEngine, onError: onMapError } = useMapEngine();
  const useFallbackMap = engine === 'osm';

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

  // The tapped pin's report, shown in a card over the map (looked up live, so it updates).
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const selected = useMemo(() => filtered.find((r) => r.id === selectedId) ?? null, [filtered, selectedId]);
  const handleSelect = useCallback((reportId: string) => setSelectedId(reportId), []);

  // Trucks on the OpenFreeMap map (Huawei phones and the fallback); tapping one opens its task.
  // Each one drives along the road between updates, like on Google/Apple maps.
  const truckMemos = React.useRef(new Map<string, MotionMemo>());
  const osmTrucks = useMemo(
    () => trips.map((t) => {
      const { target, memo } = nextMotion(truckMemos.current.get(t.taskId), t);
      truckMemos.current.set(t.taskId, memo);
      return { id: t.taskId, ...target, label: `${t.crewName} · arriving in ${formatEta(t.etaSeconds)}` };
    }),
    [trips],
  );

  // Dumping hotspots, live: 3+ open reports within 100 m in the last 90 days (reportProximity.ts).
  const hotspots = useMemo(() => findHotspots(reports.map((r) => ({
    id: r.id, latitude: r.location.latitude, longitude: r.location.longitude, status: r.status,
    createdAt: new Date(r.createdAt), approximate: !!r.location.address?.includes('(approximate'),
  }))), [reports]);
  const osmAreas: OsmArea[] = useMemo(
    () => hotspots.map((h, i) => ({ id: `hs${i}`, latitude: h.latitude, longitude: h.longitude, radiusM: HOTSPOT_RADIUS_M, color: HOTSPOT_COLOR })),
    [hotspots],
  );

  const osmMarkers: OsmMarker[] = useMemo(
    () =>
      filtered.map((report) => ({
        id: report.id,
        latitude: report.location.latitude,
        longitude: report.location.longitude,
        color: getMarkerColor(report.severity),
        glow: report.severity === 'critical' || report.severity === 'high',
        // No popup: tapping the pin opens the same report card as on Google/Apple maps.
      })),
    [filtered],
  );

  return (
    <SafeAreaView style={styles.container}>
      {/* ── Header ── */}
      <View style={styles.header}>
        <TouchableOpacity style={styles.backBtn} onPress={() => navigation.goBack()}>
          <BackIcon />
        </TouchableOpacity>
        <View style={{ flex: 1, alignItems: 'center' }}>
          <Text style={styles.headerTitle}>Waste Map</Text>
          {/* Everyone only sees their own barangay's reports. */}
          <Text style={{ fontSize: 12, color: colors.textMuted }} numberOfLines={1}>
            {viewer?.barangay ? `Brgy. ${viewer.barangay}` : 'No barangay on your account'}
          </Text>
        </View>
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
      <StatsBar counts={counts} activeFilter={filter} onFilter={handleFilter} styles={styles} />

      {/* ── Map ── */}
      <View style={styles.mapContainer}>
        {Platform.OS === 'web' ? (
          <View style={styles.webFallback}>
            <Text style={styles.webFallbackTitle}>Map isn't available on web</Text>
            <Text style={styles.webFallbackText}>
              Open CleanStream on iOS or Android (Expo Go or a dev build) to view the live waste map.
            </Text>
          </View>
        ) : useFallbackMap ? (
          <OsmMapView
            region={CEBU}
            markers={osmMarkers}
            trucks={osmTrucks}
            areas={osmAreas}
            onMarkerPress={handleSelect}
            onTruckPress={openTask}
            style={styles.map}
          />
        ) : (
          <MapErrorBoundary onError={onMapError}>
            <MapView
              ref={mapRef}
              // Google Maps with CleanStream's style on Android, matching Apple Maps on iOS.
              {...nativeMapLook(isDark)}
              style={styles.map}
              initialRegion={CEBU}
              showsUserLocation
              showsMyLocationButton={false}
              moveOnMarkerPress={false}
              onMapReady={onMapReadyEngine}
              // Tapping the map (not a pin) closes the report card. iOS also reports pin taps here.
              onPress={(e) => { if (e.nativeEvent.action !== 'marker-press') setSelectedId(null); }}
            >
              {filtered.map((report) => (
                <SeverityMarker
                  key={report.id}
                  report={report}
                  selected={report.id === selectedId}
                  onSelect={handleSelect}
                />
              ))}
              {hotspots.map((h, i) => (
                <Circle
                  key={`hs${i}-${h.count}`}
                  center={{ latitude: h.latitude, longitude: h.longitude }}
                  radius={HOTSPOT_RADIUS_M}
                  strokeColor={HOTSPOT_COLOR}
                  strokeWidth={2}
                  fillColor="rgba(220,38,38,0.16)"
                  zIndex={0}
                />
              ))}
              {trips.map((trip) => <LiveTruckMarker key={trip.taskId} trip={trip} onPress={openTask} />)}
            </MapView>
          </MapErrorBoundary>
        )}

        {/* Loading overlay */}
        {Platform.OS !== 'web' && loading && (
          <View style={styles.loadingOverlay}>
            <ActivityIndicator size="large" color={colors.teal} />
            <Text style={styles.loadingText}>Loading map data…</Text>
          </View>
        )}

        {/* Legend, or the tapped report's analysis in its place */}
        {selected ? (
          <ReportCard report={selected} onOpen={handleNavigate} onClose={() => setSelectedId(null)} styles={styles} />
        ) : (
          <MapLegend styles={styles} />
        )}

        {/* Live badge, with trucks on the road for officials and the Admin */}
        <View style={styles.liveBadge}>
          <View style={styles.liveDot} />
          <Text style={styles.liveText}>
            {trips.length > 0 ? `Live · 🚚 ${trips.length} on the way` : 'Live'}
          </Text>
        </View>

        {/* Back to Cebu City (Google/Apple maps; the OpenStreetMap view has its own zoom buttons) */}
        {engine === 'native' && Platform.OS !== 'web' && !selected && (
          <TouchableOpacity
            style={styles.recenterBtn}
            onPress={() => mapRef.current?.animateToRegion(CEBU, 600)}
            accessibilityRole="button"
            accessibilityLabel="Show all of Cebu City"
          >
            <Text style={styles.recenterIcon}>⌖</Text>
          </TouchableOpacity>
        )}
      </View>

      {/* ── Bottom summary bar ── */}
      <View style={styles.bottomBar}>
        <Text style={styles.bottomTotal}>
          {filtered.length} of {total} report{total !== 1 ? 's' : ''} shown
          {hotspots.length > 0 ? ` · ${hotspots.length} hotspot${hotspots.length === 1 ? '' : 's'}` : ''}
        </Text>
        <Text style={styles.bottomSub}>Live · cleaned-up sites drop off</Text>
      </View>
    </SafeAreaView>
  );
}

// ─── Styles ───────────────────────────────────────────────────────────────────

const createStyles = (Colors: ThemeColors) => StyleSheet.create({
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
  webFallback: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 32,
    backgroundColor: Colors.grayBg,
    gap: 8,
  },
  webFallbackTitle: { fontSize: 15, fontWeight: '700', color: Colors.textPrimary, textAlign: 'center' },
  webFallbackText:  { fontSize: 12, color: Colors.textMuted, textAlign: 'center', lineHeight: 18 },

  // Report card (tapped pin)
  sheet: {
    position: 'absolute', left: 10, right: 10, bottom: 12,
    backgroundColor: Colors.surface, borderRadius: 18, padding: 12, gap: 10,
    shadowColor: '#000', shadowOffset: { width: 0, height: 4 }, shadowOpacity: 0.2, shadowRadius: 12, elevation: 8,
  },
  sheetTop: { flexDirection: 'row', gap: 12, alignItems: 'flex-start' },
  sheetPhoto: { width: 76, height: 76, borderRadius: 12, backgroundColor: Colors.grayBg },
  sheetNoPhoto: { alignItems: 'center', justifyContent: 'center' },
  sheetBadge: { alignSelf: 'flex-start', borderRadius: 8, paddingHorizontal: 8, paddingVertical: 3, marginBottom: 4 },
  sheetBadgeText: { fontSize: 11, fontWeight: '800' },
  sheetTitle: { fontSize: 15, fontWeight: '700', color: Colors.textPrimary },
  sheetSub: { fontSize: 11, color: Colors.textMuted, marginTop: 2 },
  sheetClose: { width: 30, height: 30, borderRadius: 15, backgroundColor: Colors.grayBg, alignItems: 'center', justifyContent: 'center' },
  sheetCloseText: { fontSize: 13, fontWeight: '800', color: Colors.textPrimary },
  factRow: { flexDirection: 'row', gap: 6 },
  fact: { flex: 1, backgroundColor: Colors.grayBg, borderRadius: 10, paddingVertical: 7, paddingHorizontal: 6, alignItems: 'center' },
  factValue: { fontSize: 13, fontWeight: '800', color: Colors.textPrimary },
  factLabel: { fontSize: 9, color: Colors.textMuted, marginTop: 1, textTransform: 'uppercase', letterSpacing: 0.3 },
  sheetNote: { fontSize: 11, color: Colors.textSecondary, lineHeight: 16 },
  sheetBtn: { backgroundColor: Colors.teal, borderRadius: 12, paddingVertical: 11, alignItems: 'center' },
  sheetBtnText: { color: '#fff', fontWeight: '700', fontSize: 13 },

  // Legend
  legend: {
    position: 'absolute', bottom: 16, left: 12,
    backgroundColor: 'rgba(255,255,255,0.96)',
    borderRadius: 16, padding: 12,
    gap: 5,
    shadowColor: '#000', shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.12, shadowRadius: 8, elevation: 3,
  },
  // Legend's background is a fixed light overlay regardless of theme, so its
  // text stays a fixed dark color too (Colors.textMuted/textPrimary would go
  // near-white in dark mode and disappear against it).
  legendTitle: { fontSize: 9, fontWeight: '700', color: '#6B6A64', textTransform: 'uppercase', letterSpacing: 0.5, marginBottom: 2 },
  legendItem:  { flexDirection: 'row', alignItems: 'center', gap: 5 },
  legendEmoji: { fontSize: 11 },
  legendRing:  { width: 12, height: 12, borderRadius: 6, borderWidth: 2, backgroundColor: 'rgba(220,38,38,0.16)' },
  legendText:  { fontSize: 10, color: '#1A1A18', fontWeight: '500' },

  // Live badge
  liveBadge: {
    position: 'absolute', top: 12, right: 12,
    flexDirection: 'row', alignItems: 'center', gap: 5,
    backgroundColor: 'rgba(255,255,255,0.95)',
    borderRadius: 20, paddingHorizontal: 11, paddingVertical: 6,
    shadowColor: '#000', shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.1, shadowRadius: 6, elevation: 3,
  },
  liveDot:  { width: 7, height: 7, borderRadius: 3.5, backgroundColor: '#22C55E' },
  recenterBtn: {
    position: 'absolute', right: 12, bottom: 16, width: 46, height: 46, borderRadius: 23,
    backgroundColor: 'rgba(255,255,255,0.97)', alignItems: 'center', justifyContent: 'center',
    shadowColor: '#000', shadowOffset: { width: 0, height: 3 }, shadowOpacity: 0.18, shadowRadius: 8, elevation: 5,
  },
  recenterIcon: { fontSize: 24, color: '#0F6E56', marginTop: -2 },
  // Same fixed-light-overlay reasoning as the legend above.
  liveText: { fontSize: 11, fontWeight: '600', color: '#1A1A18' },

  // Loading overlay
  loadingOverlay: {
    ...StyleSheet.absoluteFill,
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
