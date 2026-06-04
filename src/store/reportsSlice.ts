import { createSlice, createAsyncThunk, PayloadAction } from '@reduxjs/toolkit';
import { WasteReport, ReportStatus } from '../types';
import {
  getAllReports,
  getReportsByUser,
  updateReportStatus,
} from '../services/reportsService';

interface ReportsState {
  reports: WasteReport[];
  userReports: WasteReport[];
  selectedReport: WasteReport | null;
  loading: boolean;
  error: string | null;
}

const initialState: ReportsState = {
  reports: [],
  userReports: [],
  selectedReport: null,
  loading: false,
  error: null,
};

export const fetchAllReports = createAsyncThunk('reports/fetchAll', async () => {
  return await getAllReports();
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
    assignedTeam,
  }: { reportId: string; status: ReportStatus; assignedTeam?: string }) => {
    await updateReportStatus(reportId, status, assignedTeam);
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
      .addCase(fetchUserReports.fulfilled, (state, action) => {
        state.userReports = action.payload;
      })
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
