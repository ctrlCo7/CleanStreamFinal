/**
 * react-native-webview 14 declares `class WebView<P = undefined>` with props `WebViewProps & P`;
 * with React 19.3's types `WebViewProps & undefined` collapses to `never`, so every prop is
 * rejected by TypeScript. It is only a typing problem (the component itself is unchanged), so
 * the same component is re-exported here with correct prop types. Import WebView from here.
 */
import type React from 'react';
import { WebView as RNWebView, WebViewProps } from 'react-native-webview';

export type { WebViewMessageEvent, WebViewProps } from 'react-native-webview';

/** The instance type, for refs: useRef<WebView>(null). */
export type WebView = RNWebView;
export const WebView = RNWebView as unknown as React.ComponentType<WebViewProps & React.RefAttributes<RNWebView>>;
