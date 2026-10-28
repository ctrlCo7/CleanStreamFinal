import React from 'react';
import { StyleSheet, View } from 'react-native';
import Svg, { Circle, Path, Rect } from 'react-native-svg';
import { MAP_COLORS } from './mapColors';

export { TEARDROP_CSS, TRUCK_SVG, teardropPinHtml } from './mapIconsHtml';

/**
 * A garbage truck seen from above, nose pointing up (north), so rotating it by the
 * heading makes it face the way it's driving, like the car in a ride-hailing app.
 * TRUCK_SVG is the same drawing as HTML, for the OpenStreetMap (WebView) map.
 */
export function TruckIcon({ size = 44, color = MAP_COLORS.truck }: { size?: number; color?: string }) {
  return (
    <Svg width={size} height={size} viewBox="0 0 44 44">
      <Circle cx="22" cy="22" r="20" fill={color} opacity={0.18} />
      <Rect x="14" y="6" width="16" height="11" rx="4" fill={color} stroke="#fff" strokeWidth="2" />
      <Rect x="16.5" y="8" width="11" height="4" rx="1.5" fill="#bdf0dd" />
      <Rect x="13" y="16" width="18" height="22" rx="3" fill="#1D9E75" stroke="#fff" strokeWidth="2" />
      <Path d="M17 21h10M17 26h10M17 31h10" stroke="#ffffff" strokeOpacity={0.7} strokeWidth="1.6" strokeLinecap="round" />
    </Svg>
  );
}


/**
 * Teardrop map pin. The tip is the exact location, so use it with
 * <Marker anchor={{ x: 0.5, y: 1 }}>. `glow` adds a soft halo for the worst reports.
 */
export function TeardropPin({ color, glow = false, icon }: { color: string; glow?: boolean; icon?: React.ReactNode }) {
  return (
    <View style={styles.wrap}>
      {glow && <View style={[styles.glow, { backgroundColor: color }]} />}
      <View style={[styles.drop, { backgroundColor: color }]}>
        <View style={styles.inner}>{icon}</View>
      </View>
    </View>
  );
}


const styles = StyleSheet.create({
  wrap: { width: 34, height: 42, alignItems: 'center' },
  glow: { position: 'absolute', top: -3, width: 40, height: 40, borderRadius: 20, opacity: 0.22 },
  drop: {
    marginTop: 2, width: 28, height: 28, borderRadius: 14, borderBottomLeftRadius: 0,
    transform: [{ rotate: '-45deg' }], borderWidth: 2.5, borderColor: '#fff',
    alignItems: 'center', justifyContent: 'center',
    shadowColor: '#000', shadowOffset: { width: 0, height: 3 }, shadowOpacity: 0.3, shadowRadius: 4, elevation: 4,
  },
  inner: {
    transform: [{ rotate: '45deg' }], minWidth: 10, minHeight: 10, borderRadius: 8, backgroundColor: '#fff',
    alignItems: 'center', justifyContent: 'center',
  },
});
