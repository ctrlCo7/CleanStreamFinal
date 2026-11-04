/**
 * Shared pieces of the WebView map used on phones without Google services (Huawei) and as
 * the fallback everywhere: MapLibre GL JS drawing OpenFreeMap's vector tiles (free, no API
 * key, no account). Sharp labels at every zoom, smooth zoom/rotation, light and dark styles.
 *
 * If OpenFreeMap can't be reached, the page switches itself to CARTO's raster tiles, so the
 * map never stays blank.
 */
import { TEARDROP_CSS } from './mapIconsHtml';

const MAPLIBRE = 'https://unpkg.com/maplibre-gl@4.7.1/dist/maplibre-gl';

/** OpenFreeMap styles: Liberty (colourful, Google-like, blue waterways) and Dark. */
export const openFreeMapStyle = (dark: boolean) =>
  `https://tiles.openfreemap.org/styles/${dark ? 'dark' : 'liberty'}`;

/** <head> contents: MapLibre, base CSS and the teardrop pin styles. */
export const mapHead = (dark: boolean) => `
<meta name="viewport" content="width=device-width, initial-scale=1.0, maximum-scale=1.0, user-scalable=no" />
<link rel="stylesheet" href="${MAPLIBRE}.css" />
<script src="${MAPLIBRE}.js"></script>
<style>
  html, body, #map { height: 100%; margin: 0; padding: 0; background: ${dark ? '#1a2120' : '#f5f6f2'}; }
  .maplibregl-ctrl-attrib { font-size: 9px; }
  .maplibregl-ctrl-group { border-radius: 10px !important; box-shadow: 0 2px 8px rgba(0,0,0,0.22) !important; }
  .maplibregl-ctrl-group button { width: 34px; height: 34px; }
  .maplibregl-popup-content { border-radius: 12px; padding: 10px; font-family: -apple-system, Roboto, sans-serif; box-shadow: 0 4px 14px rgba(0,0,0,0.2); }
  .maplibregl-popup-content img { width: 100%; border-radius: 8px; margin-bottom: 6px; display: block; }
  .cs-popup-tap { color: #1D9E75; font-size: 11px; font-weight: 700; margin-top: 6px; display: block; }
  .cs-truck { width: 48px; height: 48px; filter: drop-shadow(0 2px 3px rgba(0,0,0,0.25)); }
  ${TEARDROP_CSS}
</style>`;

/**
 * Creates `map` (MapLibre) with the OpenFreeMap style and the raster fallback.
 * Defines `csOnStyle(fn)`: runs fn now if the style is loaded and again after any style
 * switch (sources/layers such as the route have to be re-added then).
 */
export const mapInitJs = (opts: {
  dark: boolean; latitude: number; longitude: number; zoom: number; interactive: boolean;
  /** 3D maps: allow turning and tilting the map (two fingers, or right-drag on a computer). */
  rotate?: boolean;
  /** Show MapLibre's own zoom buttons (default true; pages with their own controls turn it off). */
  controls?: boolean;
  pitch?: number;
}) => `
  var RASTER_STYLE = { version: 8, sources: { carto: { type: 'raster', tileSize: 256,
    tiles: ['a','b','c','d'].map(function (s) { return 'https://' + s + '.basemaps.cartocdn.com/${opts.dark ? 'dark_all' : 'rastertiles/voyager'}/{z}/{x}/{y}@2x.png'; }),
    attribution: '&copy; OpenStreetMap contributors &copy; CARTO' } },
    layers: [{ id: 'carto', type: 'raster', source: 'carto' }] };
  var map = new maplibregl.Map({
    container: 'map',
    style: '${openFreeMapStyle(opts.dark)}',
    center: [${opts.longitude}, ${opts.latitude}],
    zoom: ${opts.zoom},
    interactive: ${opts.interactive ? 'true' : 'false'},
    dragRotate: ${opts.rotate ? 'true' : 'false'},
    pitchWithRotate: ${opts.rotate ? 'true' : 'false'},
    ${opts.rotate ? `maxPitch: 75, pitch: ${opts.pitch ?? 0}, antialias: true,` : ''}
    attributionControl: { compact: true },
  });
  if (${opts.interactive && opts.controls !== false ? 'true' : 'false'}) map.addControl(new maplibregl.NavigationControl({ showCompass: false }), 'bottom-right');
  if (!${opts.rotate ? 'true' : 'false'}) map.touchZoomRotate && map.touchZoomRotate.disableRotation && map.touchZoomRotate.disableRotation();

  var styleHooks = [], styleReady = false, usingFallback = false;
  window.csOnStyle = function (fn) { styleHooks.push(fn); if (styleReady) fn(); };
  map.on('style.load', function () { styleReady = true; styleHooks.forEach(function (fn) { fn(); }); });
  function useFallback() {
    if (usingFallback) return;
    usingFallback = true; styleReady = false;
    map.setStyle(RASTER_STYLE);
  }
  // OpenFreeMap unreachable (or very slow): switch to the raster tiles.
  setTimeout(function () { if (!styleReady) useFallback(); }, 8000);
  map.on('error', function (e) {
    var msg = String((e && e.error && e.error.message) || '');
    if (!styleReady && /style|fetch|network|Failed/i.test(msg)) useFallback();
  });

  window.csPost = function (msg) { if (window.ReactNativeWebView) window.ReactNativeWebView.postMessage(msg); };

  // The same look as the Google style (mapTheme.ts): no shop/business icons, vivid
  // waterways, soft parks, quiet buildings. Layers a style lacks are simply skipped.
  var CS_LOOK = ${JSON.stringify(opts.dark ? OSM_LOOK.dark : OSM_LOOK.light)};
  window.csOnStyle(function () {
    if (usingFallback) return;
    var layers = (map.getStyle() && map.getStyle().layers) || [];
    layers.forEach(function (l) {
      var sl = l['source-layer'] || '';
      try {
        if (sl === 'poi') map.setLayoutProperty(l.id, 'visibility', 'none');
        else if (l.type === 'background') map.setPaintProperty(l.id, 'background-color', CS_LOOK.land);
        else if (sl === 'water' && l.type === 'fill') map.setPaintProperty(l.id, 'fill-color', CS_LOOK.water);
        else if (sl === 'waterway' && l.type === 'line') map.setPaintProperty(l.id, 'line-color', CS_LOOK.waterway);
        else if ((sl === 'water_name' || sl === 'waterway') && l.type === 'symbol') {
          map.setPaintProperty(l.id, 'text-color', CS_LOOK.waterText);
          map.setPaintProperty(l.id, 'text-halo-color', CS_LOOK.waterHalo);
        }
        else if (sl === 'park' && l.type === 'fill') map.setPaintProperty(l.id, 'fill-color', CS_LOOK.park);
        else if (sl === 'building' && l.type === 'fill') map.setPaintProperty(l.id, 'fill-color', CS_LOOK.building);
        else if (sl === 'building' && l.type === 'fill-extrusion') map.setPaintProperty(l.id, 'fill-extrusion-color', CS_LOOK.building);
      } catch (e) { /* this style draws the layer differently: leave it as is */ }
    });
  });
`;

/** Colours for the OpenFreeMap style, matching the Google style in mapTheme.ts. */
export const OSM_LOOK = {
  light: { land: '#f5f6f2', water: '#86cbe9', waterway: '#5bb7dd', waterText: '#14607d', waterHalo: '#e2f4fb', park: '#cfe9cb', building: '#e6e8e3' },
  dark: { land: '#1a2120', water: '#0d4a5f', waterway: '#1b6a85', waterText: '#7fcbe3', waterHalo: '#0d4a5f', park: '#1d3027', building: '#232b29' },
};

/**
 * Glides a MapLibre marker to a new position and turns it the short way round, like a
 * vehicle in a delivery app. `state` keeps the marker's current position between calls.
 * With `to.via` (road corners) and `to.durationMs` it drives along the road at a steady
 * speed, turning at each corner (same as useGlide on Google/Apple maps).
 */
export const glideJs = `
  function csLerpAngle(a, b, t) { var d = ((b - a + 540) % 360) - 180; return (a + d * t + 360) % 360; }
  function csDist(a, b) {
    var k = Math.cos(a.lat * Math.PI / 180), dx = (b.lng - a.lng) * k, dy = b.lat - a.lat;
    return Math.sqrt(dx * dx + dy * dy) * 111320;
  }
  function csBearing(a, b) {
    var r = Math.PI / 180, y = Math.sin((b.lng - a.lng) * r) * Math.cos(b.lat * r);
    var x = Math.cos(a.lat * r) * Math.sin(b.lat * r) - Math.sin(a.lat * r) * Math.cos(b.lat * r) * Math.cos((b.lng - a.lng) * r);
    return (Math.atan2(y, x) / r + 360) % 360;
  }
  window.csGlide = function (marker, state, to) {
    if (!state.shown) { state.shown = { lng: to.longitude, lat: to.latitude, h: to.heading || 0 }; }
    var from = { lng: state.shown.lng, lat: state.shown.lat, h: state.shown.h }, start = Date.now();
    var target = { lng: to.longitude, lat: to.latitude };
    var path = [from].concat((to.via || []).map(function (p) { return { lng: p.longitude, lat: p.latitude }; }), [target]);
    var lens = [], total = 0;
    for (var i = 1; i < path.length; i++) { lens.push(csDist(path[i - 1], path[i])); total += lens[i - 1]; }
    var tracked = to.durationMs != null, duration = to.durationMs || 1800;
    cancelAnimationFrame(state.anim);
    (function step() {
      var t = Math.min(1, (Date.now() - start) / duration);
      if (tracked && path.length > 2 && total > 0) {
        var left = total * t, j = 0;
        while (j < lens.length - 1 && left > lens[j]) { left -= lens[j]; j++; }
        var f = lens[j] ? Math.min(1, left / lens[j]) : 1, a = path[j], b = path[j + 1];
        state.shown = { lng: a.lng + (b.lng - a.lng) * f, lat: a.lat + (b.lat - a.lat) * f,
          h: t === 1 ? (to.heading || 0) : csLerpAngle(state.shown.h, csBearing(a, b), 0.35) };
      } else {
        var e = tracked ? t : 1 - Math.pow(1 - t, 3);
        state.shown = { lng: from.lng + (to.longitude - from.lng) * e, lat: from.lat + (to.latitude - from.lat) * e,
          h: csLerpAngle(from.h, to.heading || 0, tracked ? Math.min(1, e * 2) : e) };
      }
      marker.setLngLat([state.shown.lng, state.shown.lat]).setRotation(state.shown.h);
      if (t < 1) state.anim = requestAnimationFrame(step);
    })();
  };
`;

export const zoomForDelta = (longitudeDelta: number): number =>
  Math.min(18, Math.max(3, Math.log2(360 / Math.max(longitudeDelta, 0.0005))));
