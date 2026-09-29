import * as Location from 'expo-location';
import { GeoLocation } from '../types';

export const slugifyBarangay = (name: string): string =>
  name
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/(^-|-$)/g, '');

export interface CebuBarangay { id: string; name: string; lat: number; lng: number }

// Canonical barangay list -- the single source of truth for barangay names/IDs across
// signup (barangay picker), GPS-based nearest-barangay fallback, and reverse geocoding.
// Using one shared list (rather than free-text entry) keeps a citizen's report barangay
// and a barangay official's assigned barangay in sync, since both derive from this list's
// `id` -- that ID is what Firestore queries (subscribeToBarangayReports) actually filter on.
export const CEBU_BARANGAYS: CebuBarangay[] = [
  { id: 'punta-princesa', name: 'Punta Princesa', lat: 10.3157, lng: 123.8854 },
  { id: 'guadalupe', name: 'Guadalupe', lat: 10.3180, lng: 123.8920 },
  { id: 'labangon', name: 'Labangon', lat: 10.3090, lng: 123.8780 },
  { id: 'mambaling', name: 'Mambaling', lat: 10.3050, lng: 123.8700 },
  { id: 'kinasang-an', name: 'Kinasang-an', lat: 10.3220, lng: 123.8990 },
  { id: 'kamputhaw', name: 'Kamputhaw', lat: 10.3350, lng: 123.9050 },
  { id: 'kamagayan', name: 'Kamagayan', lat: 10.3040, lng: 123.8990 },
  { id: 'tinago', name: 'Tinago', lat: 10.2970, lng: 123.9010 },
  { id: 'basak-san-nicolas', name: 'Basak San Nicolas', lat: 10.2950, lng: 123.8880 },
  { id: 'tejero', name: 'Tejero', lat: 10.3120, lng: 123.8820 },
];

/** Matches a (possibly device-reverse-geocoded) barangay name against the canonical
 * list, so a name like "Guadalupe " or "guadalupe" still resolves to the same
 * `barangayId` a citizen's report and a barangay official's account both rely on.
 * Returns undefined if the name doesn't match any canonical entry.
 */
export const findBarangayByName = (name: string | undefined | null): CebuBarangay | undefined => {
  if (!name) return undefined;
  const normalized = name.trim().toLowerCase();
  return CEBU_BARANGAYS.find((b) => b.name.toLowerCase() === normalized);
};

const haversineDistance = (
  lat1: number, lng1: number, lat2: number, lng2: number,
): number => {
  const R = 6371;
  const dLat = ((lat2 - lat1) * Math.PI) / 180;
  const dLng = ((lng2 - lng1) * Math.PI) / 180;
  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos((lat1 * Math.PI) / 180) *
      Math.cos((lat2 * Math.PI) / 180) *
      Math.sin(dLng / 2) ** 2;
  return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
};

export const getNearestBarangayEntry = (lat: number, lng: number): CebuBarangay => {
  let nearest = CEBU_BARANGAYS[0];
  let minDist = Infinity;
  for (const b of CEBU_BARANGAYS) {
    const dist = haversineDistance(lat, lng, b.lat, b.lng);
    if (dist < minDist) {
      minDist = dist;
      nearest = b;
    }
  }
  return nearest;
};

export const getNearestBarangay = (lat: number, lng: number): string =>
  getNearestBarangayEntry(lat, lng).name;

export const requestLocationPermission = async (): Promise<boolean> => {
  const { status } = await Location.requestForegroundPermissionsAsync();
  return status === 'granted';
};

export const getCurrentLocation = async (): Promise<GeoLocation> => {
  const hasPermission = await requestLocationPermission();
  if (!hasPermission) throw new Error('Location permission denied');

  const loc = await Location.getCurrentPositionAsync({
    accuracy: Location.Accuracy.High,
  });

  const { latitude, longitude, accuracy } = loc.coords;

  // Default fallback using nearest hardcoded barangay
  const nearest = getNearestBarangayEntry(latitude, longitude);
  let barangay = nearest.name;
  let barangayId: string | undefined = nearest.id;
  let address = `${latitude.toFixed(4)}°N, ${longitude.toFixed(4)}°E`;

  try {
    const [geo] = await Location.reverseGeocodeAsync({ latitude, longitude });
    if (geo) {
      // district is the most specific administrative unit (barangay-level on some devices)
      const reverseGeocodedName = geo.district || geo.subregion || geo.city || barangay;
      barangay = reverseGeocodedName;
      // Only trust the reverse-geocoded name for barangayId if it matches our canonical
      // list -- otherwise keep the GPS-nearest match's ID so the report/account still
      // links to a real barangay record instead of an unmatched free-text name.
      barangayId = findBarangayByName(reverseGeocodedName)?.id ?? nearest.id;
      address = [geo.streetNumber, geo.street, geo.district || geo.subregion, geo.city]
        .filter(Boolean)
        .join(', ');
    }
  } catch {
    // keep fallback values
  }

  return {
    latitude,
    longitude,
    accuracy: accuracy || undefined,
    timestamp: loc.timestamp,
    barangay,
    barangayId,
    address,
  };
};

export const watchLocation = (
  callback: (loc: GeoLocation) => void,
) => {
  let subscription: Location.LocationSubscription | null = null;

  Location.watchPositionAsync(
    { accuracy: Location.Accuracy.High, distanceInterval: 10 },
    async (loc) => {
      const { latitude, longitude, accuracy } = loc.coords;
      const nearest = getNearestBarangayEntry(latitude, longitude);
      let barangay = nearest.name;
      let barangayId: string | undefined = nearest.id;
      let address = `${latitude.toFixed(4)}°N, ${longitude.toFixed(4)}°E`;
      try {
        const [geo] = await Location.reverseGeocodeAsync({ latitude, longitude });
        if (geo) {
          const reverseGeocodedName = geo.district || geo.subregion || geo.city || barangay;
          barangay = reverseGeocodedName;
          barangayId = findBarangayByName(reverseGeocodedName)?.id ?? nearest.id;
          address = [geo.streetNumber, geo.street, geo.district || geo.subregion, geo.city]
            .filter(Boolean)
            .join(', ');
        }
      } catch { /* keep fallback */ }
      callback({ latitude, longitude, accuracy: accuracy || undefined, timestamp: loc.timestamp, barangay, barangayId, address });
    },
  ).then((sub) => { subscription = sub; });

  return () => subscription?.remove();
};
