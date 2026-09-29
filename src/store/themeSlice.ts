import { createAsyncThunk, createSlice } from '@reduxjs/toolkit';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { ThemeMode } from '../constants/theme';

const STORAGE_KEY = 'cleanstream_theme_mode';

interface ThemeState {
  mode: ThemeMode;
  loaded: boolean;
}

const initialState: ThemeState = {
  mode: 'system',
  loaded: false,
};

export const loadThemeMode = createAsyncThunk('theme/load', async () => {
  const stored = await AsyncStorage.getItem(STORAGE_KEY);
  return (stored as ThemeMode | null) ?? 'system';
});

export const changeThemeMode = createAsyncThunk(
  'theme/change',
  async (mode: ThemeMode) => {
    await AsyncStorage.setItem(STORAGE_KEY, mode);
    return mode;
  },
);

const themeSlice = createSlice({
  name: 'theme',
  initialState,
  reducers: {},
  extraReducers: (builder) => {
    builder
      .addCase(loadThemeMode.fulfilled, (state, action) => {
        state.mode = action.payload;
        state.loaded = true;
      })
      .addCase(loadThemeMode.rejected, (state) => {
        state.loaded = true;
      })
      .addCase(changeThemeMode.fulfilled, (state, action) => {
        state.mode = action.payload;
      });
  },
});

export default themeSlice.reducer;
