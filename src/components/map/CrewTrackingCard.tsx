import React, { useEffect, useMemo, useRef, useState } from 'react';
import {
  Modal, Platform, ScrollView, StyleSheet, Text, TouchableOpacity, useWindowDimensions, View,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import MapView, { Marker, Polyline } from 'react-native-maps';
import { useTheme } from '../../hooks/useTheme';
import { useT } from '../../hooks/useT';
import { useGlide, useTruckTarget } from '../../hooks/useGlide';
import { useMapEngine } from '../../hooks/useMapFallback';
import { useMyPosition } from '../../hooks/useMyPosition';
import { useAppSelector } from '../../store/hooks';
import { ThemeColors } from '../../constants/theme';
import { CrewTracking } from '../../types';
import { formatDistance, formatEta, locateOnRoute } from '../../services/routeMath';
import { secondsSinceUpdate } from '../../services/crewTrackingService';
import { MapErrorBoundary } from '../common/MapErrorBoundary';
import { MAP_COLORS, nativeMapLook } from './mapTheme';
import { TeardropPin, TruckIcon } from './MapIcons';
import { OsmTrackingView, TrackingFrame } from './OsmTrackingView';
import { NavigationBanner } from './NavigationBanner';
import { Tracking3DHandle, Tracking3DView } from './tracking3d/Tracking3DView';
import { CameraState, Frame3D, Page3DCommand } from './tracking3d/tracking3dPage';
import { MovementStatus, movementStatus, speedKmh, tripProgress } from './trackingStatus';

/**
 * A live "your crew is on the way" dashboard, like a ride-hailing app: arrival time,
 * distance, movement status and trip progress, and a 3D map (buildings, the road route, a
 * 3D garbage truck that drives along the road and turns with it) with camera controls:
 * follow the truck, view it from behind / the front / either side, orbit 360°, tilt, zoom,
 * 2D/3D, and full screen. Phones that can't draw the 3D map get the 2D Google / Apple /
 * OpenStreetMap map as before.
 * `driver`: the crew leader's own phone, which also gets turn-by-turn directions and a map
 * that follows the truck from behind, turned the way it drives.
 */
export function CrewTrackingCard({ tracking, mapHeight = 320, driver = false }: {
  tracking: CrewTracking | null; mapHeight?: number; driver?: boolean;
}) {
  const { colors, isDark } = useTheme();
  const { t } = useT();
  const styles = useMemo(() => createStyles(colors), [colors]);
  const [, tick] = useState(0);
  const [expanded, setExpanded] = useState(false);
  useEffect(() => {
    const id = setInterval(() => tick((n) => n + 1), 5000);
    return () => clearInterval(id);
  }, []);

  if (!tracking || tracking.status === 'ended') return null;

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
      <LiveStatusPanel tracking={tracking} />
      {expanded ? (
        <View style={[styles.map, styles.mapPlaceholder, { height: 80 }]}>
          <Text style={styles.note}>{t('track.expand')} …</Text>
        </View>
      ) : (
        <TrackingMap
          tracking={tracking}
          isDark={isDark}
          height={driver ? Math.max(mapHeight, 400) : mapHeight}
          driver={driver}
          onExpand={() => setExpanded(true)}
        />
      )}
      {tracking.routeSource === 'straight' && <Text style={styles.note}>{t('track.straightNote')}</Text>}
      <FullScreenTracking visible={expanded} tracking={tracking} driver={driver} onClose={() => setExpanded(false)} />
    </View>
  );
}

// ─── Live status: ETA, distance, what the truck is doing, progress ───────────

const STATUS_KEYS: Record<MovementStatus, 'track.lost' | 'track.rerouting' | 'track.arriving' | 'track.movingNoSpeed' | 'track.stopped'> = {
  lost: 'track.lost', rerouting: 'track.rerouting', arriving: 'track.arriving', moving: 'track.movingNoSpeed', stopped: 'track.stopped',
};

function useStatus(tracking: CrewTracking) {
  const { colors } = useTheme();
  const { t } = useT();
  const since = secondsSinceUpdate(tracking);
  const status = movementStatus(tracking, since);
  const kmh = speedKmh(tracking);
  const label = status === 'moving' && kmh != null ? t('track.moving', { speed: kmh }) : t(STATUS_KEYS[status]);
  const color = {
    lost: colors.textMuted, rerouting: colors.amber, arriving: colors.teal, moving: colors.teal, stopped: colors.amber,
  }[status];
  return { since, status, label, color, kmh };
}

function LiveStatusPanel({ tracking, floating = false }: { tracking: CrewTracking; floating?: boolean }) {
  const { colors } = useTheme();
  const { t } = useT();
  const styles = useMemo(() => createStyles(colors), [colors]);
  const { since, status, label, color } = useStatus(tracking);
  const pct = tripProgress(tracking);
  const stale = status === 'lost';
  return (
    <View style={[styles.panel, floating && styles.panelFloating]}>
      <View style={styles.head}>
        <View style={styles.etaBox}>
          <Text style={styles.etaLabel}>{t('track.arrivingIn')}</Text>
          <Text style={styles.eta}>{formatEta(tracking.etaSeconds)}</Text>
        </View>
        <View style={{ flex: 1 }}>
          <Text style={styles.title} numberOfLines={1}>{t('track.onTheWay')}</Text>
          <Text style={styles.sub} numberOfLines={1}>
            {tracking.crewName} · {t('track.away', { distance: formatDistance(tracking.remainingM) })}
          </Text>
          <Text style={[styles.updated, stale && { color: colors.redText }]}>
            {stale ? t('track.stale', { time: formatEta(since) }) : since < 10 ? `● ${t('track.live')}` : t('track.updated', { s: since })}
          </Text>
        </View>
      </View>
      <View style={styles.statusRow}>
        <View style={[styles.statusPill, { borderColor: color }]}>
          <View style={[styles.statusDot, { backgroundColor: color }]} />
          <Text style={[styles.statusText, { color }]} numberOfLines={1}>{label}</Text>
        </View>
        <Text style={styles.progressText}>{t('track.progress', { pct })}</Text>
      </View>
      <View style={styles.progressTrack}>
        <View style={[styles.progressFill, { width: `${pct}%` }]} />
      </View>
      <Text style={styles.destination} numberOfLines={1}>
        🗑️ {t('track.destination')}: {t('track.site')} · {tracking.destination.latitude.toFixed(5)}, {tracking.destination.longitude.toFixed(5)}
      </Text>
    </View>
  );
}

// ─── Full screen ─────────────────────────────────────────────────────────────

function FullScreenTracking({ visible, tracking, driver, onClose }: {
  visible: boolean; tracking: CrewTracking; driver: boolean; onClose: () => void;
}) {
  const { colors, isDark } = useTheme();
  const { t } = useT();
  const styles = useMemo(() => createStyles(colors), [colors]);
  const insets = useSafeAreaInsets();
  const { width, height } = useWindowDimensions();
  // Tablets and computers: the panel floats at the side; phones: across the top.
  const wide = width >= 720;
  // The map's own buttons go below the panel on phones (measured, as the panel's height varies).
  const [panelH, setPanelH] = useState(driver ? 250 : 190);
  return (
    <Modal visible={visible} animationType="slide" onRequestClose={onClose} supportedOrientations={['portrait', 'landscape']}>
      <View style={{ flex: 1, backgroundColor: colors.appBg }}>
        {visible && (
          <TrackingMap
            tracking={tracking}
            isDark={isDark}
            height={height}
            driver={driver}
            fullScreen
            topInset={insets.top + (wide ? 12 : panelH + 16)}
            bottomInset={insets.bottom}
          />
        )}
        <View
          style={[styles.fsOverlay, { top: insets.top + 8 }, wide ? { width: 380, left: 12 } : { left: 10, right: 58 }]}
          pointerEvents="box-none"
          onLayout={(e) => setPanelH(e.nativeEvent.layout.height)}
        >
          {driver && <NavigationBanner taskId={tracking.taskId} destination={tracking.destination} />}
          <LiveStatusPanel tracking={tracking} floating />
        </View>
        <TouchableOpacity
          style={[styles.closeBtn, { top: insets.top + 8 }, { right: wide ? 12 : 10 }]}
          onPress={onClose}
          accessibilityRole="button"
          accessibilityLabel={t('track.close')}
        >
          <Text style={styles.closeText}>✕</Text>
        </TouchableOpacity>
      </View>
    </Modal>
  );
}

// ─── The map: 3D when the phone can draw it, else the 2D map ─────────────────

interface MapProps {
  tracking: CrewTracking; isDark: boolean; height: number; driver: boolean;
  onExpand?: () => void; fullScreen?: boolean; topInset?: number; bottomInset?: number;
}

// Once a phone has shown it can't draw the 3D map, don't try again this session.
let no3D = false;

function TrackingMap(props: MapProps) {
  const [use3d, setUse3d] = useState(!no3D);
  if (use3d) {
    return <TrackingMap3D {...props} onUnavailable={(why) => { console.warn('[Map3D] Using the 2D map:', why); no3D = true; setUse3d(false); }} />;
  }
  return <TrackingMap2D {...props} />;
}

function TrackingMap3D({ tracking, isDark, height, driver, onExpand, fullScreen, topInset = 0, bottomInset = 0, onUnavailable }: MapProps & {
  onUnavailable: (why: string) => void;
}) {
  const { colors } = useTheme();
  const { t } = useT();
  const styles = useMemo(() => createStyles(colors), [colors]);
  const role = useAppSelector((s) => s.auth.user?.role);
  const view = useRef<Tracking3DHandle>(null);
  const [cam, setCam] = useState<CameraState>({
    mode: driver ? 'chase' : 'overview', view: 'behind', threeD: true, orbit: false, bearing: 0, pitch: 50,
  });
  const me = useMyPosition(!driver);
  const { status, kmh } = useStatus(tracking);

  const truckTarget = useMemo(
    () => ({ latitude: tracking.latitude, longitude: tracking.longitude, heading: tracking.heading }),
    [tracking.latitude, tracking.longitude, tracking.heading],
  );
  // Drives along the road between updates, at a steady speed (truckMotion.ts).
  const motion = useTruckTarget(tracking);
  const ahead = useMemo(() => {
    const at = locateOnRoute(tracking.route, truckTarget);
    return [at.point, ...tracking.route.slice(at.segment + 1)];
  }, [tracking.route, truckTarget]);

  const truckLabel = status === 'lost'
    ? `${tracking.crewName} · ${t('track.lost')}`
    : status === 'rerouting'
      ? `${tracking.crewName} · ${t('track.rerouting')}`
      : kmh != null && kmh > 3 ? `${tracking.crewName} · ${kmh} km/h` : tracking.crewName;

  const frame: Frame3D = useMemo(() => ({
    truck: motion ?? { ...truckTarget, via: [], stopped: true },
    ahead,
    destination: tracking.destination,
    straight: tracking.routeSource === 'straight',
    stale: status === 'lost',
    offRoute: status === 'rerouting',
    me,
    labels: { truck: `🚚 ${truckLabel}`, site: t('track.site'), me: role === 'citizen' ? t('track.youReporter') : t('track.you') },
  }), [motion, truckTarget, ahead, tracking.destination, tracking.routeSource, status, me, truckLabel, t, role]);

  const cmd = (c: Page3DCommand) => view.current?.command(c);
  const following = cam.mode === 'chase';
  const tall = height >= 380;

  const VIEWS: Array<{ key: 'behind' | 'front' | 'left' | 'right'; label: string }> = [
    { key: 'behind', label: t('track.behind') },
    { key: 'front', label: t('track.front') },
    { key: 'left', label: t('track.left') },
    { key: 'right', label: t('track.right') },
  ];

  return (
    <View style={[fullScreen ? StyleSheet.absoluteFill : styles.map, !fullScreen && { height }]}>
      <Tracking3DView
        ref={view}
        frame={frame}
        dark={isDark}
        driver={driver}
        onCamera={setCam}
        onUnavailable={onUnavailable}
        style={StyleSheet.absoluteFill}
      />

      {/* Top: Directions (whole route) and full screen */}
      <View style={[styles.topBar, { top: fullScreen ? topInset : 10 }]} pointerEvents="box-none">
        <View style={{ flex: 1 }} />
        <MapPill label={`🧭 ${t('track.directions')}`} onPress={() => cmd({ type: 'route' })} />
        {onExpand && <MapPill label="⤢" accessibilityLabel={t('track.expand')} onPress={onExpand} />}
      </View>

      {/* Right: 2D/3D, compass, zoom, tilt */}
      <View style={[styles.sideBar, { top: (fullScreen ? topInset : 10) + 44 }]} pointerEvents="box-none">
        <RoundBtn
          label={cam.threeD ? '3D' : '2D'}
          active={cam.threeD}
          onPress={() => cmd({ type: 'dim', threeD: !cam.threeD })}
          accessibilityLabel={cam.threeD ? 'Switch to 2D map' : 'Switch to 3D map'}
        />
        <RoundBtn onPress={() => cmd({ type: 'north' })} accessibilityLabel={t('track.north')}>
          <View style={{ transform: [{ rotate: `${-cam.bearing}deg` }], alignItems: 'center' }}>
            <Text style={styles.compassNeedle}>▲</Text>
            <Text style={styles.compassN}>N</Text>
          </View>
        </RoundBtn>
        <View style={styles.btnGroup}>
          <RoundBtn grouped label="+" onPress={() => cmd({ type: 'zoom', by: 1 })} accessibilityLabel="Zoom in" />
          <RoundBtn grouped label="−" onPress={() => cmd({ type: 'zoom', by: -1 })} accessibilityLabel="Zoom out" />
        </View>
        {(tall || fullScreen) && (
          <View style={styles.btnGroup}>
            <RoundBtn grouped label="⤒" onPress={() => cmd({ type: 'tilt', by: 10 })} accessibilityLabel="Tilt the map more" />
            <RoundBtn grouped label="⤓" onPress={() => cmd({ type: 'tilt', by: -10 })} accessibilityLabel="Tilt the map less" />
          </View>
        )}
      </View>

      {/* Bottom: follow the truck and camera angles */}
      <ScrollView
        horizontal
        showsHorizontalScrollIndicator={false}
        style={[styles.camBar, { bottom: (fullScreen ? bottomInset : 0) + 10 }]}
        contentContainerStyle={styles.camBarContent}
        keyboardShouldPersistTaps="handled"
      >
        <MapPill label={`🚚 ${t('track.follow')}`} active={following && cam.view !== 'custom' && !cam.orbit} onPress={() => cmd({ type: 'follow' })} />
        {VIEWS.map((v) => (
          <MapPill
            key={v.key}
            label={v.label}
            active={following && cam.view === v.key && !cam.orbit}
            onPress={() => cmd({ type: 'view', view: v.key })}
          />
        ))}
        <MapPill label={`⟳ ${t('track.orbit')}`} active={cam.orbit} onPress={() => cmd({ type: 'orbit' })} />
        {!driver && <MapPill label={t('track.overview')} active={cam.mode === 'overview'} onPress={() => cmd({ type: 'overview' })} />}
      </ScrollView>
    </View>
  );
}

function MapPill({ label, onPress, active = false, accessibilityLabel }: {
  label: string; onPress: () => void; active?: boolean; accessibilityLabel?: string;
}) {
  const { colors } = useTheme();
  const styles = useMemo(() => createStyles(colors), [colors]);
  return (
    <TouchableOpacity
      style={[styles.pill, active && styles.pillActive]}
      onPress={onPress}
      accessibilityRole="button"
      accessibilityState={{ selected: active }}
      accessibilityLabel={accessibilityLabel ?? label}
      activeOpacity={0.8}
    >
      <Text style={[styles.pillText, active && styles.pillTextActive]}>{label}</Text>
    </TouchableOpacity>
  );
}

function RoundBtn({ label, children, onPress, active = false, grouped = false, accessibilityLabel }: {
  label?: string; children?: React.ReactNode; onPress: () => void; active?: boolean; grouped?: boolean; accessibilityLabel: string;
}) {
  const { colors } = useTheme();
  const styles = useMemo(() => createStyles(colors), [colors]);
  return (
    <TouchableOpacity
      style={[styles.round, grouped && styles.roundGrouped, active && styles.roundActive]}
      onPress={onPress}
      accessibilityRole="button"
      accessibilityLabel={accessibilityLabel}
      activeOpacity={0.8}
    >
      {children ?? <Text style={[styles.roundText, active && { color: '#fff' }]}>{label}</Text>}
    </TouchableOpacity>
  );
}

// ─── 2D map (phones without WebGL): Google / Apple Maps or OpenStreetMap ─────

function TrackingMap2D({ tracking, isDark, height, driver, fullScreen }: MapProps) {
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
  // Moves along the road between updates, at a steady speed (like ride-hailing apps).
  const motion = useTruckTarget(tracking);
  const truck = useGlide(motion);
  // "Directions": show the whole way still to go, truck to site. Bumped on each tap.
  const [fitRoute, setFitRoute] = useState(0);

  // Only the part of the route still ahead, like a delivery app.
  const ahead = useMemo(() => {
    const at = locateOnRoute(tracking.route, truckTarget);
    return [at.point, ...tracking.route.slice(at.segment + 1)];
  }, [tracking.route, truckTarget]);

  // Directions: the whole remaining route in view, flat and north up, until Follow is tapped.
  useEffect(() => {
    if (!fitRoute || fallback || !map.current) return;
    // Undo the driver's tilted, turning view first.
    map.current.animateCamera({ heading: 0, pitch: 0 }, { duration: 0 });
    map.current.fitToCoordinates([truckTarget, ...ahead, tracking.destination], {
      edgePadding: { top: 70, right: 50, bottom: 50, left: 50 },
      animated: true,
    });
  }, [fitRoute]); // eslint-disable-line react-hooks/exhaustive-deps

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
    truck: motion ?? truckTarget, ahead, fitRoute, destination: tracking.destination, straight: tracking.routeSource === 'straight', follow, driver,
  }), [motion, truckTarget, ahead, fitRoute, tracking.destination, tracking.routeSource, follow, driver]);

  return (
    <View style={[fullScreen ? StyleSheet.absoluteFill : styles.map, !fullScreen && { height }]}>
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
      <View style={[styles.topBar, { top: 10 }]} pointerEvents="box-none">
        <View style={{ flex: 1 }} />
        <MapPill label={`🧭 ${t('track.directions')}`} onPress={() => { setFollow(false); setFitRoute((n) => n + 1); }} />
        {!follow && <MapPill label={`🚚 ${t('track.follow')}`} onPress={() => setFollow(true)} />}
      </View>
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
  panel: { gap: 8 },
  panelFloating: {
    backgroundColor: Colors.surface, borderRadius: 16, padding: 12, marginTop: 8,
    shadowColor: '#000', shadowOffset: { width: 0, height: 4 }, shadowOpacity: 0.18, shadowRadius: 12, elevation: 6,
  },
  head: { flexDirection: 'row', alignItems: 'center', gap: 12 },
  etaBox: { backgroundColor: Colors.teal, borderRadius: 14, paddingHorizontal: 12, paddingVertical: 8, alignItems: 'center', minWidth: 86 },
  etaLabel: { fontSize: 10, color: 'rgba(255,255,255,0.85)', fontWeight: '600' },
  eta: { fontSize: 17, color: '#fff', fontWeight: '800' },
  title: { fontSize: 15, fontWeight: '700', color: Colors.textPrimary },
  sub: { fontSize: 12, color: Colors.textSecondary, marginTop: 2 },
  updated: { fontSize: 11, color: Colors.textMuted, marginTop: 3 },
  statusRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 8 },
  statusPill: {
    flexDirection: 'row', alignItems: 'center', gap: 6, borderWidth: 1, borderRadius: 14,
    paddingHorizontal: 10, paddingVertical: 4, flexShrink: 1,
  },
  statusDot: { width: 8, height: 8, borderRadius: 4 },
  statusText: { fontSize: 12, fontWeight: '700', flexShrink: 1 },
  progressText: { fontSize: 11, color: Colors.textMuted, fontWeight: '600' },
  progressTrack: { height: 5, borderRadius: 3, backgroundColor: Colors.grayBg, overflow: 'hidden' },
  progressFill: { height: 5, borderRadius: 3, backgroundColor: Colors.teal },
  destination: { fontSize: 11, color: Colors.textSecondary },
  map: { borderRadius: 14, overflow: 'hidden', backgroundColor: Colors.grayBg },
  mapPlaceholder: { alignItems: 'center', justifyContent: 'center' },
  topBar: { position: 'absolute', left: 10, right: 10, flexDirection: 'row', alignItems: 'center', gap: 8 },
  sideBar: { position: 'absolute', right: 10, gap: 8, alignItems: 'flex-end' },
  camBar: { position: 'absolute', left: 0, right: 0, flexGrow: 0 },
  camBarContent: { paddingHorizontal: 10, gap: 6, alignItems: 'center' },
  pill: {
    backgroundColor: Colors.surface, borderRadius: 18, paddingHorizontal: 12, paddingVertical: 7, minHeight: 32, justifyContent: 'center',
    shadowColor: '#000', shadowOffset: { width: 0, height: 2 }, shadowOpacity: 0.2, shadowRadius: 4, elevation: 3,
  },
  pillActive: { backgroundColor: Colors.teal },
  pillText: { fontSize: 12, fontWeight: '700', color: Colors.teal },
  pillTextActive: { color: '#fff' },
  round: {
    width: 36, height: 36, borderRadius: 18, backgroundColor: Colors.surface, alignItems: 'center', justifyContent: 'center',
    shadowColor: '#000', shadowOffset: { width: 0, height: 2 }, shadowOpacity: 0.2, shadowRadius: 4, elevation: 3,
  },
  roundGrouped: { borderRadius: 0, shadowOpacity: 0, elevation: 0, backgroundColor: 'transparent' },
  roundActive: { backgroundColor: Colors.teal },
  roundText: { fontSize: 14, fontWeight: '800', color: Colors.textPrimary },
  btnGroup: {
    backgroundColor: Colors.surface, borderRadius: 18, overflow: 'hidden',
    shadowColor: '#000', shadowOffset: { width: 0, height: 2 }, shadowOpacity: 0.2, shadowRadius: 4, elevation: 3,
  },
  compassNeedle: { fontSize: 10, color: '#EF4444', lineHeight: 11 },
  compassN: { fontSize: 10, fontWeight: '800', color: Colors.textPrimary, lineHeight: 11 },
  note: { fontSize: 11, color: Colors.textMuted },
  fsOverlay: { position: 'absolute', gap: 0 },
  closeBtn: {
    position: 'absolute', width: 40, height: 40, borderRadius: 20, backgroundColor: Colors.surface,
    alignItems: 'center', justifyContent: 'center',
    shadowColor: '#000', shadowOffset: { width: 0, height: 2 }, shadowOpacity: 0.25, shadowRadius: 5, elevation: 6,
  },
  closeText: { fontSize: 16, fontWeight: '800', color: Colors.textPrimary },
});

