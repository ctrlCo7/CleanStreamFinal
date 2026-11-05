import React, { useEffect, useMemo, useRef, useState } from 'react';
import {
  ActivityIndicator, Modal, Platform, SafeAreaView, StyleSheet, Text, TouchableOpacity, View,
} from 'react-native';
import { WebView, WebViewMessageEvent } from './WebViewCompat';
import { useTheme } from '../../hooks/useTheme';
import { ThemeColors } from '../../constants/theme';
import { GeoLocation } from '../../types';
import { getNearestBarangayEntry, locationAtPoint } from '../../services/locationService';
import { distanceM } from '../../services/reportProximity';
import { mapHead, mapInitJs } from '../map/openFreeMap';

interface Props {
  visible: boolean;
  /** Where the map opens: the current report point (GPS fix, search result or barangay centre). */
  start: { latitude: number; longitude: number } | null;
  /** The phone's own GPS fix, if there is one: drawn as a blue dot with its accuracy. */
  gps?: { latitude: number; longitude: number; accuracy?: number } | null;
  /** Why the reporter is asked (e.g. "GPS was not available"). */
  reason?: string;
  onClose: () => void;
  onConfirm: (loc: GeoLocation) => void;
}

type PageMsg = { type: 'center'; lat: number; lng: number };

const pageHtml = (dark: boolean, lat: number, lng: number, gps: Props['gps']) => `<!DOCTYPE html>
<html><head>${mapHead(dark)}
<style>
  .cs-gps { width: 16px; height: 16px; border-radius: 50%; background: #378ADD; border: 3px solid #fff; box-shadow: 0 0 0 2px rgba(55,138,221,0.35); }
</style></head>
<body><div id="map"></div>
<script>
  ${mapInitJs({ dark, latitude: lat, longitude: lng, zoom: 18, interactive: true })}
  function post(o) {
    var s = JSON.stringify(o);
    if (window.ReactNativeWebView) window.ReactNativeWebView.postMessage(s);
    else if (window.parent && window.parent !== window) window.parent.postMessage({ csPin: s }, '*');
  }
  function sendCenter() { var c = map.getCenter(); post({ type: 'center', lat: c.lat, lng: c.lng }); }
  map.on('moveend', sendCenter);
  map.on('load', sendCenter);

  var GPS = ${JSON.stringify(gps ?? null)};
  if (GPS) {
    var el = document.createElement('div'); el.className = 'cs-gps';
    new maplibregl.Marker({ element: el }).setLngLat([GPS.longitude, GPS.latitude]).addTo(map);
    if (GPS.accuracy) {
      window.csOnStyle(function () {
        // Accuracy ring: a polygon circle (metres), so it scales with zoom.
        var pts = [], R = 6378137, n = 48;
        for (var i = 0; i <= n; i++) {
          var a = (i / n) * 2 * Math.PI;
          var dLat = (GPS.accuracy * Math.cos(a)) / R, dLng = (GPS.accuracy * Math.sin(a)) / (R * Math.cos(GPS.latitude * Math.PI / 180));
          pts.push([GPS.longitude + dLng * 180 / Math.PI, GPS.latitude + dLat * 180 / Math.PI]);
        }
        try {
          if (map.getSource('acc')) return;
          map.addSource('acc', { type: 'geojson', data: { type: 'Feature', geometry: { type: 'Polygon', coordinates: [pts] } } });
          map.addLayer({ id: 'acc', type: 'fill', source: 'acc', paint: { 'fill-color': '#378ADD', 'fill-opacity': 0.12 } });
        } catch (e) { /* the ring is only a hint */ }
      });
    }
  }
  window.csFly = function (lat, lng) { map.flyTo({ center: [lng, lat], zoom: Math.max(map.getZoom(), 18) }); };
</script></body></html>`;

/**
 * Full-screen map where the reporter puts the pin exactly on the waste: the map moves
 * under a fixed pin in the middle. The confirmed point becomes the report's location,
 * which is where the cleanup crew is sent and where live tracking drives to.
 */
export function PinLocationModal({ visible, start, gps, reason, onClose, onConfirm }: Props) {
  const { colors, isDark } = useTheme();
  const styles = useMemo(() => createStyles(colors), [colors]);
  const web = useRef<WebView>(null);
  const iframe = useRef<HTMLIFrameElement | null>(null);
  const [center, setCenter] = useState<{ lat: number; lng: number } | null>(null);
  const [busy, setBusy] = useState(false);

  // A fresh page each time the picker opens, centred on the current report point.
  const html = useMemo(
    () => (visible && start ? pageHtml(isDark, start.latitude, start.longitude, gps) : ''),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [visible, isDark],
  );
  useEffect(() => { if (visible && start) setCenter({ lat: start.latitude, lng: start.longitude }); }, [visible]); // eslint-disable-line react-hooks/exhaustive-deps

  const handle = (raw: unknown) => {
    if (typeof raw !== 'string') return;
    try {
      const m = JSON.parse(raw) as PageMsg;
      if (m.type === 'center' && Number.isFinite(m.lat) && Number.isFinite(m.lng)) setCenter({ lat: m.lat, lng: m.lng });
    } catch { /* not ours */ }
  };

  useEffect(() => {
    if (Platform.OS !== 'web' || typeof window === 'undefined' || !visible) return undefined;
    const onMsg = (e: MessageEvent) => {
      if (e.source !== iframe.current?.contentWindow) return;
      handle((e.data as { csPin?: unknown } | null)?.csPin);
    };
    window.addEventListener('message', onMsg);
    return () => window.removeEventListener('message', onMsg);
  }, [visible]); // eslint-disable-line react-hooks/exhaustive-deps

  const flyToGps = () => {
    if (!gps) return;
    const js = `window.csFly && window.csFly(${gps.latitude}, ${gps.longitude}); true;`;
    if (Platform.OS === 'web') {
      const w = iframe.current?.contentWindow as (Window & { csFly?: (a: number, b: number) => void }) | null | undefined;
      try { w?.csFly?.(gps.latitude, gps.longitude); } catch { /* ignore */ }
    } else web.current?.injectJavaScript(js);
  };

  const confirm = async () => {
    if (!center) return;
    setBusy(true);
    let loc: GeoLocation;
    try {
      loc = await locationAtPoint(center.lat, center.lng);
    } catch {
      const b = getNearestBarangayEntry(center.lat, center.lng);
      loc = {
        latitude: center.lat, longitude: center.lng, timestamp: Date.now(), source: 'pin',
        barangay: b.name, barangayId: b.id, address: `${center.lat.toFixed(5)}°N, ${center.lng.toFixed(5)}°E`,
      };
    }
    setBusy(false);
    onConfirm(loc);
  };

  const fromGps = gps && center ? Math.round(distanceM(gps.latitude, gps.longitude, center.lat, center.lng)) : null;

  return (
    <Modal visible={visible} animationType="slide" onRequestClose={onClose}>
      <SafeAreaView style={styles.root}>
        <View style={styles.header}>
          <Text style={styles.title}>Pin the exact spot of the waste</Text>
          <Text style={styles.hint}>
            {reason ? `${reason} ` : ''}Drag the map until the pin sits right on the waste. The cleanup crew is sent to this exact point.
          </Text>
        </View>

        <View style={styles.mapWrap}>
          {!!html && (Platform.OS === 'web'
            ? React.createElement('iframe', {
              ref: iframe, srcDoc: html, title: 'Pin the waste location',
              style: { border: 0, width: '100%', height: '100%', display: 'block' },
            })
            : (
              <WebView
                ref={web}
                source={{ html }}
                originWhitelist={['*']}
                style={styles.webview}
                onMessage={(e: WebViewMessageEvent) => handle(e.nativeEvent.data)}
                javaScriptEnabled
                domStorageEnabled
                scrollEnabled={false}
              />
            ))}
          {/* The fixed pin: its tip marks the map centre. */}
          <View pointerEvents="none" style={styles.pinWrap}>
            <Text style={styles.pin}>📍</Text>
          </View>
          {!!gps && (
            <TouchableOpacity style={styles.gpsBtn} onPress={flyToGps} accessibilityLabel="Move the pin back to my GPS position">
              <Text style={styles.gpsBtnText}>◎ My GPS</Text>
            </TouchableOpacity>
          )}
        </View>

        <View style={styles.footer}>
          <Text style={styles.coords}>
            {center ? `${center.lat.toFixed(5)}°N, ${center.lng.toFixed(5)}°E` : 'Loading map...'}
          </Text>
          {fromGps !== null && (
            <Text style={styles.muted}>
              {fromGps <= 3 ? 'At your GPS position' : `${fromGps} m from your GPS position`}
              {gps?.accuracy ? ` · GPS accuracy ±${Math.round(gps.accuracy)} m` : ''}
            </Text>
          )}
          <View style={styles.row}>
            <TouchableOpacity style={[styles.btn, styles.btnGhost]} onPress={onClose} disabled={busy}>
              <Text style={[styles.btnText, { color: colors.textPrimary }]}>Cancel</Text>
            </TouchableOpacity>
            <TouchableOpacity
              style={[styles.btn, styles.btnMain, (!center || busy) && { opacity: 0.6 }]}
              onPress={confirm}
              disabled={!center || busy}
              accessibilityLabel="Use this spot as the waste location"
            >
              {busy ? <ActivityIndicator color="#fff" /> : <Text style={[styles.btnText, { color: '#fff' }]}>Use this spot</Text>}
            </TouchableOpacity>
          </View>
        </View>
      </SafeAreaView>
    </Modal>
  );
}

const createStyles = (c: ThemeColors) => StyleSheet.create({
  root: { flex: 1, backgroundColor: c.appBg },
  header: { paddingHorizontal: 16, paddingTop: Platform.OS === 'android' ? 36 : 12, paddingBottom: 10, backgroundColor: c.surface },
  title: { fontSize: 16, fontWeight: '700', color: c.textPrimary },
  hint: { fontSize: 12, color: c.textSecondary, marginTop: 4, lineHeight: 17 },
  mapWrap: { flex: 1 },
  webview: { flex: 1, backgroundColor: 'transparent' },
  // The emoji's tip sits at the bottom centre of its box, so lift the box by its height.
  pinWrap: { position: 'absolute', left: 0, right: 0, top: 0, bottom: 0, alignItems: 'center', justifyContent: 'center' },
  pin: { fontSize: 40, marginBottom: 44 },
  gpsBtn: {
    position: 'absolute', left: 12, bottom: 12, backgroundColor: c.surface, borderRadius: 18,
    paddingHorizontal: 12, paddingVertical: 8, elevation: 3, shadowColor: c.shadow, shadowOpacity: 0.2, shadowRadius: 4,
  },
  gpsBtnText: { fontSize: 12, fontWeight: '700', color: c.blueText },
  footer: { padding: 16, backgroundColor: c.surface, gap: 4 },
  coords: { fontSize: 13, fontWeight: '600', color: c.textPrimary },
  muted: { fontSize: 11, color: c.textMuted },
  row: { flexDirection: 'row', gap: 10, marginTop: 10 },
  btn: { flex: 1, borderRadius: 12, paddingVertical: 13, alignItems: 'center', justifyContent: 'center' },
  btnGhost: { backgroundColor: c.grayBg },
  btnMain: { backgroundColor: c.teal },
  btnText: { fontSize: 14, fontWeight: '700' },
});
