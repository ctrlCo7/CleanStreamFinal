import { lightColors } from './theme';

// Static light-mode palette — used by screens not yet converted to the
// theme-aware `useTheme()` hook (see src/hooks/useTheme.ts). Re-exported from
// theme.ts so the two never drift out of sync.
export const Colors = lightColors;

export type ColorKey = keyof typeof Colors;
