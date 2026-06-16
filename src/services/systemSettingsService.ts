import {
  doc,
  getDoc,
  setDoc,
  updateDoc,
  onSnapshot,
  serverTimestamp,
} from 'firebase/firestore';
import { db } from './firebase';
import { SystemSettings } from '../types';

const DOC_ID = 'app';
const COL = 'systemSettings';

const DEFAULT_SETTINGS: Omit<SystemSettings, 'updatedAt' | 'updatedBy'> = {
  appVersion: '1.0.0',
  minAppVersion: '1.0.0',
  maintenanceMode: false,
  maintenanceMessage: '',
  aiModelVersion: 'v1.0',
  maxPhotoSizeMB: 10,
  allowedPhotoTypes: ['image/jpeg', 'image/png', 'image/webp'],
  defaultSeverityThresholds: {
    critical: 90,
    high: 70,
    moderate: 40,
  },
  notificationSettings: {
    enablePush: true,
    enableEmail: false,
    reportUpdateAlerts: true,
    criticalAlerts: true,
  },
  featureFlags: {
    aiAnalysis: true,
    cleanupEvents: true,
    announcements: true,
    messaging: true,
    mapView: true,
  },
  supportEmail: 'support@cleanstream.ph',
  supportPhone: '+63 900 000 0000',
};

export const initializeSystemSettings = async (adminUserId: string): Promise<void> => {
  const ref = doc(db, COL, DOC_ID);
  const snap = await getDoc(ref);
  if (snap.exists()) return;
  await setDoc(ref, {
    ...DEFAULT_SETTINGS,
    updatedAt: serverTimestamp(),
    updatedBy: adminUserId,
  });
};

export const getSystemSettings = async (): Promise<SystemSettings | null> => {
  const snap = await getDoc(doc(db, COL, DOC_ID));
  if (!snap.exists()) return null;
  return snap.data() as SystemSettings;
};

export const updateSystemSettings = async (
  updates: Partial<Omit<SystemSettings, 'updatedAt'>>,
  updatedByUserId: string,
): Promise<void> => {
  await updateDoc(doc(db, COL, DOC_ID), {
    ...updates,
    updatedBy: updatedByUserId,
    updatedAt: serverTimestamp(),
  });
};

export const setMaintenanceMode = async (
  enabled: boolean,
  message: string,
  updatedByUserId: string,
): Promise<void> => {
  await updateDoc(doc(db, COL, DOC_ID), {
    maintenanceMode: enabled,
    maintenanceMessage: message,
    updatedBy: updatedByUserId,
    updatedAt: serverTimestamp(),
  });
};

export const setFeatureFlag = async (
  flag: string,
  value: boolean,
  updatedByUserId: string,
): Promise<void> => {
  await updateDoc(doc(db, COL, DOC_ID), {
    [`featureFlags.${flag}`]: value,
    updatedBy: updatedByUserId,
    updatedAt: serverTimestamp(),
  });
};

export const subscribeToSystemSettings = (
  callback: (settings: SystemSettings | null) => void,
) => {
  return onSnapshot(doc(db, COL, DOC_ID), (snap) => {
    callback(snap.exists() ? (snap.data() as SystemSettings) : null);
  });
};

export const isFeatureEnabled = async (flag: string): Promise<boolean> => {
  const settings = await getSystemSettings();
  return settings?.featureFlags?.[flag] ?? false;
};

export const isMaintenanceMode = async (): Promise<{ enabled: boolean; message: string }> => {
  const settings = await getSystemSettings();
  return {
    enabled: settings?.maintenanceMode ?? false,
    message: settings?.maintenanceMessage ?? '',
  };
};
