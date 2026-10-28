import { describe, expect, it } from 'vitest';
import { DEFAULT_APP_SETTINGS, parseAppSettings } from '../appSettings';
import { categoryOf, isMuted, isOn } from '../notificationPrefs';

describe('parseAppSettings', () => {
  it('treats a missing document as all defaults (everything on)', () => {
    expect(parseAppSettings(undefined)).toEqual(DEFAULT_APP_SETTINGS);
  });
  it('reads switches the Super Admin turned off, leaving the rest on', () => {
    const s = parseAppSettings({
      featureFlags: { messaging: false, mapView: false },
      notificationSettings: { criticalAlerts: false },
      aiReviewThreshold: 75,
      supportEmail: 'help@cebu.gov.ph',
    });
    expect(s.features).toMatchObject({ messaging: false, mapView: false, aiAnalysis: true, cleanupEvents: true });
    expect(s.notifications).toMatchObject({ criticalAlerts: false, enablePush: true });
    expect(s.aiReviewThreshold).toBe(75);
    expect(s.supportEmail).toBe('help@cebu.gov.ph');
  });
  it('ignores a nonsense threshold', () => {
    expect(parseAppSettings({ aiReviewThreshold: 250 }).aiReviewThreshold).toBe(60);
    expect(parseAppSettings({ aiReviewThreshold: 'high' }).aiReviewThreshold).toBe(60);
  });
});

describe('notification preferences', () => {
  it('sorts every notification type into a category', () => {
    expect(categoryOf('report_verified')).toBe('reports');
    expect(categoryOf('task_assigned')).toBe('tasks');
    expect(categoryOf('announcement')).toBe('community');
    expect(categoryOf('message')).toBe('messages');
    expect(categoryOf('system')).toBe('alerts');
  });
  it('has everything on until the person turns it off', () => {
    expect(isOn(undefined, 'dailyAlarm')).toBe(true);
    expect(isMuted({}, 'message')).toBe(false);
    expect(isMuted({ messages: false }, 'message')).toBe(true);
    expect(isMuted({ messages: false }, 'report_completed')).toBe(false);
    expect(isOn({ dailyAlarm: false }, 'dailyAlarm')).toBe(false);
  });
});
