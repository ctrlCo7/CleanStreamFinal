import { describe, expect, it } from 'vitest';
import { friendlyAuthError } from '../authMessages';

describe('sign-in errors people can understand', () => {
  it('turns Firebase codes into plain sentences', () => {
    expect(friendlyAuthError({ code: 'auth/invalid-credential' })).toBe('Wrong email or password. Check them and try again.');
    expect(friendlyAuthError(new Error('Firebase: Error (auth/invalid-credential).'))).toBe('Wrong email or password. Check them and try again.');
    expect(friendlyAuthError({ code: 'auth/email-already-in-use' })).toMatch(/already exists/);
  });
  it('keeps messages that are already written for people', () => {
    expect(friendlyAuthError(new Error('This account has been deactivated. Please contact the Super Admin.')))
      .toBe('This account has been deactivated. Please contact the Super Admin.');
  });
  it('never shows an unknown raw code', () => {
    expect(friendlyAuthError({ code: 'auth/internal-error' })).not.toMatch(/auth\//);
  });
});
