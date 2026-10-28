import { afterEach, describe, expect, it } from 'vitest';
import { validateNewAccount } from './accountRules';
import { barangayById, cleanBarangayName, listBarangays, resolveBarangay, setRegisteredBarangays, slugifyBarangay } from './barangays';

afterEach(() => setRegisteredBarangays([]));

describe('resolveBarangay', () => {
  it('matches a listed barangay whatever the letter case or "Brgy." prefix', () => {
    for (const typed of ['Guadalupe', 'guadalupe', '  GUADALUPE ', 'Brgy. Guadalupe', 'barangay guadalupe']) {
      expect(resolveBarangay(typed)).toEqual({ ok: true, id: 'guadalupe', name: 'Guadalupe', isNew: false });
    }
    expect(resolveBarangay('basak san nicolas')).toMatchObject({ id: 'basak-san-nicolas', isNew: false });
  });
  it('turns an unlisted name into a new barangay with the same id the app uses', () => {
    expect(resolveBarangay('Lahug')).toEqual({ ok: true, id: 'lahug', name: 'Lahug', isNew: true });
    expect(resolveBarangay('  Sto.   Niño ')).toMatchObject({ ok: true, name: 'Sto. Niño', isNew: true });
    expect(resolveBarangay('Pasil')).toMatchObject({ id: 'pasil' });
  });
  it('rejects empty, too short or odd input', () => {
    expect(resolveBarangay('   ').ok).toBe(false);
    expect(resolveBarangay('X').ok).toBe(false);
    expect(resolveBarangay('<script>').ok).toBe(false);
    expect(resolveBarangay('a'.repeat(61)).ok).toBe(false);
  });
  it('treats a registered barangay as known', () => {
    setRegisteredBarangays([{ id: 'lahug', name: 'Lahug', custom: true }]);
    expect(resolveBarangay('lahug')).toMatchObject({ id: 'lahug', isNew: false });
    expect(barangayById('lahug')?.name).toBe('Lahug');
    expect(listBarangays().at(-1)?.id).toBe('lahug');
  });
  it('never lets a registered entry shadow a built-in one', () => {
    setRegisteredBarangays([{ id: 'guadalupe', name: 'Fake', custom: true }]);
    expect(barangayById('guadalupe')?.name).toBe('Guadalupe');
  });
});

describe('helpers', () => {
  it('slugifies like the mobile app', () => {
    expect(slugifyBarangay('Kinasang-an')).toBe('kinasang-an');
    expect(slugifyBarangay(' Basak San Nicolas ')).toBe('basak-san-nicolas');
  });
  it('cleans typed names', () => {
    expect(cleanBarangayName(' brgy   Lahug ')).toBe('Lahug');
  });
});

describe('account form with a typed barangay', () => {
  const base = { email: 'a@b.co', firstName: 'A', lastName: 'B', password: 'longenough', employeeId: 'E-1' };
  it('accepts a new barangay for an official', () => {
    expect(validateNewAccount({ ...base, role: 'barangay', barangayName: 'Lahug' })).toEqual({});
  });
  it('asks for one when the box is empty', () => {
    expect(validateNewAccount({ ...base, role: 'barangay', barangayName: '' }).barangayId).toBe('Enter the barangay.');
  });
  it("doesn't ask Admins for a barangay", () => {
    expect(validateNewAccount({ ...base, role: 'admin' })).toEqual({});
  });
});
