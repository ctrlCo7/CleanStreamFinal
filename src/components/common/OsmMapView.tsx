import React, { useMemo, useRef } from 'react';
import { StyleProp, StyleSheet, View, ViewStyle } from 'react-native';
import { WebView, WebViewMessageEvent } from 'react-native-webview';
import { useTheme } from '../../hooks/useTheme';
import { TEARDROP_CSS, teardropPinHtml } from '../map/MapIcons';

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
  /** Pre-built popup HTML (already escaped). Omit for a plain, popup-less pin. */
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

export const regionToZoom = (longitudeDelta: number): number => {
  const zoom = Math.round(Math.log2(360 / Math.max(longitudeDelta, 0.0001)));
  return Math.min(19, Math.max(2, zoom));
};

/**
 * Base map tiles: CARTO Voyager (light) or Dark Matter (dark), which are much cleaner than
 * the default OpenStreetMap tiles, with OpenStreetMap's own tiles as an automatic fallback
 * if CARTO can't be reached. Expects a Leaflet map in `map`. Shared with OsmTrackingView.
 */
export const osmTilesJs = (dark: boolean) => `
  var tiles = L.tileLayer('https://{s}.basemaps.cartocdn.com/${dark ? 'dark_all' : 'rastertiles/voyager'}/{z}/{x}/{y}{r}.png', {
    maxZoom: 20, subdomains: 'abcd', attribution: '&copy; OpenStreetMap contributors &copy; CARTO'
  }).addTo(map);
  var tileErrors = 0;
  tiles.on('tileerror', function () {
    if (++tileErrors !== 4) return;
    map.removeLayer(tiles);
    L.tileLayer('https://tile.openstreetmap.org/{z}/{x}/{y}.png', {
      maxZoom: 19, attribution: '&copy; OpenStreetMap contributors'
    }).addTo(map);
  });
`;

export const osmBaseCss = (dark: boolean) => `
  html, body, #map { height: 100%; margin: 0; padding: 0; background: ${dark ? '#1b1f1e' : '#eef2ef'}; }
  .leaflet-control-attribution { font-size: 9px; }
  .leaflet-bar { border: none !important; box-shadow: 0 2px 8px rgba(0,0,0,0.22) !important; border-radius: 10px !important; overflow: hidden; }
  .leaflet-bar a { width: 34px !important; height: 34px !important; line-height: 34px !important; }
  .leaflet-popup-content-wrapper { border-radius: 12px; }
  .leaflet-popup-content { margin: 10px; font-family: -apple-system, Roboto, sans-serif; }
  .leaflet-popup-content img { width: 100%; border-radius: 8px; margin-bottom: 6px; display: block; }
  .cs-popup-tap { color: #1D9E75; font-size: 11px; font-weight: 700; margin-top: 6px; display: block; }
  ${TEARDROP_CSS}
`;

const buildHtml = (region: OsmMapRegion, markers: OsmMarker[], interactive: boolean, dark: boolean): string => {
  const zoom = regionToZoom(region.longitudeDelta);
  const interactiveJs = interactive ? 'true' : 'false';
  const markersJson = JSON.stringify(
    markers.map((m) => ({
      id: m.id,
      latitude: m.latitude,
      longitude: m.longitude,
      html: teardropPinHtml(m.color, !!m.glow),
      popupHtml: m.popupHtml ?? null,
    })),
  );

  return `<!DOCTYPE html>
<html>
<head>
<meta name="viewport" content="width=device-width, initial-scale=1.0, maximum-scale=1.0, user-scalable=no" />
<link rel="stylesheet" href="https://unpkg.com/leaflet@1.9.4/dist/leaflet.css" />
<style>${osmBaseCss(dark)}</style>
</head>
<body>
<div id="map"></div>
<script src="https://unpkg.com/leaflet@1.9.4/dist/leaflet.js"></script>
<script>
  var markers = ${markersJson};
  var map = L.map('map', {
    zoomControl: false,
    dragging: ${interactiveJs},
    scrollWheelZoom: ${interactiveJs},
    doubleClickZoom: ${interactiveJs},
    touchZoom: ${interactiveJs},
    boxZoom: ${interactiveJs},
    keyboard: ${interactiveJs},
    attributionControl: true,
  }).setView([${region.latitude}, ${region.longitude}], ${zoom});
  if (${interactiveJs}) L.control.zoom({ position: 'bottomright' }).addTo(map);
  map.attributionControl.setPrefix(false);
  ${osmTilesJs(dark)}

  window.csNavigate = function (id) {
    if (window.ReactNativeWebView) window.ReactNativeWebView.postMessage(id);
  };

  markers.forEach(function (m) {
    var icon = L.divIcon({ className: '', html: m.html, iconSize: [34, 42], iconAnchor: [17, 40], popupAnchor: [0, -36] });
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
 * OpenStreetMap/Leaflet-based map rendered in a WebView. Used wherever react-native-maps
 * (Google Maps) can't run -- most notably on Huawei phones without Google Play Services,
 * where PROVIDER_GOOGLE crashes on init. Has no dependency on Google Play Services at all.
 */
export function OsmMapView({ region, markers, onMarkerPress, interactive = true, style }: OsmMapViewProps) {
  const webviewRef = useRef<WebView>(null);
  const { isDark } = useTheme();

  const html = useMemo(() => buildHtml(region, markers, interactive, isDark), [region, markers, interactive, isDark]);

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
