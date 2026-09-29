import { useCallback } from 'react';
import { useColorScheme } from 'react-native';
import { useAppDispatch, useAppSelector } from '../store/hooks';
import { changeThemeMode } from '../store/themeSlice';
import { darkColors, lightColors, ThemeColors, ThemeMode } from '../constants/theme';

interface UseThemeResult {
  colors: ThemeColors;
  isDark: boolean;
  mode: ThemeMode;
  setMode: (mode: ThemeMode) => void;
}

export function useTheme(): UseThemeResult {
  const dispatch = useAppDispatch();
  const mode = useAppSelector((s) => s.theme.mode);
  const systemScheme = useColorScheme();

  const isDark = mode === 'system' ? systemScheme === 'dark' : mode === 'dark';

  const setMode = useCallback(
    (next: ThemeMode) => {
      dispatch(changeThemeMode(next));
    },
    [dispatch],
  );

  return {
    colors: isDark ? darkColors : lightColors,
    isDark,
    mode,
    setMode,
  };
}
