import { useEffect, useState } from 'react';
import { subscribeToSystemSettings } from '../services/systemSettingsService';

/**
 * Live maintenance-mode switch, set by the Super Admin in the web portal (System settings).
 * While it's on, report screens refuse new submissions and show the message.
 */
export function useMaintenance(): { enabled: boolean; message: string } {
  const [state, setState] = useState({ enabled: false, message: '' });
  useEffect(
    () =>
      subscribeToSystemSettings((s) =>
        setState({ enabled: s?.maintenanceMode === true, message: s?.maintenanceMessage?.trim() ?? '' }),
      ),
    [],
  );
  return state;
}

export const maintenanceText = (message: string) =>
  message || 'CleanStream is under maintenance and is not accepting new reports right now. Please try again later.';
