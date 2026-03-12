import type { ThemeColor } from '~/types';

export interface ColorPalette {
  brand: string;
  primary: string;
  primarySoft: string;
  primaryMuted: string;
  backgroundWarm: string;
  backgroundSubtle: string;
  accent: string;
  accentSoft: string;
  background: string;
  card: string;
  border: string;
  surface: string;
  surfaceMuted: string;
  text: string;
  textSoft: string;
  textMuted: string;
  muted: string;
  success: string;
  successSoft: string;
  error: string;
  errorSoft: string;
  coral: string;
  lavender: string;
  sky: string;
}

type ResolvedTheme = 'light' | 'dark';
type CssVarMap = Record<string, string>;

const baseLightPalette: ColorPalette = {
  brand: '#1F8A6F',
  primary: '#1F8A6F',
  primarySoft: '#E0F5EE',
  primaryMuted: '#B5E2D4',
  backgroundWarm: '#FAF7F0',
  backgroundSubtle: '#F5F1E8',
  accent: '#F6B750',
  accentSoft: '#FDF0D8',
  background: '#FAF7F0',
  card: '#FEFDFB',
  border: '#E4DFD1',
  surface: '#FFFEFB',
  surfaceMuted: '#F3EEE3',
  text: '#1A2E2A',
  textSoft: '#6B7A77',
  textMuted: '#94A39F',
  muted: '#6B7A77',
  success: '#1E9468',
  successSoft: '#DFFBF0',
  error: '#D45F57',
  errorSoft: '#FDE8E6',
  coral: '#F37D57',
  lavender: '#8E9FE8',
  sky: '#8CC7FF',
};

const baseDarkPalette: ColorPalette = {
  brand: '#34C99A',
  primary: '#34C99A',
  primarySoft: '#1A3D32',
  primaryMuted: '#245A48',
  backgroundWarm: '#121A24',
  backgroundSubtle: '#161E28',
  accent: '#E8AD4A',
  accentSoft: '#2E2518',
  background: '#121A24',
  card: '#1A1F28',
  border: '#3C4353',
  surface: '#1A2330',
  surfaceMuted: '#1E2A36',
  text: '#E8EDF2',
  textSoft: '#9AACA6',
  textMuted: '#6B8078',
  muted: '#9AACA6',
  success: '#2DB87E',
  successSoft: '#1A3D2E',
  error: '#E06B63',
  errorSoft: '#3D1C1A',
  coral: '#F37D57',
  lavender: '#8E9FE8',
  sky: '#8CC7FF',
};

/**
 * CSS custom property values for NativeWind's vars() function.
 * These map to the --variables used in tailwind.config.js color definitions.
 * Values are HSL components without the hsl() wrapper (e.g. "162 60% 36%").
 */
const baseLightCssVars: CssVarMap = {
  '--background': '40 35% 97%',
  '--foreground': '170 20% 14%',
  '--card': '40 20% 99%',
  '--card-foreground': '170 20% 14%',
  '--popover': '40 20% 99%',
  '--popover-foreground': '170 20% 14%',
  '--primary': '162 60% 36%',
  '--primary-foreground': '0 0% 100%',
  '--secondary': '40 28% 93%',
  '--secondary-foreground': '170 16% 22%',
  '--muted': '40 24% 94%',
  '--muted-foreground': '170 10% 45%',
  '--accent': '36 90% 62%',
  '--accent-foreground': '35 60% 18%',
  '--destructive': '6 68% 55%',
  '--destructive-foreground': '0 0% 100%',
  '--success': '162 62% 36%',
  '--success-foreground': '0 0% 100%',
  '--warning': '36 90% 55%',
  '--warning-foreground': '34 62% 14%',
  '--border': '40 18% 87%',
  '--input': '40 18% 87%',
  '--ring': '162 60% 36%',
};

const baseDarkCssVars: CssVarMap = {
  '--background': '223 28% 9%',
  '--foreground': '210 20% 95%',
  '--card': '220 22% 13%',
  '--card-foreground': '210 20% 95%',
  '--popover': '220 22% 13%',
  '--popover-foreground': '210 20% 95%',
  '--primary': '168 48% 50%',
  '--primary-foreground': '179 86% 9%',
  '--secondary': '221 18% 20%',
  '--secondary-foreground': '210 25% 89%',
  '--muted': '221 18% 20%',
  '--muted-foreground': '218 14% 70%',
  '--accent': '38 87% 58%',
  '--accent-foreground': '28 62% 12%',
  '--destructive': '5 78% 60%',
  '--destructive-foreground': '0 0% 100%',
  '--success': '157 70% 42%',
  '--success-foreground': '0 0% 100%',
  '--warning': '36 96% 60%',
  '--warning-foreground': '34 80% 12%',
  '--border': '221 16% 28%',
  '--input': '221 16% 28%',
  '--ring': '168 48% 50%',
};

interface ThemeColorOverrides {
  swatch: { light: string; dark: string };
  lightPalette: Partial<ColorPalette>;
  darkPalette: Partial<ColorPalette>;
  lightCssVars: Partial<CssVarMap>;
  darkCssVars: Partial<CssVarMap>;
}

export const THEME_COLOR_OPTIONS: readonly ThemeColor[] = [
  'sage',
  'ocean',
  'terracotta',
  'berry',
  'slate',
  'amber',
  'indigo',
  'emerald',
  'rosewood',
] as const;

const themeColorOverrides: Record<ThemeColor, ThemeColorOverrides> = {
  sage: {
    swatch: { light: '#1F8A6F', dark: '#34C99A' },
    lightPalette: {},
    darkPalette: {},
    lightCssVars: {},
    darkCssVars: {},
  },
  ocean: {
    swatch: { light: '#2B6CB0', dark: '#63ABF0' },
    lightPalette: {
      brand: '#2B6CB0',
      primary: '#2B6CB0',
      primarySoft: '#E3EEFA',
      primaryMuted: '#BED4EF',
    },
    darkPalette: {
      brand: '#63ABF0',
      primary: '#63ABF0',
      primarySoft: '#1A314A',
      primaryMuted: '#294A70',
    },
    lightCssVars: {
      '--primary': '213 61% 43%',
      '--ring': '213 61% 43%',
      '--primary-foreground': '0 0% 100%',
    },
    darkCssVars: {
      '--primary': '208 82% 67%',
      '--ring': '208 82% 67%',
      '--primary-foreground': '212 72% 12%',
    },
  },
  terracotta: {
    swatch: { light: '#B65F48', dark: '#E19279' },
    lightPalette: {
      brand: '#B65F48',
      primary: '#B65F48',
      primarySoft: '#F7E8E2',
      primaryMuted: '#E8C3B7',
    },
    darkPalette: {
      brand: '#E19279',
      primary: '#E19279',
      primarySoft: '#3B2520',
      primaryMuted: '#5C382E',
    },
    lightCssVars: {
      '--primary': '12 43% 50%',
      '--ring': '12 43% 50%',
      '--primary-foreground': '0 0% 100%',
    },
    darkCssVars: {
      '--primary': '16 63% 68%',
      '--ring': '16 63% 68%',
      '--primary-foreground': '18 62% 12%',
    },
  },
  berry: {
    swatch: { light: '#A34E79', dark: '#D283AC' },
    lightPalette: {
      brand: '#A34E79',
      primary: '#A34E79',
      primarySoft: '#F5E6EE',
      primaryMuted: '#E1BCD0',
    },
    darkPalette: {
      brand: '#D283AC',
      primary: '#D283AC',
      primarySoft: '#382133',
      primaryMuted: '#56394B',
    },
    lightCssVars: {
      '--primary': '330 35% 47%',
      '--ring': '330 35% 47%',
      '--primary-foreground': '0 0% 100%',
    },
    darkCssVars: {
      '--primary': '331 47% 67%',
      '--ring': '331 47% 67%',
      '--primary-foreground': '329 61% 14%',
    },
  },
  slate: {
    swatch: { light: '#3D6D79', dark: '#79B8C7' },
    lightPalette: {
      brand: '#3D6D79',
      primary: '#3D6D79',
      primarySoft: '#E4EFF2',
      primaryMuted: '#B8CED5',
    },
    darkPalette: {
      brand: '#79B8C7',
      primary: '#79B8C7',
      primarySoft: '#1D333A',
      primaryMuted: '#34545D',
    },
    lightCssVars: {
      '--primary': '191 33% 36%',
      '--ring': '191 33% 36%',
      '--primary-foreground': '0 0% 100%',
    },
    darkCssVars: {
      '--primary': '192 40% 64%',
      '--ring': '192 40% 64%',
      '--primary-foreground': '193 58% 12%',
    },
  },
  amber: {
    swatch: { light: '#A97432', dark: '#D7A86B' },
    lightPalette: {
      brand: '#A97432',
      primary: '#A97432',
      primarySoft: '#F8ECDE',
      primaryMuted: '#E6CBAA',
    },
    darkPalette: {
      brand: '#D7A86B',
      primary: '#D7A86B',
      primarySoft: '#3A2B1C',
      primaryMuted: '#5A4128',
    },
    lightCssVars: {
      '--primary': '34 54% 43%',
      '--ring': '34 54% 43%',
      '--primary-foreground': '0 0% 100%',
    },
    darkCssVars: {
      '--primary': '33 58% 63%',
      '--ring': '33 58% 63%',
      '--primary-foreground': '29 66% 12%',
    },
  },
  indigo: {
    swatch: { light: '#4F63B8', dark: '#8FA5F0' },
    lightPalette: {
      brand: '#4F63B8',
      primary: '#4F63B8',
      primarySoft: '#E7EBFA',
      primaryMuted: '#C5CFEE',
    },
    darkPalette: {
      brand: '#8FA5F0',
      primary: '#8FA5F0',
      primarySoft: '#232B47',
      primaryMuted: '#38456E',
    },
    lightCssVars: {
      '--primary': '230 42% 52%',
      '--ring': '230 42% 52%',
      '--primary-foreground': '0 0% 100%',
    },
    darkCssVars: {
      '--primary': '228 76% 75%',
      '--ring': '228 76% 75%',
      '--primary-foreground': '228 63% 14%',
    },
  },
  emerald: {
    swatch: { light: '#1E8E64', dark: '#46C892' },
    lightPalette: {
      brand: '#1E8E64',
      primary: '#1E8E64',
      primarySoft: '#E0F6EC',
      primaryMuted: '#B8E6D2',
    },
    darkPalette: {
      brand: '#46C892',
      primary: '#46C892',
      primarySoft: '#1A3E31',
      primaryMuted: '#295D49',
    },
    lightCssVars: {
      '--primary': '158 65% 34%',
      '--ring': '158 65% 34%',
      '--primary-foreground': '0 0% 100%',
    },
    darkCssVars: {
      '--primary': '156 54% 53%',
      '--ring': '156 54% 53%',
      '--primary-foreground': '160 70% 11%',
    },
  },
  rosewood: {
    swatch: { light: '#B1525F', dark: '#DF8693' },
    lightPalette: {
      brand: '#B1525F',
      primary: '#B1525F',
      primarySoft: '#F8E7EA',
      primaryMuted: '#EBC1C8',
    },
    darkPalette: {
      brand: '#DF8693',
      primary: '#DF8693',
      primarySoft: '#3D2328',
      primaryMuted: '#5E3840',
    },
    lightCssVars: {
      '--primary': '352 38% 51%',
      '--ring': '352 38% 51%',
      '--primary-foreground': '0 0% 100%',
    },
    darkCssVars: {
      '--primary': '351 58% 70%',
      '--ring': '351 58% 70%',
      '--primary-foreground': '352 56% 14%',
    },
  },
};

export function getThemeColorSwatch(themeColor: ThemeColor, resolved: ResolvedTheme): string {
  const palette = themeColorOverrides[themeColor];
  return resolved === 'dark' ? palette.swatch.dark : palette.swatch.light;
}

export function getThemePalette(themeColor: ThemeColor, resolved: ResolvedTheme): ColorPalette {
  const base = resolved === 'dark' ? baseDarkPalette : baseLightPalette;
  const overrides =
    resolved === 'dark'
      ? themeColorOverrides[themeColor].darkPalette
      : themeColorOverrides[themeColor].lightPalette;
  return { ...base, ...overrides };
}

export function getThemeCssVars(themeColor: ThemeColor, resolved: ResolvedTheme): CssVarMap {
  const base = resolved === 'dark' ? baseDarkCssVars : baseLightCssVars;
  const overrides =
    resolved === 'dark'
      ? themeColorOverrides[themeColor].darkCssVars
      : themeColorOverrides[themeColor].lightCssVars;
  return { ...base, ...overrides } as CssVarMap;
}

export const colors: ColorPalette = getThemePalette('sage', 'light');
export const darkColors: ColorPalette = getThemePalette('sage', 'dark');
export const lightCssVars: CssVarMap = getThemeCssVars('sage', 'light');
export const darkCssVars: CssVarMap = getThemeCssVars('sage', 'dark');

export const spacing = {
  xxs: 4,
  xs: 8,
  sm: 12,
  md: 16,
  lg: 20,
  xl: 24,
  '2xl': 32,
  '3xl': 40,
  screenHorizontal: 20,
  formBottom: 24,
  listBottom: 24,
} as const;

export const LIST_BOTTOM_PADDING = spacing.listBottom;

/** Shared radius presets for StyleSheet-based layouts */
export const radii = {
  sm: 12,
  md: 18,
  lg: 24,
  xl: 32,
  pill: 9999,
} as const;

/** Shared duration presets (ms) */
export const durations = {
  fast: 150,
  normal: 250,
  slow: 400,
  entrance: 500,
} as const;
