import { describe, expect, it, vi } from 'vitest';

vi.mock('../firebase', () => ({ db: {} }));
const { crewRequestProblems } = await import('../crewRequestService');
const { notificationTarget } = await import('../notificationRouting');

const ok = { teamName: 'Talamban Crew 2', crewSize: 6, reason: 'More reports than one crew can handle' };

describe('requesting a cleanup team account', () => {
  it('accepts a complete request', () => {
    expect(crewRequestProblems(ok)).toEqual({});
    expect(crewRequestProblems({ ...ok, leaderEmail: 'leader@example.com', leaderPhone: '0917 123 4567' })).toEqual({});
  });

  it('explains what is missing or wrong', () => {
    const p = crewRequestProblems({ teamName: 'ab', crewSize: 0, reason: 'short', leaderEmail: 'nope', leaderPhone: '123' });
    expect(Object.keys(p).sort()).toEqual(['crewSize', 'leaderEmail', 'leaderPhone', 'reason', 'teamName']);
    expect(crewRequestProblems({ ...ok, crewSize: 2.5 }).crewSize).toBeTruthy();
    expect(crewRequestProblems({ ...ok, crewSize: Number.NaN }).crewSize).toBeTruthy();
  });

  it("opens the requests screen when the Super Admin's answer is tapped", () => {
    const n = { type: 'crew_request' as const };
    expect(notificationTarget(n, 'barangay')).toEqual({ screen: 'RequestCrew' });
    expect(notificationTarget(n, 'admin')).toEqual({ screen: 'RequestCrew' });
    expect(notificationTarget(n, 'citizen')).toBeNull();
  });
});
