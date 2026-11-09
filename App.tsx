import React, { useEffect } from 'react';
import { StatusBar } from 'expo-status-bar';
import { Provider } from 'react-redux';
import { store } from './src/store';
import { useAppDispatch } from './src/store/hooks';
import { loadThemeMode } from './src/store/themeSlice';
import { loadLanguage } from './src/store/languageSlice';
import { useTheme } from './src/hooks/useTheme';
import RootNavigator from './src/navigation/RootNavigator';
import { AppErrorBoundary, installGlobalErrorHandler } from './src/components/common/AppErrorBoundary';
import { AppDialogHost, installAppDialogs } from './src/components/common/AppDialog';
// Registers the crew trip's background location task. It must load with the app, even when
// Android starts CleanStream in the background with no screen open.
import './src/services/crewTrackingService';

installGlobalErrorHandler();
// Every Alert.alert shows CleanStream's own dialog (icon by message type, branded buttons).
installAppDialogs();

function AppShell() {
  const dispatch = useAppDispatch();
  const { isDark } = useTheme();

  useEffect(() => {
    dispatch(loadThemeMode());
    dispatch(loadLanguage());
  }, [dispatch]);

  return (
    <>
      <StatusBar style={isDark ? 'light' : 'dark'} />
      <AppErrorBoundary>
        <RootNavigator />
      </AppErrorBoundary>
      <AppDialogHost />
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
