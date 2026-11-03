import React, { useEffect, useMemo, useRef, useState } from 'react';
import { Platform, StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import MapView, { Marker, Polyline } from 'react-native-maps';
import { useTheme } from '../../hooks/useTheme';
import { useT } from '../../hooks/useT';
import { useGlide } from '../../hooks/useGlide';
import { useMapEngine } from '../../hooks/useMapFallback';
import { ThemeColors } from '../../constants/theme';
import { CrewTracking } from '../../types';
import { formatDistance, formatEta, locateOnRoute } from '../../services/routeMath';
import { secondsSinceUpdate } from '../../services/crewTrackingService';
import { MapErrorBoundary } from '../common/MapErrorBoundary';
import { MAP_COLORS, nativeMapLook } from './mapTheme';
import { TeardropPin, TruckIcon } from './MapIcons';
import { OsmTrackingView, TrackingFrame } from './OsmTrackingView';
import { NavigationBanner } from './NavigationBanner';

// No update for this long means the crew's phone lost signal or closed the app.
const STALE_S = 120;

/**
 * A live "your crew is on the way" card, like a delivery app: arrival time, distance,
 * and a map with the route and a truck that glides along it as GPS updates arrive.
 * Works on Google Maps, Apple Maps, and OpenStreetMap (phones without Google services).
 * `driver`: the crew leader's own phone, which also gets turn-by-turn directions and a map
 * that follows the truck closely, turned the way it drives.
 */
export function CrewTrackingCard({ tracking, mapHeight = 260, driver = false }: {
  tracking: CrewTracking | null; mapHeight?: number; driver?: boolean;
}) {
  const { colors, isDark } = useTheme();
  const { t } = useT();
  const styles = useMemo(() => createStyles(colors), [colors]);
  const [, tick] = useState(0);
  useEffect(() => {
    const id = setInterval(() => tick((n) => n + 1), 5000);
    return () => clearInterval(id);
  }, []);

  if (!tracking || tracking.status === 'ended') return null;

  const since = secondsSinceUpdate(tracking);
  const stale = tracking.status === 'en_route' && since > STALE_S;

  if (tracking.status === 'arrived') {
    return (
      <View style={[styles.card, styles.arrived]}>
        <TruckIcon size={36} />
        <View style={{ flex: 1 }}>
          <Text style={[styles.title, { color: colors.tealDark }]}>{t('track.arrived')}</Text>
          <Text style={[styles.sub, { color: colors.tealDark }]}>{tracking.crewName}</Text>
        </View>
      </View>
    );
  }

  return (
    <View style={styles.card}>
      {driver && <NavigationBanner taskId={tracking.taskId} destination={tracking.destination} />}
      <View style={styles.head}>
        <View style={styles.etaBox}>
          <Text style={styles.etaLabel}>{t('track.arrivingIn')}</Text>
          <Text style={styles.eta}>{formatEta(tracking.etaSeconds)}</Text>
        </View>
        <View style={{ flex: 1 }}>
          <Text style={styles.title}>{t('track.onTheWay')}</Text>
          <Text style={styles.sub}>
            {tracking.crewName} · {t('track.away', { distance: formatDistance(tracking.remainingM) })}
          </Text>
          <Text style={[styles.updated, stale && { color: colors.redText }]}>
            {stale ? t('track.stale', { time: formatEta(since) }) : since < 10 ? t('track.live') : t('track.updated', { s: since })}
          </Text>
        </View>
      </View>
      <TrackingMap tracking={tracking} isDark={isDark} height={driver ? Math.max(mapHeight, 340) : mapHeight} driver={driver} />
      {tracking.routeSource === 'straight' && <Text style={styles.note}>{t('track.straightNote')}</Text>}
    </View>
  );
}

function TrackingMap({ tracking, isDark, height, driver }: { tracking: CrewTracking; isDark: boolean; height: number; driver: boolean }) {
  const { colors } = useTheme();
  const { t } = useT();
  const styles = useMemo(() => createStyles(colors), [colors]);
  const map = useRef<MapView>(null);
  const { engine, onReady, onError } = useMapEngine();
  const fallback = engine !== 'native';
  const [follow, setFollow] = useState(true);
  // Marker views are snapshotted on Android; let them draw once, then freeze for speed.
  const [drawing, setDrawing] = useState(true);
  useEffect(() => {
    const id = setTimeout(() => setDrawing(false), 800);
    return () => clearTimeout(id);
  }, []);

  const truckTarget = useMemo(
    () => ({ latitude: tracking.latitude, longitude: tracking.longitude, heading: tracking.heading }),
    [tracking.latitude, tracking.longitude, tracking.heading],
  );
  const truck = useGlide(truckTarget);

  // Only the part of the route still ahead, like a delivery app.
  const ahead = useMemo(() => {
    const at = locateOnRoute(tracking.route, truckTarget);
    return [at.point, ...tracking.route.slice(at.segment + 1)];
  }, [tracking.route, truckTarget]);

  // Keep the truck and the site in view while following. The driver instead gets a close,
  // tilted view that turns with the truck, like a navigation app.
  useEffect(() => {
    if (!follow || fallback || !map.current) return;
    if (driver) {
      map.current.animateCamera(
        { center: truckTarget, heading: truckTarget.heading, pitch: 45, zoom: 17 },
        { duration: 800 },
      );
      return;
    }
    map.current.fitToCoordinates([truckTarget, tracking.destination], {
      edgePadding: { top: 60, right: 60, bottom: 60, left: 60 },
      animated: true,
    });
  }, [truckTarget, tracking.destination, follow, fallback, driver]);

  const frame: TrackingFrame = useMemo(() => ({
    truck: truckTarget, ahead, destination: tracking.destination, straight: tracking.routeSource === 'straight', follow, driver,
  }), [truckTarget, ahead, tracking.destination, tracking.routeSource, follow, driver]);

  return (
    <View style={[styles.map, { height }]}>
      {Platform.OS === 'web' ? null : engine === 'osm' ? (
        <OsmTrackingView frame={frame} dark={isDark} onUserPan={() => setFollow(false)} style={StyleSheet.absoluteFill} />
      ) : (
        <MapErrorBoundary onError={onError}>
          <MapView
            ref={map}
            style={StyleSheet.absoluteFill}
            {...nativeMapLook(isDark)}
            initialRegion={{
              latitude: (tracking.latitude + tracking.destination.latitude) / 2,
              longitude: (tracking.longitude + tracking.destination.longitude) / 2,
              latitudeDelta: Math.max(0.01, Math.abs(tracking.latitude - tracking.destination.latitude) * 1.8),
              longitudeDelta: Math.max(0.01, Math.abs(tracking.longitude - tracking.destination.longitude) * 1.8),
            }}
            onMapReady={onReady}
            onPanDrag={() => setFollow(false)}
            rotateEnabled={false}
            pitchEnabled={false}
          >
            <Polyline coordinates={ahead} strokeColor={MAP_COLORS.routeCasing} strokeWidth={9} />
            <Polyline
              coordinates={ahead}
              strokeColor={MAP_COLORS.route}
              strokeWidth={5}
              lineDashPattern={tracking.routeSource === 'straight' ? [12, 10] : undefined}
            />
            <Marker coordinate={tracking.destination} anchor={{ x: 0.5, y: 1 }} tracksViewChanges={drawing}>
              <TeardropPin color={MAP_COLORS.destination} glow icon={<Text style={{ fontSize: 10 }}>🗑️</Text>} />
            </Marker>
            {truck && (
              <Marker
                coordinate={truck}
                anchor={{ x: 0.5, y: 0.5 }}
                flat
                rotation={truck.heading}
                tracksViewChanges={drawing}
                zIndex={10}
              >
                <TruckIcon />
              </Marker>
            )}
          </MapView>
        </MapErrorBoundary>
      )}
      {!follow && (
        <TouchableOpacity style={styles.recenter} onPress={() => setFollow(true)} accessibilityRole="button">
          <Text style={styles.recenterText}>{t('track.recenter')}</Text>
        </TouchableOpacity>
      )}
    </View>
  );
}

const createStyles = (Colors: ThemeColors) => StyleSheet.create({
  card: {
    backgroundColor: Colors.surface, borderRadius: 18, padding: 14, gap: 12,
    borderWidth: StyleSheet.hairlineWidth, borderColor: Colors.border,
    shadowColor: Colors.shadow, shadowOffset: { width: 0, height: 4 }, shadowOpacity: 0.06, shadowRadius: 12, elevation: 2,
  },
  arrived: { flexDirection: 'row', alignItems: 'center', backgroundColor: Colors.tealLight },
  head: { flexDirection: 'row', alignItems: 'center', gap: 12 },
  etaBox: { backgroundColor: Colors.teal, borderRadius: 14, paddingHorizontal: 12, paddingVertical: 8, alignItems: 'center', minWidth: 86 },
  etaLabel: { fontSize: 10, color: 'rgba(255,255,255,0.85)', fontWeight: '600' },
  eta: { fontSize: 17, color: '#fff', fontWeight: '800' },
  title: { fontSize: 15, fontWeight: '700', color: Colors.textPrimary },
  sub: { fontSize: 12, color: Colors.textSecondary, marginTop: 2 },
  updated: { fontSize: 11, color: Colors.textMuted, marginTop: 3 },
  map: { borderRadius: 14, overflow: 'hidden', backgroundColor: Colors.grayBg },
  recenter: {
    position: 'absolute', top: 10, right: 10, backgroundColor: Colors.surface, borderRadius: 20,
    paddingHorizontal: 12, paddingVertical: 7,
    shadowColor: '#000', shadowOffset: { width: 0, height: 2 }, shadowOpacity: 0.2, shadowRadius: 4, elevation: 3,
  },
  recenterText: { fontSize: 12, fontWeight: '700', color: Colors.teal },
  note: { fontSize: 11, color: Colors.textMuted },
});
