import { describe, expect, it, vi } from 'vitest';

vi.mock('./firebase', () => ({ db: {} }));
const { sortRequests, splitName, toCrewRequest } = await import('./crewRequests');
const { newPendingIds } = await import('./crewRequestsData');

const ts = (iso: string) => ({ toDate: () => new Date(iso) });
const req = (id: string, status: string, created: string, decided?: string) =>
  toCrewRequest(id, { barangay: 'Talamban', teamName: 'Crew', status, createdAt: ts(created), ...(decided ? { decidedAt: ts(decided) } : {}) });

describe('cleanup team requests in the portal', () => {
  it('reads a request and fills sensible defaults', () => {
    const r = toCrewRequest('x', { barangayId: 'talamban', teamName: 'Crew 2', crewSize: 6, requestedByRole: 'admin', status: 'weird' });
    expect(r).toMatchObject({ barangay: 'talamban', crewSize: 6, requestedByRole: 'admin', status: 'pending' });
  });

  it('lists waiting requests first, oldest first, then answered ones newest first', () => {
    const list = sortRequests([
      req('done-old', 'approved', '2026-11-01', '2026-11-02'),
      req('wait-new', 'pending', '2026-11-06'),
      req('done-new', 'declined', '2026-11-03', '2026-11-05'),
      req('wait-old', 'pending', '2026-11-04'),
    ]);
    expect(list.map((r) => r.id)).toEqual(['wait-old', 'wait-new', 'done-new', 'done-old']);
  });

  it('turns the crew leader into first and last name for the account form', () => {
    expect(splitName({ leaderName: 'Juan Dela Cruz', teamName: 'T', barangay: 'B' })).toEqual({ firstName: 'Juan Dela', lastName: 'Cruz' });
    expect(splitName({ leaderName: 'Juan', teamName: 'T', barangay: 'B' })).toEqual({ firstName: 'Juan', lastName: 'Crew' });
    expect(splitName({ teamName: 'Talamban Crew 2', barangay: 'B' })).toEqual({ firstName: 'Talamban Crew 2', lastName: 'Crew' });
  });

  it('alerts only for requests that are new and waiting, never for the first load', () => {
    const first = [req('a', 'pending', '2026-11-01')];
    expect(newPendingIds(null, first)).toEqual([]);
    const next = [...first, req('b', 'pending', '2026-11-02'), req('c', 'cancelled', '2026-11-02')];
    expect(newPendingIds(new Set(['a']), next)).toEqual(['b']);
  });
});
