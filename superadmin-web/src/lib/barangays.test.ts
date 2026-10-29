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
    // Mohon is in Talisay, not Cebu City, so it isn't on the built-in list.
    expect(resolveBarangay('Mohon')).toEqual({ ok: true, id: 'mohon', name: 'Mohon', isNew: true });
    expect(resolveBarangay('  Barrio   Niño ')).toMatchObject({ ok: true, id: 'barrio-nino', name: 'Barrio Niño', isNew: true });
    expect(resolveBarangay('Pasil')).toMatchObject({ id: 'pasil', isNew: false });
  });
  it('rejects empty, too short or odd input', () => {
    expect(resolveBarangay('   ').ok).toBe(false);
    expect(resolveBarangay('X').ok).toBe(false);
    expect(resolveBarangay('<script>').ok).toBe(false);
    expect(resolveBarangay('a'.repeat(61)).ok).toBe(false);
  });
  it('knows all 80 barangays of Cebu City, and their other spellings', () => {
    expect(listBarangays()).toHaveLength(80);
    expect(new Set(listBarangays().map((b) => b.id)).size).toBe(80);
    expect(resolveBarangay('Lahug')).toMatchObject({ id: 'lahug', isNew: false });
    expect(resolveBarangay('Camputhaw')).toMatchObject({ id: 'kamputhaw', name: 'Kamputhaw', isNew: false });
    expect(resolveBarangay('Sto. Niño')).toMatchObject({ id: 'santo-nino', name: 'Santo Niño', isNew: false });
    expect(resolveBarangay('Kinasang-an')).toMatchObject({ id: 'kinasang-an', isNew: false });
  });
  it('treats a registered barangay as known', () => {
    setRegisteredBarangays([{ id: 'mohon', name: 'Mohon', custom: true }]);
    expect(resolveBarangay('mohon')).toMatchObject({ id: 'mohon', isNew: false });
    expect(barangayById('mohon')?.name).toBe('Mohon');
    expect(listBarangays().at(-1)?.id).toBe('mohon');
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
    expect(slugifyBarangay('Santo Niño')).toBe('santo-nino');
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
  it('asks Admins for a barangay too (they only see its reports)', () => {
    expect(validateNewAccount({ ...base, role: 'admin' }).barangayId).toBeTruthy();
    expect(validateNewAccount({ ...base, role: 'admin', barangayName: 'Lahug' })).toEqual({});
  });
});
