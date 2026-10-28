import { createAsyncThunk, createSlice } from '@reduxjs/toolkit';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { Lang } from '../i18n/strings';

const STORAGE_KEY = 'cleanstream_language';
const LANGS: Lang[] = ['en', 'fil', 'ceb'];

interface LanguageState {
  lang: Lang;
}

const initialState: LanguageState = { lang: 'en' };

export const loadLanguage = createAsyncThunk('language/load', async () => {
  const stored = await AsyncStorage.getItem(STORAGE_KEY);
  return LANGS.includes(stored as Lang) ? (stored as Lang) : 'en';
});

export const changeLanguage = createAsyncThunk('language/change', async (lang: Lang) => {
  await AsyncStorage.setItem(STORAGE_KEY, lang);
  return lang;
});

const languageSlice = createSlice({
  name: 'language',
  initialState,
  reducers: {},
  extraReducers: (builder) => {
    builder
      .addCase(loadLanguage.fulfilled, (state, action) => { state.lang = action.payload; })
      .addCase(changeLanguage.fulfilled, (state, action) => { state.lang = action.payload; });
  },
});

export default languageSlice.reducer;
