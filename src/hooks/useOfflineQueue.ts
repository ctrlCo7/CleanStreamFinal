import { useEffect, useState } from 'react';
import { AppState } from 'react-native';
import { QueueState, loadQueue, subscribeQueue, syncOfflineReports } from '../services/offlineQueue';

/** Live view of the reports waiting on this phone. */
export function useOfflineQueue(): QueueState {
  const [state, setState] = useState<QueueState>({ items: [], syncing: false });
  useEffect(() => subscribeQueue(setState), []);
  return state;
}

/**
 * Uploads saved reports when the app opens, when it returns to the foreground, and every
 * two minutes while it is open. `onSent` runs after anything went up (e.g. to refresh lists).
 */
export function useOfflineSync(userId: string | undefined, onSent?: (count: number) => void) {
  useEffect(() => {
    if (!userId) return;
    let alive = true;
    const run = () => {
      syncOfflineReports(userId)
        .then((n) => { if (alive && n > 0) onSent?.(n); })
        .catch((e) => console.warn('[Offline] Sync failed:', e));
    };
    loadQueue().then(run);
    const sub = AppState.addEventListener('change', (s) => { if (s === 'active') run(); });
    const timer = setInterval(run, 120_000);
    return () => { alive = false; sub.remove(); clearInterval(timer); };
    // onSent is a callback from the caller; re-running on its identity would restart the timer.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [userId]);
}
