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

export type AccountStatus = 'active' | 'pending' | 'rejected' | 'inactive' | 'removed';

/** Set on Admin / Barangay Official sign-ups, which must pass an ID + face check. */
export type IdVerificationStatus = 'pending' | 'approved' | 'rejected';

export const ID_TYPE_LABELS: Record<string, string> = {
  philsys: 'PhilSys National ID', umid: 'UMID', passport: 'Passport', drivers_license: "Driver's License",
  prc: 'PRC ID', postal: 'Postal ID', voters: "Voter's ID", sss: 'SSS ID', gsis: 'GSIS ID',
  govt_employee: 'Government employee ID', other_govt: 'Other government-issued ID',
};

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
  phone?: string;
  idVerification?: IdVerificationStatus;
  idRejectionReason?: string;
  isActive: boolean;
  isVerified: boolean;
  createdAt: Date | null;
  deletedAt: Date | null;
}

export type AuditAction =
  | 'account.create' | 'account.update' | 'account.verify' | 'account.unverify'
  | 'account.deactivate' | 'account.reactivate' | 'account.remove' | 'account.restore'
  | 'account.reset_password' | 'identity.approve' | 'identity.reject';

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

/** What the phone reported about the photos. Advisory only: it can be faked by a modified app. */
export interface ClientChecks {
  mode?: 'mlkit' | 'unavailable';
  faceOnId?: boolean;
  textReadable?: boolean;
  lastNameOnId?: boolean | null;
  firstNameOnId?: boolean | null;
  liveness?: { neutral?: boolean; smile?: boolean; turn?: boolean };
}

/** An applicant's ID photo and selfies, as stored in `verifications/{uid}` until reviewed. */
export interface Verification {
  uid: string;
  role: Role;
  idType: string;
  idImage: string;
  selfieNeutral: string;
  selfieSmile: string;
  selfieTurn: string;
  clientChecks: ClientChecks;
  status: 'pending' | 'approved' | 'rejected';
  submittedAt: Date | null;
}
