import React, { useEffect, useMemo, useRef, useState } from 'react';
import { StyleProp, StyleSheet, View, ViewStyle } from 'react-native';
import { WebView, WebViewMessageEvent } from 'react-native-webview';
import { MAP_COLORS } from './mapTheme';
import { TRUCK_SVG, teardropPinHtml } from './mapIconsHtml';
import { glideJs, mapHead, mapInitJs } from './openFreeMap';

export interface TrackingFrame {
  truck: { latitude: number; longitude: number; heading: number };
  /** Route still ahead of the truck. */
  ahead: Array<{ latitude: number; longitude: number }>;
  destination: { latitude: number; longitude: number };
  /** True when the route is a straight line (no road route available). */
  straight: boolean;
  follow: boolean;
  /** Crew leader's phone: close, tilted view turned the way the truck drives. */
  driver?: boolean;
}

interface Props {
  frame: TrackingFrame;
  dark: boolean;
  onUserPan?: () => void;
  style?: StyleProp<ViewStyle>;
}

/**
 * Live truck tracking on OpenFreeMap (MapLibre in a WebView), for phones without Google
 * services and as the fallback. The page is built once; each GPS update is pushed into it,
 * and the page glides and turns the truck itself, so nothing reloads or flickers.
 */
export function OsmTrackingView({ frame, dark, onUserPan, style }: Props) {
  const ref = useRef<WebView>(null);
  const [loaded, setLoaded] = useState(false);
  const first = useRef(frame).current;

  const html = useMemo(() => `<!DOCTYPE html>
<html><head>${mapHead(dark)}</head>
<body><div id="map"></div>
<script>
  ${mapInitJs({ dark, latitude: first.truck.latitude, longitude: first.truck.longitude, zoom: 14, interactive: true })}
  ${glideJs}

  var latest = null, follow = true, fitted = false;
  var empty = { type: 'Feature', properties: {}, geometry: { type: 'LineString', coordinates: [] } };
  function routeData() {
    return !latest ? empty : { type: 'Feature', properties: {}, geometry: { type: 'LineString',
      coordinates: latest.ahead.map(function (p) { return [p.longitude, p.latitude]; }) } };
  }
  // Route layers live in the style, so they are (re)added whenever a style finishes loading.
  csOnStyle(function () {
    if (!map.getSource('route')) map.addSource('route', { type: 'geojson', data: routeData() });
    if (!map.getLayer('route-casing')) map.addLayer({ id: 'route-casing', type: 'line', source: 'route',
      layout: { 'line-cap': 'round', 'line-join': 'round' }, paint: { 'line-color': '${MAP_COLORS.routeCasing}', 'line-width': 9 } });
    if (!map.getLayer('route-line')) map.addLayer({ id: 'route-line', type: 'line', source: 'route',
      layout: { 'line-cap': 'round', 'line-join': 'round' }, paint: { 'line-color': '${MAP_COLORS.route}', 'line-width': 5 } });
    if (latest) map.setPaintProperty('route-line', 'line-dasharray', latest.straight ? [2, 1.5] : [1, 0]);
  });

  var destEl = document.createElement('div');
  destEl.innerHTML = '${teardropPinHtml(MAP_COLORS.destination, true, '🗑️')}';
  var dest = new maplibregl.Marker({ element: destEl, anchor: 'bottom' }).setLngLat([0, 0]);
  var truckEl = document.createElement('div');
  truckEl.className = 'cs-truck';
  truckEl.innerHTML = ${JSON.stringify(TRUCK_SVG.replace(/\n/g, ''))};
  var truck = new maplibregl.Marker({ element: truckEl, rotationAlignment: 'map', pitchAlignment: 'map' }).setLngLat([0, 0]);
  var truckState = {}, added = false;

  map.on('dragstart', function () { follow = false; csPost('pan'); });

  window.csUpdate = function (f) {
    latest = f;
    follow = f.follow;
    if (!added) { dest.addTo(map); truck.setLngLat([f.truck.longitude, f.truck.latitude]).addTo(map); added = true; }
    dest.setLngLat([f.destination.longitude, f.destination.latitude]);
    var src = map.getSource && map.getSource('route');
    if (src) { src.setData(routeData()); map.setPaintProperty('route-line', 'line-dasharray', f.straight ? [2, 1.5] : [1, 0]); }
    csGlide(truck, truckState, f.truck);

    if (f.driver && fitted && follow) {
      map.easeTo({ center: [f.truck.longitude, f.truck.latitude], zoom: 17, bearing: f.truck.heading, pitch: 45, duration: 800 });
      return;
    }
    var b = new maplibregl.LngLatBounds([f.truck.longitude, f.truck.latitude], [f.truck.longitude, f.truck.latitude]);
    b.extend([f.destination.longitude, f.destination.latitude]);
    if (!fitted) { f.ahead.forEach(function (p) { b.extend([p.longitude, p.latitude]); }); }
    if (!fitted || follow) map.fitBounds(b, { padding: 56, maxZoom: 17, duration: fitted ? 800 : 0 });
    fitted = true;
  };
  window.csUpdate(${JSON.stringify(first)});
</script></body></html>`, [dark]); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => setLoaded(false), [html]);
  useEffect(() => {
    if (!loaded) return;
    ref.current?.injectJavaScript(`window.csUpdate && window.csUpdate(${JSON.stringify(frame)}); true;`);
  }, [frame, loaded]);

  const onMessage = (e: WebViewMessageEvent) => {
    if (e.nativeEvent.data === 'pan') onUserPan?.();
  };

  return (
    <View style={[styles.container, style]}>
      <WebView
        ref={ref}
        source={{ html }}
        originWhitelist={['*']}
        style={styles.webview}
        onLoadEnd={() => setLoaded(true)}
        onMessage={onMessage}
        javaScriptEnabled
        domStorageEnabled
        scrollEnabled={false}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  webview: { flex: 1, backgroundColor: 'transparent' },
});
