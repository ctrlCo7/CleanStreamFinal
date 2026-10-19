import { describe, expect, it } from 'vitest';
import {
  accountsToCsv, computeStats, filterAccounts, generatePassword, guardDisable, guardRoleChange,
  statusOf, validateNewAccount,
} from './accountRules';
import { Account } from './types';

const acct = (over: Partial<Account>): Account => ({
  uid: 'u1', email: 'a@b.co', firstName: 'Ana', lastName: 'Cruz', role: 'citizen',
  isActive: true, isVerified: false, createdAt: null, deletedAt: null, ...over,
});
const me = { uid: 'me', email: 'me@x.co' };

describe('statusOf', () => {
  it('derives status with removed > inactive > pending > active', () => {
    expect(statusOf(acct({ deletedAt: new Date(), isActive: false }))).toBe('removed');
    expect(statusOf(acct({ isActive: false }))).toBe('inactive');
    expect(statusOf(acct({ role: 'barangay', isVerified: false }))).toBe('pending');
    expect(statusOf(acct({ role: 'cleanup_team', isVerified: false }))).toBe('pending');
    expect(statusOf(acct({ role: 'barangay', isVerified: true }))).toBe('active');
  });
  it('never treats unverified citizens or admins as pending', () => {
    expect(statusOf(acct({ role: 'citizen', isVerified: false }))).toBe('active');
    expect(statusOf(acct({ role: 'admin', isVerified: false }))).toBe('active');
  });
});

describe('guards', () => {
  const root = acct({ uid: 'me', role: 'superadmin', isVerified: true });
  const other = acct({ uid: 'sa2', role: 'superadmin', isVerified: true });
  it("blocks acting on one's own account", () => {
    expect(guardDisable(me, root, [root, other], 'deactivate').ok).toBe(false);
    expect(guardRoleChange(me, root, 'admin', [root, other]).ok).toBe(false);
  });
  it('blocks disabling or demoting the last active Super Admin', () => {
    expect(guardDisable(me, other, [root, other], 'remove').ok).toBe(true);
    expect(guardDisable(me, other, [other], 'remove').ok).toBe(false);
    expect(guardRoleChange(me, other, 'admin', [other]).ok).toBe(false);
  });
  it('allows ordinary changes', () => {
    expect(guardDisable(me, acct({ uid: 'x' }), [root], 'deactivate').ok).toBe(true);
    expect(guardRoleChange(me, acct({ uid: 'x' }), 'barangay', [root]).ok).toBe(true);
  });
});

describe('validateNewAccount', () => {
  const base = { email: 'new@x.co', firstName: 'N', lastName: 'M', role: 'admin' as const, password: 'longenough1' };
  it('accepts a valid admin', () => expect(validateNewAccount(base)).toEqual({}));
  it('requires barangay + employee id for barangay officials', () => {
    const e = validateNewAccount({ ...base, role: 'barangay' });
    expect(e.barangayId).toBeTruthy();
    expect(e.employeeId).toBeTruthy();
  });
  it('rejects bad email, short password, missing names', () => {
    const e = validateNewAccount({ ...base, email: 'nope', password: 'short', firstName: ' ', lastName: '' });
    expect(Object.keys(e).sort()).toEqual(['email', 'firstName', 'lastName', 'password']);
  });
});

describe('cleanup crew accounts', () => {
  const crew = { email: 'crew@x.co', firstName: 'Crew', lastName: 'Leader', role: 'cleanup_team' as const, password: 'longenough1' };
  it('need a barangay and a contact number', () => {
    const e = validateNewAccount(crew);
    expect(e.barangayId).toBeTruthy();
    expect(e.phone).toBeTruthy();
  });
  it('are valid with both', () => {
    expect(validateNewAccount({ ...crew, barangayId: 'tinago', phone: '0917 123 4567' })).toEqual({});
  });
  it('reject a phone number that is not Philippine', () => {
    expect(validateNewAccount({ ...crew, barangayId: 'tinago', phone: '555-1234' }).phone).toBeTruthy();
  });
  it('treat the number as optional for officials but still check it when given', () => {
    const official = { email: 'o@x.co', firstName: 'O', lastName: 'P', role: 'barangay' as const, barangayId: 'tinago', employeeId: 'BSP-1', password: 'longenough1' };
    expect(validateNewAccount(official)).toEqual({});
    expect(validateNewAccount({ ...official, phone: 'nope' }).phone).toBeTruthy();
  });
  it('are found by searching their phone number', () => {
    const list = [acct({ uid: 'c1', role: 'cleanup_team', phone: '+639171234567' }), acct({ uid: 'c2', role: 'citizen' })];
    expect(filterAccounts(list, { query: '+639171234567', role: 'all', status: 'live' }).map((a) => a.uid)).toEqual(['c1']);
  });
});

describe('filterAccounts', () => {
  const list = [
    acct({ uid: '1', firstName: 'Ana', role: 'citizen', barangay: 'Guadalupe' }),
    acct({ uid: '2', firstName: 'Ben', role: 'barangay', isVerified: false, employeeId: 'BSP-9' }),
    acct({ uid: '3', firstName: 'Cy', role: 'admin', isActive: false }),
    acct({ uid: '4', firstName: 'Di', role: 'citizen', deletedAt: new Date() }),
  ];
  it('hides removed accounts in the default view and searches across fields', () => {
    expect(filterAccounts(list, { query: '', role: 'all', status: 'live' }).map((a) => a.uid)).toEqual(['1', '2', '3']);
    expect(filterAccounts(list, { query: 'bsp-9', role: 'all', status: 'live' }).map((a) => a.uid)).toEqual(['2']);
    expect(filterAccounts(list, { query: 'guadalupe', role: 'all', status: 'all' }).map((a) => a.uid)).toEqual(['1']);
  });
  it('matches a full name typed with a space, in any order', () => {
    const named = [acct({ uid: 'n1', firstName: 'Ana', lastName: 'Cruz' }), acct({ uid: 'n2', firstName: 'Ana', lastName: 'Lim' })];
    expect(filterAccounts(named, { query: 'ana cruz', role: 'all', status: 'live' }).map((a) => a.uid)).toEqual(['n1']);
    expect(filterAccounts(named, { query: 'cruz ana', role: 'all', status: 'live' }).map((a) => a.uid)).toEqual(['n1']);
    expect(filterAccounts(named, { query: 'ana zzz', role: 'all', status: 'live' })).toEqual([]);
  });
  it('filters by role and status', () => {
    expect(filterAccounts(list, { query: '', role: 'citizen', status: 'removed' }).map((a) => a.uid)).toEqual(['4']);
    expect(filterAccounts(list, { query: '', role: 'all', status: 'pending' }).map((a) => a.uid)).toEqual(['2']);
    expect(filterAccounts(list, { query: '', role: 'all', status: 'inactive' }).map((a) => a.uid)).toEqual(['3']);
  });
});

describe('computeStats', () => {
  it('counts live accounts, pending, inactive, removed and this week', () => {
    const now = new Date('2026-10-20T00:00:00Z');
    const s = computeStats([
      acct({ uid: '1', createdAt: new Date('2026-10-18T00:00:00Z') }),
      acct({ uid: '2', role: 'barangay', createdAt: new Date('2026-09-01T00:00:00Z') }),
      acct({ uid: '3', isActive: false }),
      acct({ uid: '4', deletedAt: new Date() }),
    ], now);
    expect(s).toMatchObject({ total: 3, pending: 1, inactive: 1, removed: 1, newThisWeek: 1 });
    expect(s.byRole.citizen).toBe(2);
    expect(s.byRole.barangay).toBe(1);
  });
});

describe('generatePassword', () => {
  it('has the requested length and every character class', () => {
    for (let i = 0; i < 50; i++) {
      const p = generatePassword(14);
      expect(p).toHaveLength(14);
      expect(p).toMatch(/[a-z]/);
      expect(p).toMatch(/[A-Z]/);
      expect(p).toMatch(/[0-9]/);
      expect(p).toMatch(/[!@#$%&*\-_?]/);
      expect(p).not.toMatch(/[0O1lI]/);
    }
  });
  it('never goes below the minimum length and differs between calls', () => {
    expect(generatePassword(3).length).toBeGreaterThanOrEqual(8);
    expect(generatePassword()).not.toBe(generatePassword());
  });
});

describe('accountsToCsv', () => {
  it('quotes cells and neutralises spreadsheet formulas', () => {
    const csv = accountsToCsv([acct({ firstName: '=HYPERLINK("http://x")', lastName: 'O"Neil', barangay: 'A, B' })]);
    const row = csv.split('\r\n')[1];
    expect(row).toContain(`"'=HYPERLINK(""http://x"")"`);
    expect(row).toContain('"O""Neil"');
    expect(row).toContain('"A, B"');
  });
});
