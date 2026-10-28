import { configureStore } from '@reduxjs/toolkit';
import authReducer from './authSlice';
import reportsReducer from './reportsSlice';
import themeReducer from './themeSlice';
import languageReducer from './languageSlice';

export const store = configureStore({
  reducer: {
    auth: authReducer,
    reports: reportsReducer,
    theme: themeReducer,
    language: languageReducer,
  },
  middleware: (getDefaultMiddleware) =>
    getDefaultMiddleware({ serializableCheck: false }),
});

export type RootState = ReturnType<typeof store.getState>;
export type AppDispatch = typeof store.dispatch;
