/**
 * Design tokens.
 *
 * The plan calls for hand-built components over a small token file rather than a
 * component kit, because NFR 4 asks for a native, polished feel across ~15 screens.
 * Everything visual should reference these values — no raw hex in components.
 */

const palette = {
  ink900: '#0B0E11',
  ink800: '#101418',
  ink700: '#1A2027',
  ink600: '#2A333D',
  ink400: '#5C6B7A',
  ink300: '#8A99A8',
  ink200: '#C3CCD5',
  ink100: '#E4E9ED',
  ink50: '#F4F6F8',
  white: '#FFFFFF',

  // Warm brass — the accent. Chosen to read as "performing arts" without
  // resorting to the purple every marketplace app defaults to.
  brass600: '#8A6320',
  brass500: '#B8862F',
  brass400: '#D4A548',
  brass100: '#F6EBD5',

  green500: '#2E7D57',
  green100: '#DCF0E5',
  red500: '#C0392B',
  red100: '#FBE3E0',
  amber500: '#B7791F',
  amber100: '#FBEFD6',
} as const

/**
 * Semantic colour roles. Declared explicitly rather than inferred from
 * lightTheme, because `palette` is `as const` and references to const-asserted
 * values keep their literal types — which would force darkTheme to repeat the
 * light hex values exactly.
 */
export type Theme = {
  bg: string
  bgSubtle: string
  bgRaised: string
  border: string
  borderStrong: string
  text: string
  textMuted: string
  textFaint: string
  accent: string
  accentText: string
  accentSubtle: string
  success: string
  successSubtle: string
  danger: string
  dangerSubtle: string
  warning: string
  warningSubtle: string
}

export const lightTheme: Theme = {
  bg: palette.white,
  bgSubtle: palette.ink50,
  bgRaised: palette.white,
  border: palette.ink100,
  borderStrong: palette.ink200,
  text: palette.ink900,
  textMuted: palette.ink400,
  textFaint: palette.ink300,
  accent: palette.brass500,
  accentText: palette.white,
  accentSubtle: palette.brass100,
  success: palette.green500,
  successSubtle: palette.green100,
  danger: palette.red500,
  dangerSubtle: palette.red100,
  warning: palette.amber500,
  warningSubtle: palette.amber100,
}

export const darkTheme: Theme = {
  bg: palette.ink900,
  bgSubtle: palette.ink800,
  bgRaised: palette.ink700,
  border: palette.ink700,
  borderStrong: palette.ink600,
  text: palette.ink50,
  textMuted: palette.ink300,
  textFaint: palette.ink400,
  accent: palette.brass400,
  accentText: palette.ink900,
  accentSubtle: palette.ink700,
  success: '#4BAA7E',
  successSubtle: '#16301F',
  danger: '#E06455',
  dangerSubtle: '#3A1A16',
  warning: '#D9A03F',
  warningSubtle: '#332512',
}

export const spacing = {
  xs: 4,
  sm: 8,
  md: 12,
  lg: 16,
  xl: 24,
  xxl: 32,
  xxxl: 48,
} as const

export const radius = {
  sm: 6,
  md: 10,
  lg: 16,
  pill: 999,
} as const

export const typography = {
  display: { fontSize: 30, lineHeight: 36, fontWeight: '700' },
  title: { fontSize: 22, lineHeight: 28, fontWeight: '700' },
  heading: { fontSize: 17, lineHeight: 24, fontWeight: '600' },
  body: { fontSize: 16, lineHeight: 24, fontWeight: '400' },
  bodyStrong: { fontSize: 16, lineHeight: 24, fontWeight: '600' },
  caption: { fontSize: 13, lineHeight: 18, fontWeight: '400' },
  captionStrong: { fontSize: 13, lineHeight: 18, fontWeight: '600' },
} as const
