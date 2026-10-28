import { useEffect, useState } from 'react';
import { Platform } from 'react-native';
import { MAP_READY_TIMEOUT_MS, PREFER_OPEN_MAP } from '../utils/mapProvider';

/**
 * Which map engine to draw with:
 *  - 'native' Google Maps on Android, Apple Maps on iPhone
 *  - 'osm'    OpenFreeMap (MapLibre in a WebView): Huawei phones from the start, and any
 *             phone where the native map throws or never reports ready
 */
export type MapEngine = 'native' | 'osm';

export function useMapEngine() {
  const [engine, setEngine] = useState<MapEngine>(() => (Platform.OS === 'web' || PREFER_OPEN_MAP ? 'osm' : 'native'));
  const [ready, setReady] = useState(false);

  useEffect(() => {
    if (engine === 'osm' || ready || Platform.OS === 'web') return;
    const timer = setTimeout(() => {
      console.warn('[Map] Native map did not report ready in time, falling back to OpenFreeMap');
      setEngine('osm');
    }, MAP_READY_TIMEOUT_MS);
    return () => clearTimeout(timer);
  }, [engine, ready]);

  return {
    engine,
    onReady: () => setReady(true),
    onError: () => { setReady(false); setEngine('osm'); },
  };
}
