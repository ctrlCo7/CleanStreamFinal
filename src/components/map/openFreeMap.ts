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
  html, body, #map { height: 100%; margin: 0; padding: 0; background: ${dark ? '#1b1f1e' : '#eef2ef'}; }
  .maplibregl-ctrl-attrib { font-size: 9px; }
  .maplibregl-ctrl-group { border-radius: 10px !important; box-shadow: 0 2px 8px rgba(0,0,0,0.22) !important; }
  .maplibregl-ctrl-group button { width: 34px; height: 34px; }
  .maplibregl-popup-content { border-radius: 12px; padding: 10px; font-family: -apple-system, Roboto, sans-serif; box-shadow: 0 4px 14px rgba(0,0,0,0.2); }
  .maplibregl-popup-content img { width: 100%; border-radius: 8px; margin-bottom: 6px; display: block; }
  .cs-popup-tap { color: #1D9E75; font-size: 11px; font-weight: 700; margin-top: 6px; display: block; }
  .cs-truck { width: 44px; height: 44px; }
  ${TEARDROP_CSS}
</style>`;

/**
 * Creates `map` (MapLibre) with the OpenFreeMap style and the raster fallback.
 * Defines `csOnStyle(fn)`: runs fn now if the style is loaded and again after any style
 * switch (sources/layers such as the route have to be re-added then).
 */
export const mapInitJs = (opts: { dark: boolean; latitude: number; longitude: number; zoom: number; interactive: boolean }) => `
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
    dragRotate: false,
    pitchWithRotate: false,
    attributionControl: { compact: true },
  });
  if (${opts.interactive ? 'true' : 'false'}) map.addControl(new maplibregl.NavigationControl({ showCompass: false }), 'bottom-right');
  map.touchZoomRotate && map.touchZoomRotate.disableRotation && map.touchZoomRotate.disableRotation();

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
`;

/**
 * Glides a MapLibre marker to a new position and turns it the short way round, like a
 * vehicle in a delivery app. `state` keeps the marker's current position between calls.
 */
export const glideJs = `
  function csLerpAngle(a, b, t) { var d = ((b - a + 540) % 360) - 180; return (a + d * t + 360) % 360; }
  window.csGlide = function (marker, state, to) {
    if (!state.shown) { state.shown = { lng: to.longitude, lat: to.latitude, h: to.heading || 0 }; }
    var from = { lng: state.shown.lng, lat: state.shown.lat, h: state.shown.h }, start = Date.now();
    cancelAnimationFrame(state.anim);
    (function step() {
      var t = Math.min(1, (Date.now() - start) / 1800), e = 1 - Math.pow(1 - t, 3);
      state.shown = { lng: from.lng + (to.longitude - from.lng) * e, lat: from.lat + (to.latitude - from.lat) * e,
        h: csLerpAngle(from.h, to.heading || 0, e) };
      marker.setLngLat([state.shown.lng, state.shown.lat]).setRotation(state.shown.h);
      if (t < 1) state.anim = requestAnimationFrame(step);
    })();
  };
`;

export const zoomForDelta = (longitudeDelta: number): number =>
  Math.min(18, Math.max(3, Math.log2(360 / Math.max(longitudeDelta, 0.0005))));
