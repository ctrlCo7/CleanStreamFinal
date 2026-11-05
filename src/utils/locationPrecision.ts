import { GeoLocation } from '../types';

/** A GPS fix worse than this (metres) is too loose to send a crew to: ask for a pin. */
export const LOOSE_GPS_M = 40;

/** True when the report point is only a stand-in (barangay centre), not the real spot. */
export const isApproximate = (loc?: GeoLocation | null): boolean =>
  !!loc && (loc.source === 'approximate' || (!loc.source && !!loc.address?.includes('(approximate')));

/** True when the spot should be confirmed on the map before the report is sent. */
export const needsPin = (loc?: GeoLocation | null): boolean =>
  !!loc && (isApproximate(loc) || loc.source === 'search'
    || (loc.source === 'gps' && typeof loc.accuracy === 'number' && loc.accuracy > LOOSE_GPS_M));

/** One line for officials and crews: how exact the report's spot is. */
export const precisionLabel = (loc?: GeoLocation | null): string => {
  if (!loc) return '';
  if (isApproximate(loc)) return 'Approximate (barangay centre) - ask the reporter for the exact spot';
  if (loc.source === 'pin') return 'Exact spot pinned on the map by the reporter';
  if (loc.source === 'search') return 'Place picked from search (not pinned)';
  if (typeof loc.accuracy === 'number') return `Phone GPS, accurate to about ${Math.max(1, Math.round(loc.accuracy))} m`;
  return 'Phone GPS';
};
