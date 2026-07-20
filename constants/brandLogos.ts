import type { ImageSourcePropType } from 'react-native';

/**
 * Bundled brand app-icon logos, downloaded from Brandfetch into
 * assets/brands/social. Used by the onboarding "Where did you hear about us?"
 * step and the Share & Earn screen. Refresh with scripts/fetch-brand-logos.mjs.
 *
 * Each image is a self-contained square app icon (its own background), so it
 * renders edge-to-edge inside a rounded tile.
 */
export const BRAND_LOGOS = {
  instagram: require('../assets/brands/social/instagram.png'),
  tiktok: require('../assets/brands/social/tiktok.jpg'),
  reddit: require('../assets/brands/social/reddit.jpg'),
  facebook: require('../assets/brands/social/facebook.png'),
  threads: require('../assets/brands/social/threads.jpg'),
  x: require('../assets/brands/social/x.jpg'),
  appstore: require('../assets/brands/social/appstore.jpg'),
  googleplay: require('../assets/brands/social/googleplay.png'),
  xiaohongshu: require('../assets/brands/social/xiaohongshu.png'),
} satisfies Record<string, ImageSourcePropType>;

export type BrandLogoKey = keyof typeof BRAND_LOGOS;
