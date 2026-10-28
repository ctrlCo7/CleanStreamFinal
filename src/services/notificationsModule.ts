import Constants, { ExecutionEnvironment } from 'expo-constants';
import { Platform } from 'react-native';

type NotificationsModule = typeof import('expo-notifications');

let mod: NotificationsModule | null | undefined;

/**
 * expo-notifications, loaded only when it can work. Since SDK 53, Expo Go on Android throws
 * as soon as the module loads (remote notifications were removed from it), which crashed
 * the whole app at startup. There it returns null and local alarms/notices are skipped;
 * development and release builds get the real module.
 */
export function getNotifications(): NotificationsModule | null {
  if (mod !== undefined) return mod;
  if (Platform.OS === 'android' && Constants.executionEnvironment === ExecutionEnvironment.StoreClient) {
    console.warn('[Notifications] Not available in Expo Go on Android; use a development build to test alarms.');
    return (mod = null);
  }
  try {
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    mod = require('expo-notifications') as NotificationsModule;
  } catch (e) {
    console.warn('[Notifications] Could not load expo-notifications:', e);
    mod = null;
  }
  return mod;
}
