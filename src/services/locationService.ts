import * as Location from 'expo-location';
import { GeoLocation } from '../types';
import { withTimeout } from '../utils/async';

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

// ─── Reverse geocoding ────────────────────────────────────────────────────────

interface Place { name?: string; address?: string }

// Android's built-in geocoder is backed by Google Play Services, so on phones
// without Google services (e.g. newer Huawei) it returns nothing or throws.
const reverseGeocodeNative = async (latitude: number, longitude: number): Promise<Place | null> => {
  try {
    const [geo] = await withTimeout(Location.reverseGeocodeAsync({ latitude, longitude }), 6000, 'Native geocode');
    if (!geo) return null;
    const area = geo.district || geo.subregion;
    return {
      name: area || geo.city || undefined,
      address: [geo.streetNumber, geo.street, area, geo.city].filter(Boolean).join(', ') || undefined,
    };
  } catch {
    return null;
  }
};

// OpenStreetMap Nominatim: free, no API key, no Google dependency.
const reverseGeocodeOsm = async (latitude: number, longitude: number): Promise<Place | null> => {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 8000);
  try {
    const res = await fetch(
      `https://nominatim.openstreetmap.org/reverse?format=jsonv2&lat=${latitude}&lon=${longitude}&zoom=18&addressdetails=1`,
      { headers: { 'Accept-Language': 'en', 'User-Agent': 'CleanStream/1.0 (waste reporting app)' }, signal: controller.signal },
    );
    if (!res.ok) return null;
    const data = await res.json();
    const a = data?.address ?? {};
    // Philippine barangays usually come back as suburb/quarter/neighbourhood/village.
    const area = a.suburb || a.quarter || a.neighbourhood || a.village || a.city_district;
    const city = a.city || a.town || a.municipality;
    const address =
      [a.house_number, a.road, area, city].filter(Boolean).join(', ') || data?.display_name || undefined;
    return { name: area || city || undefined, address };
  } catch {
    return null;
  } finally {
    clearTimeout(timer);
  }
};

const enrichPosition = async (
  coords: { latitude: number; longitude: number; accuracy: number | null },
  timestamp: number,
  cachedPlace?: Place | null,
): Promise<{ loc: GeoLocation; place: Place | null }> => {
  const { latitude, longitude, accuracy } = coords;
  const nearest = getNearestBarangayEntry(latitude, longitude);

  const place =
    cachedPlace ??
    (await reverseGeocodeNative(latitude, longitude)) ??
    (await reverseGeocodeOsm(latitude, longitude));

  const name = place?.name ?? nearest.name;
  return {
    place,
    loc: {
      latitude,
      longitude,
      accuracy: accuracy || undefined,
      timestamp,
      barangay: name,
      // Only trust a geocoded name for barangayId if it matches the canonical list;
      // otherwise keep the GPS-nearest match so the report still links to a real barangay.
      barangayId: findBarangayByName(name)?.id ?? nearest.id,
      address: place?.address ?? `${latitude.toFixed(4)}°N, ${longitude.toFixed(4)}°E`,
    },
  };
};

// ─── Position ─────────────────────────────────────────────────────────────────

// expo-location's getCurrentPositionAsync has no built-in timeout -- without a
// clear GPS fix the native call can simply never resolve. Racing it against a
// timeout, then retrying at a cheaper accuracy, then falling back to any
// cached fix, guarantees this always settles one way or another.
const getPositionWithFallback = async (): Promise<Location.LocationObject> => {
  try {
    return await withTimeout(
      Location.getCurrentPositionAsync({ accuracy: Location.Accuracy.High }),
      30000,
    );
  } catch {
    // High accuracy (GPS-only) can stall with a weak signal.
  }

  try {
    return await withTimeout(
      Location.getCurrentPositionAsync({ accuracy: Location.Accuracy.Balanced }),
      10000,
    );
  } catch {
    // Still nothing -- fall back to any cached fix rather than failing outright.
  }

  const lastKnown = await Location.getLastKnownPositionAsync();
  if (lastKnown) return lastKnown;

  throw new Error('Unable to determine current location');
};

export const getCurrentLocation = async (): Promise<GeoLocation> => {
  const hasPermission = await requestLocationPermission();
  if (!hasPermission) throw new Error('Location permission denied');

  const pos = await getPositionWithFallback();
  return (await enrichPosition(pos.coords, pos.timestamp)).loc;
};

/**
 * Live location: calls back on the first fix and again whenever the device
 * moves, with the street address resolved for each. Resolves to an
 * unsubscribe function; rejects if permission is denied.
 */
export const watchLocation = async (
  callback: (loc: GeoLocation) => void,
): Promise<() => void> => {
  const hasPermission = await requestLocationPermission();
  if (!hasPermission) throw new Error('Location permission denied');

  // Asks Android to also enable the network provider (Wi-Fi/cell positioning)
  // for a faster first fix. Harmless if unsupported.
  await Location.enableNetworkProviderAsync().catch(() => undefined);

  let lastGeocoded: { latitude: number; longitude: number; place: Place | null } | null = null;

  const subscription = await Location.watchPositionAsync(
    { accuracy: Location.Accuracy.High, timeInterval: 4000, distanceInterval: 5 },
    async (pos) => {
      const { latitude, longitude } = pos.coords;
      // Re-resolving the address on every tiny GPS jitter would hammer the
      // geocoder (Nominatim allows ~1 req/s), so reuse it within ~25 m.
      const reuse =
        lastGeocoded && lastGeocoded.place &&
        haversineDistance(latitude, longitude, lastGeocoded.latitude, lastGeocoded.longitude) < 0.025
          ? lastGeocoded.place
          : undefined;
      const { loc, place } = await enrichPosition(pos.coords, pos.timestamp, reuse);
      if (!reuse) lastGeocoded = { latitude, longitude, place };
      callback(loc);
    },
  );

  return () => subscription.remove();
};
