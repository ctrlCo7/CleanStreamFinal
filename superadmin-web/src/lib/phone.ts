/**
 * Philippine phone numbers. Crews and officials are contacted by phone, so a number is stored in one
 * dialable form (+63...) however it was typed. Keep in sync with src/utils/phone.ts in the app.
 */

/** Returns the number in +63 form, or null if it doesn't look like a Philippine mobile or landline. */
export function normalizePhone(input: string): string | null {
  const cleaned = input.trim().replace(/[\s\-().]/g, '');
  if (!/^\+?\d+$/.test(cleaned)) return null;
  const digits = cleaned.replace(/^\+/, '');

  if (/^09\d{9}$/.test(digits)) return `+63${digits.slice(1)}`;
  if (/^9\d{9}$/.test(digits)) return `+63${digits}`;
  if (/^639\d{9}$/.test(digits)) return `+${digits}`;

  if (/^0[2-8]\d{8,9}$/.test(digits)) return `+63${digits.slice(1)}`;
  if (/^63[2-8]\d{8,9}$/.test(digits)) return `+${digits}`;
  return null;
}

/** "+639171234567" -> "+63 917 123 4567". Landlines and anything unexpected are returned as given. */
export function formatPhone(normalized: string): string {
  const m = /^\+63(9\d{2})(\d{3})(\d{4})$/.exec(normalized);
  return m ? `+63 ${m[1]} ${m[2]} ${m[3]}` : normalized;
}
