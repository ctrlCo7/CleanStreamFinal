import React, { useEffect, useMemo, useRef, useState } from 'react';
import { StyleProp, StyleSheet, View, ViewStyle } from 'react-native';
import { WebView, WebViewMessageEvent } from 'react-native-webview';
import { osmBaseCss, osmTilesJs } from '../common/OsmMapView';
import { MAP_COLORS, } from './mapTheme';
import { TRUCK_SVG, teardropPinHtml } from './MapIcons';

export interface TrackingFrame {
  truck: { latitude: number; longitude: number; heading: number };
  /** Route still ahead of the truck. */
  ahead: Array<{ latitude: number; longitude: number }>;
  destination: { latitude: number; longitude: number };
  /** True when the route is a straight line (no road route available). */
  straight: boolean;
  follow: boolean;
}

interface Props {
  frame: TrackingFrame;
  dark: boolean;
  onUserPan?: () => void;
  style?: StyleProp<ViewStyle>;
}

/**
 * Live truck tracking on OpenStreetMap (Leaflet in a WebView), for phones without Google
 * services. The page is built once; each GPS update is pushed into it, and the page itself
 * glides and turns the truck, so nothing reloads or flickers.
 */
export function OsmTrackingView({ frame, dark, onUserPan, style }: Props) {
  const ref = useRef<WebView>(null);
  const [loaded, setLoaded] = useState(false);
  // Built from the first frame only; later frames go through csUpdate().
  const first = useRef(frame).current;

  const html = useMemo(() => `<!DOCTYPE html>
<html><head>
<meta name="viewport" content="width=device-width, initial-scale=1.0, maximum-scale=1.0, user-scalable=no" />
<link rel="stylesheet" href="https://unpkg.com/leaflet@1.9.4/dist/leaflet.css" />
<style>${osmBaseCss(dark)}
  .cs-truck { width: 44px; height: 44px; transition: none; }
</style>
</head><body><div id="map"></div>
<script src="https://unpkg.com/leaflet@1.9.4/dist/leaflet.js"></script>
<script>
  var map = L.map('map', { zoomControl: false, attributionControl: true });
  L.control.zoom({ position: 'bottomright' }).addTo(map);
  map.attributionControl.setPrefix(false);
  ${osmTilesJs(dark)}

  var casing = L.polyline([], { color: '${MAP_COLORS.routeCasing}', weight: 9, opacity: 0.9 }).addTo(map);
  var line = L.polyline([], { color: '${MAP_COLORS.route}', weight: 5 }).addTo(map);
  var dest = L.marker([0, 0], { icon: L.divIcon({ className: '', html: '${teardropPinHtml(MAP_COLORS.destination, true, '🗑️')}',
    iconSize: [34, 42], iconAnchor: [17, 40] }) }).addTo(map);
  var truck = L.marker([0, 0], { icon: L.divIcon({ className: '', html: '<div class="cs-truck" id="truck">${TRUCK_SVG.replace(/\n/g, '')}</div>',
    iconSize: [44, 44], iconAnchor: [22, 22] }), zIndexOffset: 1000 }).addTo(map);

  var shown = null, anim = 0, fitted = false, follow = true;
  map.on('dragstart', function () {
    follow = false;
    if (window.ReactNativeWebView) window.ReactNativeWebView.postMessage('pan');
  });

  function turnTo(deg) { var el = document.getElementById('truck'); if (el) el.style.transform = 'rotate(' + deg + 'deg)'; }
  function lerpAngle(a, b, t) { var d = ((b - a + 540) % 360) - 180; return (a + d * t + 360) % 360; }

  window.csUpdate = function (f) {
    follow = f.follow;
    var ll = f.ahead.map(function (p) { return [p.latitude, p.longitude]; });
    casing.setLatLngs(ll); line.setLatLngs(ll);
    line.setStyle({ dashArray: f.straight ? '10 8' : null });
    dest.setLatLng([f.destination.latitude, f.destination.longitude]);

    var to = f.truck;
    if (!shown) { shown = { lat: to.latitude, lng: to.longitude, h: to.heading }; truck.setLatLng([shown.lat, shown.lng]); turnTo(shown.h); }
    var from = { lat: shown.lat, lng: shown.lng, h: shown.h }, start = Date.now();
    cancelAnimationFrame(anim);
    (function step() {
      var t = Math.min(1, (Date.now() - start) / 1800), e = 1 - Math.pow(1 - t, 3);
      shown = { lat: from.lat + (to.latitude - from.lat) * e, lng: from.lng + (to.longitude - from.lng) * e, h: lerpAngle(from.h, to.heading, e) };
      truck.setLatLng([shown.lat, shown.lng]); turnTo(shown.h);
      if (t < 1) anim = requestAnimationFrame(step);
    })();

    var bounds = L.latLngBounds([[to.latitude, to.longitude], [f.destination.latitude, f.destination.longitude]]);
    if (!fitted) { map.fitBounds(bounds.extend(line.getBounds()), { padding: [48, 48], maxZoom: 17 }); fitted = true; }
    else if (follow) map.fitBounds(bounds, { padding: [56, 56], maxZoom: 17, animate: true });
  };
  window.csUpdate(${JSON.stringify(first)});
</script></body></html>`, [dark]); // eslint-disable-line react-hooks/exhaustive-deps

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
        scrollEnabled={false}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  webview: { flex: 1, backgroundColor: 'transparent' },
});
