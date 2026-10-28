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
import MapView, { Marker, Callout } from 'react-native-maps';
import { useTheme } from '../hooks/useTheme';
import { ThemeColors } from '../constants/theme';
import { CrewTracking, RootStackParamList, WasteReport, SeverityLevel } from '../types';
import { BackIcon } from '../components/common/TabIcons';
import { useMapReports } from '../hooks/useMapReports';
import { MapErrorBoundary } from '../components/common/MapErrorBoundary';
import { useMapEngine } from '../hooks/useMapFallback';
import { PetalPinsMap } from '../components/map/PetalMap';
import { OsmMapView, OsmMarker, escapeHtml } from '../components/common/OsmMapView';
import { nativeMapLook } from '../components/map/mapTheme';
import { TeardropPin, TruckIcon } from '../components/map/MapIcons';
import { subscribeActiveTrips } from '../services/crewTrackingService';
import { formatEta } from '../services/routeMath';
import { useGlide } from '../hooks/useGlide';
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


// Builds the same callout content (photo, severity badge, barangay, waste
// type, confidence, report number) as the native <Callout>, as HTML for the
// Leaflet popup fallback.
function buildPopupHtml(report: WasteReport): string {
  const color     = getMarkerColor(report.severity);
  const bgColor   = SEVERITY_BG[report.severity as SeverityLevel] ?? '#F9F9F9';
  const emoji     = SEVERITY_EMOJIS[report.severity as SeverityLevel] ?? '⚪';
  const sevLabel  = SEVERITY_LABELS[report.severity as SeverityLevel] ?? report.severity;
  const barangay  = escapeHtml(report.location.barangay ?? report.barangay ?? 'Unknown');
  const wasteLabel = escapeHtml(report.aiAnalysis?.wasteTypes?.[0]?.label ?? 'Waste detected');
  const confidence = report.aiAnalysis?.confidence != null
    ? `${Number(report.aiAnalysis.confidence).toFixed(1)}%`
    : '—';
  const reportNum = escapeHtml(report.reportNumber ?? report.id.slice(0, 12));

  const photoHtml = report.photoURL
    ? `<img src="${escapeHtml(report.photoURL)}" />`
    : '';

  return `${photoHtml}
    <div style="display:inline-block;border-radius:6px;padding:3px 7px;background:${bgColor};margin-bottom:6px;">
      <span style="font-size:11px;font-weight:700;color:${color};">${emoji} ${escapeHtml(sevLabel)}</span>
    </div>
    <div style="font-size:12px;font-weight:600;color:#1A1A18;">${barangay}</div>
    <div style="font-size:10px;color:#6B6A64;margin-top:2px;">${wasteLabel}</div>
    <div style="font-size:10px;color:#2E86DE;margin-top:3px;font-weight:600;">AI Confidence: ${confidence}</div>
    <div style="font-size:9px;color:#9A9890;margin-top:2px;">${reportNum}</div>
    <div class="cs-popup-tap" onclick="window.csNavigate('${report.id}')">Tap to view full report →</div>`;
}

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
  styles: ReturnType<typeof createStyles>;
}

const SeverityMarker = memo(
  ({ report, onNavigate, styles }: SeverityMarkerProps) => {
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
        // The pin's tip marks the exact spot.
        anchor={{ x: 0.5, y: 1 }}
        calloutAnchor={{ x: 0.5, y: 0 }}
        // tracksViewChanges=false is critical: prevents continuous native re-renders
        // Set to true only while animating/updating, otherwise performance tanks
        tracksViewChanges={false}
      >
        {/* Teardrop pin -- critical/high severity gets a soft glow halo so the worst
            hotspots visually stand out on the map, not just differ by color. */}
        <TeardropPin color={color} glow={report.severity === 'critical' || report.severity === 'high'} />

        {/* Info callout -- includes the report's photo so tapping a marker
            shows what was actually reported, not just text metadata. */}
        <Callout style={styles.callout} onPress={() => onNavigate(report.id)}>
          {!!report.photoURL && (
            <Image source={{ uri: report.photoURL }} style={styles.calloutImage} resizeMode="cover" />
          )}
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
  </View>
));

// ─── Live trucks (officials and Admin) ────────────────────────────────────────

/** A cleanup truck on its way, gliding between GPS updates and facing where it drives. */
function LiveTruckMarker({ trip, onPress }: { trip: CrewTracking; onPress: (taskId: string) => void }) {
  const target = useMemo(
    () => ({ latitude: trip.latitude, longitude: trip.longitude, heading: trip.heading }),
    [trip.latitude, trip.longitude, trip.heading],
  );
  const pos = useGlide(target);
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

  // Petal Maps on Huawei, Google Maps / Apple Maps elsewhere, OpenStreetMap if neither starts.
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

  // Petal Maps pins and trucks (Huawei). The pin's info window opens the report.
  const petalPins = useMemo(
    () => filtered.map((r) => ({
      id: r.id,
      latitude: r.location.latitude,
      longitude: r.location.longitude,
      severity: r.severity,
      title: `${SEVERITY_LABELS[r.severity as SeverityLevel] ?? r.severity} · ${r.location.barangay ?? r.barangay ?? 'Unknown'}`,
      snippet: `${r.aiAnalysis?.wasteTypes?.[0]?.label ?? 'Waste'} · Tap for details`,
    })),
    [filtered],
  );
  const petalTrucks = useMemo(
    () => trips.map((t) => ({
      id: t.taskId, latitude: t.latitude, longitude: t.longitude, heading: t.heading,
      title: t.crewName, snippet: `On the way · arriving in ${formatEta(t.etaSeconds)}`, onPress: () => openTask(t.taskId),
    })),
    [trips, openTask],
  );

  const osmMarkers: OsmMarker[] = useMemo(
    () =>
      filtered.map((report) => ({
        id: report.id,
        latitude: report.location.latitude,
        longitude: report.location.longitude,
        color: getMarkerColor(report.severity),
        glow: report.severity === 'critical' || report.severity === 'high',
        popupHtml: buildPopupHtml(report),
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
        ) : engine === 'petal' ? (
          <PetalPinsMap
            region={CEBU}
            pins={petalPins}
            trucks={petalTrucks}
            dark={isDark}
            onPinPress={handleNavigate}
            onReady={onMapReadyEngine}
            onError={onMapError}
            style={styles.map}
          />
        ) : useFallbackMap ? (
          <OsmMapView region={CEBU} markers={osmMarkers} onMarkerPress={handleNavigate} style={styles.map} />
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
            >
              {filtered.map((report) => (
                <SeverityMarker
                  key={report.id}
                  report={report}
                  onNavigate={handleNavigate}
                  styles={styles}
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

        {/* Legend */}
        <MapLegend styles={styles} />

        {/* Live badge, with trucks on the road for officials and the Admin */}
        <View style={styles.liveBadge}>
          <View style={styles.liveDot} />
          <Text style={styles.liveText}>
            {trips.length > 0 && engine !== 'osm' ? `Live · 🚚 ${trips.length} on the way` : 'Live'}
          </Text>
        </View>

        {/* Back to Cebu City (Google/Apple maps; the OpenStreetMap view has its own zoom buttons) */}
        {engine === 'native' && Platform.OS !== 'web' && (
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
        </Text>
        <Text style={styles.bottomSub}>AI-classified · Real-time</Text>
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

  // Markers
  markerWrap: { width: 46, height: 46, alignItems: 'center', justifyContent: 'center' },
  pinGlow: {
    position: 'absolute',
    width: 46, height: 46, borderRadius: 23,
    opacity: 0.22,
  },
  pin: {
    width: 26, height: 26, borderRadius: 13,
    alignItems: 'center', justifyContent: 'center',
    borderWidth: 3, borderColor: '#fff',
    shadowColor: '#000', shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.35, shadowRadius: 4, elevation: 5,
  },
  pinInner: { width: 8, height: 8, borderRadius: 4, backgroundColor: 'rgba(255,255,255,0.9)' },

  // Callout
  callout: {
    backgroundColor: Colors.white,
    borderRadius: 12,
    padding: 10,
    minWidth: 180,
    maxWidth: 240,
  },
  calloutImage: {
    width: '100%',
    height: 110,
    borderRadius: 10,
    marginBottom: 7,
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
