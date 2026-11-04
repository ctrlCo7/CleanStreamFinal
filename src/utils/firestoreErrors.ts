// Turns a failed Firestore write into a message that says why, instead of "please try again".
// No React Native imports (unit-tested).

const codeOf = (e: unknown): string => String((e as { code?: unknown })?.code ?? '').replace(/^firestore\//, '');

/**
 * `action` reads after "couldn't", e.g. "verify this report".
 * `context.otherBarangay` is true when the item belongs to a different barangay than the user.
 */
export function explainWriteError(e: unknown, action: string, context: { otherBarangay?: boolean } = {}): string {
  const code = codeOf(e);
  if (code === 'permission-denied') {
    if (context.otherBarangay) return `You couldn't ${action} because it belongs to another barangay. You can only act on your own barangay's.`;
    return `You're not allowed to ${action}. Your account's barangay may not match, your ID check may not be approved yet, `
      + 'or the app\'s security rules on Firebase need updating. Ask the Super Admin to check your account.';
  }
  if (code === 'unavailable' || code === 'deadline-exceeded') return `Couldn't ${action}: no connection. Check your internet and try again.`;
  if (code === 'not-found') return `Couldn't ${action}: it no longer exists (it may have been deleted).`;
  const detail = (e as { message?: unknown })?.message;
  return `Couldn't ${action}.${detail ? ` (${String(detail)})` : ''} Please try again.`;
}
