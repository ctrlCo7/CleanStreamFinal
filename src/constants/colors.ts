export const Colors = {
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
} as const;

export type ColorKey = keyof typeof Colors;
