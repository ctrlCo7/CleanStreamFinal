import { FormEvent, useId, useState } from 'react';
import {
  AccountFormInput, MIN_PASSWORD_LENGTH, NewAccountInput, generatePassword, needsBarangay,
  validateAccountForm, validateNewAccount,
} from '../lib/accountRules';
import { BARANGAYS } from '../lib/barangays';
import { Account, ROLES, ROLE_LABELS, Role } from '../lib/types';
import { Dialog } from './Dialog';

interface BaseProps { onClose: () => void; busy: boolean }

interface CreateProps extends BaseProps {
  mode: 'create';
  onSubmit: (input: NewAccountInput, sendResetEmail: boolean) => void;
}
interface EditProps extends BaseProps {
  mode: 'edit';
  account: Account;
  /** If set, the role can't be changed and this explains why. */
  roleLockedReason?: string;
  onSubmit: (input: AccountFormInput) => void;
}

export function AccountForm(props: CreateProps | EditProps) {
  const editing = props.mode === 'edit' ? props.account : null;
  const [email, setEmail] = useState(editing?.email ?? '');
  const [firstName, setFirstName] = useState(editing?.firstName ?? '');
  const [lastName, setLastName] = useState(editing?.lastName ?? '');
  const [role, setRole] = useState<Role>(editing?.role ?? 'barangay');
  const [barangayId, setBarangayId] = useState(editing?.barangayId ?? '');
  const [employeeId, setEmployeeId] = useState(editing?.employeeId ?? '');
  const [agency, setAgency] = useState(editing?.agency ?? '');
  const [password, setPassword] = useState(() => (props.mode === 'create' ? generatePassword() : ''));
  const [showPassword, setShowPassword] = useState(false);
  const [sendReset, setSendReset] = useState(true);
  const [errors, setErrors] = useState<Record<string, string>>({});
  const uid = useId();
  const id = (name: string) => `${uid}-${name}`;

  const submit = (e: FormEvent) => {
    e.preventDefault();
    const base: AccountFormInput = {
      email, firstName, lastName, role,
      barangayId: needsBarangay(role) ? barangayId : undefined,
      employeeId: employeeId || undefined,
      agency: agency || undefined,
    };
    if (props.mode === 'create') {
      const input: NewAccountInput = { ...base, password };
      const found = validateNewAccount(input);
      setErrors(found);
      if (Object.keys(found).length === 0) props.onSubmit(input, sendReset);
    } else {
      const found = validateAccountForm(base);
      setErrors(found);
      if (Object.keys(found).length === 0) props.onSubmit(base);
    }
  };

  const field = (name: string, label: string, control: React.ReactNode, hint?: string) => (
    <div className="field">
      <label htmlFor={id(name)}>{label}</label>
      {control}
      {errors[name] ? <p className="field-error" id={id(`${name}-err`)}>{errors[name]}</p> : hint ? <p className="field-hint">{hint}</p> : null}
    </div>
  );
  const aria = (name: string) => ({
    id: id(name),
    'aria-invalid': errors[name] ? true : undefined,
    'aria-describedby': errors[name] ? id(`${name}-err`) : undefined,
  });

  return (
    <Dialog title={props.mode === 'create' ? 'Create account' : 'Edit account'} onClose={props.onClose}>
      <form onSubmit={submit} noValidate>
        <div className="dialog-body form-grid">
          {field('firstName', 'First name', <input {...aria('firstName')} value={firstName} onChange={(e) => setFirstName(e.target.value)} autoComplete="off" autoFocus />)}
          {field('lastName', 'Last name', <input {...aria('lastName')} value={lastName} onChange={(e) => setLastName(e.target.value)} autoComplete="off" />)}

          <div className="span-2">
            {field('email', 'Email', <input {...aria('email')} type="email" value={email} onChange={(e) => setEmail(e.target.value)} readOnly={props.mode === 'edit'} autoComplete="off" />,
              props.mode === 'edit' ? "Email is the sign-in ID and can't be changed here." : undefined)}
          </div>

          <div className="span-2">
            {field('role', 'Role',
              <select {...aria('role')} value={role} onChange={(e) => setRole(e.target.value as Role)} disabled={props.mode === 'edit' && !!props.roleLockedReason}>
                {ROLES.map((r) => <option key={r} value={r}>{ROLE_LABELS[r]}</option>)}
              </select>,
              props.mode === 'edit' && props.roleLockedReason ? props.roleLockedReason : undefined)}
            {role === 'superadmin' && (
              <p className="callout callout-warn">Super Admins have full control of every account, including yours. Only give this role to people you fully trust.</p>
            )}
          </div>

          {needsBarangay(role) && (
            <div className="span-2">
              {field('barangayId', 'Barangay',
                <select {...aria('barangayId')} value={barangayId} onChange={(e) => setBarangayId(e.target.value)}>
                  <option value="">Select a barangay…</option>
                  {BARANGAYS.map((b) => <option key={b.id} value={b.id}>{b.name}</option>)}
                </select>)}
            </div>
          )}

          {(role === 'barangay' || role === 'admin' || role === 'cleanup_team') && (
            <>
              {field('employeeId', role === 'barangay' ? 'Employee ID' : 'Employee ID (optional)', <input {...aria('employeeId')} value={employeeId} onChange={(e) => setEmployeeId(e.target.value)} autoComplete="off" />)}
              {field('agency', 'Agency (optional)', <input {...aria('agency')} value={agency} onChange={(e) => setAgency(e.target.value)} autoComplete="off" />)}
            </>
          )}

          {props.mode === 'create' && (
            <div className="span-2">
              {field('password', 'Temporary password',
                <div className="input-row">
                  <input {...aria('password')} type={showPassword ? 'text' : 'password'} value={password} onChange={(e) => setPassword(e.target.value)} autoComplete="new-password" spellCheck={false} />
                  <button type="button" className="btn btn-sm" onClick={() => setShowPassword((s) => !s)}>{showPassword ? 'Hide' : 'Show'}</button>
                  <button type="button" className="btn btn-sm" onClick={() => { setPassword(generatePassword()); setShowPassword(true); }}>Generate</button>
                </div>,
                `At least ${MIN_PASSWORD_LENGTH} characters. You'll see it once after the account is created.`)}
              <label className="check">
                <input type="checkbox" checked={sendReset} onChange={(e) => setSendReset(e.target.checked)} />
                Also email them a link to choose their own password
              </label>
            </div>
          )}
        </div>
        <div className="dialog-actions">
          <button type="button" className="btn" onClick={props.onClose}>Cancel</button>
          <button type="submit" className="btn btn-primary" disabled={props.busy}>
            {props.busy ? 'Saving…' : props.mode === 'create' ? 'Create account' : 'Save changes'}
          </button>
        </div>
      </form>
    </Dialog>
  );
}
