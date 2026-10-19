import { Account, AccountStatus, Actor, ROLES, ROLE_LABELS, Role, SELF_REGISTERING_STAFF } from './types';

// ─── Status ──────────────────────────────────────────────────────────────────

export const statusOf = (a: Account): AccountStatus => {
  if (a.deletedAt) return 'removed';
  if (!a.isActive) return 'inactive';
  if (SELF_REGISTERING_STAFF.includes(a.role) && !a.isVerified) return 'pending';
  return 'active';
};

export const fullName = (a: Pick<Account, 'firstName' | 'lastName' | 'email'>): string =>
  `${a.firstName} ${a.lastName}`.trim() || a.email;

// ─── Safety guards ───────────────────────────────────────────────────────────

export interface GuardResult { ok: boolean; reason?: string }
const allowed: GuardResult = { ok: true };
const blocked = (reason: string): GuardResult => ({ ok: false, reason });

const isLastActiveSuperAdmin = (target: Account, all: Account[]): boolean =>
  target.role === 'superadmin' &&
  statusOf(target) !== 'removed' &&
  !all.some((a) => a.uid !== target.uid && a.role === 'superadmin' && statusOf(a) === 'active');

/** Deactivating or removing: never yourself, never the last active Super Admin. */
export const guardDisable = (actor: Actor, target: Account, all: Account[], verb: string): GuardResult => {
  if (target.uid === actor.uid) return blocked(`You can't ${verb} your own account.`);
  if (isLastActiveSuperAdmin(target, all)) {
    return blocked(`This is the last active Super Admin, so it can't be ${verb}d.`);
  }
  return allowed;
};

export const guardRoleChange = (actor: Actor, target: Account, newRole: Role, all: Account[]): GuardResult => {
  if (newRole === target.role) return allowed;
  if (target.uid === actor.uid) return blocked("You can't change your own role.");
  if (isLastActiveSuperAdmin(target, all)) {
    return blocked("This is the last active Super Admin, so its role can't be changed.");
  }
  return allowed;
};

// ─── Validation ──────────────────────────────────────────────────────────────

export interface AccountFormInput {
  email: string;
  firstName: string;
  lastName: string;
  role: Role;
  barangayId?: string;
  employeeId?: string;
  agency?: string;
}
export interface NewAccountInput extends AccountFormInput { password: string }

export const MIN_PASSWORD_LENGTH = 8;
const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export const needsBarangay = (role: Role): boolean => role === 'citizen' || role === 'barangay';

export const validateAccountForm = (input: AccountFormInput): Record<string, string> => {
  const errors: Record<string, string> = {};
  if (!input.firstName.trim()) errors.firstName = 'First name is required.';
  if (!input.lastName.trim()) errors.lastName = 'Last name is required.';
  if (!EMAIL_RE.test(input.email.trim())) errors.email = 'Enter a valid email address.';
  if (!ROLES.includes(input.role)) errors.role = 'Choose a role.';
  if (needsBarangay(input.role) && !input.barangayId) errors.barangayId = 'Choose a barangay for this role.';
  if (input.role === 'barangay' && !input.employeeId?.trim()) {
    errors.employeeId = 'Employee ID is required for barangay officials.';
  }
  return errors;
};

export const validateNewAccount = (input: NewAccountInput): Record<string, string> => {
  const errors = validateAccountForm(input);
  if (input.password.length < MIN_PASSWORD_LENGTH) {
    errors.password = `Use at least ${MIN_PASSWORD_LENGTH} characters.`;
  }
  return errors;
};

// ─── Filtering ───────────────────────────────────────────────────────────────

export interface AccountFilter {
  query: string;
  role: Role | 'all';
  /** 'live' = everything except removed accounts. */
  status: AccountStatus | 'all' | 'live';
}

export const filterAccounts = (accounts: Account[], f: AccountFilter): Account[] => {
  // Every word typed must appear somewhere on the account, so "ana cruz" finds Ana Cruz.
  const words = f.query.trim().toLowerCase().split(/\s+/).filter(Boolean);
  return accounts.filter((a) => {
    const status = statusOf(a);
    if (f.role !== 'all' && a.role !== f.role) return false;
    if (f.status === 'live') {
      if (status === 'removed') return false;
    } else if (f.status !== 'all' && status !== f.status) {
      return false;
    }
    if (words.length === 0) return true;
    const haystack = [a.firstName, a.lastName, a.email, a.barangay, a.employeeId, a.agency, ROLE_LABELS[a.role]]
      .map((v) => v ?? '').join(' ').toLowerCase();
    return words.every((w) => haystack.includes(w));
  });
};

// ─── Stats ───────────────────────────────────────────────────────────────────

export interface AccountStats {
  total: number;
  byRole: Record<Role, number>;
  pending: number;
  inactive: number;
  removed: number;
  newThisWeek: number;
}

export const computeStats = (accounts: Account[], now: Date = new Date()): AccountStats => {
  const byRole = Object.fromEntries(ROLES.map((r) => [r, 0])) as Record<Role, number>;
  let pending = 0;
  let inactive = 0;
  let removed = 0;
  let newThisWeek = 0;
  let total = 0;
  const weekAgo = now.getTime() - 7 * 24 * 3600 * 1000;
  for (const a of accounts) {
    const s = statusOf(a);
    if (s === 'removed') { removed++; continue; }
    total++;
    byRole[a.role]++;
    if (s === 'pending') pending++;
    if (s === 'inactive') inactive++;
    if (a.createdAt && a.createdAt.getTime() >= weekAgo) newThisWeek++;
  }
  return { total, byRole, pending, inactive, removed, newThisWeek };
};

// ─── Password generation ─────────────────────────────────────────────────────

const LOWER = 'abcdefghijkmnpqrstuvwxyz';
const UPPER = 'ABCDEFGHJKLMNPQRSTUVWXYZ';
const DIGITS = '23456789';
const SYMBOLS = '!@#$%&*-_?';

const secureInt = (max: number): number => {
  const limit = Math.floor(0x100000000 / max) * max;
  const buf = new Uint32Array(1);
  do { crypto.getRandomValues(buf); } while (buf[0] >= limit);
  return buf[0] % max;
};

/** A random password with at least one of each character class (ambiguous 0/O/1/l/I excluded). */
export const generatePassword = (length = 14, randomInt: (max: number) => number = secureInt): string => {
  const all = LOWER + UPPER + DIGITS + SYMBOLS;
  const pick = (set: string) => set[randomInt(set.length)];
  const chars = [pick(LOWER), pick(UPPER), pick(DIGITS), pick(SYMBOLS)];
  while (chars.length < Math.max(length, MIN_PASSWORD_LENGTH)) chars.push(pick(all));
  for (let i = chars.length - 1; i > 0; i--) {
    const j = randomInt(i + 1);
    [chars[i], chars[j]] = [chars[j], chars[i]];
  }
  return chars.join('');
};

// ─── CSV export ──────────────────────────────────────────────────────────────

// A cell starting with = + - @ is treated as a formula by spreadsheet apps; prefix it so a
// hostile name like "=HYPERLINK(...)" is shown as text instead of being executed.
const csvCell = (value: unknown): string => {
  let s = value == null ? '' : String(value);
  if (/^[=+\-@\t\r]/.test(s)) s = `'${s}`;
  return `"${s.replace(/"/g, '""')}"`;
};

export const accountsToCsv = (accounts: Account[]): string => {
  const header = ['First name', 'Last name', 'Email', 'Role', 'Status', 'Barangay', 'Employee ID', 'Agency', 'Created'];
  const rows = accounts.map((a) => [
    a.firstName, a.lastName, a.email, ROLE_LABELS[a.role], statusOf(a), a.barangay, a.employeeId, a.agency,
    a.createdAt ? a.createdAt.toISOString() : '',
  ]);
  return [header, ...rows].map((r) => r.map(csvCell).join(',')).join('\r\n');
};
