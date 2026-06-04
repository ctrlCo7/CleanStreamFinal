import * as Location from 'expo-location';
import { GeoLocation } from '../types';

const CEBU_BARANGAYS: { name: string; lat: number; lng: number }[] = [
  { name: 'Punta Princesa', lat: 10.3157, lng: 123.8854 },
  { name: 'Guadalupe', lat: 10.3180, lng: 123.8920 },
  { name: 'Labangon', lat: 10.3090, lng: 123.8780 },
  { name: 'Mambaling', lat: 10.3050, lng: 123.8700 },
  { name: 'Kinasang-an', lat: 10.3220, lng: 123.8990 },
  { name: 'Kamputhaw', lat: 10.3350, lng: 123.9050 },
  { name: 'Kamagayan', lat: 10.3040, lng: 123.8990 },
  { name: 'Tinago', lat: 10.2970, lng: 123.9010 },
  { name: 'Basak San Nicolas', lat: 10.2950, lng: 123.8880 },
  { name: 'Tejero', lat: 10.3120, lng: 123.8820 },
];

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

export const getNearestBarangay = (lat: number, lng: number): string => {
  let nearest = CEBU_BARANGAYS[0];
  let minDist = Infinity;
  for (const b of CEBU_BARANGAYS) {
    const dist = haversineDistance(lat, lng, b.lat, b.lng);
    if (dist < minDist) {
      minDist = dist;
      nearest = b;
    }
  }
  return nearest.name;
};

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
  const barangay = getNearestBarangay(latitude, longitude);

  return {
    latitude,
    longitude,
    accuracy: accuracy || undefined,
    timestamp: loc.timestamp,
    barangay,
    address: `${latitude.toFixed(4)}°N, ${longitude.toFixed(4)}°E`,
  };
};

export const watchLocation = (
  callback: (loc: GeoLocation) => void,
) => {
  let subscription: Location.LocationSubscription | null = null;

  Location.watchPositionAsync(
    { accuracy: Location.Accuracy.High, distanceInterval: 10 },
    (loc) => {
      const { latitude, longitude, accuracy } = loc.coords;
      callback({
        latitude,
        longitude,
        accuracy: accuracy || undefined,
        timestamp: loc.timestamp,
        barangay: getNearestBarangay(latitude, longitude),
        address: `${latitude.toFixed(4)}°N, ${longitude.toFixed(4)}°E`,
      });
    },
  ).then((sub) => { subscription = sub; });

  return () => subscription?.remove();
};
