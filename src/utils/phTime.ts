/**
 * Philippine Standard Time (UTC+8, no daylight saving) for everything that depends on "today"
 * or a time of day: cleanup schedules, checkpoint due/missed times and alarms. Computed from
 * the UTC instant, so it is right even if a phone's own time zone is set to something else.
 * Pure, so it is unit-tested.
 */
export const PH_OFFSET_MS = 8 * 60 * 60 * 1000;

const shifted = (d: Date) => new Date(d.getTime() + PH_OFFSET_MS);

/** "YYYY-MM-DD" of the given instant in the Philippines. */
export function phDateKey(d: Date = new Date()): string {
  const s = shifted(d);
  return `${s.getUTCFullYear()}-${String(s.getUTCMonth() + 1).padStart(2, '0')}-${String(s.getUTCDate()).padStart(2, '0')}`;
}

/** Minutes since midnight in the Philippines (0–1439). */
export function phMinutes(d: Date = new Date()): number {
  const s = shifted(d);
  return s.getUTCHours() * 60 + s.getUTCMinutes();
}

const DAYS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'] as const;
export type WeekdayShort = (typeof DAYS)[number];

/** Day of the week in the Philippines, as "Mon".."Sun". */
export function phWeekday(d: Date = new Date()): WeekdayShort {
  return DAYS[shifted(d).getUTCDay()];
}

/** "HH:mm" → minutes since midnight; NaN if malformed. */
export function hhmmToMinutes(hhmm: string): number {
  const m = /^(\d{1,2}):(\d{2})$/.exec((hhmm ?? '').trim());
  if (!m) return NaN;
  const h = Number(m[1]), min = Number(m[2]);
  return h < 24 && min < 60 ? h * 60 + min : NaN;
}

/** The instant of a Philippine wall-clock date and time ("2026-11-04", "07:30"). */
export function phInstant(dateKey: string, hhmm: string): Date {
  const [y, mo, d] = dateKey.split('-').map(Number);
  const mins = hhmmToMinutes(hhmm);
  return new Date(Date.UTC(y, mo - 1, d, 0, Number.isFinite(mins) ? mins : 0) - PH_OFFSET_MS);
}

/** The Philippine date key `days` days after `dateKey`. */
export function addDaysKey(dateKey: string, days: number): string {
  const [y, mo, d] = dateKey.split('-').map(Number);
  const t = new Date(Date.UTC(y, mo - 1, d + days));
  return `${t.getUTCFullYear()}-${String(t.getUTCMonth() + 1).padStart(2, '0')}-${String(t.getUTCDate()).padStart(2, '0')}`;
}

const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

/** A timestamp shown in Philippine time: "Nov 4, 2026, 9:05 AM PHT". */
export function formatPH(value: string | number | Date | null | undefined): string {
  if (value == null || value === '') return '—';
  const d = value instanceof Date ? value : new Date(value);
  if (Number.isNaN(d.getTime())) return '—';
  const s = shifted(d);
  const h = s.getUTCHours();
  return `${MONTHS[s.getUTCMonth()]} ${s.getUTCDate()}, ${s.getUTCFullYear()}, ${h % 12 === 0 ? 12 : h % 12}:${String(s.getUTCMinutes()).padStart(2, '0')} ${h < 12 ? 'AM' : 'PM'} PHT`;
}

/** Weekday of a date key ("2026-11-04" → "Wed"). */
export function weekdayOfKey(dateKey: string): WeekdayShort {
  const [y, mo, d] = dateKey.split('-').map(Number);
  return DAYS[new Date(Date.UTC(y, mo - 1, d)).getUTCDay()];
}
