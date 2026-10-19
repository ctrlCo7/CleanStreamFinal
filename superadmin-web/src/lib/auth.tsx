import { ReactNode, createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react';
import { onAuthStateChanged, signInWithEmailAndPassword, signOut } from 'firebase/auth';
import { doc, getDoc } from 'firebase/firestore';
import { statusOf } from './accountRules';
import { toAccount } from './accounts';
import { auth, db } from './firebase';
import { Account, Actor } from './types';

type AuthState =
  | { status: 'loading' }
  | { status: 'signed-out'; message?: string }
  | { status: 'ready'; actor: Actor; profile: Account };

interface AuthApi {
  state: AuthState;
  signIn: (email: string, password: string) => Promise<void>;
  logOut: () => Promise<void>;
}

const AuthContext = createContext<AuthApi | null>(null);

const friendlyAuthError = (e: unknown): string => {
  const code = (e as { code?: string }).code ?? '';
  if (['auth/invalid-credential', 'auth/wrong-password', 'auth/user-not-found', 'auth/invalid-email'].includes(code)) {
    return 'Incorrect email or password.';
  }
  if (code === 'auth/too-many-requests') return 'Too many attempts. Wait a few minutes and try again.';
  if (code === 'auth/network-request-failed') return 'No connection. Check your internet and try again.';
  if (code === 'auth/user-disabled') return 'This account has been disabled.';
  return (e as Error).message || 'Sign-in failed.';
};

export function AuthProvider({ children }: { children: ReactNode }) {
  const [state, setState] = useState<AuthState>({ status: 'loading' });

  useEffect(() => {
    return onAuthStateChanged(auth, async (user) => {
      if (!user) {
        setState((s) => (s.status === 'signed-out' ? s : { status: 'signed-out' }));
        return;
      }
      try {
        const snap = await getDoc(doc(db, 'users', user.uid));
        const profile = snap.exists() ? toAccount(snap.id, snap.data()) : null;
        if (!profile || profile.role !== 'superadmin' || statusOf(profile) === 'removed' || !profile.isActive) {
          await signOut(auth);
          setState({
            status: 'signed-out',
            message: 'This portal is only for Super Admin accounts. Use the CleanStream app for other roles.',
          });
          return;
        }
        setState({ status: 'ready', actor: { uid: user.uid, email: profile.email || user.email || '' }, profile });
      } catch (e) {
        await signOut(auth).catch(() => undefined);
        setState({ status: 'signed-out', message: `Could not load your profile: ${(e as Error).message}` });
      }
    });
  }, []);

  const signIn = useCallback(async (email: string, password: string) => {
    try {
      await signInWithEmailAndPassword(auth, email.trim(), password);
    } catch (e) {
      throw new Error(friendlyAuthError(e));
    }
  }, []);

  const logOut = useCallback(async () => {
    await signOut(auth);
  }, []);

  const value = useMemo(() => ({ state, signIn, logOut }), [state, signIn, logOut]);
  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth(): AuthApi {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuth must be used inside <AuthProvider>');
  return ctx;
}

/** The signed-in Super Admin. Only call from screens rendered after sign-in. */
export function useActor(): Actor {
  const { state } = useAuth();
  if (state.status !== 'ready') throw new Error('useActor called while signed out');
  return state.actor;
}
