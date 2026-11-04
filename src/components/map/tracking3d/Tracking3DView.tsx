import React, { forwardRef, useEffect, useImperativeHandle, useMemo, useRef, useState } from 'react';
import { Platform, StyleProp, StyleSheet, View, ViewStyle } from 'react-native';
import { WebView, WebViewMessageEvent } from 'react-native-webview';
import { CameraState, Frame3D, Page3DCommand, Page3DMessage, tracking3dHtml } from './tracking3dPage';

export interface Tracking3DHandle { command: (c: Page3DCommand) => void }

interface Props {
  frame: Frame3D;
  dark: boolean;
  driver: boolean;
  onCamera?: (c: CameraState) => void;
  /** The phone can't draw the 3D map (no WebGL, or the map library didn't load). */
  onUnavailable?: (reason: string) => void;
  style?: StyleProp<ViewStyle>;
}

const parse = (raw: unknown): Page3DMessage | null => {
  if (typeof raw !== 'string') return null;
  try { return JSON.parse(raw) as Page3DMessage; } catch { return null; }
};

/**
 * The 3D tracking map (tracking3dPage.ts) in a WebView on phones, or an iframe on the web.
 * The page is built once per theme; GPS updates and camera commands are pushed into it, so
 * it never reloads or flickers while the truck drives.
 */
export const Tracking3DView = forwardRef<Tracking3DHandle, Props>(function Tracking3DView(
  { frame, dark, driver, onCamera, onUnavailable, style }, ref,
) {
  const web = useRef<WebView>(null);
  const iframe = useRef<HTMLIFrameElement | null>(null);
  const [loaded, setLoaded] = useState(false);
  const first = useRef(frame).current;
  const html = useMemo(() => tracking3dHtml({ dark, driver, frame: first }), [dark, driver]); // eslint-disable-line react-hooks/exhaustive-deps
  const handlers = useRef({ onCamera, onUnavailable });
  handlers.current = { onCamera, onUnavailable };

  useEffect(() => setLoaded(false), [html]);

  const run = (fn: 'csUpdate' | 'csCmd', arg: unknown) => {
    if (Platform.OS === 'web') {
      const w = iframe.current?.contentWindow as (Window & Record<string, (a: unknown) => void>) | null | undefined;
      try { w?.[fn]?.(arg); } catch (e) { console.warn('[Map3D] Page call failed:', e); }
      return;
    }
    web.current?.injectJavaScript(`window.${fn} && window.${fn}(${JSON.stringify(arg)}); true;`);
  };

  useImperativeHandle(ref, () => ({ command: (c) => { if (loaded) run('csCmd', c); } }), [loaded]); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    if (loaded) run('csUpdate', frame);
  }, [frame, loaded]); // eslint-disable-line react-hooks/exhaustive-deps

  const handle = (msg: Page3DMessage | null) => {
    if (!msg) return;
    if (msg.type === 'camera') handlers.current.onCamera?.(msg);
    else if (msg.type === 'nogl') handlers.current.onUnavailable?.(msg.reason);
    else if (msg.type === 'error') console.warn('[Map3D] Page error:', msg.message);
  };

  // Web: the page talks to us with postMessage from its iframe.
  useEffect(() => {
    if (Platform.OS !== 'web' || typeof window === 'undefined') return undefined;
    const onMsg = (e: MessageEvent) => {
      if (e.source !== iframe.current?.contentWindow) return;
      handle(parse((e.data as { cs3d?: unknown } | null)?.cs3d));
    };
    window.addEventListener('message', onMsg);
    return () => window.removeEventListener('message', onMsg);
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  if (Platform.OS === 'web') {
    return (
      <View style={[styles.container, style]}>
        {React.createElement('iframe', {
          key: html.length + (dark ? 'd' : 'l'),
          ref: iframe,
          srcDoc: html,
          title: '3D live tracking map',
          onLoad: () => setLoaded(true),
          style: { border: 0, width: '100%', height: '100%', display: 'block' },
        })}
      </View>
    );
  }

  return (
    <View style={[styles.container, style]}>
      <WebView
        ref={web}
        source={{ html }}
        originWhitelist={['*']}
        style={styles.webview}
        onLoadEnd={() => setLoaded(true)}
        onMessage={(e: WebViewMessageEvent) => handle(parse(e.nativeEvent.data))}
        onError={() => handlers.current.onUnavailable?.('webview')}
        onRenderProcessGone={() => handlers.current.onUnavailable?.('crashed')}
        onContentProcessDidTerminate={() => web.current?.reload()}
        javaScriptEnabled
        domStorageEnabled
        scrollEnabled={false}
        overScrollMode="never"
        androidLayerType="hardware"
        setBuiltInZoomControls={false}
      />
    </View>
  );
});

const styles = StyleSheet.create({
  container: { flex: 1 },
  webview: { flex: 1, backgroundColor: 'transparent' },
});
