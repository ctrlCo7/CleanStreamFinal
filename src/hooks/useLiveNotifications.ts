import { useEffect, useRef } from 'react';
import { Platform } from 'react-native';
import { NavigationContainerRef } from '@react-navigation/native';
import { RootStackParamList, User } from '../types';
import { subscribeToNotifications } from '../services/notificationService';
import { getNotifications } from '../services/notificationsModule';
import { appSettings } from '../services/appSettings';
import { notificationTarget } from '../services/notificationRouting';
import { registerInStaffDirectory } from '../services/staffDirectory';
import { hasPushToken, registerPushToken } from '../services/pushService';

const CHANNEL_ID = 'cleanstream-updates';

/**
 * Makes notifications actually reach people. Every notification CleanStream creates is a
 * Firestore document; without this, staff never saw theirs. While the app is open or in the
 * background, each new one pops up as a phone notification (respecting the person's muted
 * categories and the Super Admin's push switch), and tapping it opens the right screen.
 * Officials and Captains are also listed in their barangay's staff directory, so residents'
 * reports reach them.
 *
 * Limitation: with the app fully closed nothing can pop up; that needs server push (Firebase
 * Cloud Messaging via Cloud Functions, which needs the paid plan). The notifications list
 * still shows everything on the next open.
 */
export function useLiveNotifications(
  user: User | null | undefined,
  navRef: React.RefObject<NavigationContainerRef<RootStackParamList> | null>,
) {
  const seen = useRef<Set<string> | null>(null);
  const role = user?.role;
  const uid = user?.uid;

  useEffect(() => { registerInStaffDirectory(user).catch(() => undefined); }, [uid, role, user?.barangayId]); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    const N = getNotifications();
    if (!uid || !N) return undefined;
    seen.current = null;
    let cancelled = false;
    (async () => {
      try {
        if (Platform.OS === 'android') {
          await N.setNotificationChannelAsync(CHANNEL_ID, { name: 'CleanStream updates', importance: N.AndroidImportance.HIGH });
        }
        const perm = await N.getPermissionsAsync();
        if (!perm.granted && perm.canAskAgain) await N.requestPermissionsAsync();
        // Pushes reach the phone even when the app is closed (once push is set up).
        if (!cancelled) await registerPushToken(user);
      } catch (e) {
        console.warn('[Notify] Setup failed (non-fatal):', e);
      }
    })();
    const unsub = subscribeToNotifications(uid, (list) => {
      if (cancelled) return;
      // The first load is history: only notices that arrive after that pop up.
      if (!seen.current) { seen.current = new Set(list.map((n) => n.id)); return; }
      const fresh = list.filter((n) => !n.read && !seen.current!.has(n.id));
      fresh.forEach((n) => seen.current!.add(n.id));
      // With push set up, the push itself is the phone notification (no duplicate pop-up).
      if (!appSettings().notifications.enablePush || hasPushToken()) return;
      fresh.forEach((n) => {
        N.scheduleNotificationAsync({
          content: { title: n.title, body: n.body, sound: 'default', data: { notificationId: n.id, type: n.type, reportId: n.reportId, taskId: n.taskId, eventId: n.eventId } },
          trigger: Platform.OS === 'android' ? { channelId: CHANNEL_ID } as never : null,
        }).catch((e) => console.warn('[Notify] Could not show notification (non-fatal):', e));
      });
    });
    return () => { cancelled = true; unsub(); };
  }, [uid]); // eslint-disable-line react-hooks/exhaustive-deps

  // Keep the muted kinds saved with the push token in step with Notification settings.
  const prefsKey = JSON.stringify(user?.notificationPrefs ?? {});
  useEffect(() => {
    if (uid) registerPushToken(user).catch(() => undefined);
  }, [prefsKey]); // eslint-disable-line react-hooks/exhaustive-deps

  // Tapping a phone notification opens the right screen for this person.
  useEffect(() => {
    const N = getNotifications();
    if (!N || !uid) return undefined;
    const sub = N.addNotificationResponseReceivedListener((resp) => {
      const d = resp.notification.request.content.data as { type?: string; reportId?: string; taskId?: string; eventId?: string } | undefined;
      if (!d?.type) return;
      const target = notificationTarget({ type: d.type as never, reportId: d.reportId, taskId: d.taskId, eventId: d.eventId }, role);
      if (target && navRef.current?.isReady()) {
        (navRef.current.navigate as (s: string, p?: object) => void)(target.screen, target.params);
      }
    });
    return () => sub.remove();
  }, [uid, role, navRef]);
}
