/**
 * Plain-language sign-in and sign-up errors. Firebase reports codes like
 * "auth/invalid-credential"; people should see what went wrong and what to do.
 * Errors that are already written for people (e.g. "This account has been deactivated")
 * pass through unchanged. No imports, so it is unit-tested directly.
 */
const MESSAGES: Record<string, string> = {
  'auth/invalid-credential': 'Wrong email or password. Check them and try again.',
  'auth/wrong-password': 'Wrong email or password. Check them and try again.',
  'auth/user-not-found': 'Wrong email or password. Check them and try again.',
  'auth/invalid-email': "That email address isn't valid. Check it and try again.",
  'auth/missing-password': 'Enter your password.',
  'auth/too-many-requests': 'Too many attempts. Wait a few minutes, or reset your password.',
  'auth/network-request-failed': 'No internet connection. Connect and try again.',
  'auth/user-disabled': 'This account has been disabled. Please contact the Super Admin.',
  'auth/email-already-in-use': 'An account with this email already exists. Sign in instead.',
  'auth/weak-password': 'Choose a stronger password (at least 6 characters).',
};

export function friendlyAuthError(e: unknown): string {
  const err = e as { code?: string; message?: string } | null;
  const code = err?.code ?? err?.message?.match(/\(?(auth\/[a-z-]+)\)?/)?.[1];
  if (code && MESSAGES[code]) return MESSAGES[code];
  if (code?.startsWith('auth/')) return 'Something went wrong while signing in. Try again in a moment.';
  return err?.message || 'Something went wrong. Try again in a moment.';
}
