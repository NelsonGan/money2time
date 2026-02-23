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

export const colors: ColorPalette = {
  brand: '#1F8A6F',
  primary: '#1F8A6F',
  primarySoft: '#E0F5EE',
  primaryMuted: '#B5E2D4',
  backgroundWarm: '#FAF7F0',
  backgroundSubtle: '#F5F1E8',
  accent: '#F6B750',
  accentSoft: '#FDF0D8',
  background: '#FAF7F0',
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

export const darkColors: ColorPalette = {
  brand: '#34C99A',
  primary: '#34C99A',
  primarySoft: '#1A3D32',
  primaryMuted: '#245A48',
  backgroundWarm: '#121A24',
  backgroundSubtle: '#161E28',
  accent: '#E8AD4A',
  accentSoft: '#2E2518',
  background: '#121A24',
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
export const lightCssVars: Record<string, string> = {
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

export const darkCssVars: Record<string, string> = {
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

export const spacing = {
  xxs: 4,
  xs: 8,
  sm: 12,
  md: 16,
  lg: 20,
  xl: 24,
  screenHorizontal: 20,
  formBottom: 24,
  listBottom: 110,
} as const;
