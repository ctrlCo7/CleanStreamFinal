import React, { useEffect, useMemo, useRef, useState } from 'react';
import { StyleProp, StyleSheet, View, ViewStyle } from 'react-native';
import { WebView, WebViewMessageEvent } from './WebViewCompat';
import { useTheme } from '../../hooks/useTheme';
import { TRUCK_SVG, teardropPinHtml } from '../map/mapIconsHtml';
import { glideJs, mapHead, mapInitJs, zoomForDelta } from '../map/openFreeMap';

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

/** A cleanup truck on its way (officials' and Admin's map). */
export interface OsmTruck {
  id: string;
  latitude: number;
  longitude: number;
  heading: number;
  /** Road corners to drive through and how long to take (truckMotion.ts). */
  via?: Array<{ latitude: number; longitude: number }>;
  durationMs?: number;
  /** Plain text shown when the truck is tapped. */
  label: string;
}

/** A shaded circle on the map (e.g. a dumping hotspot). */
export interface OsmArea { id: string; latitude: number; longitude: number; radiusM: number; color: string }

interface OsmMapViewProps {
  region: OsmMapRegion;
  markers: OsmMarker[];
  trucks?: OsmTruck[];
  areas?: OsmArea[];
  onMarkerPress?: (id: string) => void;
  onTruckPress?: (id: string) => void;
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

const markersPayload = (markers: OsmMarker[]) =>
  markers.map((m) => ({
    id: m.id, latitude: m.latitude, longitude: m.longitude,
    html: teardropPinHtml(m.color, !!m.glow), popupHtml: m.popupHtml ?? null,
  }));

const buildHtml = (region: OsmMapRegion, interactive: boolean, dark: boolean): string => `<!DOCTYPE html>
<html><head>${mapHead(dark)}</head>
<body><div id="map"></div>
<script>
  ${mapInitJs({ dark, latitude: region.latitude, longitude: region.longitude, zoom: zoomForDelta(region.longitudeDelta), interactive })}
  ${glideJs}

  // Report pins: added, moved or removed by id, so updates never reload the map.
  var pins = {};
  window.csSetMarkers = function (list) {
    var seen = {};
    list.forEach(function (m) {
      seen[m.id] = true;
      var p = pins[m.id];
      if (!p || p.html !== m.html) {
        if (p) p.marker.remove();
        var el = document.createElement('div');
        el.innerHTML = m.html;
        var marker = new maplibregl.Marker({ element: el, anchor: 'bottom' }).setLngLat([m.longitude, m.latitude]);
        if (m.popupHtml) marker.setPopup(new maplibregl.Popup({ offset: 36, maxWidth: '240px' }).setHTML(m.popupHtml));
        else if (${interactive ? 'true' : 'false'}) el.addEventListener('click', function () { csPost('pin:' + m.id); });
        marker.addTo(map);
        pins[m.id] = { marker: marker, html: m.html };
      } else {
        p.marker.setLngLat([m.longitude, m.latitude]);
      }
    });
    Object.keys(pins).forEach(function (id) { if (!seen[id]) { pins[id].marker.remove(); delete pins[id]; } });
  };

  // Trucks on the road: glide between GPS updates and face the way they drive.
  var trucks = {};
  window.csSetTrucks = function (list) {
    var seen = {};
    list.forEach(function (t) {
      seen[t.id] = true;
      var tr = trucks[t.id];
      if (!tr) {
        var el = document.createElement('div');
        el.className = 'cs-truck';
        el.innerHTML = ${JSON.stringify(TRUCK_SVG.replace(/\n/g, ''))};
        el.title = t.label;
        el.addEventListener('click', function () { csPost('truck:' + t.id); });
        tr = trucks[t.id] = { marker: new maplibregl.Marker({ element: el, rotationAlignment: 'map', pitchAlignment: 'map' })
          .setLngLat([t.longitude, t.latitude]).addTo(map), state: {} };
      }
      csGlide(tr.marker, tr.state, t);
    });
    Object.keys(trucks).forEach(function (id) { if (!seen[id]) { trucks[id].marker.remove(); delete trucks[id]; } });
  };

  // Shaded circles (hotspots), drawn under the pins; re-added whenever a style loads.
  var areasData = { type: 'FeatureCollection', features: [] };
  function circle(a) {
    var pts = [], k = Math.cos(a.latitude * Math.PI / 180);
    for (var i = 0; i <= 48; i++) {
      var t = i / 48 * 2 * Math.PI;
      pts.push([a.longitude + (a.radiusM * Math.sin(t)) / (111320 * k), a.latitude + (a.radiusM * Math.cos(t)) / 111320]);
    }
    return { type: 'Feature', properties: { color: a.color }, geometry: { type: 'Polygon', coordinates: [pts] } };
  }
  csOnStyle(function () {
    if (!map.getSource('cs-areas')) map.addSource('cs-areas', { type: 'geojson', data: areasData });
    if (!map.getLayer('cs-areas-fill')) map.addLayer({ id: 'cs-areas-fill', type: 'fill', source: 'cs-areas', paint: { 'fill-color': ['get', 'color'], 'fill-opacity': 0.18 } });
    if (!map.getLayer('cs-areas-line')) map.addLayer({ id: 'cs-areas-line', type: 'line', source: 'cs-areas', paint: { 'line-color': ['get', 'color'], 'line-width': 2, 'line-dasharray': [2, 1.5] } });
  });
  window.csSetAreas = function (list) {
    areasData = { type: 'FeatureCollection', features: list.map(circle) };
    var src = map.getSource && map.getSource('cs-areas');
    if (src) src.setData(areasData);
  };

  window.csNavigate = function (id) { csPost('pin:' + id); };
  // Ask the app for the pins and trucks now that the functions above exist.
  csPost('ready');
</script></body></html>`;

// JSON for injected JavaScript. Line/paragraph separators (which can come in with report
// text) are valid in JSON but break the whole script in older Android WebViews.
const toJs = (value: unknown) => JSON.stringify(value).replace(/\u2028/g, '\\u2028').replace(/\u2029/g, '\\u2029');

/**
 * Map for phones without Google services (most Huawei phones) and the fallback when Google
 * Maps or Apple Maps can't start: MapLibre drawing OpenFreeMap's vector map in a WebView.
 * Needs no Google Play Services, API key or account.
 */
export function OsmMapView({
  region, markers, trucks = [], areas = [], onMarkerPress, onTruckPress, interactive = true, style,
}: OsmMapViewProps) {
  const ref = useRef<WebView>(null);
  const { isDark } = useTheme();
  const [loaded, setLoaded] = useState(false);
  // Built once per theme; pins and trucks are pushed in afterwards.
  const firstRegion = useRef(region).current;
  const html = useMemo(() => buildHtml(firstRegion, interactive, isDark), [firstRegion, interactive, isDark]);
  useEffect(() => setLoaded(false), [html]);

  const sendMarkers = () =>
    ref.current?.injectJavaScript(`window.csSetMarkers && window.csSetMarkers(${toJs(markersPayload(markers))}); true;`);
  const sendTrucks = () =>
    ref.current?.injectJavaScript(`window.csSetTrucks && window.csSetTrucks(${toJs(trucks)}); true;`);

  useEffect(() => {
    if (loaded) sendMarkers();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [markers, loaded]);

  const sendAreas = () =>
    ref.current?.injectJavaScript(`window.csSetAreas && window.csSetAreas(${toJs(areas)}); true;`);
  useEffect(() => {
    if (loaded) sendAreas();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [areas, loaded]);

  useEffect(() => {
    if (loaded) sendTrucks();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [trucks, loaded]);

  const handleMessage = (event: WebViewMessageEvent) => {
    const msg = event.nativeEvent.data;
    // The page is set up: send what it has (it may have missed earlier sends).
    if (msg === 'ready') {
      setLoaded(true);
      sendMarkers();
      sendTrucks();
      sendAreas();
    } else if (msg.startsWith('pin:')) onMarkerPress?.(msg.slice(4));
    else if (msg.startsWith('truck:')) onTruckPress?.(msg.slice(6));
  };

  return (
    <View style={[styles.container, style]}>
      <WebView
        ref={ref}
        source={{ html }}
        originWhitelist={['*']}
        style={styles.webview}
        onMessage={handleMessage}
        onLoadEnd={() => setLoaded(true)}
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
