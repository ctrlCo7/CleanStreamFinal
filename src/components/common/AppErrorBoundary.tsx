import React from 'react';
import { ScrollView, StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { signOut } from 'firebase/auth';
import { auth } from '../../services/firebase';

type ErrorListener = (error: Error) => void;
let listener: ErrorListener | null = null;

interface ErrorUtilsLike {
  getGlobalHandler(): (error: Error, isFatal?: boolean) => void;
  setGlobalHandler(handler: (error: Error, isFatal?: boolean) => void): void;
}

/**
 * In a release build any uncaught JavaScript error closes the app with no message.
 * Route those to the on-screen error view instead, so the user can see (and send)
 * what went wrong rather than just "it crashed".
 */
export function installGlobalErrorHandler(): void {
  const errorUtils = (globalThis as { ErrorUtils?: ErrorUtilsLike }).ErrorUtils;
  if (!errorUtils) return;
  const previous = errorUtils.getGlobalHandler();
  errorUtils.setGlobalHandler((error, isFatal) => {
    if (isFatal && listener) listener(error);
    else previous(error, isFatal);
  });
}

interface State { error: Error | null; componentStack?: string }

export class AppErrorBoundary extends React.Component<{ children: React.ReactNode }, State> {
  state: State = { error: null };

  static getDerivedStateFromError(error: Error): State {
    return { error };
  }

  componentDidMount() {
    listener = (error) => this.setState({ error });
  }

  componentWillUnmount() {
    listener = null;
  }

  componentDidCatch(error: Error, info: { componentStack?: string | null }) {
    console.error('[AppErrorBoundary]', error, info.componentStack);
    this.setState({ componentStack: info.componentStack ?? undefined });
  }

  private reset = () => this.setState({ error: null, componentStack: undefined });

  private signOutAndReset = async () => {
    try {
      await signOut(auth);
    } catch {
      // nothing more to do -- just reset below
    }
    this.reset();
  };

  render() {
    const { error, componentStack } = this.state;
    if (!error) return this.props.children;

    // Fixed colours and no theme/navigation hooks: this view has to work even when
    // those are what broke.
    return (
      <View style={styles.container}>
        <Text style={styles.title}>Something went wrong</Text>
        <Text style={styles.sub}>
          CleanStream hit an error. Please screenshot this screen and send it to the developer.
        </Text>
        <ScrollView style={styles.box} contentContainerStyle={{ padding: 12 }}>
          <Text selectable style={styles.message}>{error.message || String(error)}</Text>
          {!!error.stack && <Text selectable style={styles.stack}>{error.stack.slice(0, 1400)}</Text>}
          {!!componentStack && <Text selectable style={styles.stack}>{componentStack.slice(0, 700)}</Text>}
        </ScrollView>
        <TouchableOpacity style={styles.primary} onPress={this.reset}>
          <Text style={styles.primaryText}>Try again</Text>
        </TouchableOpacity>
        <TouchableOpacity style={styles.secondary} onPress={this.signOutAndReset}>
          <Text style={styles.secondaryText}>Sign out and restart</Text>
        </TouchableOpacity>
      </View>
    );
  }
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#FFFFFF', padding: 20, paddingTop: 56, gap: 12 },
  title: { fontSize: 20, fontWeight: '700', color: '#1A1A18' },
  sub: { fontSize: 13, color: '#6B6A64', lineHeight: 19 },
  box: { flex: 1, backgroundColor: '#F4F3EE', borderRadius: 12 },
  message: { fontSize: 13, fontWeight: '600', color: '#B03A2E', marginBottom: 8 },
  stack: { fontSize: 10, color: '#4A4A44', marginBottom: 8, fontFamily: 'monospace' },
  primary: { backgroundColor: '#1D9E75', borderRadius: 12, paddingVertical: 13, alignItems: 'center' },
  primaryText: { color: '#fff', fontSize: 14, fontWeight: '600' },
  secondary: { borderRadius: 12, paddingVertical: 13, alignItems: 'center', backgroundColor: '#F4F3EE' },
  secondaryText: { color: '#1A1A18', fontSize: 14, fontWeight: '600' },
});
