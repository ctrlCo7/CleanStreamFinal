import { FormEvent, useState } from 'react';
import { LogoMark } from '../components/Icons';
import { useAuth } from '../lib/auth';

export function Login() {
  const { state, signIn } = useAuth();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const denied = state.status === 'signed-out' ? state.message : undefined;

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    setBusy(true);
    setError(null);
    try {
      await signIn(email, password);
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setBusy(false);
    }
  };

  return (
    <main className="login">
      <form className="login-card" onSubmit={submit}>
        <div className="login-brand">
          <LogoMark size={44} />
          <div>
            <h1>CleanStream</h1>
            <p>Super Admin portal</p>
          </div>
        </div>

        {(error || denied) && <p className="callout callout-error" role="alert">{error ?? denied}</p>}

        <div className="field">
          <label htmlFor="email">Email</label>
          <input id="email" type="email" value={email} onChange={(e) => setEmail(e.target.value)} autoComplete="username" required autoFocus />
        </div>
        <div className="field">
          <label htmlFor="password">Password</label>
          <input id="password" type="password" value={password} onChange={(e) => setPassword(e.target.value)} autoComplete="current-password" required />
        </div>

        <button className="btn btn-primary btn-block" type="submit" disabled={busy || !email || !password}>
          {busy ? 'Signing in…' : 'Sign in'}
        </button>
        <p className="login-foot">Restricted to Super Admin accounts. All changes made here are recorded in the audit log.</p>
      </form>
    </main>
  );
}
