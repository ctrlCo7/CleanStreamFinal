/**
 * Petal Maps (HUAWEI Map Kit) for Huawei phones, which have no Google Play Services and so
 * can't run Google Maps. Same features as the Google/Apple maps: severity pins, the live
 * route and a gliding, rotating cleanup truck.
 *
 * The native module is loaded lazily so iPhones, Expo Go and builds without it never crash
 * on import; callers fall back to OpenStreetMap when it is missing or doesn't start.
 *
 * Setup (see docs/huawei-petal-maps.md): an API key from AppGallery Connect in app.json
 * (expo.extra.huaweiMapApiKey), or agconnect-services.json in the project root.
 * Marker icons are PNGs in assets/map-icons/ (scripts/generate-map-icons.mjs), copied
 * into the Android app by plugins/withHuaweiMaps.js.
 */
import React, { useEffect, useMemo, useRef, useState } from 'react';
import { Platform, StyleProp, UIManager, ViewStyle } from 'react-native';
import Constants from 'expo-constants';
import type HMSMapType from '@hmscore/react-native-hms-map';
import type { HMSMarker as HMSMarkerType, HMSPolyline as HMSPolylineType } from '@hmscore/react-native-hms-map';
import { SeverityLevel } from '../../types';
import { useGlide } from '../../hooks/useGlide';
import { MAP_COLORS } from './mapTheme';
import { argb } from './argb';

type PetalModule = {
  default: typeof HMSMapType;
  HMSMarker: typeof HMSMarkerType;
  HMSPolyline: typeof HMSPolylineType;
};

let petal: PetalModule | null | undefined;

/** The Map Kit module, or null when it isn't in this build (iOS, Expo Go, web). */
export function getPetal(): PetalModule | null {
  if (petal !== undefined) return petal;
  petal = null;
  if (Platform.OS !== 'android') return petal;
  // The JavaScript side always bundles, but the native map view only exists in builds made
  // with the Map Kit plugin. Expo Go, for one, doesn't have it, and drawing it there crashes.
  if (!UIManager.hasViewManagerConfig?.('HMSMapView')) return petal;
  try {
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const mod = require('@hmscore/react-native-hms-map');
    if (mod?.default && mod.HMSMarker) petal = mod as PetalModule;
  } catch (e) {
    console.warn('[Petal] Map Kit not available in this build:', e);
  }
  return petal;
}

type PetalExtra = { huaweiMapApiKey?: string; huaweiAgconnect?: boolean };
const petalExtra = () => (Constants.expoConfig?.extra ?? {}) as PetalExtra;

/**
 * Petal Maps draws nothing (and may still report ready) without credentials, so only use it
 * when an API key is in app.json or agconnect-services.json was built into the app.
 */
export const hasPetalCredentials = (): boolean => !!petalExtra().huaweiMapApiKey?.trim() || petalExtra().huaweiAgconnect === true;

let initPromise: Promise<void> | null = null;

/** Starts Map Kit once with the API key (Asia-Pacific data centre, which serves the Philippines). */
export function initPetal(): Promise<void> {
  if (initPromise) return initPromise;
  const mod = getPetal();
  const apiKey = petalExtra().huaweiMapApiKey?.trim() ?? '';
  initPromise = !mod
    ? Promise.reject(new Error('Map Kit not available'))
    // Without a key here, Map Kit authenticates with agconnect-services.json instead.
    : apiKey ? mod.default.module.initializer(apiKey, 'SG') : Promise.resolve();
  initPromise.catch(() => { initPromise = null; });
  return initPromise;
}

export { argb } from './argb';

const PIN_ASSET: Record<SeverityLevel, string> = {
  critical: 'map-icons/pin-critical.png',
  high: 'map-icons/pin-high.png',
  moderate: 'map-icons/pin-moderate.png',
  low: 'map-icons/pin-low.png',
};

interface Region { latitude: number; longitude: number; latitudeDelta: number; longitudeDelta: number }
const zoomFor = (r: Region) => Math.min(18, Math.max(3, Math.log2(360 / Math.max(r.longitudeDelta, 0.0005))));

interface ReadyProps { onReady: () => void; onError: () => void }

function useInit(onError: () => void) {
  const [ok, setOk] = useState(false);
  useEffect(() => {
    let alive = true;
    initPetal().then(() => alive && setOk(true)).catch((e) => {
      console.warn('[Petal] Could not start Map Kit:', e);
      if (alive) onError();
    });
    return () => { alive = false; };
  }, []); // eslint-disable-line react-hooks/exhaustive-deps
  return ok;
}

// ─── Report pins ──────────────────────────────────────────────────────────────

export interface PetalPin {
  id: string;
  latitude: number;
  longitude: number;
  severity: SeverityLevel;
  title?: string;
  snippet?: string;
}

export function PetalPinsMap({
  region, pins, dark, interactive = true, onPinPress, onReady, onError, style, trucks = [],
}: ReadyProps & {
  region: Region;
  pins: PetalPin[];
  dark: boolean;
  interactive?: boolean;
  onPinPress?: (id: string) => void;
  style?: StyleProp<ViewStyle>;
  trucks?: Array<{ id: string; latitude: number; longitude: number; heading: number; title: string; snippet: string; onPress?: () => void }>;
}) {
  const ok = useInit(onError);
  const mod = getPetal();
  if (!mod || !ok) return null;
  const { default: HMSMap, HMSMarker } = mod;
  return (
    <HMSMap
      style={style}
      camera={{ target: { latitude: region.latitude, longitude: region.longitude }, zoom: zoomFor(region) }}
      darkMode={dark}
      compassEnabled={false}
      zoomControlsEnabled={false}
      scrollGesturesEnabled={interactive}
      zoomGesturesEnabled={interactive}
      rotateGesturesEnabled={false}
      tiltGesturesEnabled={false}
      myLocationEnabled={interactive}
      onMapReady={onReady}
    >
      {pins.map((p) => (
        <HMSMarker
          key={p.id}
          coordinate={{ latitude: p.latitude, longitude: p.longitude }}
          icon={{ asset: PIN_ASSET[p.severity] }}
          markerAnchor={[0.5, 1]}
          title={p.title}
          snippet={p.snippet}
          clickable={interactive}
          onInfoWindowClick={() => onPinPress?.(p.id)}
        />
      ))}
      {trucks.map((t) => <PetalTruck key={t.id} {...t} />)}
    </HMSMap>
  );
}

function PetalTruck({ latitude, longitude, heading, title, snippet, onPress }: {
  latitude: number; longitude: number; heading: number; title?: string; snippet?: string; onPress?: () => void;
}) {
  const target = useMemo(() => ({ latitude, longitude, heading }), [latitude, longitude, heading]);
  const pos = useGlide(target);
  const mod = getPetal();
  if (!mod || !pos) return null;
  const { HMSMarker } = mod;
  return (
    <HMSMarker
      coordinate={{ latitude: pos.latitude, longitude: pos.longitude }}
      icon={{ asset: 'map-icons/truck.png' }}
      markerAnchor={[0.5, 0.5]}
      flat
      rotation={pos.heading}
      zIndex={10}
      title={title}
      snippet={snippet}
      onInfoWindowClick={onPress}
    />
  );
}

// ─── Live tracking ─────────────────────────────────────────────────────────────

export function PetalTrackingMap({
  truck, ahead, destination, straight, follow, dark, onUserPan, onReady, onError, style,
}: ReadyProps & {
  truck: { latitude: number; longitude: number; heading: number };
  ahead: Array<{ latitude: number; longitude: number }>;
  destination: { latitude: number; longitude: number };
  straight: boolean;
  follow: boolean;
  dark: boolean;
  onUserPan: () => void;
  style?: StyleProp<ViewStyle>;
}) {
  const ok = useInit(onError);
  const map = useRef<{ setBounds: (b: unknown[], padding: number) => void } | null>(null);
  const userMoved = useRef(false);

  // Keep the truck and the site in view while following.
  useEffect(() => {
    if (!ok || !follow || !map.current) return;
    map.current.setBounds([
      { latitude: Math.min(truck.latitude, destination.latitude), longitude: Math.min(truck.longitude, destination.longitude) },
      { latitude: Math.max(truck.latitude, destination.latitude), longitude: Math.max(truck.longitude, destination.longitude) },
    ], 120);
  }, [ok, follow, truck.latitude, truck.longitude, destination.latitude, destination.longitude]);

  const mod = getPetal();
  if (!mod || !ok) return null;
  const { default: HMSMap, HMSMarker, HMSPolyline } = mod;
  return (
    <HMSMap
      ref={(r: unknown) => { map.current = r as typeof map.current; }}
      style={style}
      camera={{ target: truck, zoom: 15 }}
      darkMode={dark}
      compassEnabled={false}
      zoomControlsEnabled={false}
      rotateGesturesEnabled={false}
      tiltGesturesEnabled={false}
      onMapReady={onReady}
      // Reason 1 = the user moved the map (gesture): stop following until Recenter.
      onCameraMoveStarted={(e) => {
        if (e?.nativeEvent?.reason === 1) { userMoved.current = true; onUserPan(); }
      }}
    >
      <HMSPolyline points={ahead} color={argb(MAP_COLORS.routeCasing)} width={18} zIndex={1} />
      <HMSPolyline
        points={ahead}
        color={argb(MAP_COLORS.route)}
        width={11}
        zIndex={2}
        {...(straight ? { pattern: [{ type: 0, length: 24 }, { type: 2, length: 18 }] } : {})}
      />
      <HMSMarker coordinate={destination} icon={{ asset: 'map-icons/pin-site.png' }} markerAnchor={[0.5, 1]} zIndex={3} />
      <PetalTruck {...truck} />
    </HMSMap>
  );
}
