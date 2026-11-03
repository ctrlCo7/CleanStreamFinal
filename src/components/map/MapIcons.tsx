import React, { useEffect, useMemo, useState } from 'react';
import { StyleSheet, View } from 'react-native';
import { SvgXml } from 'react-native-svg';
import { MAP_COLORS } from './mapColors';
import { truckSvg } from './mapIconsHtml';

export { TEARDROP_CSS, TRUCK_SVG, teardropPinHtml, truckSvg } from './mapIconsHtml';

/**
 * The garbage truck marker, nose pointing up (north), so rotating it by the heading makes
 * it face the way it's driving, like the car in a ride-hailing app. Same drawing as the
 * WebView maps use (truckSvg).
 */
export function TruckIcon({ size = 48, color = MAP_COLORS.truck }: { size?: number; color?: string }) {
  const xml = useMemo(() => truckSvg(color), [color]);
  return <SvgXml xml={xml} width={size} height={size} />;
}


/**
 * For <Marker tracksViewChanges={...}>. Android draws a custom marker into a picture once and
 * reuses it; with tracksViewChanges={false} from the start, many phones take that picture
 * before the pin's colour is drawn and show a blank pin. So keep it live for a moment after
 * it appears or `look` changes, then freeze it.
 */
export function useMarkerDrawing(look: string): boolean {
  const [drawing, setDrawing] = useState(true);
  useEffect(() => {
    setDrawing(true);
    const id = setTimeout(() => setDrawing(false), 800);
    return () => clearTimeout(id);
  }, [look]);
  return drawing;
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
