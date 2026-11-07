import { createAsyncThunk, createSlice, PayloadAction } from '@reduxjs/toolkit';
import {
  getReportsByBarangay,
  getReportsByUser,
  updateReportStatus,
} from '../services/reportsService';
import { ReportStatus, WasteReport } from '../types';
import { login, logout, restoreSession } from './authSlice';

interface ReportsState {
  reports: WasteReport[];
  userReports: WasteReport[];
  /** Whose reports `userReports` holds. Another account must never see them. */
  userReportsOwner: string | null;
  selectedReport: WasteReport | null;
  loading: boolean;
  error: string | null;
}

const initialState: ReportsState = {
  reports: [],
  userReports: [],
  userReportsOwner: null,
  selectedReport: null,
  loading: false,
  error: null,
};

/** The Admin's reports: only their own barangay's, none if the account has no barangay. */
export const fetchAllReports = createAsyncThunk('reports/fetchAll', async (barangayId: string | undefined) => {
  if (!barangayId) return [];
  return await getReportsByBarangay(barangayId, 200);
});

export const fetchUserReports = createAsyncThunk(
  'reports/fetchByUser',
  async (userId: string) => {
    return await getReportsByUser(userId);
  },
);

export const changeReportStatus = createAsyncThunk(
  'reports/changeStatus',
  async ({
    reportId,
    status,
    changedByUserId,
    changedByName,
  }: { reportId: string; status: ReportStatus; changedByUserId: string; changedByName: string }) => {
    await updateReportStatus(reportId, status, changedByUserId, changedByName);
    return { reportId, status };
  },
);

const reportsSlice = createSlice({
  name: 'reports',
  initialState,
  reducers: {
    setSelectedReport(state, action: PayloadAction<WasteReport | null>) {
      state.selectedReport = action.payload;
    },
    upsertReport(state, action: PayloadAction<WasteReport>) {
      const idx = state.reports.findIndex((r) => r.id === action.payload.id);
      if (idx >= 0) state.reports[idx] = action.payload;
      else state.reports.unshift(action.payload);

      const uIdx = state.userReports.findIndex((r) => r.id === action.payload.id);
      if (uIdx >= 0) state.userReports[uIdx] = action.payload;
      else state.userReports.unshift(action.payload);
    },
    clearError(state) { state.error = null; },
  },
  extraReducers: (builder) => {
    builder
      .addCase(fetchAllReports.pending, (state) => { state.loading = true; })
      .addCase(fetchAllReports.fulfilled, (state, action) => {
        state.loading = false;
        state.reports = action.payload;
      })
      .addCase(fetchAllReports.rejected, (state, action) => {
        state.loading = false;
        state.error = action.error.message || 'Failed to load reports';
      })
      // Another account's list is dropped at once, not shown until the new one arrives.
      .addCase(fetchUserReports.pending, (state, action) => {
        state.loading = true;
        if (state.userReportsOwner !== action.meta.arg) {
          state.userReports = [];
          state.userReportsOwner = action.meta.arg;
        }
      })
      .addCase(fetchUserReports.fulfilled, (state, action) => {
        // A slow answer for the previous account (it signed out meanwhile) is thrown away.
        if (action.meta.arg !== state.userReportsOwner) return;
        state.loading = false;
        state.userReports = action.payload;
      })
      .addCase(fetchUserReports.rejected, (state, action) => {
        state.loading = false;
        state.error = action.error.message ?? 'Failed to load reports';
      })
      // Signing out, or a different person signing in on this phone, starts from nothing.
      .addCase(logout.fulfilled, () => initialState)
      .addCase(logout.rejected, () => initialState)
      .addCase(login.fulfilled, (state, action) => (action.payload?.uid === state.userReportsOwner ? state : initialState))
      .addCase(restoreSession.fulfilled, (state, action) => (action.payload?.uid === state.userReportsOwner ? state : initialState))
      .addCase(changeReportStatus.fulfilled, (state, action) => {
        const { reportId, status } = action.payload;
        const r = state.reports.find((x) => x.id === reportId);
        if (r) r.status = status;
        const ur = state.userReports.find((x) => x.id === reportId);
        if (ur) ur.status = status;
      });
  },
});

export const { setSelectedReport, upsertReport, clearError } = reportsSlice.actions;
export default reportsSlice.reducer;
