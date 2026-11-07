import { beforeEach, describe, expect, it, vi } from 'vitest';
import { configureStore } from '@reduxjs/toolkit';

// No Firebase in tests: each account's "database" is a list here, answered when we say so.
const pending: Record<string, Array<(r: unknown[]) => void>> = {};
vi.mock('../reportsService', () => ({
  getReportsByUser: (uid: string) => new Promise((resolve) => { (pending[uid] ??= []).push(resolve); }),
  getReportsByBarangay: async () => [],
  updateReportStatus: async () => undefined,
}));
vi.mock('../authService', () => ({
  loginUser: async (email: string) => ({ userData: { uid: email, role: 'citizen' } }),
  logoutUser: async () => undefined,
  registerUser: async () => ({}),
  getUsableProfile: async () => null,
}));

const { default: reportsReducer, fetchUserReports } = await import('../../store/reportsSlice');
const { default: authReducer, login, logout } = await import('../../store/authSlice');

const report = (id: string, userId: string) => ({ id, userId, status: 'pending' });
const answer = (uid: string, reports: unknown[]) => { pending[uid].shift()!(reports); };
const newStore = () => configureStore({ reducer: { auth: authReducer, reports: reportsReducer }, middleware: (g) => g({ serializableCheck: false }) });

describe("a citizen never sees another account's reports", () => {
  beforeEach(() => { for (const k of Object.keys(pending)) delete pending[k]; });

  it('clears the list when someone signs out', async () => {
    const store = newStore();
    const a = store.dispatch(fetchUserReports('anna'));
    answer('anna', [report('r1', 'anna')]);
    await a;
    expect(store.getState().reports.userReports).toHaveLength(1);

    await store.dispatch(logout());
    expect(store.getState().reports.userReports).toHaveLength(0);
  });

  it("drops the previous account's list as soon as another account loads", async () => {
    const store = newStore();
    const a = store.dispatch(fetchUserReports('anna'));
    answer('anna', [report('r1', 'anna'), report('r2', 'anna')]);
    await a;
    expect(store.getState().reports.userReports).toHaveLength(2);

    const b = store.dispatch(fetchUserReports('ben')); // still loading
    expect(store.getState().reports.userReports).toHaveLength(0);
    answer('ben', [report('r9', 'ben')]);
    await b;
    expect(store.getState().reports.userReports.map((r) => r.id)).toEqual(['r9']);
  });

  it("ignores a slow answer for the account that already signed out", async () => {
    const store = newStore();
    const a = store.dispatch(fetchUserReports('anna')); // anna's request is slow...
    await store.dispatch(login({ email: 'ben', password: 'x' }));
    const b = store.dispatch(fetchUserReports('ben'));
    answer('ben', [report('r9', 'ben')]);
    await b;
    answer('anna', [report('r1', 'anna')]); // ...and arrives after ben signed in
    await a;
    expect(store.getState().reports.userReports.map((r) => r.id)).toEqual(['r9']);
  });
});
