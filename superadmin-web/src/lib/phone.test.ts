import { describe, expect, it } from 'vitest';
import { formatPhone, normalizePhone } from './phone';

describe('normalizePhone', () => {
  it('accepts the usual ways of writing a Philippine mobile number', () => {
    for (const input of ['09171234567', '0917 123 4567', '0917-123-4567', '+63 917 123 4567', '639171234567', '9171234567', ' (0917) 123-4567 ']) {
      expect(normalizePhone(input)).toBe('+639171234567');
    }
  });
  it('accepts landlines with an area code (Cebu 032)', () => {
    expect(normalizePhone('(032) 123-4567')).toBe('+63321234567');
    expect(normalizePhone('0321234567')).toBe('+63321234567');
    expect(normalizePhone('+63 32 123 4567')).toBe('+63321234567');
    expect(normalizePhone('02 8123 4567')).toBe('+6328123 4567'.replace(' ', ''));
  });
  it('rejects things that are not phone numbers', () => {
    for (const input of ['', 'abc', '12345', '0917123456', '09171234567890', '+1 555 123 4567', '0917 123 45x7', '999999999999999']) {
      expect(normalizePhone(input)).toBeNull();
    }
  });
});

describe('formatPhone', () => {
  it('spaces a mobile number for reading and leaves landlines alone', () => {
    expect(formatPhone('+639171234567')).toBe('+63 917 123 4567');
    expect(formatPhone('+63321234567')).toBe('+63321234567');
  });
});
