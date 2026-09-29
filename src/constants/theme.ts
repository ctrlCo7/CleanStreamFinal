export const lightColors = {
  teal: '#1D9E75',
  tealDark: '#0F6E56',
  tealDeep: '#085041',
  tealLight: '#E1F5EE',
  tealMid: '#9FE1CB',
  tealPale: '#C8EFE2',

  amber: '#EF9F27',
  amberBg: '#FAEEDA',
  amberText: '#854F0B',

  red: '#E24B4A',
  redBg: '#FCEBEB',
  redText: '#A32D2D',

  critical: '#C0392B',
  criticalBg: '#FDECEA',
  criticalText: '#922B21',

  blue: '#378ADD',
  blueBg: '#E6F1FB',
  blueText: '#185FA5',

  purple: '#7F77DD',
  purpleBg: '#EEEDFE',
  purpleText: '#3C3489',

  green: '#639922',
  greenBg: '#EAF3DE',
  greenText: '#27500A',

  orange: '#E07B3A',
  orangeBg: '#FDF0E8',
  orangeText: '#7D3A10',

  brgy: '#C97B2A',
  brgyDark: '#935515',
  brgyDeep: '#5C340D',
  brgyLight: '#FDF0E0',
  brgyMid: '#F2C27A',
  brgyBg: '#FDF5EB',
  brgyBorder: 'rgba(201,123,42,0.22)',

  grayBg: '#F5F5F3',
  grayMid: '#D3D1C7',
  grayMuted: '#888780',
  grayHint: '#B4B2A9',

  textPrimary: '#1A1A18',
  textSecondary: '#5F5E5A',
  textMuted: '#888780',
  textHint: '#B4B2A9',

  border: 'rgba(0,0,0,0.10)',
  borderMid: 'rgba(0,0,0,0.15)',
  white: '#FFFFFF',
  black: '#000000',
  appBg: '#EAEAE6',

  // Card/surface elevation — same as white in light mode, distinct in dark mode
  surface: '#FFFFFF',
  surfaceRaised: '#FFFFFF',
  shadow: '#000000',
} as const;

export type ThemeColors = { [K in keyof typeof lightColors]: string };

export const darkColors: ThemeColors = {
  teal: '#1FCF97',
  tealDark: '#9DF0D6',
  tealDeep: '#9DF0D6',
  tealLight: 'rgba(29,158,117,0.20)',
  tealMid: 'rgba(29,158,117,0.38)',
  tealPale: 'rgba(29,158,117,0.12)',

  amber: '#F6B553',
  amberBg: 'rgba(239,159,39,0.20)',
  amberText: '#F7D097',

  red: '#ED6F6E',
  redBg: 'rgba(226,75,74,0.20)',
  redText: '#F29C9B',

  critical: '#DC5142',
  criticalBg: 'rgba(192,57,43,0.20)',
  criticalText: '#EDA8A1',

  blue: '#5EA4E9',
  blueBg: 'rgba(55,138,221,0.20)',
  blueText: '#9CC7F2',

  purple: '#8178E2',
  purpleBg: 'rgba(127,119,221,0.20)',
  purpleText: '#A8A2EB',

  green: '#7FC925',
  greenBg: 'rgba(99,153,34,0.20)',
  greenText: '#CAEDA0',

  orange: '#EB9862',
  orangeBg: 'rgba(224,123,58,0.20)',
  orangeText: '#F3BD9B',

  brgy: '#DF9447',
  brgyDark: '#EEC89F',
  brgyDeep: '#EEC89F',
  brgyLight: 'rgba(201,123,42,0.20)',
  brgyMid: 'rgba(201,123,42,0.38)',
  brgyBg: 'rgba(201,123,42,0.12)',
  brgyBorder: 'rgba(201,123,42,0.35)',

  grayBg: '#161616',
  grayMid: '#3A3A38',
  grayMuted: '#9B9A94',
  grayHint: '#77766F',

  textPrimary: '#F2F2F0',
  textSecondary: '#C7C6C0',
  textMuted: '#9B9A94',
  textHint: '#77766F',

  border: 'rgba(255,255,255,0.12)',
  borderMid: 'rgba(255,255,255,0.18)',
  white: '#1E1E1D',
  black: '#000000',
  appBg: '#0C0C0B',

  surface: '#1E1E1D',
  surfaceRaised: '#262625',
  shadow: '#000000',
};

export type ThemeMode = 'light' | 'dark' | 'system';
