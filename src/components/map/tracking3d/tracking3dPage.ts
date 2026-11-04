/**
 * The 3D live-tracking page: MapLibre GL JS with OpenFreeMap vector tiles (free, no key),
 * 3D buildings, landmark names, the road route with direction arrows, and a three.js
 * garbage truck drawn in a MapLibre custom layer, so it sits on the road, is hidden behind
 * buildings, and shows its front, back and sides as the camera turns around it.
 *
 * The page is built once; React Native pushes each GPS update with `csUpdate(frame)` and
 * camera commands with `csCmd(cmd)`. It reports back JSON messages (see Page3DMessage).
 * No React Native imports, so it can be unit-tested and opened in a desktop browser.
 *
 * Camera modes:
 *  - 'overview': keeps the truck and the site in view as the truck moves (viewers' default)
 *  - 'chase':    "Follow truck": centred on the truck and turning with it; the view is
 *                behind / front / left / right of the truck, north-up, or wherever the user
 *                turned it to (that offset is kept relative to the truck's heading). Orbit
 *                circles the truck 360°. The crew's own phone starts here.
 *  - 'free':     the user dragged the map; nothing moves until Follow or Overview is tapped.
 * Turning the camera never turns the truck: its heading comes from motionJs only.
 */
import { MAP_COLORS } from '../mapColors';
import { TRUCK_SVG, teardropPinHtml } from '../mapIconsHtml';
import { mapHead, mapInitJs } from '../openFreeMap';
import { motionJs } from './motionJs';
import { TRUCK_DIMENSIONS, truckModelJs } from './truckModelJs';

export const THREE_JS = 'https://unpkg.com/three@0.149.0/build/three.min.js';

type P = { latitude: number; longitude: number };

export interface Frame3D {
  /** Where the truck drives next (truckMotion.ts): through `via` road corners, over `durationMs`. */
  truck: P & { heading: number; via?: P[]; durationMs?: number; stopped?: boolean };
  /** Route still ahead of the truck. */
  ahead: P[];
  destination: P;
  /** No road route: the line is a dashed straight line. */
  straight: boolean;
  /** No update for a while: the truck is drawn faded at its last known position. */
  stale: boolean;
  /** The truck has left its route; a new one is on the way. */
  offRoute: boolean;
  /** The viewer's own position (the reporter, or an official), when they share it with the app. */
  me?: P | null;
  labels: { truck: string; site: string; me: string };
}

export type CameraMode = 'overview' | 'chase' | 'free';
export type CameraView = 'behind' | 'front' | 'left' | 'right' | 'north' | 'custom';

export type Page3DCommand =
  | { type: 'view'; view: Exclude<CameraView, 'custom'> }
  | { type: 'follow' }
  | { type: 'overview' }
  | { type: 'route' }
  | { type: 'orbit' }
  | { type: 'dim'; threeD: boolean }
  | { type: 'zoom'; by: number }
  | { type: 'tilt'; by: number }
  | { type: 'north' };

export interface CameraState { mode: CameraMode; view: CameraView; threeD: boolean; orbit: boolean; bearing: number; pitch: number }

export type Page3DMessage =
  | { type: 'ready'; three: boolean }
  | { type: 'nogl'; reason: string }
  | ({ type: 'camera' } & CameraState)
  | { type: 'error'; message: string };

const PAGE_CSS = (dark: boolean) => `
  .cs-chip { font: 700 11px/1.25 -apple-system, Roboto, "Segoe UI", sans-serif; white-space: nowrap; pointer-events: none;
    color: ${dark ? '#e5ece9' : '#10201b'}; background: ${dark ? 'rgba(24,32,30,0.94)' : 'rgba(255,255,255,0.96)'};
    border-radius: 12px; padding: 4px 9px; box-shadow: 0 2px 8px rgba(0,0,0,0.25); }
  .cs-chip-truck { background: ${MAP_COLORS.routeCasing}; color: #ffffff; }
  .cs-chip-stale { background: #6b7280; color: #ffffff; }
  .cs-chip-off { background: #b45309; color: #ffffff; }
  .cs-chip-me { background: #1d4ed8; color: #ffffff; }
  .cs-me { width: 16px; height: 16px; border-radius: 8px; background: #2563eb; border: 3px solid #ffffff;
    box-shadow: 0 1px 5px rgba(0,0,0,0.35); position: relative; box-sizing: content-box; }
  .cs-me::after { content: ""; position: absolute; left: -11px; top: -11px; width: 38px; height: 38px; border-radius: 19px;
    background: rgba(37,99,235,0.28); animation: csPulse 2.2s ease-out infinite; }
  @keyframes csPulse { from { transform: scale(0.4); opacity: 1; } to { transform: scale(1.5); opacity: 0; } }
  .maplibregl-ctrl-bottom-left, .maplibregl-ctrl-bottom-right { bottom: 0; }
`;

export function tracking3dHtml(o: { dark: boolean; driver: boolean; frame: Frame3D }): string {
  const { dark, driver, frame } = o;
  return `<!DOCTYPE html>
<html><head>${mapHead(dark)}
<script src="${THREE_JS}"></script>
<style>${PAGE_CSS(dark)}</style>
</head>
<body><div id="map"></div>
<script>
  window.csSend = function (o) {
    var s = JSON.stringify(o);
    if (window.ReactNativeWebView) window.ReactNativeWebView.postMessage(s);
    else if (window.parent && window.parent !== window) window.parent.postMessage({ cs3d: s }, '*');
  };
  window.onerror = function (m) { csSend({ type: 'error', message: String(m) }); };
  (function () {
    var ok = false;
    try { var c = document.createElement('canvas'); ok = !!(c.getContext('webgl2') || c.getContext('webgl')); } catch (e) { ok = false; }
    if (typeof maplibregl === 'undefined') { window.csNoGl = 'maplibre'; csSend({ type: 'nogl', reason: 'maplibre' }); }
    else if (!ok) { window.csNoGl = 'webgl'; csSend({ type: 'nogl', reason: 'webgl' }); }
  })();
</script>
<script>
  if (window.csNoGl) throw new Error('3D map unavailable: ' + window.csNoGl);
  ${mapInitJs({ dark, latitude: frame.truck.latitude, longitude: frame.truck.longitude, zoom: 15, interactive: true, rotate: true, controls: false, pitch: 50 })}
  ${motionJs}
  ${truckModelJs}

  var DRIVER = ${driver ? 'true' : 'false'}, CS_DARK = ${dark ? 'true' : 'false'};
  var TRUCK_LEN = ${TRUCK_DIMENSIONS.length};
  var VIEWS = { behind: 0, front: 180, left: 90, right: -90 };
  var latest = null, motion = csMotionCreate();
  var cam = { mode: DRIVER ? 'chase' : 'overview', view: 'behind', offset: 0, threeD: true, orbit: false,
    pitch3d: DRIVER ? 62 : 52, zoomTarget: null, pitchTarget: null, gesture: false, snap: true };
  var BUILD_ID = null, truck3d = null, svgTruck = null, raf = 0, lastTick = Date.now(), settleUntil = 0, lastSent = '';

  // ── Layers: 3D buildings, landmarks, route, truck ──
  var empty = { type: 'Feature', properties: {}, geometry: { type: 'LineString', coordinates: [] } };
  function routeData() {
    return !latest || latest.ahead.length < 2 ? empty : { type: 'Feature', properties: {}, geometry: { type: 'LineString',
      coordinates: latest.ahead.map(function (p) { return [p.longitude, p.latitude]; }) } };
  }
  function setRoute() {
    var src = map.getSource && map.getSource('route');
    if (!src || !latest) return;
    src.setData(routeData());
    try {
      // A road route is solid with arrows; no road route is a dashed grey straight line.
      ['route-casing', 'route-line', 'route-arrows'].forEach(function (id) { map.setLayoutProperty(id, 'visibility', latest.straight ? 'none' : 'visible'); });
      map.setLayoutProperty('route-straight', 'visibility', latest.straight ? 'visible' : 'none');
    } catch (e) { /* layers not added yet */ }
  }
  function addArrowImage() {
    if (map.hasImage('cs-arrow')) return;
    var c = csCanvas(48, 48, function (ctx) {
      ctx.strokeStyle = '#ffffff'; ctx.lineWidth = 7; ctx.lineCap = 'round'; ctx.lineJoin = 'round';
      ctx.beginPath(); ctx.moveTo(17, 12); ctx.lineTo(31, 24); ctx.lineTo(17, 36); ctx.stroke();
    });
    map.addImage('cs-arrow', c.getContext('2d').getImageData(0, 0, 48, 48), { pixelRatio: 2 });
  }
  function applyThreeD() {
    if (BUILD_ID && map.getLayer(BUILD_ID)) map.setLayoutProperty(BUILD_ID, 'visibility', cam.threeD ? 'visible' : 'none');
    if (map.touchPitch) { if (cam.threeD) map.touchPitch.enable(); else map.touchPitch.disable(); }
    if (cam.threeD) map.setMaxPitch(75);
  }

  csOnStyle(function () {
    var style = map.getStyle() || {}, vector = !!(style.sources && style.sources.openmaptiles);
    BUILD_ID = null;
    (style.layers || []).forEach(function (l) { if (l.type === 'fill-extrusion' && l['source-layer'] === 'building') BUILD_ID = l.id; });
    if (vector && !BUILD_ID) {
      try {
        map.addLayer({ id: 'cs-buildings-3d', type: 'fill-extrusion', source: 'openmaptiles', 'source-layer': 'building', minzoom: 14, paint: {} });
        BUILD_ID = 'cs-buildings-3d';
      } catch (e) { BUILD_ID = null; }
    }
    if (BUILD_ID) {
      try {
        map.setLayerZoomRange(BUILD_ID, 14, 24);
        map.setPaintProperty(BUILD_ID, 'fill-extrusion-color', CS_DARK ? '#2c3734' : '#e2e5df');
        setBuildingOpacity();
        map.setPaintProperty(BUILD_ID, 'fill-extrusion-height', ['interpolate', ['linear'], ['zoom'], 14, 0, 15.5, ['coalesce', ['get', 'render_height'], 6]]);
        map.setPaintProperty(BUILD_ID, 'fill-extrusion-base', ['interpolate', ['linear'], ['zoom'], 14, 0, 15.5, ['coalesce', ['get', 'render_min_height'], 0]]);
        map.setPaintProperty(BUILD_ID, 'fill-extrusion-vertical-gradient', true);
      } catch (e) { /* style draws buildings its own way */ }
    }
    applyThreeD();
    addArrowImage();
    // The route goes under the buildings, so a tall building in front of it hides it as it would in real life.
    var before = BUILD_ID && map.getLayer(BUILD_ID) ? BUILD_ID : undefined;
    if (!map.getSource('route')) map.addSource('route', { type: 'geojson', data: routeData() });
    if (!map.getLayer('route-casing')) map.addLayer({ id: 'route-casing', type: 'line', source: 'route',
      layout: { 'line-cap': 'round', 'line-join': 'round' },
      paint: { 'line-color': '${MAP_COLORS.routeCasing}', 'line-width': ['interpolate', ['linear'], ['zoom'], 12, 6, 18, 16] } }, before);
    if (!map.getLayer('route-line')) map.addLayer({ id: 'route-line', type: 'line', source: 'route',
      layout: { 'line-cap': 'round', 'line-join': 'round' },
      paint: { 'line-color': '${MAP_COLORS.route}', 'line-width': ['interpolate', ['linear'], ['zoom'], 12, 3.5, 18, 10] } }, before);
    if (!map.getLayer('route-straight')) map.addLayer({ id: 'route-straight', type: 'line', source: 'route',
      layout: { 'line-cap': 'round', 'line-join': 'round', visibility: 'none' },
      paint: { 'line-color': '${MAP_COLORS.routeStraight}', 'line-width': 4, 'line-dasharray': [2, 1.5] } }, before);
    if (!map.getLayer('route-arrows')) map.addLayer({ id: 'route-arrows', type: 'symbol', source: 'route', minzoom: 13,
      layout: { 'symbol-placement': 'line', 'symbol-spacing': 70, 'icon-image': 'cs-arrow', 'icon-size': ['interpolate', ['linear'], ['zoom'], 13, 0.5, 18, 1],
        'icon-rotation-alignment': 'map', 'icon-pitch-alignment': 'map', 'icon-allow-overlap': true, 'icon-ignore-placement': true } }, before);
    // Landmarks people navigate by: names only (no shop icons), like the rest of the app's maps.
    if (vector && !map.getLayer('cs-landmarks')) {
      try {
        map.addLayer({ id: 'cs-landmarks', type: 'symbol', source: 'openmaptiles', 'source-layer': 'poi', minzoom: 15,
          filter: ['in', ['get', 'class'], ['literal', ['school', 'college', 'hospital', 'place_of_worship', 'town_hall', 'police',
            'fire_station', 'marketplace', 'stadium', 'library', 'harbor', 'bus', 'railway', 'shop_mall', 'mall']]],
          layout: { 'text-field': ['coalesce', ['get', 'name:latin'], ['get', 'name']], 'text-font': ['Noto Sans Regular'],
            'text-size': 11, 'text-max-width': 9, 'text-padding': 4 },
          paint: { 'text-color': CS_DARK ? '#d4ddd9' : '#3f4b46', 'text-halo-color': CS_DARK ? '#1a2120' : '#ffffff', 'text-halo-width': 1.5 } });
      } catch (e) { /* no POIs in this style */ }
    }
    setRoute();
    if (window.THREE && !map.getLayer('cs-truck')) map.addLayer(truckLayer);
    csSend({ type: 'ready', three: !!window.THREE });
  });

  // ── The 3D truck (three.js in a MapLibre custom layer) ──
  var ROT_X = window.THREE ? new THREE.Matrix4().makeRotationAxis(new THREE.Vector3(1, 0, 0), Math.PI / 2) : null;
  function truckScale() {
    // Real size when zoomed right in; never smaller than a size that stays easy to see:
    // larger when following it (the truck is the subject), smaller over the city.
    var mpp = 40075016.686 * Math.cos(motion.shown.lat * Math.PI / 180) / (512 * Math.pow(2, map.getZoom()));
    var minPx = cam.mode === 'chase' ? 70 : 44;
    return Math.min(60, Math.max(1, minPx * mpp / TRUCK_LEN));
  }
  var truckLayer = {
    id: 'cs-truck', type: 'custom', renderingMode: '3d',
    onAdd: function (m, gl) {
      this.camera = new THREE.Camera();
      this.scene = new THREE.Scene();
      this.scene.add(new THREE.HemisphereLight(0xffffff, 0x5b6470, CS_DARK ? 0.8 : 1.0));
      var sun = new THREE.DirectionalLight(0xffffff, CS_DARK ? 0.5 : 0.8);
      sun.position.set(0.55, 1.4, 0.45); this.scene.add(sun);
      if (!truck3d) truck3d = csBuildTruck(THREE, CS_DARK);
      this.scene.add(truck3d.group);
      this.renderer = new THREE.WebGLRenderer({ canvas: m.getCanvas(), context: gl, antialias: true });
      this.renderer.autoClear = false;
      // See-through silhouette, drawn first and ignoring depth: where a building stands between
      // the camera and the truck, a faint truck still shows through it.
      this.xray = new THREE.MeshBasicMaterial({ color: '${MAP_COLORS.truck}', transparent: true, opacity: 0.38, depthTest: false, depthWrite: false });
    },
    render: function (gl, matrix) {
      if (!motion.shown) return;
      var mc = maplibregl.MercatorCoordinate.fromLngLat([motion.shown.lng, motion.shown.lat], 0);
      var s = mc.meterInMercatorCoordinateUnits() * truckScale();
      var l = new THREE.Matrix4().makeTranslation(mc.x, mc.y, mc.z).scale(new THREE.Vector3(s, -s, s)).multiply(ROT_X);
      // Heading: clockwise from north. The model's nose points to -z, so turn it by -heading.
      truck3d.group.rotation.y = -motion.h * Math.PI / 180;
      this.camera.projectionMatrix = new THREE.Matrix4().fromArray(matrix).multiply(l);
      this.renderer.resetState();
      truck3d.decals.forEach(function (d) { d.visible = false; });
      this.scene.overrideMaterial = this.xray;
      this.renderer.render(this.scene, this.camera);
      this.scene.overrideMaterial = null;
      truck3d.decals.forEach(function (d) { d.visible = true; });
      this.renderer.render(this.scene, this.camera);
    },
  };

  // ── Markers: site, the viewer ("You"), and the truck's label ──
  // MapLibre owns the marker element's classes, so the chip is an inner element we can restyle.
  function chip(cls) {
    var el = document.createElement('div'), c = document.createElement('div');
    c.className = 'cs-chip ' + (cls || ''); el.appendChild(c); el.chip = c; return el;
  }
  var destEl = document.createElement('div');
  destEl.innerHTML = '${teardropPinHtml(MAP_COLORS.destination, true, '🗑️')}';
  var dest = new maplibregl.Marker({ element: destEl, anchor: 'bottom' }).setLngLat([0, 0]);
  var destChip = chip(), destLabel = new maplibregl.Marker({ element: destChip, anchor: 'bottom', offset: [0, -46] }).setLngLat([0, 0]);
  var meEl = document.createElement('div'); meEl.className = 'cs-me';
  var me = new maplibregl.Marker({ element: meEl }).setLngLat([0, 0]);
  var meChip = chip('cs-chip-me'), meLabel = new maplibregl.Marker({ element: meChip, anchor: 'top', offset: [0, 14] }).setLngLat([0, 0]);
  var truckChip = chip('cs-chip-truck'), truckLabel = new maplibregl.Marker({ element: truckChip, anchor: 'bottom', offset: [0, -40] }).setLngLat([0, 0]);
  var meShown = false;
  if (!window.THREE) {
    // three.js could not load: the flat truck drawing, still turned by the GPS heading.
    var svgEl = document.createElement('div'); svgEl.className = 'cs-truck';
    svgEl.innerHTML = ${JSON.stringify(TRUCK_SVG.replace(/\n/g, ''))};
    svgTruck = new maplibregl.Marker({ element: svgEl, rotationAlignment: 'map', pitchAlignment: 'map' }).setLngLat([0, 0]);
  }

  // ── Camera ──
  function sendCamera(force) {
    var st = { type: 'camera', mode: cam.mode, view: cam.view, threeD: cam.threeD, orbit: cam.orbit,
      bearing: Math.round(map.getBearing()), pitch: Math.round(map.getPitch()) };
    var key = [st.mode, st.view, st.threeD, st.orbit, Math.round(st.bearing / 4), Math.round(st.pitch / 5)].join('|');
    if (force || key !== lastSent) { lastSent = key; csSend(st); }
  }
  function desiredBearing() {
    if (cam.view === 'north') return 0;
    return (motion.h + (VIEWS.hasOwnProperty(cam.view) ? VIEWS[cam.view] : cam.offset) + 360) % 360;
  }
  function chasePadding() {
    // Behind the truck: put it in the lower part of the screen so more road ahead is visible.
    var H = map.getContainer().clientHeight;
    return cam.view === 'behind' && cam.threeD ? { top: Math.round(H * 0.32), bottom: 0, left: 0, right: 0 } : { top: 0, bottom: 0, left: 0, right: 0 };
  }
  function enterChase(view) {
    cam.mode = 'chase';
    if (view) { cam.view = view; cam.offset = VIEWS[view] || 0; }
    // Close in, so the truck is drawn near its real size next to the road and buildings.
    cam.zoomTarget = Math.max(map.getZoom(), 18);
    // Behind / in front the camera looks along the street; from the sides it looks across the
    // block, so it rises higher (less tilt) to see over the buildings.
    if (cam.threeD) {
      cam.pitchTarget = cam.view === 'north' ? 45 : cam.view === 'behind' ? cam.pitch3d
        : cam.view === 'front' ? Math.max(50, Math.min(cam.pitch3d, 62)) : 44;
    }
    map.setPadding(chasePadding());
    setBuildingOpacity();
  }
  // Following the truck, buildings are see-through so they never hide it or the road.
  function setBuildingOpacity() {
    if (BUILD_ID && map.getLayer(BUILD_ID)) map.setPaintProperty(BUILD_ID, 'fill-extrusion-opacity', cam.mode === 'chase' ? 0.62 : 0.9);
  }
  function fitOverview(all, duration) {
    if (!latest || cam.gesture) return;
    var t = latest.truck, b = new maplibregl.LngLatBounds([t.longitude, t.latitude], [t.longitude, t.latitude]);
    b.extend([latest.destination.longitude, latest.destination.latitude]);
    if (all) latest.ahead.forEach(function (p) { b.extend([p.longitude, p.latitude]); });
    var H = map.getContainer().clientHeight, W = map.getContainer().clientWidth;
    map.setPadding({ top: 0, bottom: 0, left: 0, right: 0 });
    var pad = { top: Math.min(96, H * 0.22), bottom: Math.min(60, H * 0.14), left: Math.min(48, W * 0.1), right: Math.min(72, W * 0.16) };
    var c = map.cameraForBounds(b, { padding: pad, bearing: map.getBearing(), maxZoom: 17.5 });
    if (!c) return;
    var pitch = cam.threeD ? Math.min(cam.pitch3d, 50) : 0;
    map.easeTo({ center: c.center, zoom: c.zoom - (pitch > 0 ? 0.35 : 0), bearing: map.getBearing(), pitch: pitch, duration: duration });
  }
  function fitRoute() {
    if (!latest) return;
    var t = latest.truck, b = new maplibregl.LngLatBounds([t.longitude, t.latitude], [t.longitude, t.latitude]);
    b.extend([latest.destination.longitude, latest.destination.latitude]);
    latest.ahead.forEach(function (p) { b.extend([p.longitude, p.latitude]); });
    map.setPadding({ top: 0, bottom: 0, left: 0, right: 0 });
    map.fitBounds(b, { padding: { top: 80, right: 70, bottom: 50, left: 50 }, maxZoom: 17, bearing: 0, pitch: 0, duration: 900 });
  }
  function updateCamera(dt) {
    if (cam.mode !== 'chase' || !motion.shown) return false;
    if (cam.orbit) { cam.view = 'custom'; cam.offset = (cam.offset + 30 * dt) % 360; }
    var c = map.getCenter(), target = motion.shown;
    var kc = cam.snap ? 1 : 1 - Math.exp(-dt * 10), opts = {};
    opts.center = [c.lng + (target.lng - c.lng) * kc, c.lat + (target.lat - c.lat) * kc];
    var busy = Math.abs(target.lng - c.lng) + Math.abs(target.lat - c.lat) > 1e-7;
    if (!cam.gesture) {
      var b = map.getBearing(), db = csTurn(b, desiredBearing());
      opts.bearing = cam.snap ? b + db : b + db * (1 - Math.exp(-dt * 4));
      busy = busy || Math.abs(db) > 0.2;
      var k = cam.snap ? 1 : 1 - Math.exp(-dt * 4);
      if (cam.pitchTarget != null) {
        var p = map.getPitch() + (cam.pitchTarget - map.getPitch()) * k;
        opts.pitch = p;
        if (Math.abs(cam.pitchTarget - p) < 0.3) { opts.pitch = cam.pitchTarget; cam.pitchTarget = null; if (!cam.threeD) map.setMaxPitch(0); }
        busy = true;
      }
      if (cam.zoomTarget != null) {
        var z = map.getZoom() + (cam.zoomTarget - map.getZoom()) * k;
        opts.zoom = z;
        if (Math.abs(cam.zoomTarget - z) < 0.01) { opts.zoom = cam.zoomTarget; cam.zoomTarget = null; }
        busy = true;
      }
    }
    cam.snap = false;
    map.jumpTo(opts);
    return busy || cam.orbit;
  }

  // ── Animation loop: runs only while something moves, then stops to save battery ──
  function tick() {
    raf = 0;
    var now = Date.now(), dt = Math.min(0.1, (now - lastTick) / 1000);
    lastTick = now;
    csMotionStep(motion, now);
    if (motion.shown) {
      var ll = [motion.shown.lng, motion.shown.lat];
      truckLabel.setLngLat(ll);
      if (svgTruck) svgTruck.setLngLat(ll).setRotation(motion.h);
      if (truck3d) truck3d.update(dt, motion, { stale: latest && latest.stale });
    }
    var camBusy = updateCamera(dt);
    map.triggerRepaint();
    sendCamera(false);
    if (motion.active) settleUntil = now + 900;
    if (motion.active || camBusy || now < settleUntil) raf = requestAnimationFrame(tick);
  }
  function ensureLoop() { if (!raf) { lastTick = Date.now(); raf = requestAnimationFrame(tick); } }

  // ── Gestures: dragging the map stops following; turning or tilting it keeps following ──
  function userEvent(e) { return !!(e && e.originalEvent); }
  map.on('dragstart', function (e) {
    if (!userEvent(e)) return;
    var touches = e.originalEvent.touches;
    if (touches && touches.length >= 2) { cam.gesture = true; return; }
    if (cam.mode !== 'free') { cam.mode = 'free'; cam.orbit = false; setBuildingOpacity(); sendCamera(true); }
  });
  map.on('rotatestart', function (e) { if (userEvent(e)) { cam.gesture = true; cam.orbit = false; } });
  map.on('pitchstart', function (e) { if (userEvent(e)) { cam.gesture = true; cam.pitchTarget = null; } });
  map.on('zoomstart', function (e) { if (userEvent(e)) cam.zoomTarget = null; });
  function gestureEnd() {
    if (!cam.gesture) return;
    cam.gesture = false;
    if (cam.mode === 'chase' && cam.view !== 'north') { cam.view = 'custom'; cam.offset = csTurn(motion.h, map.getBearing()); }
    if (cam.threeD && map.getPitch() > 5) cam.pitch3d = map.getPitch();
    sendCamera(true);
    ensureLoop();
  }
  map.on('rotateend', function (e) { if (userEvent(e)) gestureEnd(); });
  map.on('pitchend', function (e) { if (userEvent(e)) gestureEnd(); });
  map.getCanvasContainer().addEventListener('touchend', function (e) { if (!e.touches || e.touches.length === 0) setTimeout(gestureEnd, 0); });
  map.getCanvasContainer().addEventListener('mouseup', function () { setTimeout(gestureEnd, 0); });
  map.on('moveend', function () { if (!cam.threeD && cam.pitchTarget == null && map.getPitch() < 0.5) map.setMaxPitch(0); });

  // ── Commands from the app's buttons ──
  window.csCmd = function (c) {
    switch (c.type) {
      case 'view': cam.orbit = false; enterChase(c.view); break;
      case 'follow': cam.orbit = false; enterChase(cam.mode === 'chase' ? null : (DRIVER ? 'behind' : cam.view === 'custom' ? 'behind' : cam.view)); break;
      case 'overview': cam.mode = 'overview'; cam.orbit = false; fitOverview(true, 900); break;
      case 'route': cam.mode = 'free'; cam.orbit = false; fitRoute(); break;
      case 'orbit':
        cam.orbit = !cam.orbit;
        if (cam.orbit) { if (cam.mode !== 'chase') enterChase('behind'); cam.offset = VIEWS.hasOwnProperty(cam.view) ? VIEWS[cam.view] : cam.offset; cam.view = 'custom'; }
        break;
      case 'dim':
        cam.threeD = !!c.threeD;
        applyThreeD();
        if (cam.mode === 'chase') { cam.pitchTarget = cam.threeD ? cam.pitch3d : 0; map.setPadding(chasePadding()); }
        else map.easeTo({ pitch: cam.threeD ? Math.min(cam.pitch3d, 50) : 0, duration: 700 });
        break;
      case 'zoom': {
        var z = Math.max(3, Math.min(20.5, (cam.zoomTarget != null ? cam.zoomTarget : map.getZoom()) + c.by));
        if (cam.mode === 'chase') cam.zoomTarget = z; else map.easeTo({ zoom: z, duration: 350 });
        break;
      }
      case 'tilt': {
        if (!cam.threeD) { cam.threeD = true; applyThreeD(); }
        var p = Math.max(0, Math.min(75, (cam.pitchTarget != null ? cam.pitchTarget : map.getPitch()) + c.by));
        cam.pitch3d = Math.max(20, p);
        if (cam.mode === 'chase') cam.pitchTarget = p; else map.easeTo({ pitch: p, duration: 400 });
        break;
      }
      case 'north':
        cam.orbit = false;
        if (cam.mode === 'chase') { cam.view = 'north'; map.setPadding(chasePadding()); } else map.easeTo({ bearing: 0, duration: 500 });
        break;
    }
    setBuildingOpacity();
    sendCamera(true);
    ensureLoop();
  };

  // ── Each GPS update from the app ──
  window.csUpdate = function (f) {
    var first = !latest;
    latest = f;
    dest.setLngLat([f.destination.longitude, f.destination.latitude]);
    destLabel.setLngLat([f.destination.longitude, f.destination.latitude]);
    destChip.chip.textContent = f.labels.site;
    truckChip.chip.textContent = f.labels.truck;
    truckChip.chip.className = 'cs-chip ' +(f.stale ? 'cs-chip-stale' : f.offRoute ? 'cs-chip-off' : 'cs-chip-truck');
    if (f.me) {
      me.setLngLat([f.me.longitude, f.me.latitude]); meLabel.setLngLat([f.me.longitude, f.me.latitude]);
      meChip.chip.textContent = f.labels.me;
      if (!meShown) { me.addTo(map); meLabel.addTo(map); meShown = true; }
    } else if (meShown) { me.remove(); meLabel.remove(); meShown = false; }
    setRoute();
    csMotionPush(motion, f.truck, Date.now());
    if (first) {
      dest.addTo(map); destLabel.addTo(map);
      truckLabel.setLngLat([f.truck.longitude, f.truck.latitude]).addTo(map);
      if (svgTruck) svgTruck.setLngLat([f.truck.longitude, f.truck.latitude]).addTo(map);
      if (cam.mode === 'chase') {
        map.jumpTo({ center: [f.truck.longitude, f.truck.latitude], zoom: 18, pitch: cam.pitch3d, bearing: f.truck.heading || 0 });
        map.setPadding(chasePadding());
      } else {
        fitOverview(true, 0);
      }
    } else if (cam.mode === 'overview') {
      fitOverview(false, 900);
    }
    if (motion.jumped && cam.mode === 'chase') cam.snap = true;
    ensureLoop();
  };
  window.csUpdate(${JSON.stringify(frame)});
  sendCamera(true);
</script></body></html>`;
}
