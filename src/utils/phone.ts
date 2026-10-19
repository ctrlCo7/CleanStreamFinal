/**
 * Philippine phone numbers. Crews and officials are contacted by phone, so a number must be
 * stored in one dialable form no matter how it was typed.
 */

/** Returns the number in +63 form, or null if it doesn't look like a Philippine mobile or landline. */
export function normalizePhone(input: string): string | null {
  const cleaned = input.trim().replace(/[\s\-().]/g, '');
  if (!/^\+?\d+$/.test(cleaned)) return null;
  const digits = cleaned.replace(/^\+/, '');

  // Mobile: 09XXXXXXXXX, 9XXXXXXXXX or 639XXXXXXXXX (the +63 form)
  if (/^09\d{9}$/.test(digits)) return `+63${digits.slice(1)}`;
  if (/^9\d{9}$/.test(digits)) return `+63${digits}`;
  if (/^639\d{9}$/.test(digits)) return `+${digits}`;

  // Landline with area code: 032 123 4567 (0 + 2-3 digit area code + 7 digits), or already +63
  if (/^0[2-8]\d{8,9}$/.test(digits)) return `+63${digits.slice(1)}`;
  if (/^63[2-8]\d{8,9}$/.test(digits)) return `+${digits}`;
  return null;
}

/** "+639171234567" -> "+63 917 123 4567". Landlines and anything unexpected are returned as given. */
export function formatPhone(normalized: string): string {
  const m = /^\+63(9\d{2})(\d{3})(\d{4})$/.exec(normalized);
  return m ? `+63 ${m[1]} ${m[2]} ${m[3]}` : normalized;
}

/** URLs that open the phone's dialer or messaging app. */
export const telUrl = (normalized: string): string => `tel:${normalized}`;
export const smsUrl = (normalized: string): string => `sms:${normalized}`;
