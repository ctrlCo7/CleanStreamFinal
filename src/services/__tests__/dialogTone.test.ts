import { describe, expect, it } from 'vitest';
import { dialogTone } from '../../components/common/dialogTone';

describe('pop-up type from its title', () => {
  it.each([
    ['Sign in failed', 'error'],
    ['Request not sent', 'error'],
    ["Couldn't check", 'error'],
    ['Location not shared', 'error'],
    ['Request sent', 'success'],
    ['Account created', 'success'],
    ['Email sent', 'success'],
    ['Task finished', 'success'],
    ['Recorded', 'success'],
    ['Cancel this request?', 'warning'],
    ['Stop sharing your location?', 'warning'],
    ['Missing fields', 'warning'],
    ['Pin the exact spot', 'warning'],
    ['Confirm your location', 'warning'],
    ['Keep CleanStream open', 'warning'],
    ['Support', 'info'],
  ])('%s → %s', (title, tone) => {
    expect(dialogTone(title)).toBe(tone);
  });

  it('falls back to the message for neutral titles', () => {
    expect(dialogTone('Report', 'The upload failed. Try again.')).toBe('error');
    expect(dialogTone('Report', 'Saved on your phone.')).toBe('info');
  });
});
