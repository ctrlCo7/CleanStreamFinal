import * as Location from 'expo-location';
import { Platform } from 'react-native';
import type { GeolocationResponse } from '@react-native-community/geolocation';

// Loaded only when needed (phones without Google Play services): its native module throws as
// soon as it is imported where it isn't built in, e.g. in Expo Go, which would stop the app.
type GeolocationApi = typeof import('@react-native-community/geolocation').default;
let geo: GeolocationApi | null = null;
const loadGeolocation = (): GeolocationApi => {
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  if (!geo) geo = (require('@react-native-community/geolocation') as { default: GeolocationApi }).default;
  return geo;
};

// expo-location on Android only works through Google Play services. Phones without them
// (Huawei, some Chinese-market phones) fail with "LocationServices.API is not available".
// There we switch to Android's own GPS and network location through
// @react-native-community/geolocation.

let noPlayServices = false;
let configured = false;

const isPlayServicesError = (e: unknown) =>
  /LocationServices\.API|SERVICE_(INVALID|MISSING|DISABLED)|Google Play services/i.test(
    String((e as Error)?.message ?? e),
  );

/** True once this phone has been found to have no Google Play services. */
export const lacksPlayServices = () => noPlayServices;

const plainAndroid = () => {
  const Geolocation = loadGeolocation();
  if (!configured) {
    Geolocation.setRNConfiguration({ skipPermissionRequests: true, locationProvider: 'android' });
    configured = true;
  }
  return Geolocation;
};

const toLocationObject = (p: GeolocationResponse): Location.LocationObject => ({
  coords: {
    latitude: p.coords.latitude,
    longitude: p.coords.longitude,
    altitude: p.coords.altitude ?? null,
    accuracy: p.coords.accuracy ?? null,
    altitudeAccuracy: p.coords.altitudeAccuracy ?? null,
    heading: p.coords.heading ?? null,
    speed: p.coords.speed ?? null,
  },
  timestamp: p.timestamp,
});

const highAccuracy = (a?: Location.Accuracy) => a == null || a >= Location.Accuracy.High;

const androidCurrentPosition = (options: Location.LocationOptions) =>
  new Promise<Location.LocationObject>((resolve, reject) => {
    plainAndroid().getCurrentPosition(
      (p) => resolve(toLocationObject(p)),
      (e) => reject(new Error(e.message || 'Unable to determine current location')),
      { enableHighAccuracy: highAccuracy(options.accuracy), timeout: 30000, maximumAge: 10000 },
    );
  });

/** Same as Location.getCurrentPositionAsync, but also works without Google Play services. */
export async function getCurrentPosition(options: Location.LocationOptions = {}): Promise<Location.LocationObject> {
  if (noPlayServices) return androidCurrentPosition(options);
  try {
    return await Location.getCurrentPositionAsync(options);
  } catch (e) {
    if (Platform.OS !== 'android' || !isPlayServicesError(e)) throw e;
    noPlayServices = true;
    return androidCurrentPosition(options);
  }
}

/** Same as Location.watchPositionAsync, but also works without Google Play services. */
export async function watchPosition(
  options: Location.LocationOptions,
  callback: (loc: Location.LocationObject) => void,
): Promise<Location.LocationSubscription> {
  const androidWatch = () => {
    const id = plainAndroid().watchPosition(
      (p) => callback(toLocationObject(p)),
      (e) => console.warn('[Location] Watch error:', e.message),
      {
        enableHighAccuracy: highAccuracy(options.accuracy),
        distanceFilter: options.distanceInterval ?? 0,
        interval: options.timeInterval ?? 5000,
      },
    );
    return { remove: () => loadGeolocation().clearWatch(id) };
  };
  if (noPlayServices) return androidWatch();

  let sub: Location.LocationSubscription = await Location.watchPositionAsync(options, callback);
  // Without Play services the watch above starts without error but never reports anything,
  // so ask once for a quick position: if that fails for lack of Play services, switch over.
  if (Platform.OS === 'android') {
    let removed = false;
    Location.getCurrentPositionAsync({ accuracy: Location.Accuracy.Lowest }).catch((e) => {
      if (!isPlayServicesError(e) || removed) return;
      noPlayServices = true;
      sub.remove();
      sub = androidWatch();
    });
    return { remove: () => { removed = true; sub.remove(); } };
  }
  return sub;
}
