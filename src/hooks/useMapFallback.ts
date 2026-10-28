import { useEffect, useState } from 'react';
import { Platform } from 'react-native';
import { MAP_READY_TIMEOUT_MS, PREFER_PETAL_MAPS } from '../utils/mapProvider';
import { getPetal, hasPetalCredentials } from '../components/map/PetalMap';

/**
 * Which map engine to draw with:
 *  - 'petal'  Petal Maps (HUAWEI Map Kit) on Huawei phones
 *  - 'native' Google Maps on other Android phones, Apple Maps on iPhone
 *  - 'osm'    OpenStreetMap in a WebView, when neither of the above starts
 * Falls through to 'osm' when the map throws or never reports ready.
 */
export type MapEngine = 'petal' | 'native' | 'osm';

const PETAL_READY_TIMEOUT_MS = 10000;

export function useMapEngine() {
  const [engine, setEngine] = useState<MapEngine>(() =>
    Platform.OS === 'web' ? 'osm' : PREFER_PETAL_MAPS && hasPetalCredentials() && getPetal() ? 'petal' : 'native');
  const [ready, setReady] = useState(false);

  useEffect(() => {
    if (engine === 'osm' || ready || Platform.OS === 'web') return;
    const timer = setTimeout(() => {
      console.warn(`[Map] ${engine} map did not report ready in time, falling back to OpenStreetMap`);
      setEngine('osm');
    }, engine === 'petal' ? PETAL_READY_TIMEOUT_MS : MAP_READY_TIMEOUT_MS);
    return () => clearTimeout(timer);
  }, [engine, ready]);

  return {
    engine,
    onReady: () => setReady(true),
    onError: () => { setReady(false); setEngine('osm'); },
  };
}
