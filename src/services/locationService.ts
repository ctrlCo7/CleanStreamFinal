import * as Location from 'expo-location';
import { GeoLocation } from '../types';
import { withTimeout } from '../utils/async';
import { getCurrentPosition, watchPosition } from './devicePosition';
import { collection, getDocs, query, where } from 'firebase/firestore';
import { db } from './firebase';

export const slugifyBarangay = (name: string): string =>
  name
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '') // drop accents: "Santo Niño" -> "santo-nino"
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/(^-|-$)/g, '');

/** `aliases`: other spellings the phone's address lookup or a person may use. */
export interface CebuBarangay { id: string; name: string; lat: number; lng: number; aliases?: string[] }

// Canonical barangay list -- the single source of truth for barangay names/IDs across
// signup (barangay picker), GPS-based nearest-barangay fallback, and reverse geocoding.
// Using one shared list (rather than free-text entry) keeps a citizen's report barangay
// and a barangay official's assigned barangay in sync, since both derive from this list's
// `id` -- that ID is what Firestore queries (subscribeToBarangayReports) actually filter on.
export const CEBU_BARANGAYS: CebuBarangay[] = [
  { id: 'adlaon', name: 'Adlaon', lat: 10.4369, lng: 123.8680 },
  { id: 'agsungot', name: 'Agsungot', lat: 10.4349, lng: 123.9102 },
  { id: 'apas', name: 'Apas', lat: 10.3375, lng: 123.9056 },
  { id: 'babag', name: 'Babag', lat: 10.3740, lng: 123.8503 },
  { id: 'bacayan', name: 'Bacayan', lat: 10.3855, lng: 123.9199 },
  { id: 'banilad', name: 'Banilad', lat: 10.3465, lng: 123.9111 },
  { id: 'basak-pardo', name: 'Basak Pardo', lat: 10.2865, lng: 123.8646 },
  { id: 'basak-san-nicolas', name: 'Basak San Nicolas', lat: 10.2865, lng: 123.8703 },
  { id: 'binaliw', name: 'Binaliw', lat: 10.4228, lng: 123.9161 },
  { id: 'bonbon', name: 'Bonbon', lat: 10.3666, lng: 123.8277 },
  { id: 'budla-an', name: 'Budla-an', lat: 10.3793, lng: 123.8859, aliases: ['Budlaan'] },
  { id: 'buhisan', name: 'Buhisan', lat: 10.3088, lng: 123.8535 },
  { id: 'bulacao', name: 'Bulacao', lat: 10.2755, lng: 123.8514 },
  { id: 'buot', name: 'Buot', lat: 10.3480, lng: 123.8081, aliases: ['Buot-Taup', 'Buot-Taup Pardo'] },
  { id: 'busay', name: 'Busay', lat: 10.3608, lng: 123.8847 },
  { id: 'calamba', name: 'Calamba', lat: 10.3016, lng: 123.8845 },
  { id: 'cambinocot', name: 'Cambinocot', lat: 10.4631, lng: 123.8975 },
  { id: 'capitol-site', name: 'Capitol Site', lat: 10.3247, lng: 123.8902 },
  { id: 'carreta', name: 'Carreta', lat: 10.3082, lng: 123.9149 },
  { id: 'cogon-pardo', name: 'Cogon Pardo', lat: 10.2774, lng: 123.8621 },
  { id: 'cogon-ramos', name: 'Cogon Ramos', lat: 10.3049, lng: 123.8984 },
  { id: 'day-as', name: 'Day-as', lat: 10.3015, lng: 123.9023, aliases: ['Dayas'] },
  { id: 'duljo-fatima', name: 'Duljo Fatima', lat: 10.2917, lng: 123.8849, aliases: ['Duljo'] },
  { id: 'ermita', name: 'Ermita', lat: 10.2917, lng: 123.8974 },
  { id: 'guadalupe', name: 'Guadalupe', lat: 10.3229, lng: 123.8839 },
  { id: 'guba', name: 'Guba', lat: 10.4282, lng: 123.8899 },
  { id: 'hipodromo', name: 'Hipodromo', lat: 10.3141, lng: 123.9070 },
  { id: 'inayawan', name: 'Inayawan', lat: 10.2702, lng: 123.8564 },
  { id: 'kalubihan', name: 'Kalubihan', lat: 10.2977, lng: 123.8991 },
  { id: 'kalunasan', name: 'Kalunasan', lat: 10.3389, lng: 123.8796 },
  { id: 'kamagayan', name: 'Kamagayan', lat: 10.2998, lng: 123.8995 },
  { id: 'kamputhaw', name: 'Kamputhaw', lat: 10.3182, lng: 123.8972, aliases: ['Camputhaw'] },
  { id: 'kasambagan', name: 'Kasambagan', lat: 10.3251, lng: 123.9113 },
  { id: 'kinasang-an', name: 'Kinasang-an Pardo', lat: 10.2823, lng: 123.8591, aliases: ['Kinasang-an', 'Kinasangan'] },
  { id: 'labangon', name: 'Labangon', lat: 10.2994, lng: 123.8791 },
  { id: 'lahug', name: 'Lahug', lat: 10.3309, lng: 123.8981 },
  { id: 'lorega-san-miguel', name: 'Lorega San Miguel', lat: 10.3066, lng: 123.9042, aliases: ['Lorega'] },
  { id: 'lusaran', name: 'Lusaran', lat: 10.4902, lng: 123.8919 },
  { id: 'luz', name: 'Luz', lat: 10.3211, lng: 123.9078 },
  { id: 'mabini', name: 'Mabini', lat: 10.4527, lng: 123.9190 },
  { id: 'mabolo', name: 'Mabolo', lat: 10.3143, lng: 123.9147 },
  { id: 'malubog', name: 'Malubog', lat: 10.3804, lng: 123.8693 },
  { id: 'mambaling', name: 'Mambaling', lat: 10.2911, lng: 123.8773 },
  { id: 'pahina-central', name: 'Pahina Central', lat: 10.2966, lng: 123.8924 },
  { id: 'pahina-san-nicolas', name: 'Pahina San Nicolas', lat: 10.2940, lng: 123.8928 },
  { id: 'pamutan', name: 'Pamutan', lat: 10.3334, lng: 123.8355 },
  { id: 'pardo', name: 'Pardo', lat: 10.2794, lng: 123.8554, aliases: ['Poblacion Pardo', 'Pardo (Pob.)'] },
  { id: 'pari-an', name: 'Pari-an', lat: 10.2989, lng: 123.9027, aliases: ['Parian'] },
  { id: 'paril', name: 'Paril', lat: 10.4750, lng: 123.9159 },
  { id: 'pasil', name: 'Pasil', lat: 10.2902, lng: 123.8947 },
  { id: 'pit-os', name: 'Pit-os', lat: 10.3964, lng: 123.9217, aliases: ['Pitos'] },
  { id: 'pulangbato', name: 'Pulangbato', lat: 10.3979, lng: 123.9063 },
  { id: 'pung-ol-sibugay', name: 'Pung-ol Sibugay', lat: 10.3970, lng: 123.8495 },
  { id: 'punta-princesa', name: 'Punta Princesa', lat: 10.2949, lng: 123.8702 },
  { id: 'quiot-pardo', name: 'Quiot Pardo', lat: 10.2890, lng: 123.8586, aliases: ['Quiot'] },
  { id: 'sambag-i', name: 'Sambag I', lat: 10.3008, lng: 123.8920 },
  { id: 'sambag-ii', name: 'Sambag II', lat: 10.3059, lng: 123.8911 },
  { id: 'san-antonio', name: 'San Antonio', lat: 10.3019, lng: 123.8983 },
  { id: 'san-jose', name: 'San Jose', lat: 10.3791, lng: 123.9164 },
  { id: 'san-nicolas-proper', name: 'San Nicolas Proper', lat: 10.2949, lng: 123.8905, aliases: ['San Nicolas'] },
  { id: 'san-roque', name: 'San Roque', lat: 10.2939, lng: 123.9060 },
  { id: 'santa-cruz', name: 'Santa Cruz', lat: 10.3061, lng: 123.8959 },
  { id: 'santo-nino', name: 'Santo Niño', lat: 10.2951, lng: 123.9028, aliases: ['Señor Santo Niño', 'Santo Nino', 'Sto. Niño'] },
  { id: 'sapangdaku', name: 'Sapangdaku', lat: 10.3350, lng: 123.8727 },
  { id: 'sawang-calero', name: 'Sawang Calero', lat: 10.2912, lng: 123.8908 },
  { id: 'sinsin', name: 'Sinsin', lat: 10.3449, lng: 123.7810, aliases: ['Sin-sin'] },
  { id: 'sirao', name: 'Sirao', lat: 10.4141, lng: 123.8722 },
  { id: 'suba', name: 'Suba', lat: 10.2900, lng: 123.8938 },
  { id: 'sudlon-i', name: 'Sudlon I', lat: 10.3636, lng: 123.7863 },
  { id: 'sudlon-ii', name: 'Sudlon II', lat: 10.3796, lng: 123.7847 },
  { id: 't-padilla', name: 'T. Padilla', lat: 10.3018, lng: 123.9043, aliases: ['T Padilla', 'Tomas Padilla'] },
  { id: 'tabunan', name: 'Tabunan', lat: 10.4397, lng: 123.8214 },
  { id: 'tagba-o', name: 'Tagba-o', lat: 10.4425, lng: 123.8399, aliases: ['Tagbao'] },
  { id: 'talamban', name: 'Talamban', lat: 10.3694, lng: 123.9169 },
  { id: 'taptap', name: 'Taptap', lat: 10.4299, lng: 123.8480 },
  { id: 'tejero', name: 'Tejero', lat: 10.3020, lng: 123.9074 },
  { id: 'tinago', name: 'Tinago', lat: 10.2986, lng: 123.9081 },
  { id: 'tisa', name: 'Tisa', lat: 10.3021, lng: 123.8690 },
  { id: 'to-ong', name: 'To-ong', lat: 10.3100, lng: 123.8362, aliases: ['Toong'] },
  { id: 'zapatera', name: 'Zapatera', lat: 10.3064, lng: 123.9013 },
];

/** Matches a (possibly device-reverse-geocoded) barangay name against the canonical
 * list, so a name like "Guadalupe " or "guadalupe" still resolves to the same
 * `barangayId` a citizen's report and a barangay official's account both rely on.
 * Returns undefined if the name doesn't match any canonical entry.
 */
export const findBarangayByName = (name: string | undefined | null): { id: string; name: string } | undefined => {
  if (!name) return undefined;
  const normalized = name.trim().toLowerCase().replace(/^(brgy\.?|barangay)\s+/, '');
  const slug = slugifyBarangay(normalized);
  return CEBU_BARANGAYS.find((b) => b.name.toLowerCase() === normalized || b.id === slug
      || b.aliases?.some((a) => a.toLowerCase() === normalized))
    ?? registeredBarangays.find((b) => b.name.toLowerCase() === normalized || b.id === slug);
};

// Barangays the Super Admin added in the portal (Firestore `barangays`, custom: true). They
// have no centre point, so they're only matched by the name the phone's address lookup gives.
let registeredBarangays: Array<{ id: string; name: string }> = [];

/** Loads the registered barangays (needs a signed-in user). Safe to call again to refresh. */
export async function loadRegisteredBarangays(): Promise<void> {
  try {
    const snap = await getDocs(query(collection(db, 'barangays'), where('custom', '==', true)));
    registeredBarangays = snap.docs.map((d) => ({ id: d.id, name: String(d.data().name ?? d.id) }));
  } catch (e) {
    console.warn('[Location] Could not load registered barangays:', e);
  }
}

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

// Philippine barangays usually come back from Nominatim as
// suburb/quarter/neighbourhood/village.
const placeFromNominatim = (item: { address?: Record<string, string>; display_name?: string }): Place => {
  const a = item.address ?? {};
  const area = a.suburb || a.quarter || a.neighbourhood || a.village || a.city_district;
  const city = a.city || a.town || a.municipality;
  const address = [a.house_number, a.road, area, city].filter(Boolean).join(', ') || item.display_name || undefined;
  return { name: area || city || undefined, address };
};

// Two free, key-less OpenStreetMap-based services, tried in order so one being down,
// rate-limited or rejecting a request doesn't take lookups down with it.
const NOMINATIM_HEADERS = { 'Accept-Language': 'en', 'User-Agent': 'CleanStream/1.0 (waste reporting app)' };
const CEBU_LAT = 10.3157;
const CEBU_LON = 123.8854;

// fetch with a timeout whose failure message says WHY it failed (HTTP status, timeout or
// no connection) instead of one generic error.
async function getJson<T>(url: string, headers: Record<string, string> | undefined, ms: number, label: string): Promise<T> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), ms);
  try {
    const res = await fetch(url, { headers, signal: controller.signal });
    if (!res.ok) throw new Error(`${label} returned ${res.status}`);
    return (await res.json()) as T;
  } catch (e) {
    if (e instanceof Error && e.name === 'AbortError') throw new Error(`${label} timed out`);
    if (e instanceof TypeError) throw new Error(`${label} unreachable`);
    throw e;
  } finally {
    clearTimeout(timer);
  }
}

interface PhotonProps {
  name?: string; street?: string; housenumber?: string;
  locality?: string; district?: string; suburb?: string; city?: string; county?: string;
}

const placeFromPhoton = (p: PhotonProps): Place => {
  const area = p.locality || p.district || p.suburb;
  const city = p.city || p.county;
  const street = p.street ? [p.housenumber, p.street].filter(Boolean).join(' ') : undefined;
  const parts = [p.name, street, area, city].filter((x): x is string => !!x);
  const address = parts.filter((x, i) => x !== parts[i - 1]).join(', ');
  return { name: area || city, address: address || undefined };
};

const reverseGeocodeOsm = async (latitude: number, longitude: number): Promise<Place | null> => {
  try {
    return placeFromNominatim(
      await getJson(
        `https://nominatim.openstreetmap.org/reverse?format=jsonv2&lat=${latitude}&lon=${longitude}&zoom=18&addressdetails=1`,
        NOMINATIM_HEADERS, 8000, 'Nominatim',
      ),
    );
  } catch {
    // fall through to Photon
  }
  try {
    const data = await getJson<{ features?: Array<{ properties: PhotonProps }> }>(
      `https://photon.komoot.io/reverse?lat=${latitude}&lon=${longitude}`,
      undefined, 8000, 'Photon',
    );
    const f = data.features?.[0];
    return f ? placeFromPhoton(f.properties) : null;
  } catch {
    return null;
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

  // Only trust a geocoded name if it is a real Cebu City barangay; otherwise use the GPS-nearest
  // one. The name and the id must agree: the geocoder sometimes answers with the city ("Cebu"),
  // and reports were then labelled "Cebu" while being filed under the nearest barangay.
  const matched = place?.name ? findBarangayByName(place.name) : undefined;
  const name = matched?.name ?? nearest.name;
  return {
    place,
    loc: {
      latitude,
      longitude,
      ...(accuracy ? { accuracy } : {}),
      timestamp,
      barangay: name,
      barangayId: matched?.id ?? nearest.id,
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
      getCurrentPosition({ accuracy: Location.Accuracy.High }),
      30000,
    );
  } catch {
    // High accuracy (GPS-only) can stall with a weak signal.
  }

  try {
    return await withTimeout(
      getCurrentPosition({ accuracy: Location.Accuracy.Balanced }),
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

  const subscription = await watchPosition(
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

// ─── Manual place search (when GPS can't get a fix) ───────────────────────────

export interface PlaceResult {
  id: string;
  title: string;
  subtitle: string;
  latitude: number;
  longitude: number;
  place: Place;
}

/** Forward-geocodes free text ("Colon Street", "Guadalupe") via OpenStreetMap,
 * biased toward Cebu City. */
export const searchPlaces = async (query: string): Promise<PlaceResult[]> => {
  const q = query.trim();
  if (q.length < 2) return [];

  let nominatimError = '';
  try {
    const items = await getJson<Array<{ place_id: number; lat: string; lon: string; name?: string; display_name: string; address?: Record<string, string> }>>(
      `https://nominatim.openstreetmap.org/search?format=jsonv2&addressdetails=1&limit=8&countrycodes=ph&viewbox=123.70,10.50,124.05,10.15&q=${encodeURIComponent(q)}`,
      NOMINATIM_HEADERS, 10000, 'Nominatim',
    );
    return items.map((it) => {
      const place = placeFromNominatim(it);
      return {
        id: String(it.place_id),
        title: it.name || place.address?.split(',')[0] || it.display_name.split(',')[0],
        subtitle: it.display_name,
        latitude: parseFloat(it.lat),
        longitude: parseFloat(it.lon),
        place,
      };
    });
  } catch (e) {
    nominatimError = e instanceof Error ? e.message : 'Nominatim failed';
  }

  try {
    const data = await getJson<{ features?: Array<{ geometry: { coordinates: [number, number] }; properties: PhotonProps & { osm_id?: number } }> }>(
      `https://photon.komoot.io/api/?q=${encodeURIComponent(q)}&lat=${CEBU_LAT}&lon=${CEBU_LON}&bbox=123.70,10.15,124.05,10.50&limit=8`,
      undefined, 15000, 'Photon',
    );
    return (data.features ?? []).map((f, i) => {
      const place = placeFromPhoton(f.properties);
      return {
        id: `${f.properties.osm_id ?? i}-${i}`,
        title: f.properties.name || place.address?.split(',')[0] || q,
        subtitle: place.address ?? q,
        latitude: f.geometry.coordinates[1],
        longitude: f.geometry.coordinates[0],
        place,
      };
    });
  } catch (e) {
    const photonError = e instanceof Error ? e.message : 'Photon failed';
    throw new Error(`${nominatimError}; ${photonError}`);
  }
};

/** Turns a chosen search result into a GeoLocation (no extra geocoding request). */
export const locationFromPlaceResult = async (r: PlaceResult): Promise<GeoLocation> => {
  const { loc } = await enrichPosition(
    { latitude: r.latitude, longitude: r.longitude, accuracy: null },
    Date.now(),
    r.place,
  );
  return loc;
};

/** The street address and barangay for a spot the reporter pinned on the map. */
export const locationAtPoint = async (latitude: number, longitude: number): Promise<GeoLocation> => {
  const { loc } = await enrichPosition({ latitude, longitude, accuracy: null }, Date.now());
  return { ...loc, source: 'pin' };
};
