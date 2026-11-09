import React, { useEffect, useMemo, useState } from 'react';
import {
  Alert, AlertButton, AlertOptions, Modal, Pressable, ScrollView, StyleSheet, Text, View,
} from 'react-native';
import Svg, { Path } from 'react-native-svg';
import { useTheme } from '../../hooks/useTheme';
import { ThemeColors } from '../../constants/theme';
import { DialogTone, dialogTone } from './dialogTone';

interface Dialog {
  id: number;
  title: string;
  message?: string;
  buttons: AlertButton[];
  options?: AlertOptions;
}

let show: ((d: Dialog) => void) | null = null;
let seq = 0;
const nativeAlert = Alert.alert.bind(Alert);

/**
 * Sends every Alert.alert in the app to CleanStream's own dialog, so error, success and
 * confirmation pop-ups look consistent and branded instead of the plain system box.
 * Call once at startup. Until <AppDialogHost /> is on screen, the system alert is used.
 */
export function installAppDialogs(): void {
  Alert.alert = (title: string, message?: string, buttons?: AlertButton[], options?: AlertOptions) => {
    if (!show) {
      nativeAlert(title, message, buttons, options);
      return;
    }
    show({ id: ++seq, title, message, buttons: buttons && buttons.length ? buttons : [{ text: 'OK' }], options });
  };
}

function ToneIcon({ tone, colors }: { tone: DialogTone; colors: ThemeColors }) {
  const fg = { error: colors.red, success: colors.teal, warning: colors.amber, info: colors.blue }[tone];
  const bg = { error: colors.redBg, success: colors.tealLight, warning: colors.amberBg, info: colors.blueBg }[tone];
  const path = {
    error: 'M8 8l8 8M16 8l-8 8',
    success: 'M6 12.5l4 4 8-9',
    warning: 'M12 6.5v7M12 17.4v.1',
    info: 'M12 11v6M12 7.4v.1',
  }[tone];
  return (
    <View style={[iconStyles.ring, { backgroundColor: bg }]}>
      <Svg width={26} height={26} viewBox="0 0 24 24" fill="none">
        <Path d={path} stroke={fg} strokeWidth={2.6} strokeLinecap="round" strokeLinejoin="round" />
      </Svg>
    </View>
  );
}

const iconStyles = StyleSheet.create({
  ring: { width: 52, height: 52, borderRadius: 26, alignItems: 'center', justifyContent: 'center', alignSelf: 'center', marginBottom: 14 },
});

/** Shows queued dialogs one at a time. Mount once, near the root of the app. */
export function AppDialogHost() {
  const { colors } = useTheme();
  const styles = useMemo(() => createStyles(colors), [colors]);
  const [queue, setQueue] = useState<Dialog[]>([]);

  useEffect(() => {
    show = (d) => setQueue((q) => [...q, d]);
    return () => { show = null; };
  }, []);

  const current = queue[0];
  if (!current) return null;
  const tone = dialogTone(current.title, current.message);

  const close = (button?: AlertButton) => {
    setQueue((q) => q.slice(1));
    // Run the button's action after the dialog has gone, as the system alert does.
    if (button?.onPress) setTimeout(() => button.onPress?.(), 0);
  };

  // Android's back button: allowed when the alert is cancelable or has a Cancel button.
  const cancelButton = current.buttons.find((b) => b.style === 'cancel');
  const onRequestClose = () => {
    if (cancelButton) close(cancelButton);
    else if (current.options?.cancelable !== false && current.buttons.length <= 1) {
      close();
      current.options?.onDismiss?.();
    }
  };

  // Cancel first (secondary), then the others; the last one is the main action.
  const ordered = [...current.buttons.filter((b) => b.style === 'cancel'), ...current.buttons.filter((b) => b.style !== 'cancel')];
  const stacked = ordered.length > 2 || ordered.some((b) => (b.text ?? '').length > 16);

  return (
    <Modal transparent visible animationType="fade" statusBarTranslucent onRequestClose={onRequestClose}>
      <View style={styles.backdrop}>
        <View style={styles.card} accessibilityRole="alert" accessibilityLiveRegion="assertive">
          <ToneIcon tone={tone} colors={colors} />
          <Text style={styles.title}>{current.title}</Text>
          {!!current.message && (
            <ScrollView style={styles.messageBox} contentContainerStyle={{ flexGrow: 1 }}>
              <Text style={styles.message}>{current.message}</Text>
            </ScrollView>
          )}
          <View style={[styles.buttons, stacked && styles.buttonsStacked]}>
            {ordered.map((b, i) => {
              const isLast = i === ordered.length - 1;
              const kind = b.style === 'destructive' ? 'danger' : b.style === 'cancel' || !isLast ? 'secondary' : 'primary';
              return (
                <Pressable
                  key={`${b.text}-${i}`}
                  onPress={() => close(b)}
                  accessibilityRole="button"
                  style={({ pressed }) => [
                    styles.button,
                    !stacked && { flex: 1 },
                    kind === 'primary' && { backgroundColor: tone === 'error' ? colors.textPrimary : colors.teal },
                    kind === 'danger' && { backgroundColor: colors.red },
                    kind === 'secondary' && styles.buttonSecondary,
                    pressed && { opacity: 0.8 },
                  ]}
                >
                  <Text
                    style={[styles.buttonText, kind === 'secondary' ? { color: colors.textPrimary } : { color: tone === 'error' && kind === 'primary' ? colors.surface : '#ffffff' }]}
                    numberOfLines={2}
                  >
                    {b.text ?? 'OK'}
                  </Text>
                </Pressable>
              );
            })}
          </View>
        </View>
      </View>
    </Modal>
  );
}

const createStyles = (C: ThemeColors) => StyleSheet.create({
  backdrop: { flex: 1, backgroundColor: 'rgba(8, 18, 15, 0.55)', alignItems: 'center', justifyContent: 'center', padding: 28 },
  card: {
    width: '100%', maxWidth: 380, backgroundColor: C.surface, borderRadius: 22, paddingHorizontal: 22, paddingTop: 24, paddingBottom: 18,
    shadowColor: '#000', shadowOpacity: 0.22, shadowRadius: 24, shadowOffset: { width: 0, height: 10 }, elevation: 12,
  },
  title: { fontSize: 18, fontWeight: '700', color: C.textPrimary, textAlign: 'center', marginBottom: 8 },
  messageBox: { maxHeight: 280, marginBottom: 4 },
  message: { fontSize: 14.5, lineHeight: 21, color: C.textSecondary, textAlign: 'center' },
  buttons: { flexDirection: 'row', gap: 10, marginTop: 18 },
  buttonsStacked: { flexDirection: 'column-reverse' },
  button: { minHeight: 48, borderRadius: 14, paddingHorizontal: 14, alignItems: 'center', justifyContent: 'center' },
  buttonSecondary: { backgroundColor: C.grayBg, borderWidth: 1, borderColor: C.border },
  buttonText: { fontSize: 15, fontWeight: '700', textAlign: 'center' },
});
