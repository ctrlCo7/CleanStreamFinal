import { createAsyncThunk, createSlice, PayloadAction } from '@reduxjs/toolkit';
import {
  getUserProfile,
  loginUser,
  logoutUser,
  registerUser,
} from '../services/authService';
import { User, UserRole } from '../types';

interface AuthState {
  user: User | null;
  loading: boolean;
  error: string | null;
  isAuthenticated: boolean;
}

const initialState: AuthState = {
  user: null,
  loading: false,
  error: null,
  isAuthenticated: false,
};

export const login = createAsyncThunk(
  'auth/login',
  async ({ email, password }: { email: string; password: string }, { rejectWithValue }) => {
    try {
      const { userData } = await loginUser(email, password);
      return userData;
    } catch (e: unknown) {
      return rejectWithValue((e as Error).message);
    }
  },
);

export const register = createAsyncThunk(
  'auth/register',
  async (
    params: {
      email: string;
      password: string;
      firstName: string;
      lastName: string;
      role: UserRole;
      barangay?: string;
      employeeId?: string;
      agency?: string;
    },
    { rejectWithValue },
  ) => {
    try {
      return await registerUser(
        params.email,
        params.password,
        params.firstName,
        params.lastName,
        params.role,
        params.barangay,
        params.employeeId,
        params.agency,
      );
    } catch (e: unknown) {
      return rejectWithValue((e as Error).message);
    }
  },
);

export const logout = createAsyncThunk('auth/logout', async () => {
  await logoutUser();
});

export const restoreSession = createAsyncThunk(
  'auth/restoreSession',
  async (uid: string, { rejectWithValue }) => {
    try {
      const userData = await getUserProfile(uid);
      if (!userData) throw new Error('Profile not found');
      return userData;
    } catch (e: unknown) {
      return rejectWithValue((e as Error).message);
    }
  },
);

const authSlice = createSlice({
  name: 'auth',
  initialState,
  reducers: {
    clearError(state) {
      state.error = null;
    },
    setUser(state, action: PayloadAction<User | null>) {
      state.user = action.payload;
      state.isAuthenticated = !!action.payload;
    },
  },
  extraReducers: (builder) => {
    builder
      .addCase(login.pending, (state) => { state.loading = true; state.error = null; })
      .addCase(login.fulfilled, (state, action) => {
        state.loading = false;
        state.user = action.payload;
        state.isAuthenticated = true;
      })
      .addCase(login.rejected, (state, action) => {
        state.loading = false;
        state.error = action.payload as string;
      })
      .addCase(register.pending, (state) => { state.loading = true; state.error = null; })
      .addCase(register.fulfilled, (state, action) => {
        state.loading = false;
        state.user = action.payload;
        state.isAuthenticated = true;
      })
      .addCase(register.rejected, (state, action) => {
        state.loading = false;
        state.error = action.payload as string;
      })
      .addCase(logout.fulfilled, (state) => {
        state.user = null;
        state.isAuthenticated = false;
      })
      .addCase(restoreSession.fulfilled, (state, action) => {
        state.user = action.payload;
        state.isAuthenticated = true;
      })
      .addCase(restoreSession.rejected, (state) => {
        state.user = null;
        state.isAuthenticated = false;
      });
  },
});

export const { clearError, setUser } = authSlice.actions;
export default authSlice.reducer;
