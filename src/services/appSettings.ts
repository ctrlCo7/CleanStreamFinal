/**
 * The Super Admin's System settings (Firestore `systemSettings/app`, edited in the web
 * portal), applied by the app:
 *  - featureFlags: aiAnalysis, cleanupEvents, messaging, mapView, announcements
 *  - aiReviewThreshold: below this AI confidence the reporter is asked what the waste is
 *  - notificationSettings: enablePush (phone notifications at all), criticalAlerts,
 *    reportUpdateAlerts, inspectionReminders
 * Missing settings mean "on" / the defaults, so a fresh project behaves normally.
 */
import { doc, onSnapshot } from 'firebase/firestore';
import { useEffect, useState } from 'react';
import { db } from './firebase';

export type FeatureFlag = 'aiAnalysis' | 'cleanupEvents' | 'messaging' | 'mapView' | 'announcements';
export type NotificationSwitch = 'enablePush' | 'criticalAlerts' | 'reportUpdateAlerts' | 'inspectionReminders';

export interface AppSettings {
  features: Record<FeatureFlag, boolean>;
  aiReviewThreshold: number;
  notifications: Record<NotificationSwitch, boolean>;
  aiModelVersion?: string;
  supportEmail?: string;
  supportPhone?: string;
}

export const DEFAULT_APP_SETTINGS: AppSettings = {
  features: { aiAnalysis: true, cleanupEvents: true, messaging: true, mapView: true, announcements: true },
  aiReviewThreshold: 60,
  notifications: { enablePush: true, criticalAlerts: true, reportUpdateAlerts: true, inspectionReminders: true },
};

/** Reads the settings document; anything missing or malformed falls back to the default. */
export function parseAppSettings(data: Record<string, unknown> | undefined): AppSettings {
  const d = data ?? {};
  const flags = (d.featureFlags ?? {}) as Record<string, unknown>;
  const notes = (d.notificationSettings ?? {}) as Record<string, unknown>;
  const threshold = typeof d.aiReviewThreshold === 'number' && d.aiReviewThreshold >= 0 && d.aiReviewThreshold <= 100
    ? d.aiReviewThreshold : DEFAULT_APP_SETTINGS.aiReviewThreshold;
  const on = (v: unknown) => v !== false;
  return {
    features: {
      aiAnalysis: on(flags.aiAnalysis), cleanupEvents: on(flags.cleanupEvents), messaging: on(flags.messaging),
      mapView: on(flags.mapView), announcements: on(flags.announcements),
    },
    aiReviewThreshold: threshold,
    notifications: {
      enablePush: on(notes.enablePush), criticalAlerts: on(notes.criticalAlerts),
      reportUpdateAlerts: on(notes.reportUpdateAlerts), inspectionReminders: on(notes.inspectionReminders),
    },
    aiModelVersion: typeof d.aiModelVersion === 'string' ? d.aiModelVersion : undefined,
    supportEmail: typeof d.supportEmail === 'string' ? d.supportEmail : undefined,
    supportPhone: typeof d.supportPhone === 'string' ? d.supportPhone : undefined,
  };
}

let current: AppSettings = DEFAULT_APP_SETTINGS;
const listeners = new Set<(s: AppSettings) => void>();
let unsubscribe: (() => void) | null = null;

/** The latest settings, for code outside React (services). */
export const appSettings = (): AppSettings => current;

/** Starts following the settings (needs a signed-in user). Safe to call more than once. */
export function startAppSettings(): void {
  if (unsubscribe) return;
  unsubscribe = onSnapshot(
    doc(db, 'systemSettings', 'app'),
    (snap) => {
      current = parseAppSettings(snap.exists() ? snap.data() : undefined);
      listeners.forEach((l) => l(current));
    },
    (e) => console.warn('[Settings] Could not load system settings (using defaults):', e),
  );
}

export function stopAppSettings(): void {
  unsubscribe?.();
  unsubscribe = null;
}

/** Live settings for screens. */
export function useAppSettings(): AppSettings {
  const [s, setS] = useState(current);
  useEffect(() => {
    listeners.add(setS);
    setS(current);
    return () => { listeners.delete(setS); };
  }, []);
  return s;
}
