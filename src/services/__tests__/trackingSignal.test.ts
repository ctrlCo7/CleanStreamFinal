import { describe, expect, it } from 'vitest';
import { movementStatus, noteReceived, secondsSinceSeen } from '../../components/map/trackingStatus';
import { CrewTracking } from '../../types';

const trip = (taskId: string, updatedAtMs: number) =>
  ({ taskId, updatedAtMs, status: 'en_route', remainingM: 2000, offRoute: false }) as unknown as CrewTracking;

describe('live tracking "signal lost"', () => {
  it('ignores a crew phone whose clock is a few minutes behind', () => {
    const now = 1_000_000_000;
    const t = trip('skew', now - 3 * 60 * 1000); // crew clock 3 min slow, update just sent
    noteReceived(t, now);
    expect(secondsSinceSeen(t, now + 2000)).toBe(2);
    expect(movementStatus(t, secondsSinceSeen(t, now + 2000))).not.toBe('lost');
  });

  it('counts from when each new update arrived on this phone', () => {
    const now = 2_000_000_000;
    noteReceived(trip('beat', now - 90_000), now);
    const next = trip('beat', now - 75_000); // the next heartbeat, still on the slow clock
    noteReceived(next, now + 15_000);
    expect(secondsSinceSeen(next, now + 20_000)).toBe(5);
  });

  it('still says lost when updates stop coming', () => {
    const now = 3_000_000_000;
    const t = trip('quiet', now);
    noteReceived(t, now);
    expect(movementStatus(t, secondsSinceSeen(t, now + 61_000))).toBe('lost');
  });

  it('believes a first copy that is clearly old (crew phone died long ago)', () => {
    const now = 4_000_000_000;
    const t = trip('dead', now - 30 * 60 * 1000);
    noteReceived(t, now);
    expect(movementStatus(t, secondsSinceSeen(t, now))).toBe('lost');
  });
});
