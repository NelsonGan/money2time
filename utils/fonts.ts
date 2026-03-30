import { Platform } from 'react-native';

// ─── Font Configuration ─────────────────────────────────────
// To change the app font, update these per-platform mappings
// and the corresponding imports/useFonts call in App.tsx.
// ─────────────────────────────────────────────────────────────

interface FontMap {
  regular: string;
  medium: string;
  semibold: string;
  bold: string;
  extrabold: string;
  black: string;
  mono: string;
  monoBold: string;
}

const IOS_FONTS: FontMap = {
  regular: 'system-ui',
  medium: 'system-ui',
  semibold: 'system-ui',
  bold: 'system-ui',
  extrabold: 'system-ui',
  black: 'system-ui',
  mono: 'ui-monospace',
  monoBold: 'ui-monospace',
};

const ANDROID_FONTS: FontMap = {
  regular: 'WorkSans_400Regular',
  medium: 'WorkSans_500Medium',
  semibold: 'WorkSans_600SemiBold',
  bold: 'WorkSans_700Bold',
  extrabold: 'WorkSans_800ExtraBold',
  black: 'WorkSans_900Black',
  mono: 'SpaceMono_400Regular',
  monoBold: 'SpaceMono_700Bold',
};

export const FONT: FontMap = Platform.select({
  ios: IOS_FONTS,
  default: ANDROID_FONTS,
})!;
