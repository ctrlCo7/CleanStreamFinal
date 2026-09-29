import React, { useEffect } from 'react';
import { StatusBar } from 'expo-status-bar';
import { Provider } from 'react-redux';
import { store } from './src/store';
import { useAppDispatch } from './src/store/hooks';
import { loadThemeMode } from './src/store/themeSlice';
import { useTheme } from './src/hooks/useTheme';
import RootNavigator from './src/navigation/RootNavigator';

function AppShell() {
  const dispatch = useAppDispatch();
  const { isDark } = useTheme();

  useEffect(() => {
    dispatch(loadThemeMode());
  }, [dispatch]);

  return (
    <>
      <StatusBar style={isDark ? 'light' : 'dark'} />
      <RootNavigator />
    </>
  );
}

export default function App() {
  return (
    <Provider store={store}>
      <AppShell />
    </Provider>
  );
}
