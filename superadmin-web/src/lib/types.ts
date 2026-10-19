export type Role = 'citizen' | 'barangay' | 'cleanup_team' | 'admin' | 'superadmin';

export const ROLES: Role[] = ['citizen', 'barangay', 'cleanup_team', 'admin', 'superadmin'];

export const ROLE_LABELS: Record<Role, string> = {
  citizen: 'Citizen',
  barangay: 'Barangay official',
  cleanup_team: 'Cleanup team',
  admin: 'Admin',
  superadmin: 'Super Admin',
};

/** Roles that can self-register in the mobile app and therefore wait for approval. */
export const SELF_REGISTERING_STAFF: Role[] = ['barangay', 'cleanup_team'];

export type AccountStatus = 'active' | 'pending' | 'inactive' | 'removed';

export interface Account {
  uid: string;
  email: string;
  firstName: string;
  lastName: string;
  role: Role;
  barangay?: string;
  barangayId?: string;
  employeeId?: string;
  agency?: string;
  isActive: boolean;
  isVerified: boolean;
  createdAt: Date | null;
  deletedAt: Date | null;
}

export type AuditAction =
  | 'account.create' | 'account.update' | 'account.verify' | 'account.unverify'
  | 'account.deactivate' | 'account.reactivate' | 'account.remove' | 'account.restore'
  | 'account.reset_password';

export interface AuditEntry {
  id: string;
  action: AuditAction;
  actorUid: string;
  actorEmail: string;
  targetUid: string;
  targetEmail: string;
  targetName: string;
  details: string;
  createdAt: Date | null;
}

export interface Actor { uid: string; email: string }
