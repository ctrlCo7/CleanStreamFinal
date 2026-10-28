import React from 'react';
import { StyleSheet, View } from 'react-native';
import Svg, { Circle, Path, Rect } from 'react-native-svg';
import { MAP_COLORS } from './mapTheme';

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

export const TRUCK_SVG = `<svg width="44" height="44" viewBox="0 0 44 44" xmlns="http://www.w3.org/2000/svg">
<circle cx="22" cy="22" r="20" fill="${MAP_COLORS.truck}" opacity="0.18"/>
<rect x="14" y="6" width="16" height="11" rx="4" fill="${MAP_COLORS.truck}" stroke="#fff" stroke-width="2"/>
<rect x="16.5" y="8" width="11" height="4" rx="1.5" fill="#bdf0dd"/>
<rect x="13" y="16" width="18" height="22" rx="3" fill="#1D9E75" stroke="#fff" stroke-width="2"/>
<path d="M17 21h10M17 26h10M17 31h10" stroke="#ffffff" stroke-opacity="0.7" stroke-width="1.6" stroke-linecap="round"/>
</svg>`;

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

/** The same pin as HTML/CSS for the OpenStreetMap map (anchor: bottom centre). */
export const teardropPinHtml = (color: string, glow = false, icon = '') =>
  `<div class="cs-drop-wrap">${glow ? `<div class="cs-drop-glow" style="background:${color}"></div>` : ''}`
  + `<div class="cs-drop" style="background:${color}"><div class="cs-drop-inner">${icon}</div></div></div>`;

export const TEARDROP_CSS = `
  .cs-drop-wrap { position: relative; width: 34px; height: 42px; }
  .cs-drop-glow { position: absolute; left: -5px; top: -5px; width: 44px; height: 44px; border-radius: 22px; opacity: 0.22; }
  .cs-drop { position: absolute; left: 3px; top: 2px; width: 28px; height: 28px; border-radius: 14px 14px 14px 0;
    transform: rotate(-45deg); border: 2.5px solid #fff; box-shadow: 0 3px 6px rgba(0,0,0,0.3); box-sizing: border-box;
    display: flex; align-items: center; justify-content: center; }
  .cs-drop-inner { transform: rotate(45deg); width: 10px; height: 10px; border-radius: 5px; background: #fff;
    display: flex; align-items: center; justify-content: center; font-size: 11px; line-height: 1; }
  .cs-drop-inner:not(:empty) { width: 16px; height: 16px; border-radius: 8px; background: transparent; }
`;

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
