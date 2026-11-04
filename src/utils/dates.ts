/**
 * Firestore returns fields written with serverTimestamp() as Timestamp objects, not strings, and
 * fields saved as ISO text as strings. Anything shown to a person goes through these helpers so
 * both look right (and a missing value shows "-", never "Invalid Date").
 */

export function toJsDate(value: unknown): Date | null {
  if (!value) return null;
  if (value instanceof Date) return Number.isNaN(value.getTime()) ? null : value;
  if (typeof value === 'object' && typeof (value as { toDate?: unknown }).toDate === 'function') {
    const d = (value as { toDate: () => Date }).toDate();
    return Number.isNaN(d.getTime()) ? null : d;
  }
  if (typeof value === 'string' || typeof value === 'number') {
    const d = new Date(value);
    return Number.isNaN(d.getTime()) ? null : d;
  }
  return null;
}

// Shown in Philippine Standard Time (UTC+8, no daylight saving), whatever the phone's own
// time zone is set to, so every user sees the same dates and times.
const PH = (d: Date) => new Date(d.getTime() + 8 * 3600000);

const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

/** "Oct 20, 2026" (Philippine date) */
export function formatDay(value: unknown): string {
  const d = toJsDate(value);
  if (!d) return '-';
  const p = PH(d);
  return `${MONTHS[p.getUTCMonth()]} ${p.getUTCDate()}, ${p.getUTCFullYear()}`;
}

/** "2:30 PM" (Philippine time) */
export function formatClock(value: unknown): string {
  const d = toJsDate(value);
  if (!d) return '-';
  const p = PH(d);
  const h = p.getUTCHours();
  return `${h % 12 === 0 ? 12 : h % 12}:${String(p.getUTCMinutes()).padStart(2, '0')} ${h < 12 ? 'AM' : 'PM'}`;
}

/** "Oct 20, 2026, 2:30 PM" */
export function formatDayAndTime(value: unknown): string {
  return toJsDate(value) ? `${formatDay(value)}, ${formatClock(value)}` : '-';
}

/** "14:30" -> "2:30 PM" (the app stores task/event times as 24-hour HH:mm text). */
export function formatHHmm(hhmm: string | undefined): string {
  const m = /^(\d{1,2}):(\d{2})$/.exec(hhmm ?? '');
  if (!m) return hhmm || '-';
  const h = Number(m[1]);
  return `${h % 12 === 0 ? 12 : h % 12}:${m[2]} ${h < 12 ? 'AM' : 'PM'}`;
}

/** The Philippine calendar date of an instant, "YYYY-MM-DD" (what tasks and events store in scheduledDate / eventDate). */
export function toDateKey(d: Date): string {
  const p = PH(d);
  return `${p.getUTCFullYear()}-${String(p.getUTCMonth() + 1).padStart(2, '0')}-${String(p.getUTCDate()).padStart(2, '0')}`;
}

/** True only for a real calendar date written as YYYY-MM-DD (rejects 2026-02-31). */
export function isValidDateKey(text: string): boolean {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(text.trim());
  if (!m) return false;
  const d = new Date(Number(m[1]), Number(m[2]) - 1, Number(m[3]));
  return d.getFullYear() === Number(m[1]) && d.getMonth() === Number(m[2]) - 1 && d.getDate() === Number(m[3]);
}

/** Shows a stored YYYY-MM-DD as "Oct 20, 2026" (the plain text is returned if it isn't a valid date). */
export function formatDateKey(key: string | undefined): string {
  if (!key || !isValidDateKey(key)) return key || '-';
  const [y, mo, d] = key.split('-').map(Number);
  return `${MONTHS[mo - 1]} ${d}, ${y}`;
}
