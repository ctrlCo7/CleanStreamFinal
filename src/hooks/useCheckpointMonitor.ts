import { useEffect, useMemo, useRef, useState } from 'react';
import { User } from '../types';
import { ManagedCheckpoint, recordMissedCheckpoints, subscribeToBarangayCheckpoints } from '../services/checkpointService';
import { checkpointDayStatus, checkpointProgress, CheckpointDayStatus } from '../services/checkpointStatus';
import { syncCheckpointAlarms } from '../services/checkpointAlarms';
import { phDateKey } from '../utils/phTime';

/**
 * Today's waterway checkpoints for a barangay, live, with each one's status (pending,
 * ongoing, completed, issue detected, missed). Re-evaluated every minute so "missed" appears
 * on time. On an official's phone it also keeps their checkpoint alarms in sync; on any
 * staff phone it records missed checkpoints (once per day each) so the Captain is alerted.
 */
export function useCheckpointMonitor(
  user: User | null | undefined,
  /** Only the always-mounted navigator manages alarms and missed alerts; screens just display. */
  opts: { manage?: boolean } = {},
) {
  const manage = !!opts.manage;
  const [checkpoints, setCheckpoints] = useState<ManagedCheckpoint[] | null>(null);
  const [now, setNow] = useState(() => new Date());
  const reported = useRef(new Set<string>());
  const barangayId = user?.barangayId;
  const uid = user?.uid;
  const role = user?.role;
  const staff = role === 'barangay' || role === 'admin';

  useEffect(() => {
    if (!staff || !barangayId || !uid) { setCheckpoints([]); return undefined; }
    return subscribeToBarangayCheckpoints(barangayId, uid, setCheckpoints);
  }, [staff, barangayId, uid]);

  useEffect(() => {
    const id = setInterval(() => setNow(new Date()), 60000);
    return () => clearInterval(id);
  }, []);

  const statuses = useMemo(() => {
    const m = new Map<string, CheckpointDayStatus>();
    (checkpoints ?? []).forEach((c) => m.set(c.id, checkpointDayStatus(c, now)));
    return m;
  }, [checkpoints, now]);
  const progress = useMemo(() => checkpointProgress(checkpoints ?? [], now), [checkpoints, now]);

  // Official's phone: rebuild their alarms when the schedule or today's inspections change.
  const alarmKey = (checkpoints ?? [])
    .map((c) => `${c.id}:${c.time}:${c.days.join('')}:${c.isActive}:${c.assignedUserIds.join(',')}:${c.lastInspectedAt?.getTime() ?? 0}:${c.inspectionStartedAt?.getTime() ?? 0}`)
    .join('|');
  useEffect(() => {
    if (!manage || role !== 'barangay' || !uid || checkpoints === null) return;
    syncCheckpointAlarms(checkpoints, uid).catch((e) => console.warn('[Checkpoints] Alarm sync failed (non-fatal):', e));
  }, [alarmKey, role, uid, manage]); // eslint-disable-line react-hooks/exhaustive-deps

  // Missed today: alert the Captain and the assigned officials (once per checkpoint per day).
  useEffect(() => {
    if (!manage || !staff || !barangayId || !uid || !role || !checkpoints) return;
    const day = phDateKey(now);
    const missed = checkpoints.filter((c) => statuses.get(c.id) === 'missed' && !reported.current.has(`${c.id}_${day}`));
    if (!missed.length) return;
    missed.forEach((c) => reported.current.add(`${c.id}_${day}`));
    recordMissedCheckpoints(barangayId, missed, { uid, role }, now).catch(() => undefined);
  }, [statuses]); // eslint-disable-line react-hooks/exhaustive-deps

  return { checkpoints, statuses, progress, now };
}
