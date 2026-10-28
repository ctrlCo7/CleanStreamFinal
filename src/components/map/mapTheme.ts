/**
 * One look for every map in the app, whichever engine draws it:
 *  - Google Maps (Android): a custom style that mutes business clutter and makes rivers,
 *    creeks and canals stand out, with light and dark versions.
 *  - Apple Maps (iOS): Apple has no style files, so it uses the muted map type, hides
 *    points of interest and follows the app's light/dark mode.
 *  - OpenStreetMap (Huawei and other phones without Google services): CARTO's clean
 *    Voyager / Dark Matter tiles (see OsmMapView).
 */
import { Platform } from 'react-native';
import { MapStyleElement, PROVIDER_GOOGLE } from 'react-native-maps';

const LIGHT: MapStyleElement[] = [
  { elementType: 'geometry', stylers: [{ color: '#f3f5f1' }] },
  { elementType: 'labels.text.fill', stylers: [{ color: '#5f6b66' }] },
  { elementType: 'labels.text.stroke', stylers: [{ color: '#ffffff' }, { weight: 3 }] },
  { featureType: 'administrative', elementType: 'geometry.stroke', stylers: [{ color: '#c9d3ce' }] },
  { featureType: 'administrative.neighborhood', elementType: 'labels.text.fill', stylers: [{ color: '#8a958f' }] },
  { featureType: 'poi', stylers: [{ visibility: 'off' }] },
  { featureType: 'poi.park', stylers: [{ visibility: 'on' }] },
  { featureType: 'poi.park', elementType: 'geometry', stylers: [{ color: '#dcefd9' }] },
  { featureType: 'poi.park', elementType: 'labels', stylers: [{ visibility: 'off' }] },
  { featureType: 'road', elementType: 'geometry', stylers: [{ color: '#ffffff' }] },
  { featureType: 'road', elementType: 'geometry.stroke', stylers: [{ color: '#e1e6e2' }] },
  { featureType: 'road.highway', elementType: 'geometry', stylers: [{ color: '#fbe9c9' }] },
  { featureType: 'road.highway', elementType: 'geometry.stroke', stylers: [{ color: '#f0d39f' }] },
  { featureType: 'road', elementType: 'labels.icon', stylers: [{ visibility: 'off' }] },
  { featureType: 'transit', stylers: [{ visibility: 'off' }] },
  // Waterways are what CleanStream is about: make them clearly visible.
  { featureType: 'water', elementType: 'geometry', stylers: [{ color: '#8fd0e8' }] },
  { featureType: 'water', elementType: 'labels.text.fill', stylers: [{ color: '#1f6f8b' }] },
  { featureType: 'water', elementType: 'labels.text.stroke', stylers: [{ color: '#e6f6fb' }] },
];

const DARK: MapStyleElement[] = [
  { elementType: 'geometry', stylers: [{ color: '#18201e' }] },
  { elementType: 'labels.text.fill', stylers: [{ color: '#8e9b96' }] },
  { elementType: 'labels.text.stroke', stylers: [{ color: '#18201e' }, { weight: 3 }] },
  { featureType: 'administrative', elementType: 'geometry.stroke', stylers: [{ color: '#2f3b37' }] },
  { featureType: 'poi', stylers: [{ visibility: 'off' }] },
  { featureType: 'poi.park', stylers: [{ visibility: 'on' }] },
  { featureType: 'poi.park', elementType: 'geometry', stylers: [{ color: '#1c2b24' }] },
  { featureType: 'poi.park', elementType: 'labels', stylers: [{ visibility: 'off' }] },
  { featureType: 'road', elementType: 'geometry', stylers: [{ color: '#28322f' }] },
  { featureType: 'road', elementType: 'geometry.stroke', stylers: [{ color: '#1f2826' }] },
  { featureType: 'road.highway', elementType: 'geometry', stylers: [{ color: '#3a3a2e' }] },
  { featureType: 'road', elementType: 'labels.icon', stylers: [{ visibility: 'off' }] },
  { featureType: 'transit', stylers: [{ visibility: 'off' }] },
  { featureType: 'water', elementType: 'geometry', stylers: [{ color: '#0e3b4b' }] },
  { featureType: 'water', elementType: 'labels.text.fill', stylers: [{ color: '#6cbcd6' }] },
  { featureType: 'water', elementType: 'labels.text.stroke', stylers: [{ color: '#0e3b4b' }] },
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
  return {
    mapType: 'mutedStandard',
    showsPointsOfInterest: false,
    showsBuildings: true,
    userInterfaceStyle: isDark ? 'dark' : 'light',
  } as const;
}

/** Map-matching colours for overlays drawn on top (routes, truck, pins). */
export const MAP_COLORS = {
  route: '#1D9E75',
  routeCasing: '#0F6E56',
  routeStraight: '#8a958f',
  truck: '#0F6E56',
  destination: '#EF4444',
};
