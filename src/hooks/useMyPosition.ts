import { useEffect, useState } from 'react';
import { Platform } from 'react-native';
import * as Location from 'expo-location';
import { watchPosition } from '../services/devicePosition';
import { LatLng } from '../services/routeMath';

/**
 * This phone's own position, to show "You" on the tracking map (the reporter, or an
 * official following the truck). Only when location access was already given to the app:
 * it never asks, and it stays on this phone (nothing is saved or shared).
 */
export function useMyPosition(enabled: boolean): LatLng | null {
  const [pos, setPos] = useState<LatLng | null>(null);
  useEffect(() => {
    if (!enabled || Platform.OS === 'web') return undefined;
    let sub: Location.LocationSubscription | null = null;
    let cancelled = false;
    (async () => {
      try {
        const perm = await Location.getForegroundPermissionsAsync();
        if (cancelled || perm.status !== 'granted') return;
        const s = await watchPosition(
          { accuracy: Location.Accuracy.Balanced, timeInterval: 10000, distanceInterval: 15 },
          (loc) => setPos({ latitude: loc.coords.latitude, longitude: loc.coords.longitude }),
        );
        if (cancelled) s.remove(); else sub = s;
      } catch (e) {
        console.warn('[Tracking] Own position unavailable (non-fatal):', e);
      }
    })();
    return () => { cancelled = true; sub?.remove(); };
  }, [enabled]);
  return enabled ? pos : null;
}
