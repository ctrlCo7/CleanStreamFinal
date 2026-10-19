import { Platform } from 'react-native';

const constants = (Platform.constants ?? {}) as { Brand?: string; Manufacturer?: string };
const maker = `${constants.Brand ?? ''} ${constants.Manufacturer ?? ''}`.toLowerCase();

// Recent Huawei/Honor phones ship without Google Play Services, so Google Maps can
// never start there -- fall back to OpenStreetMap quickly instead of waiting.
export const LIKELY_NO_GOOGLE_SERVICES = Platform.OS === 'android' && /huawei|honor/.test(maker);

// How long to wait for Google Maps to report ready before giving up on it. Phones with
// Google services can take several seconds on first map init, so they get a generous
// window; that's what stops a working Google Maps from being swapped for the fallback.
export const MAP_READY_TIMEOUT_MS = LIKELY_NO_GOOGLE_SERVICES ? 3000 : 15000;
