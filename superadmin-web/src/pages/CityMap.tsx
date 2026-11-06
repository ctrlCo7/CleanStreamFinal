import { useEffect, useMemo, useRef, useState } from 'react';
import maplibregl, { GeoJSONSource, LngLatBoundsLike, Map as MlMap, Marker } from 'maplibre-gl';
import 'maplibre-gl/dist/maplibre-gl.css';
import { ReportStatusPill, SeverityPill } from '../components/Pill';
import { listBarangays, barangayById } from '../lib/barangays';
import {
  CEBU_CENTER, CITY_ZOOM, HOTSPOT_RADIUS_M, Hotspot, LiveTrip, RESOLVED_COLOR, SEVERITY_COLORS, STALE_S,
  findHotspots, formatDistance, formatEta, isOpen, secondsSinceSeen, subscribeLiveTrips,
} from '../lib/cityMap';
import { useData } from '../lib/data';
import { formatDateTime } from '../lib/format';
import { REPORT_STATUS_LABELS, Report, SEVERITIES, Severity } from '../lib/operations';
import { OpsErrors, useOps } from '../lib/opsData';

type Show = 'open' | 'all' | 'resolved';
type Pinned = Report & { latitude: number; longitude: number };

const RASTER_STYLE = (dark: boolean): maplibregl.StyleSpecification => ({
  version: 8,
  sources: {
    carto: {
      type: 'raster', tileSize: 256,
      tiles: ['a', 'b', 'c', 'd'].map((s) => `https://${s}.basemaps.cartocdn.com/${dark ? 'dark_all' : 'rastertiles/voyager'}/{z}/{x}/{y}@2x.png`),
      attribution: '&copy; OpenStreetMap contributors &copy; CARTO',
    },
  },
  layers: [{ id: 'carto', type: 'raster', source: 'carto' }],
});

/** A circle of `radiusM` metres as a polygon, so it keeps its real size at every zoom. */
const circlePolygon = (lat: number, lng: number, radiusM: number, n = 40): GeoJSON.Polygon => {
  const pts: [number, number][] = [];
  for (let i = 0; i <= n; i++) {
    const a = (i / n) * 2 * Math.PI;
    const dLat = (radiusM * Math.cos(a)) / 111320;
    const dLng = (radiusM * Math.sin(a)) / (111320 * Math.cos((lat * Math.PI) / 180));
    pts.push([lng + dLng, lat + dLat]);
  }
  return { type: 'Polygon', coordinates: [pts] };
};

const fc = <G extends GeoJSON.Geometry>(features: Array<GeoJSON.Feature<G>>): GeoJSON.FeatureCollection<G> => ({ type: 'FeatureCollection', features });

const truckSvg = (color: string) => `
<svg viewBox="0 0 40 40" width="40" height="40" aria-hidden="true">
  <circle cx="20" cy="20" r="17" fill="${color}" stroke="#fff" stroke-width="3"/>
  <path d="M20 8 L28 27 L20 23 L12 27 Z" fill="#fff"/>
</svg>`;

export function CityMap() {
  const { reports, loading } = useOps();
  useData(); // newly registered barangays
  const [show, setShow] = useState<Show>('open');
  const [barangayId, setBarangayId] = useState('all');
  const [severity, setSeverity] = useState<Severity | 'all'>('all');
  const [layers, setLayers] = useState({ reports: true, hotspots: true, trucks: true });
  const [trips, setTrips] = useState<LiveTrip[]>([]);
  const [tripError, setTripError] = useState<string | null>(null);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [followId, setFollowId] = useState<string | null>(null);
  const [now, setNow] = useState(Date.now());

  useEffect(() => subscribeLiveTrips((t) => { setTrips(t); setTripError(null); }, (e) => setTripError(`Couldn't load live trucks: ${e.message}`)), []);
  useEffect(() => { const id = setInterval(() => setNow(Date.now()), 1000); return () => clearInterval(id); }, []);

  const pinned = useMemo(
    () => reports.filter((r): r is Pinned => r.latitude !== undefined && r.longitude !== undefined),
    [reports],
  );
  const visible = useMemo(() => pinned.filter((r) =>
    (barangayId === 'all' || r.barangayId === barangayId)
    && (severity === 'all' || r.severity === severity)
    && (show === 'all' || (show === 'open' ? isOpen(r) : r.status === 'completed'))), [pinned, barangayId, severity, show]);
  const hotspots = useMemo(
    () => findHotspots(pinned.filter((r) => barangayId === 'all' || r.barangayId === barangayId)).sort((a, b) => b.count - a.count),
    [pinned, barangayId],
  );
  const shownTrips = useMemo(() => trips.filter((t) => barangayId === 'all' || t.barangayId === barangayId), [trips, barangayId]);
  const selected = useMemo(() => reports.find((r) => r.id === selectedId) ?? null, [reports, selectedId]);
  const noLocation = reports.length - pinned.length;

  // ─── Map ───────────────────────────────────────────────────────────────────
  const box = useRef<HTMLDivElement>(null);
  const mapRef = useRef<MlMap | null>(null);
  const [styleTick, setStyleTick] = useState(0);
  const truckMarkers = useRef(new Map<string, { marker: Marker; el: HTMLDivElement; from: [number, number]; to: [number, number]; t0: number }>());

  useEffect(() => {
    if (!box.current) return undefined;
    const dark = window.matchMedia?.('(prefers-color-scheme: dark)').matches ?? false;
    const map = new maplibregl.Map({
      container: box.current,
      style: `https://tiles.openfreemap.org/styles/${dark ? 'dark' : 'liberty'}`,
      center: [CEBU_CENTER.longitude, CEBU_CENTER.latitude],
      zoom: CITY_ZOOM,
      attributionControl: { compact: true },
    });
    map.addControl(new maplibregl.NavigationControl({ showCompass: false }), 'top-right');
    map.touchZoomRotate.disableRotation();
    map.dragRotate.disable();
    let loaded = false;
    let fallback = false;
    const useFallback = () => { if (fallback) return; fallback = true; map.setStyle(RASTER_STYLE(dark)); };
    // OpenFreeMap unreachable or slow: switch to CARTO's raster tiles so the map never stays blank.
    const timer = setTimeout(() => { if (!loaded) useFallback(); }, 8000);
    map.on('error', (e) => { if (!loaded && /style|fetch|network|Failed/i.test(String(e?.error?.message ?? ''))) useFallback(); });
    map.on('style.load', () => {
      loaded = true;
      if (!fallback) {
        // Hide shop and business icons: the waste pins are what matters here.
        for (const l of map.getStyle().layers ?? []) {
          if ((l as { 'source-layer'?: string })['source-layer'] === 'poi') map.setLayoutProperty(l.id, 'visibility', 'none');
        }
      }
      map.addSource('hotspots', { type: 'geojson', data: fc([]) });
      map.addLayer({ id: 'hotspots-fill', type: 'fill', source: 'hotspots', paint: { 'fill-color': ['get', 'color'], 'fill-opacity': 0.22 } });
      map.addLayer({ id: 'hotspots-line', type: 'line', source: 'hotspots', paint: { 'line-color': ['get', 'color'], 'line-width': 2, 'line-dasharray': [2, 1.5] } });
      map.addSource('routes', { type: 'geojson', data: fc([]) });
      map.addLayer({ id: 'routes-casing', type: 'line', source: 'routes', layout: { 'line-cap': 'round', 'line-join': 'round' }, paint: { 'line-color': '#0F6E56', 'line-width': 7, 'line-opacity': 0.5 } });
      map.addLayer({ id: 'routes-line', type: 'line', source: 'routes', layout: { 'line-cap': 'round', 'line-join': 'round' }, paint: { 'line-color': ['get', 'color'], 'line-width': 4 } });
      map.addSource('dests', { type: 'geojson', data: fc([]) });
      map.addLayer({ id: 'dests', type: 'circle', source: 'dests', paint: { 'circle-radius': 7, 'circle-color': '#EF4444', 'circle-stroke-color': '#fff', 'circle-stroke-width': 3 } });
      map.addSource('reports', { type: 'geojson', data: fc([]) });
      map.addLayer({
        id: 'reports', type: 'circle', source: 'reports',
        paint: {
          'circle-radius': ['interpolate', ['linear'], ['zoom'], 10, 4, 14, 7, 17, 10],
          'circle-color': ['get', 'color'],
          'circle-opacity': ['case', ['get', 'approx'], 0.35, 0.95],
          'circle-stroke-color': ['case', ['get', 'selected'], '#111', '#fff'],
          'circle-stroke-width': ['case', ['get', 'selected'], 3, 1.5],
        },
      });
      setStyleTick((n) => n + 1);
    });
    map.on('click', 'reports', (e) => {
      const id = e.features?.[0]?.properties?.id;
      if (typeof id === 'string') setSelectedId(id);
    });
    map.on('mouseenter', 'reports', () => { map.getCanvas().style.cursor = 'pointer'; });
    map.on('mouseleave', 'reports', () => { map.getCanvas().style.cursor = ''; });
    // The user dragged the map: stop following a truck.
    map.on('dragstart', () => setFollowId(null));
    mapRef.current = map;
    const markers = truckMarkers.current;
    return () => {
      clearTimeout(timer);
      markers.forEach((m) => m.marker.remove());
      markers.clear();
      map.remove();
      mapRef.current = null;
    };
  }, []);

  const setData = (id: string, data: GeoJSON.FeatureCollection) => (mapRef.current?.getSource(id) as GeoJSONSource | undefined)?.setData(data);

  // Report pins
  useEffect(() => {
    if (!styleTick) return;
    setData('reports', fc(layers.reports ? visible.map((r) => ({
      type: 'Feature' as const,
      geometry: { type: 'Point' as const, coordinates: [r.longitude, r.latitude] },
      properties: {
        id: r.id, approx: r.approximate, selected: r.id === selectedId,
        color: r.status === 'completed' ? RESOLVED_COLOR : SEVERITY_COLORS[r.severity],
      },
    })) : []));
  }, [visible, layers.reports, selectedId, styleTick]);

  // Hotspot areas
  useEffect(() => {
    if (!styleTick) return;
    setData('hotspots', fc(layers.hotspots ? hotspots.map((h) => ({
      type: 'Feature' as const,
      geometry: circlePolygon(h.latitude, h.longitude, HOTSPOT_RADIUS_M),
      properties: { id: h.id, color: SEVERITY_COLORS[h.worst] },
    })) : []));
  }, [hotspots, layers.hotspots, styleTick]);

  // Trucks: route lines, destinations and gliding markers
  useEffect(() => {
    const map = mapRef.current;
    if (!map || !styleTick) return;
    const list = layers.trucks ? shownTrips : [];
    setData('routes', fc(list.filter((t) => t.route.length > 1).map((t) => ({
      type: 'Feature' as const,
      geometry: { type: 'LineString' as const, coordinates: t.route.map((p) => [p.longitude, p.latitude]) },
      properties: { color: t.routeSource === 'osrm' ? '#1D9E75' : '#8a958f' },
    }))));
    setData('dests', fc(list.map((t) => ({
      type: 'Feature' as const, geometry: { type: 'Point' as const, coordinates: [t.destination.longitude, t.destination.latitude] }, properties: {},
    }))));

    const markers = truckMarkers.current;
    const seen = new Set<string>();
    for (const t of list) {
      seen.add(t.taskId);
      const to: [number, number] = [t.longitude, t.latitude];
      const m = markers.get(t.taskId);
      if (!m) {
        const el = document.createElement('div');
        el.className = 'truck-marker';
        el.title = t.crewName;
        el.addEventListener('click', () => setFollowId(t.taskId));
        const marker = new maplibregl.Marker({ element: el, rotationAlignment: 'map' }).setLngLat(to).addTo(map);
        markers.set(t.taskId, { marker, el, from: to, to, t0: performance.now() });
      } else if (m.to[0] !== to[0] || m.to[1] !== to[1]) {
        const cur = m.marker.getLngLat();
        Object.assign(m, { from: [cur.lng, cur.lat] as [number, number], to, t0: performance.now() });
      }
      const entry = markers.get(t.taskId)!;
      entry.marker.setRotation(t.heading);
    }
    for (const [id, m] of markers) if (!seen.has(id)) { m.marker.remove(); markers.delete(id); }
  }, [shownTrips, layers.trucks, styleTick]);

  // Grey out trucks whose phone went quiet; glide the rest between updates.
  useEffect(() => {
    for (const t of shownTrips) {
      const m = truckMarkers.current.get(t.taskId);
      if (!m) continue;
      const stale = secondsSinceSeen(t, now) > STALE_S;
      const html = truckSvg(stale ? '#6b7280' : '#1D9E75');
      if (m.el.dataset.stale !== String(stale)) { m.el.innerHTML = html; m.el.dataset.stale = String(stale); }
    }
  }, [now, shownTrips]);
  useEffect(() => {
    let raf = 0;
    const GLIDE_MS = 2500;
    const step = () => {
      const t = performance.now();
      truckMarkers.current.forEach((m) => {
        const k = Math.min(1, (t - m.t0) / GLIDE_MS);
        if (k < 1 || m.from !== m.to) {
          m.marker.setLngLat([m.from[0] + (m.to[0] - m.from[0]) * k, m.from[1] + (m.to[1] - m.from[1]) * k]);
          if (k >= 1) m.from = m.to;
        }
      });
      raf = requestAnimationFrame(step);
    };
    raf = requestAnimationFrame(step);
    return () => cancelAnimationFrame(raf);
  }, []);

  // Follow the chosen truck.
  useEffect(() => {
    const t = shownTrips.find((x) => x.taskId === followId);
    if (t && mapRef.current) mapRef.current.easeTo({ center: [t.longitude, t.latitude], zoom: Math.max(mapRef.current.getZoom(), 15), duration: 1200 });
  }, [followId, shownTrips]);

  // Picking a barangay zooms to its reports.
  useEffect(() => {
    const map = mapRef.current;
    if (!map || !styleTick) return;
    const pts = barangayId === 'all' ? [] : pinned.filter((r) => r.barangayId === barangayId && !r.approximate);
    if (barangayId === 'all') { map.easeTo({ center: [CEBU_CENTER.longitude, CEBU_CENTER.latitude], zoom: CITY_ZOOM, duration: 800 }); return; }
    if (!pts.length) return;
    const lngs = pts.map((p) => p.longitude);
    const lats = pts.map((p) => p.latitude);
    const bounds: LngLatBoundsLike = [[Math.min(...lngs), Math.min(...lats)], [Math.max(...lngs), Math.max(...lats)]];
    map.fitBounds(bounds, { padding: 60, maxZoom: 16, duration: 800 });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [barangayId, styleTick]);

  const flyTo = (lat: number, lng: number, zoom = 17) => { setFollowId(null); mapRef.current?.flyTo({ center: [lng, lat], zoom }); };
  const openHotspot = (h: Hotspot) => { flyTo(h.latitude, h.longitude); setSelectedId(h.reportIds[0] ?? null); };

  const openCount = pinned.filter(isOpen).length;
  const liveCount = trips.length;

  return (
    <>
      <header className="page-head">
        <div>
          <h1>City map</h1>
          <p className="muted">Every waste report, dumping hotspot and cleanup truck on its way, across all of Cebu City. Updates live.</p>
        </div>
      </header>
      <OpsErrors streams={['reports']} />
      {tripError && <p className="callout callout-error" role="alert">{tripError}</p>}

      <div className="stat-grid">
        <div className="stat"><span className="stat-n">{loading.reports ? '…' : openCount}</span><span className="stat-l">Open reports on the map</span></div>
        <div className={`stat${hotspots.length ? ' stat-attn' : ''}`}><span className="stat-n">{hotspots.length}</span><span className="stat-l">Hotspots (3+ within 100 m, 90 days)</span></div>
        <div className="stat"><span className="stat-n">{liveCount}</span><span className="stat-l">Trucks on the way now</span></div>
      </div>

      <div className="toolbar">
        <select value={barangayId} onChange={(e) => setBarangayId(e.target.value)} aria-label="Barangay">
          <option value="all">All of Cebu City</option>
          {listBarangays().map((b) => <option key={b.id} value={b.id}>{b.name}</option>)}
        </select>
        <select value={show} onChange={(e) => setShow(e.target.value as Show)} aria-label="Which reports">
          <option value="open">Open reports</option>
          <option value="resolved">Cleaned up</option>
          <option value="all">All reports</option>
        </select>
        <select value={severity} onChange={(e) => setSeverity(e.target.value as Severity | 'all')} aria-label="Severity">
          <option value="all">Any severity</option>
          {SEVERITIES.map((s) => <option key={s} value={s}>{s[0].toUpperCase() + s.slice(1)}</option>)}
        </select>
        {(['reports', 'hotspots', 'trucks'] as const).map((k) => (
          <label key={k} className="check map-toggle">
            <input type="checkbox" checked={layers[k]} onChange={(e) => setLayers((l) => ({ ...l, [k]: e.target.checked }))} />
            {k === 'reports' ? 'Reports' : k === 'hotspots' ? 'Hotspots' : 'Live trucks'}
          </label>
        ))}
      </div>

      <div className="citymap">
        <div className="citymap-map">
          <div ref={box} className="citymap-canvas" aria-label="Map of Cebu City reports, hotspots and trucks" />
          <div className="map-legend" aria-label="Legend">
            {SEVERITIES.map((s) => <span key={s}><i style={{ background: SEVERITY_COLORS[s] }} />{s[0].toUpperCase() + s.slice(1)}</span>)}
            <span><i style={{ background: RESOLVED_COLOR }} />Cleaned up</span>
            <span><i className="legend-faint" />Approximate spot</span>
            <span><i className="legend-truck" />Truck</span>
          </div>
        </div>

        <aside className="citymap-side">
          {selected && (
            <section className="card citymap-detail">
              <div className="card-head">
                <h2>{selected.reportNumber}</h2>
                <button className="link" onClick={() => setSelectedId(null)}>Close</button>
              </div>
              {selected.photoURL && <img src={selected.photoURL} alt={`Photo for report ${selected.reportNumber}`} className="citymap-photo" />}
              <p><SeverityPill severity={selected.severity} /> <ReportStatusPill status={selected.status} /></p>
              <p className="small"><strong>{selected.wasteLabel}</strong>{selected.hazardous ? ' · hazardous' : ''}</p>
              <p className="small">{selected.address ?? '—'}<br /><span className="muted">Brgy. {selected.barangay ?? barangayById(selected.barangayId)?.name ?? '—'}</span></p>
              {selected.approximate && <p className="callout callout-warn small">Approximate: only the barangay's centre, not the exact spot.</p>}
              <p className="small muted">
                Reported {formatDateTime(selected.createdAt)} by {selected.userName}
                {selected.latitude !== undefined && selected.longitude !== undefined && (
                  <> · <button className="link" onClick={() => flyTo(selected.latitude!, selected.longitude!)}>Zoom in</button></>
                )}
              </p>
              <p className="small muted">{REPORT_STATUS_LABELS[selected.status]}{selected.resolvedAt ? ` · resolved ${formatDateTime(selected.resolvedAt)}` : ''}</p>
            </section>
          )}

          <section className="card">
            <div className="card-head"><h2>Live trucks</h2><span className="muted small">{shownTrips.length}</span></div>
            {shownTrips.length === 0 ? <p className="muted small">No cleanup crew is on the way right now.</p> : (
              <ul className="list">
                {shownTrips.map((t) => {
                  const since = secondsSinceSeen(t, now);
                  const lost = since > STALE_S;
                  return (
                    <li key={t.taskId}>
                      <button className={`citymap-item${followId === t.taskId ? ' active' : ''}`} onClick={() => setFollowId(t.taskId)}>
                        <strong>🚚 {t.crewName}</strong>
                        <span className="small muted">Brgy. {barangayById(t.barangayId)?.name ?? t.barangayId}</span>
                        <span className="small">
                          {lost ? <span className="text-danger">Signal lost · last seen {formatEta(since)} ago</span>
                            : <>Arriving in {formatEta(t.etaSeconds)} · {formatDistance(t.remainingM)} away{t.speed != null ? ` · ${Math.round(t.speed * 3.6)} km/h` : ''}</>}
                        </span>
                        {!lost && <span className="small muted">{since < 10 ? '● Live' : `Updated ${since} s ago`}{t.offRoute ? ' · re-routing' : ''}</span>}
                      </button>
                    </li>
                  );
                })}
              </ul>
            )}
            {followId && <button className="btn btn-sm" onClick={() => setFollowId(null)}>Stop following</button>}
          </section>

          <section className="card">
            <div className="card-head"><h2>Hotspots</h2><span className="muted small">{hotspots.length}</span></div>
            {hotspots.length === 0 ? <p className="muted small">No place has 3 or more open reports within 100 m in the last 90 days.</p> : (
              <ul className="list">
                {hotspots.slice(0, 30).map((h) => (
                  <li key={h.id}>
                    <button className="citymap-item" onClick={() => openHotspot(h)}>
                      <strong><i className="dot" style={{ background: SEVERITY_COLORS[h.worst] }} />Brgy. {h.barangay ?? '—'}</strong>
                      <span className="small muted">{h.count} open reports · worst: {h.worst}</span>
                    </button>
                  </li>
                ))}
              </ul>
            )}
          </section>

          {noLocation > 0 && <p className="muted small">{noLocation} report{noLocation === 1 ? ' has' : 's have'} no location and can't be shown on the map.</p>}
        </aside>
      </div>
    </>
  );
}
