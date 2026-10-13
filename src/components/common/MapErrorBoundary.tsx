import React from 'react';

interface Props {
  onError: () => void;
  children: React.ReactNode;
}

interface State {
  hasError: boolean;
}

// react-native-maps with PROVIDER_GOOGLE throws during native view init on
// devices without Google Play Services (e.g. Huawei phones without GMS).
// This boundary catches that crash and tells the parent to swap to the
// OpenStreetMap/Leaflet fallback instead of taking down the whole screen.
export class MapErrorBoundary extends React.Component<Props, State> {
  state: State = { hasError: false };

  static getDerivedStateFromError() {
    return { hasError: true };
  }

  componentDidCatch(error: unknown) {
    console.warn('[Map] Native MapView crashed, falling back to OSM map:', error);
    this.props.onError();
  }

  render() {
    if (this.state.hasError) return null;
    return this.props.children;
  }
}
