/**
 * One look for every map in the app, whichever engine draws it:
 *  - Google Maps (Android): a custom style that mutes business clutter and makes rivers,
 *    creeks and canals stand out, with light and dark versions.
 *  - Apple Maps (iOS): Apple has no style files, so it uses the standard map with points
 *    of interest hidden and follows the app's light/dark mode.
 *  - OpenFreeMap (Huawei and other phones without Google services): the same palette is
 *    applied to its vector style once it loads (see openFreeMap.ts).
 */
import { Platform } from 'react-native';
import { MapStyleElement, PROVIDER_GOOGLE } from 'react-native-maps';

// One palette for all three maps (the OpenFreeMap page applies the same colours, see openFreeMap.ts).
const LIGHT: MapStyleElement[] = [
  { elementType: 'geometry', stylers: [{ color: '#f5f6f2' }] },
  { elementType: 'labels.text.fill', stylers: [{ color: '#56615c' }] },
  { elementType: 'labels.text.stroke', stylers: [{ color: '#ffffff' }, { weight: 3 }] },
  { featureType: 'landscape.man_made', elementType: 'geometry', stylers: [{ color: '#eff1ec' }] },
  { featureType: 'landscape.natural', elementType: 'geometry', stylers: [{ color: '#e9f2e4' }] },
  { featureType: 'administrative', elementType: 'geometry.stroke', stylers: [{ color: '#c4cfc9' }] },
  { featureType: 'administrative.land_parcel', stylers: [{ visibility: 'off' }] },
  { featureType: 'administrative.locality', elementType: 'labels.text.fill', stylers: [{ color: '#2f3a36' }] },
  { featureType: 'administrative.neighborhood', elementType: 'labels.text.fill', stylers: [{ color: '#7d8a84' }] },
  { featureType: 'poi', stylers: [{ visibility: 'off' }] },
  { featureType: 'poi.park', stylers: [{ visibility: 'on' }] },
  { featureType: 'poi.park', elementType: 'geometry', stylers: [{ color: '#cfe9cb' }] },
  { featureType: 'poi.park', elementType: 'labels', stylers: [{ visibility: 'off' }] },
  { featureType: 'road', elementType: 'geometry', stylers: [{ color: '#ffffff' }] },
  { featureType: 'road', elementType: 'geometry.stroke', stylers: [{ color: '#dde3df' }] },
  { featureType: 'road', elementType: 'labels.icon', stylers: [{ visibility: 'off' }] },
  { featureType: 'road.local', elementType: 'labels.text.fill', stylers: [{ color: '#8a958f' }] },
  { featureType: 'road.highway', elementType: 'geometry', stylers: [{ color: '#fde7b5' }] },
  { featureType: 'road.highway', elementType: 'geometry.stroke', stylers: [{ color: '#f2c879' }] },
  { featureType: 'road.highway', elementType: 'labels.text.fill', stylers: [{ color: '#7a5b1e' }] },
  { featureType: 'transit', stylers: [{ visibility: 'off' }] },
  // Waterways are what CleanStream is about: make them clearly visible.
  { featureType: 'water', elementType: 'geometry', stylers: [{ color: '#86cbe9' }] },
  { featureType: 'water', elementType: 'labels.text.fill', stylers: [{ color: '#14607d' }] },
  { featureType: 'water', elementType: 'labels.text.stroke', stylers: [{ color: '#e2f4fb' }] },
];

const DARK: MapStyleElement[] = [
  { elementType: 'geometry', stylers: [{ color: '#1a2120' }] },
  { elementType: 'labels.text.fill', stylers: [{ color: '#9aa8a2' }] },
  { elementType: 'labels.text.stroke', stylers: [{ color: '#1a2120' }, { weight: 3 }] },
  { featureType: 'landscape.natural', elementType: 'geometry', stylers: [{ color: '#1b2622' }] },
  { featureType: 'administrative', elementType: 'geometry.stroke', stylers: [{ color: '#33403b' }] },
  { featureType: 'administrative.land_parcel', stylers: [{ visibility: 'off' }] },
  { featureType: 'administrative.locality', elementType: 'labels.text.fill', stylers: [{ color: '#c5d0cb' }] },
  { featureType: 'poi', stylers: [{ visibility: 'off' }] },
  { featureType: 'poi.park', stylers: [{ visibility: 'on' }] },
  { featureType: 'poi.park', elementType: 'geometry', stylers: [{ color: '#1d3027' }] },
  { featureType: 'poi.park', elementType: 'labels', stylers: [{ visibility: 'off' }] },
  { featureType: 'road', elementType: 'geometry', stylers: [{ color: '#2b3633' }] },
  { featureType: 'road', elementType: 'geometry.stroke', stylers: [{ color: '#1f2826' }] },
  { featureType: 'road', elementType: 'labels.icon', stylers: [{ visibility: 'off' }] },
  { featureType: 'road.highway', elementType: 'geometry', stylers: [{ color: '#4a4330' }] },
  { featureType: 'road.highway', elementType: 'geometry.stroke', stylers: [{ color: '#5c5236' }] },
  { featureType: 'road.highway', elementType: 'labels.text.fill', stylers: [{ color: '#d9c38f' }] },
  { featureType: 'transit', stylers: [{ visibility: 'off' }] },
  { featureType: 'water', elementType: 'geometry', stylers: [{ color: '#0d4a5f' }] },
  { featureType: 'water', elementType: 'labels.text.fill', stylers: [{ color: '#7fcbe3' }] },
  { featureType: 'water', elementType: 'labels.text.stroke', stylers: [{ color: '#0d4a5f' }] },
];

/**
 * Props for a react-native-maps <MapView>: Google Maps with CleanStream's style on
 * Android, Apple Maps tuned to match on iOS. (Expo Go on iOS has no Google Maps SDK,
 * so iOS deliberately stays on Apple Maps.)
 */
export function nativeMapLook(isDark: boolean) {
  if (Platform.OS === 'android') {
    return {
      provider: PROVIDER_GOOGLE,
      customMapStyle: isDark ? DARK : LIGHT,
      showsBuildings: false,
      showsIndoors: false,
      toolbarEnabled: false,
    } as const;
  }
  // Apple Maps takes no style file. The standard map (vivid blue water, green parks) with
  // points of interest hidden comes closest to the Google style above.
  return {
    mapType: 'standard',
    showsPointsOfInterest: false,
    showsBuildings: true,
    showsCompass: false,
    showsTraffic: false,
    userInterfaceStyle: isDark ? 'dark' : 'light',
  } as const;
}

export { MAP_COLORS } from './mapColors';
