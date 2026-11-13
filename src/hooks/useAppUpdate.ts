import { useEffect } from 'react';
import { Alert, AppState, Linking, Platform } from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { AppUpdate, checkForUpdate } from '../services/appUpdate';

const LATER_KEY = 'cleanstream.update.later.v1';
const LATER_MS = 6 * 60 * 60_000; // "Later" hides that build for 6 hours
const CHECK_EVERY_MS = 30 * 60_000;

/**
 * Checks for a newer CleanStream APK when the app opens and when it comes back to the
 * foreground (at most every 30 minutes), and offers it with an Update button.
 */
export function useAppUpdate() {
  useEffect(() => {
    if (Platform.OS !== 'android') return;
    let lastCheck = 0;
    let showing = false;

    const offer = (u: AppUpdate) => {
      showing = true;
      Alert.alert(
        'Update available',
        `A new version of CleanStream (build ${u.build}) is ready. Tap Update, open the downloaded file, then tap Update again. Your account and reports stay on the phone.`
          + (u.notes ? `\n\nWhat's new:\n${u.notes}` : ''),
        [
          {
            text: 'Later',
            style: 'cancel',
            onPress: () => {
              showing = false;
              AsyncStorage.setItem(LATER_KEY, JSON.stringify({ build: u.build, at: Date.now() })).catch(() => undefined);
            },
          },
          {
            text: 'Update',
            onPress: () => {
              showing = false;
              Linking.openURL(u.apkUrl).catch((e) => console.warn('[Update] Could not open the download:', e));
            },
          },
        ],
        { cancelable: false },
      );
    };

    const run = async () => {
      if (showing || Date.now() - lastCheck < CHECK_EVERY_MS) return;
      lastCheck = Date.now();
      const update = await checkForUpdate();
      if (!update) return;
      try {
        const later = JSON.parse((await AsyncStorage.getItem(LATER_KEY)) ?? 'null') as { build: number; at: number } | null;
        if (later && later.build === update.build && Date.now() - later.at < LATER_MS) return;
      } catch { /* show it */ }
      offer(update);
    };

    run();
    const sub = AppState.addEventListener('change', (s) => { if (s === 'active') run(); });
    return () => sub.remove();
  }, []);
}
