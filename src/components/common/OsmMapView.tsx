import React, { useMemo, useRef } from 'react';
import { StyleProp, StyleSheet, View, ViewStyle } from 'react-native';
import { WebView, WebViewMessageEvent } from 'react-native-webview';

export interface OsmMapRegion {
  latitude: number;
  longitude: number;
  latitudeDelta: number;
  longitudeDelta: number;
}

export interface OsmMarker {
  id: string;
  latitude: number;
  longitude: number;
  color: string;
  glow?: boolean;
  /** Pre-built popup HTML (already escaped). Omit for a plain, popup-less dot. */
  popupHtml?: string;
}

interface OsmMapViewProps {
  region: OsmMapRegion;
  markers: OsmMarker[];
  onMarkerPress?: (id: string) => void;
  /** Pan/zoom/tap enabled. Set false for a static preview widget. */
  interactive?: boolean;
  style?: StyleProp<ViewStyle>;
}

export const escapeHtml = (value: string): string =>
  value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');

const regionToZoom = (longitudeDelta: number): number => {
  const zoom = Math.round(Math.log2(360 / Math.max(longitudeDelta, 0.0001)));
  return Math.min(19, Math.max(2, zoom));
};

const buildHtml = (region: OsmMapRegion, markers: OsmMarker[], interactive: boolean): string => {
  const zoom = regionToZoom(region.longitudeDelta);
  const interactiveJs = interactive ? 'true' : 'false';
  const markersJson = JSON.stringify(
    markers.map((m) => ({
      id: m.id,
      latitude: m.latitude,
      longitude: m.longitude,
      color: m.color,
      glow: !!m.glow,
      popupHtml: m.popupHtml ?? null,
    })),
  );

  return `<!DOCTYPE html>
<html>
<head>
<meta name="viewport" content="width=device-width, initial-scale=1.0, maximum-scale=1.0, user-scalable=no" />
<link rel="stylesheet" href="https://unpkg.com/leaflet@1.9.4/dist/leaflet.css" />
<style>
  html, body, #map { height: 100%; margin: 0; padding: 0; background: #D4EFE4; }
  .cs-pin-wrap { position: relative; width: 22px; height: 22px; }
  .cs-pin-glow { position: absolute; top: -8px; left: -8px; width: 38px; height: 38px; border-radius: 19px; opacity: 0.22; }
  .cs-pin { width: 22px; height: 22px; border-radius: 11px; border: 3px solid #fff; box-shadow: 0 2px 4px rgba(0,0,0,0.35); box-sizing: border-box; }
  .leaflet-popup-content img { width: 100%; border-radius: 8px; margin-bottom: 6px; display: block; }
  .leaflet-popup-content { margin: 10px; font-family: -apple-system, Roboto, sans-serif; }
  .cs-popup-tap { color: #2E86DE; font-size: 11px; font-weight: 600; margin-top: 6px; display: block; }
</style>
</head>
<body>
<div id="map"></div>
<script src="https://unpkg.com/leaflet@1.9.4/dist/leaflet.js"></script>
<script>
  var markers = ${markersJson};
  var map = L.map('map', {
    zoomControl: ${interactiveJs},
    dragging: ${interactiveJs},
    scrollWheelZoom: ${interactiveJs},
    doubleClickZoom: ${interactiveJs},
    touchZoom: ${interactiveJs},
    boxZoom: ${interactiveJs},
    keyboard: ${interactiveJs},
    attributionControl: true,
  }).setView([${region.latitude}, ${region.longitude}], ${zoom});

  map.attributionControl.setPrefix(false);
  L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
    maxZoom: 19,
    attribution: '© OpenStreetMap contributors',
  }).addTo(map);

  window.csNavigate = function (id) {
    if (window.ReactNativeWebView) window.ReactNativeWebView.postMessage(id);
  };

  markers.forEach(function (m) {
    var icon = L.divIcon({
      className: '',
      html: '<div class="cs-pin-wrap">' +
        (m.glow ? '<div class="cs-pin-glow" style="background:' + m.color + '"></div>' : '') +
        '<div class="cs-pin" style="background:' + m.color + '"></div>' +
      '</div>',
      iconSize: [22, 22],
      iconAnchor: [11, 11],
    });
    var marker = L.marker([m.latitude, m.longitude], { icon: icon }).addTo(map);
    if (m.popupHtml) {
      marker.bindPopup(m.popupHtml, { maxWidth: 220 });
    } else if (${interactiveJs}) {
      marker.on('click', function () { window.csNavigate(m.id); });
    }
  });
</script>
</body>
</html>`;
};

/**
 * OpenStreetMap/Leaflet-based map rendered in a WebView. Used as a fallback
 * wherever react-native-maps (Google Maps) can't run -- most notably on
 * Huawei phones without Google Play Services, where PROVIDER_GOOGLE crashes
 * on init. Has no dependency on Google Play Services at all.
 */
export function OsmMapView({ region, markers, onMarkerPress, interactive = true, style }: OsmMapViewProps) {
  const webviewRef = useRef<WebView>(null);

  const html = useMemo(() => buildHtml(region, markers, interactive), [region, markers, interactive]);

  const handleMessage = (event: WebViewMessageEvent) => {
    const id = event.nativeEvent.data;
    if (id && onMarkerPress) onMarkerPress(id);
  };

  return (
    <View style={[styles.container, style]}>
      <WebView
        ref={webviewRef}
        source={{ html }}
        originWhitelist={['*']}
        style={styles.webview}
        onMessage={handleMessage}
        javaScriptEnabled
        domStorageEnabled
        scrollEnabled={false}
        showsVerticalScrollIndicator={false}
        showsHorizontalScrollIndicator={false}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  webview: { flex: 1, backgroundColor: 'transparent' },
});
