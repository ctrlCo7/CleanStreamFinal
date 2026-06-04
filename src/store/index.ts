import { configureStore } from '@reduxjs/toolkit';
import authReducer from './authSlice';
import reportsReducer from './reportsSlice';

export const store = configureStore({
  reducer: {
    auth: authReducer,
    reports: reportsReducer,
  },
  middleware: (getDefaultMiddleware) =>
    getDefaultMiddleware({ serializableCheck: false }),
});

export type RootState = ReturnType<typeof store.getState>;
export type AppDispatch = typeof store.dispatch;
